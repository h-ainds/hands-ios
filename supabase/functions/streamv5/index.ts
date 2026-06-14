import "@supabase/functions-js/edge-runtime"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const SYSTEM_PROMPT =
  "You are a personal chef. You help users get recipe ideas, plan meals, create weekly menus, and generate shopping lists. Always indicate recipes or a likely recipe concept with lightweight hint by wrapping the title inside these two [ ] "

interface RequestBody {
  prompt: string
  context?: unknown[]
  imageBase64?: string
  mimeType?: string
}

const ALLOWED_VISION_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  if (!openaiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const { prompt, context = [], imageBase64, mimeType } = body

  if (!prompt || typeof prompt !== "string") {
    return new Response(
      JSON.stringify({ error: "prompt is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  const hasImage =
    typeof imageBase64 === "string" &&
    imageBase64.length > 0 &&
    typeof mimeType === "string" &&
    ALLOWED_VISION_TYPES.includes(mimeType)

  const userContent = hasImage
    ? [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` },
      ]
    : prompt

  // Build input: prior context + new user message
  const input = [...context, { role: "user", content: userContent }]

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      instructions: SYSTEM_PROMPT,
      input,
      stream: true,
    }),
  })

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text()
    console.error(`[streamv5] OpenAI error ${openaiResponse.status}:`, errorText.slice(0, 300))
    return new Response(
      JSON.stringify({ error: `OpenAI API error: ${openaiResponse.status}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }

  // Proxy the SSE stream directly to the client
  return new Response(openaiResponse.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
})
