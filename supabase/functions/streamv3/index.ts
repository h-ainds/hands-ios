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
  history?: string[]
  imageBase64?: string
  mimeType?: string
  recipeContext?: RecipeContext
}

interface VisionIngredient {
  name: string
  category: string
  confidence: "high" | "medium" | "low"
}

interface Recipe {
  id: string
  title: string
  caption: string
  image: string
}

// ── Tool definition ──────────────────────────────────────────────────────────

const SEARCH_RECIPE_TOOL = {
  type: "function",
  name: "search_recipes",
  description:
    "Search the recipe database for recipes matching the user's request. " +
    "Call this before recommending any recipes.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What to search for — dish name, ingredients, cuisine, cooking method, dietary needs, etc.",
      },
      count: {
        type: "number",
        description: "Number of recipes to retrieve (default 5, max 8)",
      },
    },
    required: ["query"],
  },
}

// ── Vision ───────────────────────────────────────────────────────────────────

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
}`.trim()

function parseVisionIngredientsJson(content: string): VisionIngredient[] {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON in vision response")
  const parsed = JSON.parse(content.slice(start, end + 1)) as { ingredients?: unknown }
  if (!Array.isArray(parsed.ingredients)) throw new Error("Missing ingredients array")
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
  const hint = userHint.trim()
    ? `\n\nUser note (hints only — still list only ingredients you actually see): ${userHint.trim()}`
    : ""

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: VISION_ANALYZE_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: `Identify the ingredients in this image.${hint}` },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "auto" },
            },
          ],
        },
      ],
      max_completion_tokens: 500,
    }),
  })

  if (!response.ok) throw new Error(`Vision API error (${response.status})`)
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== "string") throw new Error("Empty vision response")
  return parseVisionIngredientsJson(content)
}

function buildPhotoContext(ingredients: VisionIngredient[]): string | undefined {
  const names = ingredients.map((i) => i.name.trim()).filter(Boolean)
  return names.length > 0 ? names.join(", ") : undefined
}

// ── RAG ──────────────────────────────────────────────────────────────────────

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-ada-002", input: text }),
  })
  if (!response.ok) throw new Error(`Embedding API error: ${await response.text()}`)
  const data = await response.json()
  return data.data[0].embedding
}

function reciprocalRankFusionIds(vectorIds: string[], ingredientIds: string[], k = 60): string[] {
  const scores = new Map<string, number>()
  vectorIds.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)))
  ingredientIds.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)))
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

async function fetchRecipeMetadataByIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  ids: string[],
): Promise<Map<string, Recipe>> {
  const normalized = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)))
  const numericIds = normalized.map(Number).filter(Number.isFinite)
  if (numericIds.length === 0) return new Map()

  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id,title,caption,image")
    .in("id", numericIds)

  if (error) return new Map()

  const map = new Map<string, Recipe>()
  for (const row of (data ?? []) as { id: number; title: string | null; caption: string | null; image: string | null }[]) {
    map.set(String(row.id), {
      id: String(row.id),
      title: row.title ?? "Untitled Recipe",
      caption: row.caption ?? "",
      image: row.image ?? "",
    })
  }
  return map
}

async function executeSearch(
  query: string,
  count: number,
  supabaseAdmin: ReturnType<typeof createClient>,
  openaiApiKey: string,
): Promise<Recipe[]> {
  const capped = Math.min(count, 8)
  const fetchCount = capped * 2

  const embedding = await generateEmbedding(query, openaiApiKey)

  const [vectorResult, ingredientResult] = await Promise.all([
    supabaseAdmin.rpc("match_recipes", { query_embedding: embedding, match_count: fetchCount }),
    supabaseAdmin
      .rpc("search_recipes_by_ingredients", { search_query: query, match_count: fetchCount })
      .catch(() => ({ data: null, error: null })),
  ])

  if (vectorResult.error) throw new Error(`Vector search failed: ${vectorResult.error.message}`)

  const vectorIds = ((vectorResult.data ?? []) as { recipe_id: string; similarity: number }[])
    .filter((row) => row.similarity >= 0.3)
    .map((row) => String(row.recipe_id))

  const ingredientIds = ((ingredientResult.data ?? []) as { recipe_id: string }[])
    .map((row) => String(row.recipe_id))
    .filter(Boolean)

  const mergedIds = reciprocalRankFusionIds(vectorIds, ingredientIds).slice(0, capped)
  const metadataMap = await fetchRecipeMetadataByIds(supabaseAdmin, mergedIds)
  return mergedIds.map((id) => metadataMap.get(id)).filter(Boolean) as Recipe[]
}

// ── LLM ──────────────────────────────────────────────────────────────────────

async function runQA(
  apiKey: string,
  recipeContext: RecipeContext,
  question: string,
): Promise<string> {
  const ingredientLines = recipeContext.ingredients
    ? Object.entries(recipeContext.ingredients)
        .flatMap(([group, items]) =>
          (items ?? []).map((i) => (group === "Ingredients" ? i : `${i} (${group})`)),
        )
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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful cooking assistant. Answer questions about the following recipe concisely. Keep answers under 3 sentences unless detail is truly needed.\n\n${recipeText}`,
        },
        { role: "user", content: question },
      ],
    }),
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() ?? "I couldn't answer that. Please try again."
}

async function runChat(
  apiKey: string,
  userMessage: string,
  preferences: string[],
  photoContext: string | undefined,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<{ text: string; recipes: Recipe[] }> {
  const instructionParts = [
    "When recommending recipes, call the search_recipes tool first to retrieve real options from our database.",
    "After receiving search results, write a warm, concise 2–3 sentence response.",
    "Reference each recipe using [[recipe:ID]] inline — the app renders a card there.",
    "Example: 'You should try [[recipe:3004]] for a cozy weeknight dinner.'",
    "Only use IDs returned by the tool. Do not write the recipe name next to the marker.",
  ]
  if (preferences.length > 0) {
    instructionParts.push(
      `User dietary profile: ${preferences.join(", ")}. Incorporate into your search query naturally.`,
    )
  }
  if (photoContext) {
    instructionParts.push(
      `The user shared a photo. Ingredients identified: ${photoContext}. Speak naturally — say 'with what you have'.`,
    )
  }
  const instructions = instructionParts.join("\n")

  // Turn 1: model decides whether to call the tool
  const turn1Res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      prompt: { id: "pmpt_6a01fd9739208195a2b9ea57f024ee940ea816dc5acb9575", version: "1" },
      instructions,
      tools: [SEARCH_RECIPE_TOOL],
      tool_choice: "auto",
      input: userMessage,
    }),
  })

  if (!turn1Res.ok) throw new Error(`Responses API error (turn 1): ${await turn1Res.text()}`)

  const turn1 = await turn1Res.json()
  const turn1Output = turn1.output?.[0]

  // Conversational turn — no tool call needed
  if (!turn1Output || turn1Output.type !== "function_call") {
    return {
      text: turn1Output?.content?.[0]?.text ?? "I can help you find recipes. What are you looking for?",
      recipes: [],
    }
  }

  // Execute the search
  const args = JSON.parse(turn1Output.arguments ?? "{}")
  const query: string = typeof args.query === "string" ? args.query : userMessage
  const count: number = typeof args.count === "number" ? args.count : 5
  const recipes = await executeSearch(query, count, supabaseAdmin, apiKey)

  const toolOutput = recipes.length > 0
    ? JSON.stringify(recipes.map((r) => ({ id: r.id, title: r.title, caption: r.caption })))
    : "No matching recipes found."

  // Turn 2: generate the final response with [[recipe:ID]] markers
  const turn2Res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      previous_response_id: turn1.id,
      instructions:
        "Write a warm, concise 2–3 sentence response using [[recipe:ID]] inline markers for each recipe you mention. " +
        "Do not write the recipe name next to the marker — the app renders a card there. " +
        "Only use IDs from the search results.",
      input: [
        {
          type: "function_call_output",
          call_id: turn1Output.call_id,
          output: toolOutput,
        },
      ],
    }),
  })

  if (!turn2Res.ok) throw new Error(`Responses API error (turn 2): ${await turn2Res.text()}`)

  const turn2 = await turn2Res.json()
  const text = turn2.output?.[0]?.content?.[0]?.text?.trim() ?? "Here are some recipes you might enjoy."

  return { text, recipes }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured")
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured")

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const body = (await req.json()) as RequestBody
    const { prompt, imageBase64, mimeType, recipeContext } = body

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Q&A shortcut — answer about a specific recipe, no retrieval
    if (recipeContext) {
      const text = await runQA(openaiKey, recipeContext, prompt)
      return new Response(
        JSON.stringify({ text, recipes: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } },
      )
    }

    // Resolve authenticated user
    const authHeader = req.headers.get("Authorization")
    let userId: string | null = null
    if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (user) userId = user.id
    }

    // Fetch preferences + run vision in parallel
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    const hasImage =
      typeof imageBase64 === "string" &&
      imageBase64.length > 0 &&
      typeof mimeType === "string" &&
      allowedMimeTypes.includes(mimeType)

    const [preferences, photoIngredients] = await Promise.all([
      userId
        ? supabaseAdmin
            .from("UserTasteProfiles")
            .select("taste_preferences")
            .eq("id", userId)
            .single()
            .then(({ data }) =>
              Array.isArray(data?.taste_preferences) ? (data.taste_preferences as string[]) : [],
            )
            .catch(() => [] as string[])
        : Promise.resolve([] as string[]),
      hasImage
        ? extractIngredientsFromPhoto(
            openaiKey,
            imageBase64!,
            mimeType as VisionMimeType,
            prompt,
          ).catch(() => [] as VisionIngredient[])
        : Promise.resolve([] as VisionIngredient[]),
    ])

    const photoContext = buildPhotoContext(photoIngredients)

    const { text, recipes } = await runChat(openaiKey, prompt, preferences, photoContext, supabaseAdmin)

    return new Response(
      JSON.stringify({
        text,
        recipes: recipes.map(({ id, title, image, caption }) => ({ id, title, image, caption })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ text: "Sorry, I encountered an error. Please try again.", recipes: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } },
    )
  }
})
