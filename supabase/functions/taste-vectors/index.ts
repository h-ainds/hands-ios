// Supabase Edge Function: taste-vectors
// Generate taste preference vectors from user input text using OpenAI

import { serve } from 'std/http/server'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TasteVectorsRequest {
  tasteText: string
}

/**
 * Clean JSON response by removing markdown code blocks
 */
function cleanJSON(str: string): string {
  return str.replace(/```json|```/g, '').trim()
}

const NEUTRAL_FALLBACKS = [
  'Variety of cuisines',
  'Home cooking',
  'Fresh ingredients',
  'Balanced meals',
  'Quick weeknight meals',
  'Comfort food',
]

/**
 * Generate 6-7 taste preference chips from raw text using OpenAI.
 * Returns array of 6 or 7 strings; validates and normalizes (dedupe, trim, length).
 */
async function generateTastePreferences(rawText: string, openAiKey: string): Promise<string[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Interpret a user's brief preference description and expand it into 6-7 detailed, specific personal preferences in the style of food/dietary habits (e.g., "prefers spicy red meat," "loves shrimp," "likes kale," "avoids gluten"). Your goal is to infer diverse, plausible preferences by reasoning step-by-step about possible likes, dislikes, and dietary choices implied by the initial description. Do not simply rephrase the input; extract and extrapolate specific attributes.

Reason internally: Analyze the user's description, deduce underlying preferences, infer implied likes/dislikes, consider common dietary patterns, and elaborate as needed.

Persist through all reasoning and deduction for each preference before producing the final output.

Only after reasoning, present exactly 6-7 distinct, well-phrased personal food preferences.

If details in the input are lacking, make logical or neutral inferences to complete the list (blend concrete inferences with reasonable assumptions).

Avoid generalities ("likes food," "enjoys eating"); be specific and creative.

Do not invent medical conditions or allergies unless strongly implied by the input.

Output format:
Output ONLY valid JSON in the following exact shape:
{"preferences":["...","...","...","...","...","..."]}

The array length must be either 6 or 7.

Each string should clearly state a single, concrete personal preference or dietary trait.

Do not include markdown, bullets, commentary, or additional keys—JSON only.`
        },
        {
          role: 'user',
          content: rawText
        }
      ],
      temperature: 0.5,
      max_tokens: 400,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API error: ${err}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid OpenAI response: missing content')
  }

  const cleaned = cleanJSON(content)
  let parsed: { preferences?: unknown }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Invalid JSON from OpenAI')
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.preferences)) {
    throw new Error('Invalid shape: preferences array required')
  }

  let list = (parsed.preferences as unknown[])
    .filter((x): x is string => typeof x === 'string')
    .map(s => s.trim())
    .filter(Boolean)

  const seen = new Set<string>()
  list = list.filter(s => {
    const key = s.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (list.length > 7) {
    list = list.slice(0, 7)
  }
  while (list.length < 6) {
    const next = NEUTRAL_FALLBACKS[list.length % NEUTRAL_FALLBACKS.length]
    if (!list.includes(next)) list.push(next)
    else list.push(`Preference ${list.length + 1}`)
  }

  return list
}

/**
 * Call OpenAI to generate taste vectors
 */
async function generateTasteVectors(tasteText: string): Promise<any> {
  const openAiKey = Deno.env.get('OPENAI_API_KEY')

  if (!openAiKey) {
    throw new Error('OPENAI_API_KEY not configured in Supabase Edge Function secrets')
  }

  // OPTION 1: Using your prompt service (if you have askOpenAI service)
  // Replace this with your actual prompt service call
  // const result = await askOpenAI({
  //   promptId: "pmpt_69406cd8596c8197a7f08a7dd5d592510ca08c3d1237f0c5",
  //   version: "4",
  //   variables: { taste_text: tasteText }
  // })

  // OPTION 2: Direct OpenAI API call
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a taste preference analyzer. Given user's food preferences,
          extract key taste vectors and return them as JSON. Include vectors for:
          - Cuisine preferences (italian, asian, mexican, etc.)
          - Dietary restrictions (vegetarian, vegan, gluten-free, etc.)
          - Taste preferences (spicy, sweet, savory, etc.)
          - Ingredient likes/dislikes
          - Cooking style preferences

          Return ONLY valid JSON with no markdown formatting.`
        },
        {
          role: 'user',
          content: `Analyze these taste preferences: "${tasteText}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${error}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  // Clean and parse the response
  const cleaned = cleanJSON(content)
  return JSON.parse(cleaned)
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify authentication: extract JWT and resolve user (required in Edge Functions)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      throw new Error('Missing Bearer token')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[TasteVectors] Auth failed:', userError?.message ?? 'No user')
      throw new Error('Unauthorized')
    }

    // Parse request body
    const { tasteText }: TasteVectorsRequest = await req.json()

    if (!tasteText || typeof tasteText !== 'string') {
      throw new Error('Invalid request: tasteText is required')
    }

    // Generate taste vectors and preference chips (same LLM provider)
    console.log(`[TasteVectors] Generating vectors and preferences for user ${user.id}`)
    const openAiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAiKey) {
      throw new Error('OPENAI_API_KEY not configured in Supabase Edge Function secrets')
    }

    const vectors = await generateTasteVectors(tasteText)

    let preferences: string[] = []
    try {
      preferences = await generateTastePreferences(tasteText, openAiKey)
    } catch (prefErr) {
      console.warn('[TasteVectors] Preferences generation failed, retrying once:', prefErr)
      try {
        preferences = await generateTastePreferences(tasteText, openAiKey)
      } catch (retryErr) {
        console.error('[TasteVectors] Preferences retry failed:', retryErr)
        preferences = NEUTRAL_FALLBACKS.slice(0, 7)
      }
    }

    // Return the vectors and preferences for chip rendering
    return new Response(
      JSON.stringify({
        success: true,
        vectors,
        tasteText,
        preferences,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('[TasteVectors] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate taste vectors',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Unauthorized' ? 401 : 500,
      }
    )
  }
})
