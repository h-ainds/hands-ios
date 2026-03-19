const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type MimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

interface RequestBody {
  imageBase64: string
  mimeType: MimeType
}

export interface Ingredient {
  name: string
  category: string
  confidence: "high" | "medium" | "low"
}

interface AnalyzeImageResponse {
  recipes: SuggestedRecipe[]
}

export interface SuggestedRecipe {
  id: string
  title: string
  image: string | null
  requiredIngredients: string[]
  estimatedCookTimeMinutes: number
  description: string
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

interface OpenAITextContent {
  type: "text"
  text: string
}

interface OpenAIImageContent {
  type: "image_url"
  image_url: {
    url: string
    detail: "low" | "high" | "auto"
  }
}

type OpenAIMessageContent = OpenAITextContent | OpenAIImageContent

interface OpenAIMessage {
  role: "user" | "system" | "assistant"
  content: OpenAIMessageContent[] | string
}

interface OpenAIChoice {
  message: {
    role: string
    content: string
  }
}

interface OpenAIChatResponse {
  choices: OpenAIChoice[]
}

const SYSTEM_PROMPT = `You are a kitchen assistant that identifies ingredients from photos.

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

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
  return data.data[0].embedding as number[]
}

function buildMessages(imageBase64: string, mimeType: MimeType): OpenAIMessage[] {
  const imageUrl = `data:${mimeType};base64,${imageBase64}`

  return [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Here is the image. Identify the ingredients following the instructions.",
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
            detail: "auto",
          },
        },
      ],
    },
  ]
}

function estimateCookTimeMinutes(detectedIngredients: Ingredient[]): number {
  const count = detectedIngredients.length
  // Simple heuristic: more ingredients -> slightly longer cook time.
  const estimated = 20 + count * 8
  return Math.max(15, Math.min(75, estimated))
}

function extractBriefDescription(caption: string): string {
  const trimmed = (caption || "").trim()
  if (!trimmed) return "A delicious recipe suggestion based on your image."

  // Take the first 1-2 sentences (best-effort; caption formatting varies).
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  return sentences.slice(0, 2).join(" ")
}

function transformRecipes(
  rows: MatchRecipeRow[],
  detectedIngredients: Ingredient[]
): SuggestedRecipe[] {
  const requiredIngredients = Array.from(
    new Set(detectedIngredients.map(i => i.name.trim()).filter(Boolean))
  ).slice(0, 10)

  const required = requiredIngredients.length > 0 ? requiredIngredients : ["mixed ingredients"]
  const cookTime = estimateCookTimeMinutes(detectedIngredients)

  return (rows || []).map(row => {
    const title = row?.metadata?.title || "Untitled Recipe"
    const caption = row?.metadata?.caption || ""
    const image = row?.metadata?.image || ""

    return {
      id: row.recipe_id,
      title,
      image: image ? image : null,
      requiredIngredients: required,
      estimatedCookTimeMinutes: cookTime,
      description: extractBriefDescription(caption),
    }
  })
}

function parseIngredientsFromResponse(content: string): Ingredient[] {
  try {
    const start = content.indexOf("{")
    const end = content.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON object found in response")
    }

    const jsonString = content.slice(start, end + 1)
    const parsed = JSON.parse(jsonString) as AnalyzeImageResponse

    if (!parsed || !Array.isArray(parsed.ingredients)) {
      throw new Error("Invalid JSON structure: missing ingredients array")
    }

    return parsed.ingredients
      .filter(
        (item) =>
          typeof item?.name === "string" &&
          typeof item?.category === "string" &&
          (item?.confidence === "high" ||
            item?.confidence === "medium" ||
            item?.confidence === "low")
      )
      .map((item) => ({
        name: item.name.trim(),
        category: item.category.trim(),
        confidence: item.confidence,
      }))
  } catch (error) {
    console.error("Failed to parse ingredients from response:", error)
    throw new Error("Failed to parse ingredients from AI response")
  }
}

async function callOpenAIChat(
  apiKey: string,
  messages: OpenAIMessage[]
): Promise<Ingredient[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages,
      max_completion_tokens: 500,
      response_format: { type: "text" },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(
      `OpenAI API error (${response.status}): ${errorText.slice(0, 300)}`
    )
  }

  const data = (await response.json()) as OpenAIChatResponse
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error("OpenAI API returned an empty response")
  }

  return parseIngredientsFromResponse(content)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      )
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured")
    }

    const body = (await req.json()) as RequestBody

    if (
      !body ||
      typeof body.imageBase64 !== "string" ||
      typeof body.mimeType !== "string"
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      )
    }

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(body.mimeType)) {
      return new Response(
        JSON.stringify({ error: "Unsupported MIME type" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      )
    }

    // 1) Analyze the image -> detected ingredients
    const messages = buildMessages(body.imageBase64, body.mimeType)
    const detectedIngredients = await callOpenAIChat(openaiKey, messages)

    // 2) Use detected ingredients -> recipe suggestions (existing RAG candidate matcher)
    const ingredientText = detectedIngredients.map(i => i.name).join(", ") || "ingredients"
    const embedding = await generateEmbedding(ingredientText, openaiKey)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Call RPC via Supabase REST to avoid importing supabase-js in this edge function.
    const rpcUrl = `${supabaseUrl}/rest/v1/rpc/match_recipes`
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: 4,
      }),
    })

    if (!rpcResponse.ok) {
      const errorText = await rpcResponse.text().catch(() => "Unknown error")
      throw new Error(`Database error (${rpcResponse.status}): ${errorText}`)
    }

    const rawRecipes = (await rpcResponse.json()) as MatchRecipeRow[]

    const recipes = transformRecipes(rawRecipes || [], detectedIngredients)

    const responseBody: AnalyzeImageResponse = { recipes }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("Error in analyze-image function:", error)

    const message =
      error instanceof Error ? error.message : "Unknown error occurred"

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    )
  }
})

