import "@supabase/functions-js/edge-runtime"
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface RequestBody {
  prompt: string
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
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

// Extract key context (ingredients and meal types) from conversation history
function extractContext(conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>, currentPrompt?: string): { ingredients: string[], mealTypes: string[] } {
  const ingredients: string[] = []
  const mealTypes: string[] = []
  
  // Common ingredient keywords
  const ingredientKeywords = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp', 'turkey', 'lamb', 
    'vegetables', 'vegetable', 'pasta', 'rice', 'quinoa', 'potato', 'tomato', 'onion', 'garlic', 
    'cheese', 'milk', 'eggs', 'tofu', 'beans', 'lentils', 'mushroom', 'spinach', 'kale', 'broccoli']
  
  // Meal type keywords
  const mealTypeKeywords = ['breakfast', 'lunch', 'dinner', 'snack', 'appetizer', 'dessert', 'brunch']
  
  // Combine all text from conversation
  const allText = [
    ...(conversationHistory || []).map(msg => msg.content.toLowerCase()),
    ...(currentPrompt ? [currentPrompt.toLowerCase()] : [])
  ].join(' ')
  
  // Extract ingredients
  ingredientKeywords.forEach(keyword => {
    if (allText.includes(keyword)) {
      ingredients.push(keyword)
    }
  })
  
  // Extract meal types
  mealTypeKeywords.forEach(keyword => {
    if (allText.includes(keyword)) {
      mealTypes.push(keyword)
    }
  })
  
  return { ingredients, mealTypes }
}

// Build a focused embedding query that emphasizes ingredients and meal types
function buildEmbeddingQuery(
  currentPrompt: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
): string {
  const context = extractContext(conversationHistory, currentPrompt)
  
  // Build focused query prioritizing ingredients and meal types
  const parts: string[] = []
  
  // Add ingredients first (most important for recipe matching)
  if (context.ingredients.length > 0) {
    parts.push(context.ingredients.join(' '))
  }
  
  // Add meal type
  if (context.mealTypes.length > 0) {
    parts.push(context.mealTypes.join(' '))
  }
  
  // Add current prompt if it adds new information
  if (currentPrompt && !parts.some(part => currentPrompt.toLowerCase().includes(part.toLowerCase()))) {
    parts.push(currentPrompt)
  }
  
  // If we have context, use it; otherwise fall back to current prompt
  return parts.length > 0 ? parts.join(' ') : currentPrompt
}

// Build the system prompt with recipe context for RAG
function buildSystemPrompt(
  recipes: Recipe[],
  extractedContext?: { ingredients: string[], mealTypes: string[] }
): string {
  if (recipes.length === 0) {
    return `
You are Hands, a friendly and enthusiastic cooking assistant. Be warm, conversational, and helpful.

Remember context from the conversation history. If the user mentioned ingredients (like "chicken") or meal types (like "lunch", "breakfast", "dinner") in previous messages, acknowledge that.

No recipes were found matching the user's request, but be friendly and helpful in your response.

Output EXACTLY this XML structure:

<answer>
  <text>
    Your friendly response here. Apologize that you couldn't find matching recipes, and suggest they try describing what ingredients they have or what type of dish they're looking for. Be warm and encouraging!
  </text>
  <items>
  </items>
</answer>

Rules:
- Be friendly and conversational
- Do not output anything outside XML
`.trim()
  }

  const recipeContext = recipes
    .map((r, i) => `${i + 1}. ${r.id} - ${r.title} — ${r.caption} - ${r.image}`)
    .join("\n")

  // Build context summary for the AI
  let contextSummary = ""
  if (extractedContext) {
    const contextParts: string[] = []
    if (extractedContext.ingredients.length > 0) {
      contextParts.push(`INGREDIENTS: ${extractedContext.ingredients.join(', ')}`)
    }
    if (extractedContext.mealTypes.length > 0) {
      contextParts.push(`MEAL TYPE: ${extractedContext.mealTypes.join(', ')}`)
    }
    if (contextParts.length > 0) {
      const hasBoth = extractedContext.ingredients.length > 0 && extractedContext.mealTypes.length > 0
      if (hasBoth) {
        contextSummary = `\n\nCRITICAL CONTEXT FROM CONVERSATION:\n${contextParts.join('\n')}\n\n⚠️ USER HAS SPECIFIED BOTH INGREDIENTS AND MEAL TYPE!\nYou MUST ONLY show recipes that:\n1. Contain/include the specified ingredients: ${extractedContext.ingredients.join(', ')}\n2. AND are appropriate for the meal type: ${extractedContext.mealTypes.join(', ')}\n\nDo NOT show recipes that only match one criterion. They MUST match BOTH.`
      } else {
        contextSummary = `\n\nCRITICAL CONTEXT FROM CONVERSATION:\n${contextParts.join('\n')}\n\nYou MUST prioritize recipes that match the specified criteria.`
      }
    }
  }

  // Determine context state
  const hasIngredients = extractedContext && extractedContext.ingredients.length > 0
  const hasMealType = extractedContext && extractedContext.mealTypes.length > 0
  const hasBothContext = hasIngredients && hasMealType
  const hasAnyContext = hasIngredients || hasMealType
  const hasNoContext = !hasIngredients && !hasMealType

  return `
You are Hands, a friendly and enthusiastic cooking assistant. Be warm, conversational, and helpful in your responses.

CONTEXT AWARENESS:
- Remember everything the user has mentioned in the conversation${contextSummary ? ' (see context above)' : ''}
- Use whatever context is available (ingredients, meal type, or both)
- Show recipes that match the available context
- Be friendly and enthusiastic about the recipes you're recommending

${hasNoContext ? `
IMPORTANT: The user hasn't specified ingredients or meal type yet. You should ask friendly follow-up questions to help them find the perfect recipes. Ask about:
- What meal they're planning (breakfast, lunch, dinner, snack)
- What ingredients they have or want to use
Be warm and conversational, like "I'd love to help! What meal are you planning for—breakfast, lunch, or dinner? And do you have any specific ingredients you'd like to use?"
` : hasBothContext ? `
RECIPE SELECTION:
- The user has specified BOTH ingredients AND meal type
- Show recipes that match BOTH the ingredients AND the meal type
- Filter recipes to only include those matching both criteria
${extractedContext && extractedContext.ingredients.length > 0 && extractedContext.mealTypes.length > 0
  ? `\nFILTERING: Show only recipes that contain ${extractedContext.ingredients.join(' and/or ')} AND are for ${extractedContext.mealTypes.join(' or ')}.`
  : ''}
` : `
RECIPE SELECTION:
- The user has specified ${hasIngredients ? `ingredients: ${extractedContext!.ingredients.join(', ')}` : `meal type: ${extractedContext!.mealTypes.join(', ')}`}
- Show recipes that match this context
- Be enthusiastic about the recipes! For example: "${hasIngredients ? extractedContext!.ingredients.join(' and ') : extractedContext!.mealTypes.join(' or ')} ${hasIngredients ? 'is' : 'are'} ${hasIngredients ? 'a great ingredient' : 'great'}! Here are some recipes!"
- Do NOT ask follow-up questions - just show the recipes with an enthusiastic message
`}

TONE & STYLE:
- Be friendly, warm, and enthusiastic
- Keep responses conversational and natural (under 25 words)
- Show excitement about the recipes you're recommending
- Use phrases like "I'd love to help!", "Here are some great options!", "These look delicious!"

${hasNoContext ? `
Note: Since the user hasn't specified ingredients or meal type, you should ask friendly follow-up questions instead of showing recipes.
` : `
Available recipes:
${recipeContext}
${contextSummary}
`}

OUTPUT FORMAT:
You MUST output complete, valid XML. Your ENTIRE response must be wrapped in this structure:

<answer>
  <text>
    ${hasNoContext 
      ? 'Your friendly response asking about ingredients and/or meal type (under 25 words). Be warm and helpful!'
      : hasBothContext
      ? `Your friendly, conversational response here (under 25 words). Be enthusiastic! The user wants ${extractedContext!.ingredients.join(' and ')} for ${extractedContext!.mealTypes.join(' or ')}. Show recipes matching BOTH!`
      : `Your friendly, enthusiastic response here (under 25 words). Show excitement about ${hasIngredients ? `the ingredient(s): ${extractedContext!.ingredients.join(' and ')}` : `the meal type: ${extractedContext!.mealTypes.join(' or ')}`}. Example: "${hasIngredients ? extractedContext!.ingredients.join(' and ') : extractedContext!.mealTypes.join(' or ')} ${hasIngredients ? 'is' : 'are'} ${hasIngredients ? 'a great ingredient' : 'great'}! Here are some recipes!" Do NOT ask follow-up questions - just be enthusiastic about the recipes!`
    }
  </text>
  <items>
    ${hasNoContext ? '' : recipes.map(() => `
    <item>
      <id></id>
      <title></title>
      <caption></caption>
      <image></image>
    </item>
    `).join("")}
  </items>
</answer>

RULES:
${hasNoContext ? `
- Do NOT output any <item> elements (leave <items> empty)
- Just ask friendly follow-up questions in the <text> tag
` : `
- Output between 1 and ${recipes.length} <item> elements from the available recipes
${hasMealType && !hasIngredients ? `- For vague requests like "${extractedContext!.mealTypes.join(' or ')} ideas", show ALL or most of the available recipes (aim for ${Math.min(12, recipes.length)} recipes) to give variety` : ''}
${hasBothContext ? `- IMPORTANT: The user specified BOTH ingredients (${extractedContext!.ingredients.join(', ')}) AND meal type (${extractedContext!.mealTypes.join(', ')}). Filter recipes to only show those matching BOTH.` : ''}
- Each <item> must use a recipe from the list above
- Do NOT invent recipes
- Filter recipes based on the user's context
- Do NOT ask follow-up questions when showing recipes - just be enthusiastic!
`}
- Your ENTIRE response must be valid XML (starting with <answer> and ending with </answer>)
- Do NOT output any text outside the XML tags
- Always close all tags completely
`.trim()
}

// Stream chat completion from OpenAI
async function streamChatCompletion(
  controller: ReadableStreamDefaultController,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
): Promise<void> {
  // Build messages array with conversation history
  const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
    { role: "system", content: systemPrompt },
  ]

  // Add conversation history if provided
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })
    })
  }

  // Add current user prompt
  messages.push({ role: "user", content: userPrompt })

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: messages,
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
    const { prompt, conversationHistory }: RequestBody = await req.json()

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Extract context and build focused embedding query
    const extractedContext = extractContext(conversationHistory, prompt)
    const embeddingQuery = buildEmbeddingQuery(prompt, conversationHistory)
    
    console.log('[Stream] Extracted context:', JSON.stringify(extractedContext))
    console.log('[Stream] Embedding query:', embeddingQuery)

    // Create streaming response - return immediately to prevent EarlyDrop
    // All async work happens inside the stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Generate embedding for the context-aware query
          const embedding = await generateEmbedding(embeddingQuery, openaiKey)

          // Determine how many recipes to retrieve based on context specificity
          // For vague requests (only meal type or no context), get more recipes
          const hasIngredients = extractedContext && extractedContext.ingredients.length > 0
          const hasMealType = extractedContext && extractedContext.mealTypes.length > 0
          const isVagueRequest = hasMealType && !hasIngredients
          
          // Call the match_recipes RPC function (RAG retrieval step)
          // Get more recipes for vague requests to show variety
          const matchCount = isVagueRequest ? 12 : 8
          const { data: rawRecipes, error: rpcError } = await supabaseAdmin.rpc("match_recipes", {
            query_embedding: embedding,
            match_count: matchCount,
          })

          if (rpcError) {
            console.error("RPC error:", rpcError)
            throw new Error(`Database error: ${rpcError.message}`)
          }

          // Transform the raw response to our Recipe format
          const recipes = transformRecipes(rawRecipes || [])

          // Build system prompt with retrieved recipes and extracted context
          const systemPrompt = buildSystemPrompt(recipes, extractedContext)

          // Stream the LLM response with conversation history
          await streamChatCompletion(controller, openaiKey, systemPrompt, prompt, conversationHistory)
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
