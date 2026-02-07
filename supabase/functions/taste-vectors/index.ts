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
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Parse request body
    const { tasteText }: TasteVectorsRequest = await req.json()

    if (!tasteText || typeof tasteText !== 'string') {
      throw new Error('Invalid request: tasteText is required')
    }

    // Generate taste vectors
    console.log(`[TasteVectors] Generating vectors for user ${user.id}`)
    const vectors = await generateTasteVectors(tasteText)

    // Return the vectors
    return new Response(
      JSON.stringify({
        success: true,
        vectors,
        tasteText,
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
