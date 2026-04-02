import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface RequestBody {
  prompt: string
  history?: string[]  // last 2 user messages, oldest first
}

// Raw response from match_recipes RPC
interface MatchRecipeRow {
  recipe_id: string
  similarity: number
  metadata: {
    title: string
    caption: string
    image: string
  }
}

// Raw response from search_recipes_by_ingredients RPC
interface IngredientSearchRow {
  recipe_id: string
  rank: number
  title: string
  caption: string
  image: string
}

// Transformed recipe for XML output
interface Recipe {
  id: string
  title: string
  caption: string
  image: string
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: text,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

// Transform raw RPC response to Recipe format, filtering out low-similarity results
function transformRecipes(rows: MatchRecipeRow[]): Recipe[] {
  return rows
    .filter(row => row.similarity >= 0.3)
    .map(row => ({
      id: row.recipe_id,
      title: row.metadata?.title || "Untitled Recipe",
      caption: row.metadata?.caption || "",
      image: row.metadata?.image || "",
    }))
}

// Non-fatal wrapper around ingredient search RPC
async function searchByIngredients(
  supabaseAdmin: ReturnType<typeof createClient>,
  prompt: string,
  matchCount: number
): Promise<IngredientSearchRow[]> {
  const { data, error } = await supabaseAdmin.rpc("search_recipes_by_ingredients", {
    search_query: prompt,
    match_count: matchCount,
  })
  if (error) {
    console.error("[Stream] Ingredient search error:", error.message)
    return []
  }
  return data || []
}

// Merge vector search and ingredient search results using Reciprocal Rank Fusion.
// Recipes appearing in both lists get a score boost — best of both worlds.
// k=60 is the standard RRF constant.
function reciprocalRankFusion(
  vectorResults: Recipe[],
  ingredientResults: IngredientSearchRow[],
  k = 60
): Recipe[] {
  const scores = new Map<string, { score: number } & Recipe>()

  vectorResults.forEach((r, i) => {
    const id = String(r.id)
    scores.set(id, { ...r, score: 1 / (k + i + 1) })
  })

  ingredientResults.forEach((row, i) => {
    const id = String(row.recipe_id)
    const contribution = 1 / (k + i + 1)
    const existing = scores.get(id)
    if (existing) {
      existing.score += contribution
    } else {
      scores.set(id, {
        id,
        title: row.title || "Untitled Recipe",
        caption: row.caption || "",
        image: row.image || "",
        score: contribution,
      })
    }
  })

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score: _s, ...recipe }) => recipe)
}

// Post-retrieval dietary filter: embedding retrieval is soft and cannot enforce
// dietary restrictions (e.g. "Chicken pasta bake" ranks highly for "pasta recipes"
// regardless of query enrichment). This LLM filter is the only reliable approach.
async function filterRecipesByPreferences(
  apiKey: string,
  recipes: Recipe[],
  preferences: string[]
): Promise<Recipe[]> {
  if (preferences.length === 0) return recipes

  const recipeList = recipes
    .map(r => `${r.id}: ${r.title} — ${r.caption}`)
    .join("\n")

  const prefText = preferences.join(", ")

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: false,
      messages: [
        {
          role: "system",
          content: `You are a strict dietary compliance checker. Given a list of recipes and a user's dietary preferences, return ONLY the IDs of recipes that comply with ALL of the user's dietary restrictions. Be strict — if a recipe title or description suggests ingredients that violate any restriction, exclude it. Return a JSON array of ID strings only, with no explanation. Example: ["123", "456"]`,
        },
        {
          role: "user",
          content: `User dietary preferences: ${prefText}\n\nRecipes:\n${recipeList}\n\nReturn JSON array of compliant recipe IDs:`,
        },
      ],
    }),
  })

  if (!response.ok) {
    console.error("[Stream] Dietary filter API error:", await response.text())
    return recipes // fall back to unfiltered if the call fails
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() ?? "[]"
  console.log("[Stream] Dietary filter raw LLM response:", content)

  try {
    // Strip markdown fences in case the model wraps the JSON
    const clean = content.replace(/```json|```/g, "").trim()
    const ids: string[] = JSON.parse(clean).map(String)
    const filtered = recipes.filter(r => ids.includes(String(r.id)))
    console.log(`[Stream] Dietary filter: ${recipes.length} → ${filtered.length} recipes`)
    return filtered.length > 0 ? filtered : recipes // fallback if filter is too aggressive
  } catch {
    console.error("[Stream] Failed to parse dietary filter response:", content)
    return recipes
  }
}

// Ask LLM for a single plain-text recommendation sentence only
async function getChatText(apiKey: string, userPrompt: string, recipes: Recipe[], preferences: string[]): Promise<string> {
  const recipeList = recipes.map(r => `- ${r.title}`).join("\n")
  const prefContext = preferences.length > 0
    ? `\n\nUser dietary profile: ${preferences.join(", ")}.`
    : ""
  const systemPrompt = `You are Hands, a cooking assistant. Write 1 short sentence (under 20 words) recommending these recipes to the user. Return ONLY the sentence, no XML, no formatting.${prefContext}\n\nRecipes:\n${recipeList}`

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI Chat API error: ${await response.text()}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() ?? "Here are some recipes you might enjoy."
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get environment variables
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured")
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured")
    }

    const authHeader = req.headers.get("Authorization")
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve authenticated user
    let userId: string | null = null
    if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
        console.log("[Stream] Authenticated user:", userId)
      } else {
        console.log("[Stream] Auth failed or anonymous:", authError?.message)
      }
    } else {
      console.log("[Stream] No user token — running without personalization")
    }

    const { prompt, history }: RequestBody = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Use only the current prompt for embedding — mixing in history biases results
    // toward previous topics and breaks topic changes (e.g. "pasta" → "cookies" still
    // returns pasta). History is kept in the request body for future use (e.g. LLM context).
    const contextualQuery = prompt

    // Fetch user taste preferences for post-retrieval filtering
    let tastePreferences: string[] = []
    if (userId) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("UserTasteProfiles")
        .select("taste_preferences")
        .eq("id", userId)
        .single()

      if (profileError) {
        console.log("[Stream] Profile fetch error:", profileError.message)
      } else if (Array.isArray(profile?.taste_preferences)) {
        tastePreferences = profile.taste_preferences
        console.log("[Stream] Loaded taste preferences:", tastePreferences.length, "chips")
      } else {
        console.log("[Stream] No taste preferences found for user")
      }
    }

    console.log("[Stream] Query:", contextualQuery.substring(0, 150))
    console.log("[Stream] Preferences:", tastePreferences)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const embedding = await generateEmbedding(contextualQuery, openaiKey)

          // Run vector search and ingredient search in parallel — no added latency
          const vectorMatchCount = tastePreferences.length > 0 ? 20 : 10
          const [vectorResult, ingredientRows] = await Promise.all([
            supabaseAdmin.rpc("match_recipes", {
              query_embedding: embedding,
              match_count: vectorMatchCount,
            }),
            searchByIngredients(supabaseAdmin, contextualQuery, 20),
          ])

          if (vectorResult.error) {
            console.error("[Stream] RPC error:", vectorResult.error)
            throw new Error(`Database error: ${vectorResult.error.message}`)
          }

          const filteredVectorRecipes = transformRecipes(vectorResult.data || [])
          console.log(`[Stream] Vector: ${filteredVectorRecipes.length} | Ingredient: ${ingredientRows.length}`)

          let recipes = reciprocalRankFusion(filteredVectorRecipes, ingredientRows)
          console.log(`[Stream] RRF merged: ${recipes.length} unique recipes`)

          // Post-retrieval dietary filter — the only reliable way to enforce restrictions
          if (tastePreferences.length > 0) {
            recipes = await filterRecipesByPreferences(openaiKey, recipes, tastePreferences)
          }

          // Cap at 6 for display
          recipes = recipes.slice(0, 6)

          if (recipes.length === 0) {
            const xml = `<answer><text>I couldn't find any recipes matching your request and dietary preferences. Try a different search.</text><items></items></answer>`
            controller.enqueue(encoder.encode(xml))
            controller.close()
            return
          }

          const text = await getChatText(openaiKey, prompt, recipes, tastePreferences)

          const itemsXml = recipes
            .map(r => `    <item>\n      <id>${r.id}</id>\n      <title>${r.title}</title>\n      <caption>${r.caption}</caption>\n      <image>${r.image}</image>\n    </item>`)
            .join("\n")

          const xml = `<answer><text>${text}</text><items>\n${itemsXml}\n  </items></answer>`
          controller.enqueue(encoder.encode(xml))
          controller.close()
        } catch (error) {
          console.error("[Stream] Streaming error:", error)
          controller.enqueue(encoder.encode(`<answer><text>Sorry, I encountered an error. Please try again.</text><items></items></answer>`))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Stream] Edge function error:", error)

    return new Response(
      `<answer><text>Sorry, I encountered an error while searching for recipes. Please try again.</text><items></items></answer>`,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      }
    )
  }
})
