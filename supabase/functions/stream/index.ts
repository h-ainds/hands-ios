import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type MimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"

interface RequestBody {
  // Backwards compatible (older clients)
  prompt?: string

  // New: optional user-typed context (the text field is not a pre-written prompt)
  context?: string

  // Optional image attachment
  imageBase64?: string
  mimeType?: MimeType

  // Optional: last 2 user messages (oldest first) for mild continuity
  history?: string[]
}

interface Ingredient {
  name: string
  category: string
  confidence: "high" | "medium" | "low"
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

// Transformed recipe for XML output
interface Recipe {
  id: string
  title: string
  caption: string
  image: string
}

const INGREDIENT_SYSTEM_PROMPT = `You are a kitchen assistant that identifies ingredients from photos.

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
  return data.data[0].embedding
}

function parseIngredientsFromResponse(content: string): Ingredient[] {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response")
  }

  const jsonString = content.slice(start, end + 1)
  const parsed = JSON.parse(jsonString) as { ingredients?: Ingredient[] }

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
}

async function extractIngredientsFromImage(
  apiKey: string,
  imageBase64: string,
  mimeType: MimeType
): Promise<Ingredient[]> {
  const imageUrl = `data:${mimeType};base64,${imageBase64}`

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: [{ type: "text", text: INGREDIENT_SYSTEM_PROMPT }],
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
      ],
      max_completion_tokens: 500,
      response_format: { type: "text" },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error")
    throw new Error(
      `OpenAI ingredient extraction error (${response.status}): ${errorText.slice(0, 300)}`
    )
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI ingredient extraction returned empty content")
  }

  return parseIngredientsFromResponse(content)
}

function buildViPrompt(
  ingredients: Ingredient[],
  context: string | undefined
): string {
  const ingredientNames = ingredients
    .map((i) => i.name?.trim())
    .filter(Boolean)
    .join(", ")

  const base = ingredientNames
    ? `I have the following ingredients in my fridge: ${ingredientNames}.`
    : "I have a photo of ingredients from my fridge."

  const c = (context || "").trim()
  const question =
    c.length > 0 ? c : "What can I make with these ingredients?"

  // Important: user never sees ingredients; they are only used to steer retrieval + answer.
  return `${base}\n\nAdditional context: ${question}`.trim()
}

// Transform raw RPC response to Recipe format (filter out low-similarity results)
function transformRecipes(rows: MatchRecipeRow[]): Recipe[] {
  return (rows || [])
    .filter((row) => row.similarity >= 0.3)
    .map((row) => ({
      id: row.recipe_id,
      title: row.metadata?.title || "Untitled Recipe",
      caption: row.metadata?.caption || "",
      image: row.metadata?.image || "",
    }))
}

// Build the system prompt with recipe context for RAG
function buildSystemPrompt(recipes: Recipe[]): string {
  if (recipes.length === 0) {
    return `
You are Hands, a cooking assistant.

No recipes were found matching the user's request.

Output EXACTLY this XML structure:

<answer>
  <text>
    I couldn't find any recipes matching your request. Try describing what ingredients you have or what type of dish you're looking for.
  </text>
  <items>
  </items>
</answer>

Rules:
- Do not output anything outside XML
`.trim()
  }

  const recipeContext = recipes
    .map((r, i) => `${i + 1}. ${r.id} - ${r.title} — ${r.caption} - ${r.image}`)
    .join("\n")

  return `
You are Hands, a cooking assistant.

You MUST recommend recipes.
Keep the your response UNDER 25 words.

You MUST output between 1 and ${recipes.length} <item> elements.
Each <item> MUST use a recipe from the list below.
You MUST NOT invent recipes.

Available recipes:
${recipeContext}

Output EXACTLY this XML structure:

<answer>
  <text>
    One paragraph of helpful explanation.
  </text>
  <items>
    ${recipes
      .map(
        () => `
    <item>
      <id></id>
      <title></title>
      <caption></caption>
      <image></image>
    </item>
    `
      )
      .join("")}
  </items>
</answer>

Rules:
- Do not omit <items>
- Do not output empty <item>
- Do not repeat recipes
- Do not output anything outside XML
`.trim()
}

// Stream chat completion from OpenAI (XML response body)
async function streamChatCompletion(
  controller: ReadableStreamDefaultController,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  image?: { imageBase64: string; mimeType: MimeType }
): Promise<void> {
  const userContent = image
    ? [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.imageBase64}`,
            detail: "auto",
          },
        },
      ]
    : userPrompt

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Chat API error: ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split("\n").filter((line) => line.startsWith("data: "))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === "[DONE]") continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) controller.enqueue(encoder.encode(delta))
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured")
    if (!supabaseUrl || !supabaseServiceKey)
      throw new Error("Supabase credentials not configured")

    const authHeader = req.headers.get("Authorization")
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Optional auth resolution (not required for VI)
    if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } =
        await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        console.log("[Stream] Authenticated user:", user.id)
      }
    }

    const body: RequestBody = await req.json()
    const context = typeof body.context === "string" ? body.context : undefined
    const legacyPrompt = typeof body.prompt === "string" ? body.prompt : undefined

    const hasImage =
      typeof body.imageBase64 === "string" &&
      body.imageBase64.length > 0 &&
      typeof body.mimeType === "string"

    const textPrompt = (context || legacyPrompt || "").trim()
    if (!hasImage && !textPrompt) {
      return new Response(JSON.stringify({ error: "Invalid prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const viPrompt = hasImage
            ? buildViPrompt(
                await extractIngredientsFromImage(
                  openaiKey,
                  body.imageBase64 as string,
                  body.mimeType as MimeType
                ),
                context
              )
            : textPrompt

          const embedding = await generateEmbedding(viPrompt, openaiKey)

          const { data: rawRecipes, error: rpcError } = await supabaseAdmin.rpc(
            "match_recipes",
            {
              query_embedding: embedding,
              match_count: 4,
            }
          )

          if (rpcError) {
            console.error("RPC error:", rpcError)
            throw new Error(`Database error: ${rpcError.message}`)
          }

          const recipes = transformRecipes(rawRecipes || [])
          const systemPrompt = buildSystemPrompt(recipes)

          await streamChatCompletion(
            controller,
            openaiKey,
            systemPrompt,
            viPrompt,
            hasImage
              ? {
                  imageBase64: body.imageBase64 as string,
                  mimeType: body.mimeType as MimeType,
                }
              : undefined
          )
          controller.close()
        } catch (error) {
          console.error("Streaming error:", error)
          const encoder = new TextEncoder()
          controller.enqueue(
            encoder.encode(
              `<answer><text>Sorry, I encountered an error. Please try again.</text><items></items></answer>`
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Edge function error:", error)
    const errorXml = `<text>Sorry, I encountered an error while searching for recipes. Please try again.</text>`
    return new Response(errorXml, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    })
  }
})

