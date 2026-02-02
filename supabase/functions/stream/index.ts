import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

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

function escapeXml(text: string): string {
  if (!text) return ""
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function formatResponseXml(text: string, recipes: Recipe[]): string {
  let xml = `<text>${escapeXml(text)}</text>`

  for (const recipe of recipes) {
    xml += `<item><id>${recipe.id}</id><title>${escapeXml(recipe.title)}</title><caption>${escapeXml(recipe.caption || "")}</caption><image>${recipe.image || ""}</image></item>`
  }

  return xml
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

// SSE helper: Send data chunk
// Important: Remove newlines from data to keep it on a single line for SSE parsing
function sendSSE(controller: ReadableStreamDefaultController, data: string) {
  const singleLineData = data.replace(/\n/g, ' ')
  const chunk = `data: ${singleLineData}\n\n`
  controller.enqueue(new TextEncoder().encode(chunk))
}

// SSE helper: Send event
function sendSSEEvent(controller: ReadableStreamDefaultController, event: string, data: string) {
  const chunk = `event: ${event}\ndata: ${data}\n\n`
  controller.enqueue(new TextEncoder().encode(chunk))
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

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          sendSSEEvent(controller, "status", "searching")

          // Generate embedding for the user's prompt
          const embedding = await generateEmbedding(prompt, openaiKey)

          // Send embedding complete status
          sendSSEEvent(controller, "status", "matching")

          // Call the match_recipes RPC function
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

          // Generate response text
          let responseText: string
          if (recipes && recipes.length > 0) {
            responseText = `I found ${recipes.length} recipe${recipes.length > 1 ? "s" : ""} that match your request!`
          } else {
            responseText = "I couldn't find any recipes matching your request. Try describing what ingredients you have or what type of dish you're looking for."
          }

          // Send the complete XML response
          const xmlResponse = formatResponseXml(responseText, recipes)

          // Stream the response (simulate streaming by sending in chunks for future use)
          sendSSE(controller, xmlResponse)

          // Send completion event
          sendSSEEvent(controller, "done", "complete")

          controller.close()
        } catch (error) {
          console.error("Streaming error:", error)

          const errorXml = `<text>Sorry, I encountered an error while searching for recipes. Please try again.</text>`
          sendSSEEvent(controller, "error", errorXml)

          controller.close()
        }
      },
    })

    // Return SSE stream with proper headers
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
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
