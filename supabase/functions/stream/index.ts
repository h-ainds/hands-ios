import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface RequestBody {
  prompt: string
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

// Transform raw RPC response to Recipe format
function transformRecipes(rows: MatchRecipeRow[]): Recipe[] {
  return rows.map(row => ({
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
    ${recipes.map(() => `
    <item>
      <id></id>
      <title></title>
      <caption></caption>
      <image></image>
    </item>
    `).join("")}
  </items>
</answer>

Rules:
- Do not omit <items>
- Do not output empty <item>
- Do not repeat recipes
- Do not output anything outside XML
`.trim()
}

// Stream chat completion from OpenAI
async function streamChatCompletion(
  controller: ReadableStreamDefaultController,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<void> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Chat API error: ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("No response body")
  }

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    const lines = chunk.split("\n").filter(line => line.startsWith("data: "))

    for (const line of lines) {
      const data = line.slice(6) // Remove "data: " prefix
      if (data === "[DONE]") continue

      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          controller.enqueue(encoder.encode(delta))
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }
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

    // Get authorization header
    const authHeader = req.headers.get("Authorization")

    // Create Supabase client - use service role for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Optionally verify user if auth header is provided
    let userId: string | null = null
    if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!authError && user) {
        userId = user.id
        console.log("Authenticated user:", userId)
      }
    }

    // Parse request body
    const { prompt }: RequestBody = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Create streaming response - return immediately to prevent EarlyDrop
    // All async work happens inside the stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Generate embedding for the user's prompt
          const embedding = await generateEmbedding(prompt, openaiKey)

          // Call the match_recipes RPC function (RAG retrieval step)
          const { data: rawRecipes, error: rpcError } = await supabaseAdmin.rpc("match_recipes", {
            query_embedding: embedding,
            match_count: 4,
          })

          if (rpcError) {
            console.error("RPC error:", rpcError)
            throw new Error(`Database error: ${rpcError.message}`)
          }

          // Transform the raw response to our Recipe format
          const recipes = transformRecipes(rawRecipes || [])

          // Build system prompt with retrieved recipes as context
          const systemPrompt = buildSystemPrompt(recipes)

          // Stream the LLM response
          await streamChatCompletion(controller, openaiKey, systemPrompt, prompt)
          controller.close()
        } catch (error) {
          console.error("Streaming error:", error)
          const encoder = new TextEncoder()
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
    console.error("Edge function error:", error)

    const errorXml = `<text>Sorry, I encountered an error while searching for recipes. Please try again.</text>`

    return new Response(errorXml, {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  }
})
