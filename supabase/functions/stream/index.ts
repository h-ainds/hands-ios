import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type VisionMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

interface RequestBody {
  prompt: string
  history?: string[]
  imageBase64?: string
  mimeType?: string
  context?: string
}

interface VisionIngredient {
  name: string
  category: string
  confidence: "high" | "medium" | "low"
}

const VISION_ANALYZE_SYSTEM = `You are a kitchen assistant that identifies ingredients from photos.

Given an image of a fridge, pantry, or groceries, identify every visible ingredient.

Rules:
- Group items into high-level categories such as: vegetables, fruits, proteins, dairy, grains, snacks, condiments, beverages, and other
- If you are not confident that something is a specific ingredient, either:
  - classify it as "other" with low confidence, or
  - omit it entirely if it is too ambiguous
- Prefer specific ingredient names over generic ones when you are confident (e.g. "cherry tomatoes" instead of "tomatoes")
- Only include food ingredients, not containers or background objects

Return a JSON object with this exact shape:
{
  "ingredients": [
    {
      "name": string,
      "category": string,
      "confidence": "high" | "medium" | "low"
    }
  ]
}
`.trim()

function parseVisionIngredientsJson(content: string): VisionIngredient[] {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in vision response")
  }
  const jsonString = content.slice(start, end + 1)
  const parsed = JSON.parse(jsonString) as { ingredients?: unknown }
  if (!parsed || !Array.isArray(parsed.ingredients)) {
    throw new Error("Invalid JSON structure: missing ingredients array")
  }
  return parsed.ingredients
    .filter(
      (item): item is VisionIngredient =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as VisionIngredient).name === "string" &&
        typeof (item as VisionIngredient).category === "string" &&
        ["high", "medium", "low"].includes((item as VisionIngredient).confidence),
    )
    .map((item) => ({
      name: item.name.trim(),
      category: item.category.trim(),
      confidence: item.confidence,
    }))
}

async function extractIngredientsFromPhoto(
  apiKey: string,
  imageBase64: string,
  mimeType: VisionMimeType,
  userHint: string,
): Promise<VisionIngredient[]> {
  const imageUrl = `data:${mimeType};base64,${imageBase64}`
  const hint = userHint.trim()
    ? `\n\nUser note (hints only — still list only ingredients you actually see in the image): ${userHint.trim()}`
    : ""

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: VISION_ANALYZE_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Here is the image. Identify the ingredients following the instructions.${hint}`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "auto" },
            },
          ],
        },
      ],
      max_completion_tokens: 500,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(`Vision API error (${response.status}): ${errorText.slice(0, 300)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== "string") {
    throw new Error("Vision API returned an empty response")
  }

  return parseVisionIngredientsJson(content)
}

interface MatchRecipeRow {
  recipe_id: string
  similarity: number
  metadata: {
    title: string
    caption: string
    image: string
  }
}

interface IngredientSearchRow {
  recipe_id: string
  rank: number
  title: string
  caption: string
  image: string
}

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

// For image queries skipThreshold=true: ingredient embeddings score lower against
// recipe prose so any threshold cuts too many valid results. RRF handles ranking.
// For text queries: 0.2 threshold filters weak matches before RRF.
function transformRecipes(rows: MatchRecipeRow[], skipThreshold = false): Recipe[] {
  return rows
    .filter(row => skipThreshold || row.similarity >= 0.2)
    .map(row => ({
      id: row.recipe_id,
      title: row.metadata?.title || "Untitled Recipe",
      caption: row.metadata?.caption || "",
      image: row.metadata?.image || "",
    }))
}

async function searchByIngredients(
  supabaseAdmin: ReturnType<typeof createClient>,
  query: string,
  matchCount: number
): Promise<IngredientSearchRow[]> {
  const { data, error } = await supabaseAdmin.rpc("search_recipes_by_ingredients", {
    search_query: query,
    match_count: matchCount,
  } as any)
  if (error) {
    console.error("[Stream] Ingredient search error:", error.message)
    return []
  }
  return data || []
}

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

// Only hard dietary restrictions go into the filter.
// Soft interest tags like "simple eating" or "avocado and greek yogurt" are skipped —
// they describe what the user likes, not what they cannot eat.
const RESTRICTION_KEYWORDS = [
  "vegan", "vegetarian", "gluten", "dairy", "nut", "allerg",
  "halal", "kosher", "lactose", "celiac", "pescatarian", "paleo", "keto",
]

async function filterRecipesByPreferences(
  apiKey: string,
  recipes: Recipe[],
  restrictions: string[]
): Promise<Recipe[]> {
  if (restrictions.length === 0) return recipes

  const recipeList = recipes
    .map(r => `${r.id}: ${r.title} — ${r.caption}`)
    .join("\n")

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
          content: `You are a dietary compliance checker. Given a list of recipes and a user's dietary restrictions, return ONLY the IDs of recipes that comply with ALL restrictions. Only exclude recipes that clearly violate a hard dietary rule (e.g. a vegan restriction excludes meat dishes). Return a JSON array of ID strings only, with no explanation. Example: ["123", "456"]`,
        },
        {
          role: "user",
          content: `User dietary restrictions: ${restrictions.join(", ")}\n\nRecipes:\n${recipeList}\n\nReturn JSON array of compliant recipe IDs:`,
        },
      ],
    }),
  })

  if (!response.ok) {
    console.error("[Stream] Dietary filter API error:", await response.text())
    return recipes
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() ?? "[]"
  console.log("[Stream] Dietary filter response:", content)

  try {
    const clean = content.replace(/```json|```/g, "").trim()
    const ids: string[] = JSON.parse(clean).map(String)
    const filtered = recipes.filter(r => ids.includes(String(r.id)))
    console.log(`[Stream] Dietary filter: ${recipes.length} → ${filtered.length} recipes`)
    return filtered.length > 0 ? filtered : recipes
  } catch {
    console.error("[Stream] Failed to parse dietary filter response:", content)
    return recipes
  }
}

async function getChatText(
  apiKey: string,
  userPrompt: string,
  recipes: Recipe[],
  preferences: string[],
  photoIngredientSummary?: string,
): Promise<string> {
  const recipeList = recipes.map(r => `- ${r.title}`).join("\n")
  const prefContext = preferences.length > 0
    ? `\n\nUser dietary profile: ${preferences.join(", ")}.`
    : ""
  const photoContext = photoIngredientSummary
    ? `\n\nThe user shared a photo; these ingredients were identified from it: ${photoIngredientSummary}. Recipes below were matched from those ingredients. Never say you cannot see photos — speak naturally as if you already understood what they have.`
    : ""
  const systemPrompt = `You are Hands, a cooking assistant. Write 1 short sentence (under 20 words) recommending these recipes to the user. Return ONLY the sentence, no XML, no formatting.${prefContext}${photoContext}\n\nRecipes:\n${recipeList}`

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

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured")
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured")

    const authHeader = req.headers.get("Authorization")
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    let userId: string | null = null
    if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
        console.log("[Stream] Authenticated user:", userId)
      }
    }

    const body = (await req.json()) as RequestBody
    const { prompt, imageBase64, mimeType } = body

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

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
        console.log("[Stream] Taste preferences:", tastePreferences)
      }
    }

    // Filter to hard dietary restrictions only — soft tags are skipped
    const hardRestrictions = tastePreferences.filter(p =>
      RESTRICTION_KEYWORDS.some(kw => p.toLowerCase().includes(kw))
    )
    console.log("[Stream] Hard restrictions:", hardRestrictions)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const isImageQuery =
            typeof imageBase64 === "string" &&
            imageBase64.length > 0 &&
            typeof mimeType === "string" &&
            ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)

          let embeddingQuery: string
          let ingredientSearchQuery: string
          let photoIngredientSummary: string | undefined

          if (isImageQuery) {
            try {
              const ingredients = await extractIngredientsFromPhoto(
                openaiKey,
                imageBase64!,
                mimeType as VisionMimeType,
                prompt,
              )

              // Log every detection with confidence so you can see what vision picked up
              console.log("[Stream] Vision raw detections:")
              ingredients.forEach(i =>
                console.log(`  [${i.confidence.toUpperCase()}] ${i.name} (${i.category})`)
              )

              // Drop low-confidence detections — they add noise to retrieval
              const names = ingredients
                .filter(i => i.confidence !== "low")
                .map(i => i.name.trim())
                .filter(Boolean)

              console.log("[Stream] Using for retrieval:", names.join(", ") || "(none — all low confidence)")

              if (names.length > 0) {
                photoIngredientSummary = names.join(", ")
                embeddingQuery = names.join(" ") + " recipes"
                ingredientSearchQuery = names.join(" ")
              } else {
                embeddingQuery = prompt
                ingredientSearchQuery = prompt
              }
            } catch (visionErr) {
              console.error("[Stream] Vision extraction failed, falling back to prompt:", visionErr)
              embeddingQuery = prompt
              ingredientSearchQuery = prompt
            }
          } else {
            embeddingQuery = prompt
            ingredientSearchQuery = prompt
          }

          console.log("[Stream] Embedding query:", embeddingQuery.substring(0, 150))
          console.log("[Stream] Ingredient search query:", ingredientSearchQuery.substring(0, 150))

          const embedding = await generateEmbedding(embeddingQuery, openaiKey)

          const vectorMatchCount = hardRestrictions.length > 0 ? 25 : 15
          const [vectorResult, ingredientRows] = await Promise.all([
            supabaseAdmin.rpc("match_recipes", {
              query_embedding: embedding,
              match_count: vectorMatchCount,
            } as any),
            searchByIngredients(supabaseAdmin, ingredientSearchQuery, 30),
          ])

          if (vectorResult.error) {
            console.error("[Stream] RPC error:", vectorResult.error)
            throw new Error(`Database error: ${vectorResult.error.message}`)
          }

          const filteredVectorRecipes = transformRecipes(vectorResult.data || [], isImageQuery)
          console.log(`[Stream] Vector: ${filteredVectorRecipes.length} | Ingredient: ${ingredientRows.length}`)

          let recipes = reciprocalRankFusion(filteredVectorRecipes, ingredientRows)
          console.log(`[Stream] RRF merged: ${recipes.length} unique recipes`)

          if (hardRestrictions.length > 0) {
            recipes = await filterRecipesByPreferences(openaiKey, recipes, hardRestrictions)
          }

          recipes = recipes.slice(0, 6)

          if (recipes.length === 0) {
            const xml = `<answer><text>I couldn't find any recipes matching your request. Try a different search.</text><items></items></answer>`
            controller.enqueue(encoder.encode(xml))
            controller.close()
            return
          }

          const text = await getChatText(
            openaiKey,
            prompt,
            recipes,
            tastePreferences,
            photoIngredientSummary,
          )

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
