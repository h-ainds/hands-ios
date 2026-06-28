import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"
import { SYSTEM_PROMPT, TOOLS } from "./agent.ts"
import { deduplicateByRecipeId } from "./search.ts"
import type { SearchRow, LabelResult } from "./search.ts"
import type {
  ServerEvent,
  RecipeCard,
  SearchRecipesOutput,
  GetRecipeDetailsOutput,
} from "../../../types/chat.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const EMBED_MODEL = "text-embedding-3-small"
const EMBED_DIMS  = 1536
const MODEL       = "gpt-5.4-mini"
const MAX_ROUNDS  = 5   // guard against runaway tool loops

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  })
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`)
  const { data } = await res.json()
  return data[0].embedding as number[]
}

// ── Tool executors ────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any, any>>

async function execSearchRecipes(
  args: { searches: Array<{ label: string; query: string }> },
  supabase: SupabaseClient,
  openAiKey: string,
): Promise<{ cards: RecipeCard[]; unmatched: string[]; toolOutput: SearchRecipesOutput }> {
  const labelResults: LabelResult[] = await Promise.all(
    args.searches.map(async ({ label, query }) => {
      const embedding = await embed(query, openAiKey)
      const { data, error } = await supabase.rpc("search_recipes_hybrid", {
        query_embedding: embedding,
        query_text: query,
        match_count: 5,
      })
      if (error) throw new Error(`search_recipes_hybrid: ${error.message}`)
      return { label, rows: (data ?? []) as SearchRow[] }
    }),
  )

  const { matched, unmatched } = deduplicateByRecipeId(labelResults)
  const cards = matched.map((m) => m.recipe)

  return {
    cards,
    unmatched,
    toolOutput: { recipes: cards, total_found: cards.length },
  }
}

async function execGetRecipeDetails(
  args: { recipe_id: string },
  supabase: SupabaseClient,
): Promise<GetRecipeDetailsOutput> {
  const { data, error } = await supabase.rpc("get_recipe_details", {
    p_recipe_id: parseInt(args.recipe_id, 10),
  })
  if (error) throw new Error(`get_recipe_details: ${error.message}`)
  const row = ((data ?? []) as Record<string, unknown>[])[0] ?? {}
  return {
    recipe: {
      id: String(row.id ?? args.recipe_id),
      title: row.title ?? "",
      image: row.image ?? null,
      caption: row.caption ?? null,
      steps: row.steps ?? null,
      // DB returns flat text[]; cast to satisfy the shared type (model reads raw JSON)
      ingredients: row.ingredients ?? null,
      tags: row.tags ?? null,
      url: row.url ?? null,
    },
  }
}

// ── OpenAI Responses API (non-streaming) ──────────────────────────────────────

type ResponsesOutput = Array<{
  type: string
  call_id?: string
  name?: string
  arguments?: string
  content?: Array<{ type: string; text?: string }>
}>

async function callOpenAI(input: unknown[], apiKey: string): Promise<ResponsesOutput> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions: SYSTEM_PROMPT, input, tools: TOOLS }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return (body.output ?? []) as ResponsesOutput
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const openAiKey    = Deno.env.get("OPENAI_API_KEY")
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")
  const supabaseKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!openAiKey || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing server configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  let reqBody: { message?: string; conversation_id?: string; context?: unknown[] }
  try { reqBody = await req.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { message, conversation_id, context = [] } = reqBody
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase       = createClient(supabaseUrl, supabaseKey)
  const conversationId = conversation_id ?? crypto.randomUUID()

  const body = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const emit = (event: ServerEvent) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`))

      try {
        emit({ type: "message_start", conversation_id: conversationId })

        let input: unknown[] = [...context, { role: "user", content: message }]

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const output = await callOpenAI(input, openAiKey)
          const toolCalls = output.filter((o) => o.type === "function_call")

          // ── No tool calls: emit final text and stop ──────────────────────
          if (toolCalls.length === 0) {
            const msg = output.find((o) => o.type === "message")
            for (const part of msg?.content ?? []) {
              if (part.type === "output_text" && part.text) {
                emit({ type: "text_delta", delta: part.text })
              }
            }
            break
          }

          // ── Execute tool calls ───────────────────────────────────────────
          const functionOutputs: unknown[] = []

          for (const call of toolCalls) {
            const callId = call.call_id!
            const args   = JSON.parse(call.arguments ?? "{}")

            emit({
              type: "tool_use",
              tool_use_id: callId,
              tool_name: call.name as "search_recipes" | "get_recipe_details",
              input: args,
            })

            if (call.name === "search_recipes") {
              const { cards, unmatched, toolOutput } = await execSearchRecipes(args, supabase, openAiKey)

              emit({ type: "tool_result", tool_use_id: callId, output: toolOutput })
              if (cards.length > 0) emit({ type: "recipe_cards", items: cards })

              // Give the model a compact summary so it knows what was found / missed.
              functionOutputs.push({
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify({
                  found: cards.map((c) => ({ id: c.id, title: c.title })),
                  unmatched,
                }),
              })
            } else {
              const result = await execGetRecipeDetails(args, supabase)

              emit({ type: "tool_result", tool_use_id: callId, output: result })
              functionOutputs.push({
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(result.recipe),
              })
            }
          }

          // Advance input for next round: prior output + tool results
          input = [...input, ...output, ...functionOutputs]
        }

        emit({ type: "message_stop" })
      } catch (err) {
        emit({ type: "error", message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
})
