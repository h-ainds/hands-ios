/**
 * Taste Vectorization Utility
 *
 * Calls the Supabase Edge Function to generate taste vectors from user preference text.
 */

import { supabase } from '@/lib/supabase/client'

export interface TasteVectorizationResult {
  vectors: Record<string, unknown>
  preferences: string[]
}

/**
 * Create taste vectors and preference chips from taste preference text.
 *
 * Calls the Supabase Edge Function 'taste-vectors' which uses OpenAI
 * to analyze the user's taste preferences and return structured vectors
 * and 6-7 chip strings.
 *
 * @param tasteText - User's taste preferences as free text
 * @returns { vectors, preferences } for storage and chip rendering
 */
export async function createTasteVectors(tasteText: string): Promise<TasteVectorizationResult> {
  try {
    console.log('[TasteVectorization] Calling edge function with taste text')

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error('Not authenticated')
    }

    const { data, error } = await supabase.functions.invoke('taste-vectors', {
      body: { tasteText },
    })

    if (error) {
      console.warn('[TasteVectorization] Edge function returned error (onboarding will continue without vectors/chips):', error.message)
      return { vectors: {}, preferences: [] }
    }

    if (!data?.success) {
      console.warn('[TasteVectorization] Edge function reported failure:', data?.error)
      return { vectors: {}, preferences: [] }
    }

    const preferences = Array.isArray(data.preferences)
      ? (data.preferences as string[]).map((s: string) => String(s).trim()).filter(Boolean)
      : []

    const prefCount = Array.isArray(data.preferences) ? data.preferences.length : 0
    console.log('[TasteVectorization] Success:', prefCount, 'preference chips')
    return {
      vectors: data.vectors || {},
      preferences,
    }
  } catch (error) {
    console.error('[TasteVectorization] Error creating taste vectors:', error)
    console.warn('[TasteVectorization] Returning empty vectors and no preferences due to error')
    return { vectors: {}, preferences: [] }
  }
}
