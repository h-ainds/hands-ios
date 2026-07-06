import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"
import { SYSTEM_PROMPT, TOOLS } from "./agent.ts"
import { deduplicateByRecipeId } from "./search.ts"
import type { SearchRow, LabelResult, DeduplicateResult } from "./search.ts"
import type { GetRecipeDetailsOutput, ServerEvent } from "../../../types/chat.ts"
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

// ── Image attachments ─────────────────────────────────────────────────────────

const ATTACHMENTS_BUCKET = "chat-attachments"

// Base64-encode bytes without pulling in a dependency. Chunked so large images
// don't blow the argument limit of String.fromCharCode / the call stack.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

// Fetch a chat image server-side (service role) from private Storage and encode
// it as a data URL for the Responses API's native `input_image` part. Scoped to
// the caller's conversation_id so a request can't reference another chat's image.
// Returns null on any miss so vision degrades to text-only rather than failing.
async function loadAttachmentDataUrl(
  supabase: SupabaseClient,
  attachmentId: string,
  conversationId: string,
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from("attachments")
    .select("storage_path, mime_type")
    .eq("id", attachmentId)
    .eq("conversation_id", conversationId)
    .maybeSingle()
  if (error || !row?.storage_path) {
    if (error) console.error("[attachment] lookup failed:", error.message)
    return null
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .download(row.storage_path as string)
  if (dlErr || !blob) {
    console.error("[attachment] download failed:", dlErr?.message ?? "no data")
    return null
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const mime = (row.mime_type as string) || "image/jpeg"
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

// ── OpenAI Responses API (streaming) ─────────────────────────────────────────

type ResponsesOutput = Array<{
  type: string
  call_id?: string
  name?: string
  arguments?: string
  content?: Array<{ type: string; text?: string }>
}>

// Yields parsed JSON objects from an SSE response body, one per `data:` line.
async function* readSSEData(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split("\n")
      buf = lines.pop()!
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const raw = line.slice(6).trim()
        if (raw === "[DONE]") return
        try { yield JSON.parse(raw) } catch { /* skip malformed frames */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// store: false — SupabaseSession is the sole state mechanism.
// raw_model_stream_event (response.output_text.delta) → emit text.delta in real time.
// run_item_stream_event / tool_called (response.output_item.done, function_call) → emit tool.call.started.
// message_output_created (response.output_item.done, message) → collected; caller emits message.completed.
async function streamRound(
  input: unknown[],
  apiKey: string,
  emit: (event: ServerEvent) => void,
): Promise<ResponsesOutput> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, instructions: SYSTEM_PROMPT, input, tools: TOOLS, store: false, stream: true }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  if (!res.body) throw new Error("OpenAI response has no body")

  const output: ResponsesOutput = []

  for await (const ev of readSSEData(res.body)) {
    // Diagnostic: pin exact discriminant and tool_called arg field for this SDK version.
    const e = ev as Record<string, unknown>
    console.log("[stream]", e.type)

    if (e.type === "response.output_text.delta") {
      emit({ t: "text.delta", delta: String(e.delta ?? "") })
    } else if (e.type === "response.output_item.done") {
      const item = e.item as ResponsesOutput[number]
      output.push(item)
      if (item.type === "function_call") {
        // Log full item to verify call_id + arguments field names in this SDK version.
        console.log("[stream:tool_called]", JSON.stringify(item).slice(0, 400))
        let parsedInput: Record<string, unknown> = {}
        try { parsedInput = JSON.parse(item.arguments ?? "{}") } catch { /* use empty */ }
        emit({
          t: "tool.call.started",
          tool_use_id: item.call_id ?? "",
          tool_name: item.name as "search_recipes" | "get_recipe_details",
          input: parsedInput,
        })
      }
    }
  }

  return output
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
  let reqBody: { message?: string; conversation_id?: string; attachment_id?: string; previous_response_id?: unknown }
  try { reqBody = await req.json() } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { message, conversation_id, attachment_id, previous_response_id } = reqBody
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

        // Native multimodal: inline the image as an input_image part for THIS turn
        // only. userMsgForStore (text-only) is what we persist, so later turns
        // don't reload/resend the base64 — keeps context lean and cost bounded.
        const userMsgForStore: Record<string, unknown> = { role: "user", content: message }
        let userMsg: Record<string, unknown> = userMsgForStore
        if (attachment_id) {
          const dataUrl = await loadAttachmentDataUrl(supabase, attachment_id, conversationId)
          if (dataUrl) {
            userMsg = {
              role: "user",
              content: [
                { type: "input_text", text: message },
                { type: "input_image", image_url: dataUrl },
              ],
            }
          }
        }

        let input: unknown[] = [...priorItems, userMsg]

        for (let round = 0; round < MAX_ROUNDS; round++) {
          // Text deltas and tool.call.started events are emitted inside streamRound.
          const output = await streamRound(input, openAiKey, emit)
          const toolCalls = output.filter((o) => o.type === "function_call")

          // ── No tool calls: message_output_created — final text already streamed ──
          if (toolCalls.length === 0) {
            input = [...input, ...output]
            break
          }

          // ── Execute tool calls ───────────────────────────────────────────
          const functionOutputs: unknown[] = []

          for (const call of toolCalls) {
            const callId = call.call_id!
            const args   = JSON.parse(call.arguments ?? "{}")

            try {
              if (call.name === "search_recipes") {
                const { matched, unmatched } = await execSearchRecipes(args, supabase, openAiKey)
                const cards = matched.map((m) => m.recipe)

                if (cards.length > 0) emit({ t: "recipe.cards", tool_use_id: callId, items: cards })

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
        // Replace the inlined-image user message with the text-only copy so the
        // base64 never lands in conversation_items.
        const newItems = input.slice(priorItems.length) as Record<string, unknown>[]
        if (newItems.length > 0) newItems[0] = userMsgForStore
        await session.addItems(newItems)

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
