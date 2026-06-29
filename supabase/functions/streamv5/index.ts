import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"
import { SYSTEM_PROMPT, TOOLS } from "./agent.ts"
import { deduplicateByRecipeId } from "./search.ts"
import type { SearchRow, LabelResult, DeduplicateResult } from "./search.ts"
import type { GetRecipeDetailsOutput } from "../../../types/chat.ts"
import { makeEmitter } from "./emit.ts"
import { SupabaseSession } from "./session.ts"

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

// Batch all queries into one API call; order of returned embeddings matches input.
async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  })
  if (!res.ok) throw new Error(`embedBatch ${res.status}: ${await res.text()}`)
  const { data } = await res.json()
  return (data as Array<{ embedding: number[] }>).map((d) => d.embedding)
}

// ── Tool executors ────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any, any, any>>

async function execSearchRecipes(
  args: { searches: Array<{ label: string; query: string }> },
  supabase: SupabaseClient,
  openAiKey: string,
): Promise<{
  matched: DeduplicateResult["matched"]
  unmatched: string[]
}> {
  // One embeddings API call for all queries — no diet/allergen args.
  const embeddings = await embedBatch(args.searches.map((s) => s.query), openAiKey)

  // Parallel RPC per label using its pre-computed embedding.
  const labelResults: LabelResult[] = await Promise.all(
    args.searches.map(async ({ label, query }, i) => {
      const { data, error } = await supabase.rpc("search_recipes_hybrid", {
        query_embedding: embeddings[i],
        query_text: query,
        match_count: 5,
      })
      if (error) throw new Error(`search_recipes_hybrid: ${error.message}`)
      return { label, rows: (data ?? []) as SearchRow[] }
    }),
  )

  return deduplicateByRecipeId(labelResults)
}

// Resolution path: the model matches the user's natural-language phrase
// (e.g. "lemon bars") to the query_label / title it stored from a prior
// search_recipes result in its context window, then calls this tool with
// that recipe_id. An id not present in context was never shown to the user;
// the not_found branch instructs the model to say so.
type DetailsResult =
  | { found: true;  output: GetRecipeDetailsOutput }
  | { found: false; recipe_id: string }

async function execGetRecipeDetails(
  args: { recipe_id: string },
  supabase: SupabaseClient,
): Promise<DetailsResult> {
  const { data, error } = await supabase.rpc("get_recipe_details", {
    p_recipe_id: parseInt(args.recipe_id, 10),
  })
  if (error) throw new Error(`get_recipe_details: ${error.message}`)

  const rows = ((data ?? []) as Record<string, unknown>[])
  if (rows.length === 0) return { found: false, recipe_id: args.recipe_id }

  const row = rows[0]
  return {
    found: true,
    output: {
      recipe: {
        id:      String(row.id ?? args.recipe_id),
        title:   String(row.title ?? ""),
        image:   (row.image   as string   | null) ?? null,
        caption: (row.caption as string   | null) ?? null,
        tags:    (row.tags    as string[] | null) ?? null,
        steps:   (row.steps   as string[] | null) ?? null,
        // DB returns flat text[]; the model reads raw JSON — cast satisfies shared type.
        ingredients: (row.ingredients as unknown as Record<string, string[]> | null) ?? null,
        url:     (row.url     as string   | null) ?? null,
      },
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

// store: false — SupabaseSession is the sole state mechanism; OpenAI server-side
// response storage and previous_response_id chaining are intentionally disabled.
async function callOpenAI(input: unknown[], apiKey: string): Promise<ResponsesOutput> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions: SYSTEM_PROMPT, input, tools: TOOLS, store: false }),
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

  // SupabaseSession is the only state mechanism. Reject previous_response_id at
  // the boundary so mixing the two is impossible by construction.
  let reqBody: { message?: string; conversation_id?: string; previous_response_id?: unknown }
  try { reqBody = await req.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { message, conversation_id, previous_response_id } = reqBody
  if (previous_response_id !== undefined) {
    return new Response(
      JSON.stringify({ error: "previous_response_id is not accepted: this endpoint uses SupabaseSession for state" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
  if (!message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!conversation_id || typeof conversation_id !== "string") {
    return new Response(JSON.stringify({ error: "conversation_id is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase       = createClient(supabaseUrl, supabaseKey)
  const conversationId = conversation_id
  const session        = new SupabaseSession(conversationId, supabase)

  const body = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const { emit, flush } = makeEmitter(controller, enc)

      try {
        // Load prior turns from the DB; new items accumulate from priorItems.length onward.
        const priorItems = await session.getItems()
        const userMsg    = { role: "user", content: message }
        let input: unknown[] = [...priorItems, userMsg]

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const output = await callOpenAI(input, openAiKey)
          const toolCalls = output.filter((o) => o.type === "function_call")

          // ── No tool calls: emit final text and stop ──────────────────────
          if (toolCalls.length === 0) {
            const msg = output.find((o) => o.type === "message")
            for (const part of msg?.content ?? []) {
              if (part.type === "output_text" && part.text) {
                emit({ t: "text.delta", delta: part.text })
              }
            }
            // Append final model output before breaking so it's included in newItems.
            input = [...input, ...output]
            break
          }

          // ── Execute tool calls ───────────────────────────────────────────
          const functionOutputs: unknown[] = []

          for (const call of toolCalls) {
            const callId = call.call_id!
            const args   = JSON.parse(call.arguments ?? "{}")

            emit({
              t: "tool.call.started",
              tool_use_id: callId,
              tool_name: call.name as "search_recipes" | "get_recipe_details",
              input: args,
            })

            try {
              if (call.name === "search_recipes") {
                const { matched, unmatched } = await execSearchRecipes(args, supabase, openAiKey)
                const cards = matched.map((m) => m.recipe)

                if (cards.length > 0) emit({ t: "recipe.cards", items: cards })

                // Compact payload → model: only query_label + recipe_id + title.
                // Image, caption, and tags are intentionally excluded from model context.
                functionOutputs.push({
                  type: "function_call_output",
                  call_id: callId,
                  output: JSON.stringify({
                    results: matched.map((m) => ({
                      query_label: m.label,
                      recipe_id: m.recipe.id,
                      title: m.recipe.title,
                    })),
                    unmatched,
                  }),
                })
              } else {
                const result = await execGetRecipeDetails(args, supabase)

                if (!result.found) {
                  // ID was never returned by search_recipes for this user — model must say so.
                  const notFound = { not_found: true, recipe_id: result.recipe_id }
                  functionOutputs.push({
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(notFound),
                  })
                } else {
                  functionOutputs.push({
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(result.output.recipe),
                  })
                }
              }
            } catch (toolErr) {
              emit({ t: "tool.call.failed", tool_use_id: callId, message: String(toolErr) })
              functionOutputs.push({
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify({ error: String(toolErr) }),
              })
            }
          }

          // Advance input for next round: prior output + tool results
          input = [...input, ...output, ...functionOutputs]
        }

        // Persist everything added this turn (user message + model output + tool I/O).
        await session.addItems(
          (input.slice(priorItems.length) as Record<string, unknown>[])
        )

        emit({ t: "message.completed" })
      } catch (err) {
        emit({ t: "error", message: String(err) })
      } finally {
        emit({ t: "done" })
        await flush()
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
