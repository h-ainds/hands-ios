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
  ingredients: Ingredient[]
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

    const messages = buildMessages(body.imageBase64, body.mimeType)
    const ingredients = await callOpenAIChat(openaiKey, messages)

    const responseBody: AnalyzeImageResponse = { ingredients }

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

