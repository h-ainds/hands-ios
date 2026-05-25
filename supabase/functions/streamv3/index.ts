import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type VisionMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

interface RecipeContext {
  title: string
  caption: string | null
  ingredients: Record<string, string[]> | null
  steps: string[] | null
  tags: string[] | null
}

interface RequestBody {
  prompt: string
  history?: string[] // last 2 user messages, oldest first
  imageBase64?: string
  mimeType?: string
  recipeContext?: RecipeContext
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

/** Same vision task as analyze-image; results feed the shared RAG pipeline (embed + ingredient RPC + RRF). */
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

// Raw response from match_recipes RPC
interface MatchRecipeRow {
  recipe_id: string
  similarity: number
}

// Raw response from search_recipes_by_ingredients RPC
interface IngredientSearchRow {
  recipe_id: string
  rank: number
}

// Transformed recipe for XML output
interface Recipe {
  id: string
  title: string
  caption: string
  image: string
  tags?: string[]
}

type RecipeMetadataRow = {
  id: number
  title: string | null
  caption: string | null
  image: string | null
  tags?: string[] | null
}

function normalizeQueryText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(s: string): string[] {
  const normalized = normalizeQueryText(s)
  if (!normalized) return []
  return normalized.split(" ").filter(Boolean)
}

function looksLikeRecipeTitleQuery(prompt: string): boolean {
  const tokens = tokenize(prompt)
  if (tokens.length === 0) return false
  // Short queries with mostly content words are often direct title intents.
  if (tokens.length <= 6) return true
  // If the query contains quotes, treat as title-like.
  if (prompt.includes('"') || prompt.includes("'")) return true
  return false
}

function getAnchorTerms(prompt: string): string[] {
  const stop = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "fresh",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "recipe",
    "the",
    "to",
    "try",
    "with",
    "want",
    "make",
  ])
  return tokenize(prompt)
    .filter((t) => t.length >= 5 && !stop.has(t))
    .slice(0, 6)
}

function containsAny(haystack: string, needles: string[]): boolean {
  const h = normalizeQueryText(haystack)
  return needles.some((n) => n && h.includes(n))
}

async function fetchRecipeMetadataByIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Map<string, Recipe>> {
  const normalized = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
  const numericIds = normalized.map((id) => Number(id)).filter((id) => Number.isFinite(id))

  if (numericIds.length === 0) return new Map()

  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id,title,caption,image,tags")
    .in("id", numericIds)

  if (error) {
    console.error("[Stream] Failed fetching recipes metadata from recipes:", error.message)
    return new Map()
  }

  const rows = (data || []) as RecipeMetadataRow[]
  const map = new Map<string, Recipe>()
  rows.forEach((row) => {
    map.set(String(row.id), {
      id: String(row.id),
      title: row.title || "Untitled Recipe",
      caption: row.caption || "",
      image: row.image || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
    })
  })
  return map
}

async function titleLexicalCandidates(
  supabaseAdmin: ReturnType<typeof createClient>,
  userPrompt: string,
  limit = 10,
): Promise<string[]> {
  const q = userPrompt.trim()
  if (!q) return []

  // 1) Exact-ish substring title match
  const { data: byTitle } = await supabaseAdmin
    .from("recipes")
    .select("id,title")
    .ilike("title", `%${q}%`)
    .limit(limit)

  const idsFromTitle = (byTitle || []).map((r: any) => String(r.id))

  // 2) Full-text search on searchable_title if available (tsvector)
  // Note: if the column isn't configured for text search, Supabase will error; treat as optional.
  let idsFromFts: string[] = []
  try {
    const { data: byFts } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .textSearch("searchable_title", q, { type: "websearch" })
      .limit(limit)
    idsFromFts = (byFts || []).map((r: any) => String(r.id))
  } catch (e) {
    // Non-fatal; some environments may not support textSearch on this column.
  }

  return Array.from(new Set([...idsFromTitle, ...idsFromFts])).filter(Boolean).slice(0, limit)
}

function applyAnchorBoostAndFilter(
  prompt: string,
  recipes: Recipe[],
): Recipe[] {
  const anchors = getAnchorTerms(prompt)
  if (anchors.length === 0) return recipes

  // Only activate if at least one recipe matches at least one anchor (avoid destructive filtering).
  const anyAnchorMatch = recipes.some((r) =>
    containsAny(`${r.title} ${r.caption} ${(r.tags || []).join(" ")}`, anchors),
  )
  if (!anyAnchorMatch) return recipes

  // Score: +2 for each anchor hit in title, +1 in tags, +0.5 in caption.
  const scored = recipes.map((r) => {
    const titleText = normalizeQueryText(r.title)
    const captionText = normalizeQueryText(r.caption)
    const tagsText = normalizeQueryText((r.tags || []).join(" "))
    let score = 0
    anchors.forEach((a) => {
      if (titleText.includes(a)) score += 2
      if (tagsText.includes(a)) score += 1
      if (captionText.includes(a)) score += 0.5
    })
    return { r, score }
  })

  // Conservative filter: drop only recipes with 0 anchor score IF doing so still leaves results.
  const withSignal = scored.filter((x) => x.score > 0)
  const filtered = withSignal.length > 0 ? withSignal : scored

  return filtered
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
}

function ensureGroundedAssistantText(text: string, recipes: Recipe[]): string {
  const cleaned = String(text || "").trim()
  if (!cleaned || recipes.length === 0) {
    return recipes.length > 0
      ? `Try [[recipe:${recipes[0].id}]] for a great meal.`
      : "Here are some recipes you might enjoy."
  }

  const allowedIds = new Set(recipes.map((r) => r.id))

  // Check if model used any valid [[recipe:ID]] markers
  const markerPattern = /\[\[recipe:([^\]]+)\]\]/g
  let match
  let hasValidMarker = false
  while ((match = markerPattern.exec(cleaned)) !== null) {
    if (allowedIds.has(match[1])) {
      hasValidMarker = true
      break
    }
  }

  // Fallback: synthesize a response with markers if model produced none
  if (!hasValidMarker) {
    const top = recipes.slice(0, 2)
    return top.map(r => `[[recipe:${r.id}]]`).join(" and ") + " are great options for you."
  }

  // Strip any markers with invalid IDs (hallucinated IDs)
  return cleaned.replace(/\[\[recipe:([^\]]+)\]\]/g, (full, id) =>
    allowedIds.has(id) ? full : ""
  ).replace(/\s{2,}/g, " ").trim()
}

async function filterExistingRecipes(
  supabaseAdmin: ReturnType<typeof createClient>,
  recipeIds: string[],
): Promise<string[]> {
  if (!recipeIds.length) return []

  const normalizedIds = Array.from(new Set(recipeIds.map((id) => String(id).trim()).filter(Boolean)))
  const numericIds = normalizedIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))

  if (numericIds.length === 0) {
    console.warn("[Stream] No numeric recipe IDs returned from retrieval; dropping all cards.")
    return []
  }

  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id")
    .in("id", numericIds)

  if (error) {
    console.error("[Stream] Failed validating retrieved recipe IDs:", error.message)
    return []
  }

  const validIdSet = new Set((data || []).map((row) => String(row.id)))
  const filtered = normalizedIds.filter((id) => validIdSet.has(String(id)))
  const droppedCount = normalizedIds.length - filtered.length

  if (droppedCount > 0) {
    const droppedIds = normalizedIds.filter((id) => !validIdSet.has(id)).slice(0, 10)
    console.warn(
      `[Stream] Dropped ${droppedCount} invalid candidate IDs not present in recipes: ${droppedIds.join(", ")}`,
    )
  }

  return filtered
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

function extractVectorCandidateIds(rows: MatchRecipeRow[]): string[] {
  return (rows || [])
    .filter((row) => row.similarity >= 0.3)
    .map((row) => String(row.recipe_id).trim())
    .filter(Boolean)
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
function reciprocalRankFusionIds(
  vectorIds: string[],
  ingredientIds: string[],
  k = 60,
): string[] {
  const scores = new Map<string, number>()

  vectorIds.forEach((id, i) => {
    const key = String(id)
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + i + 1))
  })

  ingredientIds.forEach((id, i) => {
    const key = String(id)
    scores.set(key, (scores.get(key) ?? 0) + 1 / (k + i + 1))
  })

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
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

// Ask LLM for a response with inline [[recipe:ID]] markers
async function getChatText(
  apiKey: string,
  userPrompt: string,
  recipes: Recipe[],
  preferences: string[],
  photoIngredientSummary?: string,
): Promise<string> {
  const recipeList = recipes.map(r => `- [${r.id}] ${r.title}`).join("\n")
  const prefContext = preferences.length > 0
    ? `\n\nUser dietary profile: ${preferences.join(", ")}.`
    : ""
  const photoContext = photoIngredientSummary
    ? `\n\nThe user shared a photo; these ingredients were identified from it: ${photoIngredientSummary}. Recipes below were matched from those ingredients (and their request). Never say you cannot see photos, images, or pictures — speak naturally as if you already understood what they have.`
    : ""
  const systemPrompt = `You are Hands, a cooking assistant. Write a natural 2–3 sentence response recommending specific recipes from the list below. When you mention a recipe, embed it inline as [[recipe:ID]] — do NOT write the recipe name separately next to the marker, the app renders a card in its place. Example: "A great choice! [[recipe:123]] is perfect for a cozy weeknight."

Only use IDs from the list. Keep your response under 50 words. No XML, no formatting.${prefContext}${photoContext}

Recipes:
${recipeList}`

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

    const body = (await req.json()) as RequestBody
    const { prompt, imageBase64, mimeType, recipeContext } = body

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Recipe Q&A mode — skip retrieval entirely, answer about the specific recipe
    if (recipeContext) {
      console.log("[Stream] Mode: recipe-qa, recipe:", recipeContext.title)

      const ingredientLines = recipeContext.ingredients
        ? Object.entries(recipeContext.ingredients)
            .flatMap(([group, items]) => (items ?? []).map(i => group === "Ingredients" ? i : `${i} (${group})`))
            .join(", ")
        : ""

      const recipeText = [
        `Title: ${recipeContext.title}`,
        recipeContext.caption ? `About: ${recipeContext.caption}` : "",
        recipeContext.tags?.length ? `Tags: ${recipeContext.tags.join(", ")}` : "",
        ingredientLines ? `Ingredients: ${ingredientLines}` : "",
        recipeContext.steps?.length
          ? `Steps:\n${recipeContext.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n")

      const qaResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: false,
          messages: [
            {
              role: "system",
              content: `You are a helpful cooking assistant. Answer questions about the following recipe concisely and helpfully. Keep answers under 3 sentences unless a detailed explanation is truly needed.\n\n${recipeText}`,
            },
            { role: "user", content: prompt },
          ],
        }),
      })

      const qaData = await qaResponse.json()
      const answer = qaData.choices?.[0]?.message?.content?.trim() ?? "I couldn't answer that. Please try again."

      return new Response(JSON.stringify({ text: answer, recipes: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" },
      })
    }

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

    console.log("[Stream] Preferences:", tastePreferences)

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          const requestId = crypto.randomUUID()
          const debugEnv = Deno.env.get("RETRIEVAL_DEBUG") === "1"
          const debugByPrompt = /lasagna|meatball|mediterranean/i.test(prompt)
          const debug = debugEnv || debugByPrompt

          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Prompt:`, prompt)
          }

          // Text-only: embedding + RPCs use the user prompt. With a photo: extract
          // ingredients first (same vision task as analyze-image), then run the same
          // vector + ingredient + RRF pipeline on "ingredients + user ask".
          let contextualQuery = prompt
          let photoIngredientSummary: string | undefined

          const allowedVision = ["image/jpeg", "image/png", "image/webp", "image/gif"]
          if (
            typeof imageBase64 === "string" &&
            imageBase64.length > 0 &&
            typeof mimeType === "string" &&
            allowedVision.includes(mimeType)
          ) {
            try {
              const ingredients = await extractIngredientsFromPhoto(
                openaiKey,
                imageBase64,
                mimeType as VisionMimeType,
                prompt,
              )
              const names = ingredients.map(i => i.name.trim()).filter(Boolean)
              if (names.length > 0) {
                photoIngredientSummary = names.join(", ")
                contextualQuery = `${photoIngredientSummary}. ${prompt}`.trim()
                console.log("[Stream] Photo ingredients (preview):", photoIngredientSummary.substring(0, 120))
              }
            } catch (visionErr) {
              console.error("[Stream] Vision extraction failed, using text prompt only:", visionErr)
            }
          }

          console.log("[Stream] Retrieval query:", contextualQuery.substring(0, 150))
          if (debug && contextualQuery !== prompt) {
            console.log(`[Stream][Debug][${requestId}] Contextual query:`, contextualQuery)
          }

          const anchorTerms = getAnchorTerms(prompt)
          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Anchor terms:`, anchorTerms)
          }

          const titleLike = looksLikeRecipeTitleQuery(prompt)
          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Title-like query:`, titleLike)
          }

          // Title/lexical candidates are always recipes.id and recipes metadata is sourced from recipes.
          const lexicalIds = await titleLexicalCandidates(supabaseAdmin, prompt, 10)
          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Lexical candidate IDs:`, lexicalIds)
          }

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

          const rawVectorRows = (vectorResult.data || []) as unknown[]
          const rawIngredientRows = (ingredientRows || []) as unknown[]

          // Pull IDs for RRF. (We still log raw payloads so we can inspect whether upstream
          // is providing metadata / polluted IDs.)
          const vectorRowsTyped = (vectorResult.data || []) as MatchRecipeRow[]
          const vectorIds = extractVectorCandidateIds(vectorRowsTyped)
          const ingredientIds = (ingredientRows || [])
            .map((row: any) => String(row.recipe_id).trim())
            .filter(Boolean)

          if (debug) {
            const preview = (arr: unknown[]) => JSON.stringify(arr.slice(0, 12))
            console.log(`[Stream][Debug][${requestId}] match_recipes raw (preview):`, preview(rawVectorRows))
            console.log(`[Stream][Debug][${requestId}] search_recipes_by_ingredients raw (preview):`, preview(rawIngredientRows))
            console.log(`[Stream][Debug][${requestId}] Vector IDs (post-sim threshold):`, vectorIds.slice(0, 30))
            console.log(`[Stream][Debug][${requestId}] Ingredient IDs:`, ingredientIds.slice(0, 30))
            console.log(
              `[Stream][Debug][${requestId}] Contains 6359? vector=${vectorIds.includes("6359")} ingredient=${ingredientIds.includes("6359")} lexical=${lexicalIds.includes("6359")}`,
            )
          }

          console.log(`[Stream] Vector candidates: ${vectorIds.length} | Ingredient candidates: ${ingredientIds.length}`)

          // Merge using RRF, then prepend lexical candidates with strong preference.
          let mergedIds = reciprocalRankFusionIds(vectorIds, ingredientIds)

          // Strong exact/near-exact preference for title-like queries:
          // if lexical IDs exist, move them to the front (deduped), preserving lexical order.
          if (lexicalIds.length > 0) {
            mergedIds = Array.from(new Set([...lexicalIds, ...mergedIds]))
          }

          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Merged IDs (pre-validation):`, mergedIds.slice(0, 30))
            console.log(`[Stream][Debug][${requestId}] Contains 6359? merged=${mergedIds.includes("6359")}`)
          }

          console.log(`[Stream] RRF merged: ${mergedIds.length} unique recipe IDs`)

          mergedIds = await filterExistingRecipes(supabaseAdmin, mergedIds)
          console.log(`[Stream] After recipes.id validation: ${mergedIds.length} recipe IDs`)
          if (debug) {
            console.log(`[Stream][Debug][${requestId}] IDs after validation:`, mergedIds.slice(0, 30))
            console.log(`[Stream][Debug][${requestId}] Contains 6359? validated=${mergedIds.includes("6359")}`)
          }

          const metadataMap = await fetchRecipeMetadataByIds(supabaseAdmin, mergedIds)
          let recipes: Recipe[] = mergedIds
            .map((id) => metadataMap.get(String(id)))
            .filter(Boolean) as Recipe[]

          const missingMeta = mergedIds.length - recipes.length
          if (missingMeta > 0) {
            console.warn(`[Stream] Missing metadata for ${missingMeta} recipe IDs after validation (unexpected).`)
          }

          if (debug) {
            console.log(
              `[Stream][Debug][${requestId}] Final recipe rows fetched from recipes (pre-anchor):`,
              recipes.slice(0, 10).map((r) => ({ id: r.id, title: r.title, tags: (r.tags || []).slice(0, 6) })),
            )
            console.log(`[Stream][Debug][${requestId}] Contains 6359? recipesFetched=${recipes.some((r) => r.id === "6359")}`)
          }

          // Final relevance sanity: anchor-boost and conservative filter (non-destructive).
          recipes = applyAnchorBoostAndFilter(prompt, recipes)

          if (debug) {
            console.log(
              `[Stream][Debug][${requestId}] Recipes after anchor boost/filter:`,
              recipes.slice(0, 10).map((r) => ({ id: r.id, title: r.title })),
            )
            console.log(`[Stream][Debug][${requestId}] Contains 6359? afterAnchor=${recipes.some((r) => r.id === "6359")}`)
          }

          // Post-retrieval dietary filter — the only reliable way to enforce restrictions
          if (tastePreferences.length > 0) {
            recipes = await filterRecipesByPreferences(openaiKey, recipes, tastePreferences)
          }

          // Cap at 6 for display
          recipes = recipes.slice(0, 6)

          if (recipes.length === 0) {
            controller.enqueue(encoder.encode(JSON.stringify({ text: "I couldn't find any recipes matching your request. Try a different search.", recipes: [] })))
            controller.close()
            return
          }

          if (debug) {
            console.log(
              `[Stream][Debug][${requestId}] Final recipes passed to text/cards:`,
              recipes.map((r) => ({ id: r.id, title: r.title })),
            )
          }

          const text = await getChatText(
            openaiKey,
            prompt,
            recipes,
            tastePreferences,
            photoIngredientSummary,
          )

          const groundedText = ensureGroundedAssistantText(text, recipes)
          if (debug) {
            console.log(`[Stream][Debug][${requestId}] Raw assistant text:`, text)
            console.log(`[Stream][Debug][${requestId}] Grounded assistant text:`, groundedText)
          }

          const payload = {
            text: groundedText,
            recipes: recipes.map(r => ({ id: r.id, title: r.title, image: r.image, caption: r.caption })),
          }
          controller.enqueue(encoder.encode(JSON.stringify(payload)))
          controller.close()
        } catch (error) {
          console.error("[Stream] Streaming error:", error)
          controller.enqueue(encoder.encode(JSON.stringify({ text: "Sorry, I encountered an error. Please try again.", recipes: [] })))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    })
  } catch (error) {
    console.error("[Stream] Edge function error:", error)

    return new Response(
      JSON.stringify({ text: "Sorry, I encountered an error while searching for recipes. Please try again.", recipes: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      }
    )
  }
})
