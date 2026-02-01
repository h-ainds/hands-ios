/**
 * Taste Vectorization Utility
 *
 * Calls the Supabase Edge Function to generate taste vectors from user preference text.
 */

import { supabase } from '@/lib/supabase/client'

/**
 * Create taste vectors from taste preference text
 *
 * Calls the Supabase Edge Function 'taste-vectors' which uses OpenAI
 * to analyze the user's taste preferences and return structured vectors.
 *
 * @param tasteText - User's taste preferences as free text
 * @returns Taste vectors object with structured preference data
 */
export async function createTasteVectors(tasteText: string): Promise<any> {
  try {
    console.log('[TasteVectorization] Calling edge function with taste text')

    // Get the current session to ensure we have a valid auth token
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error('Not authenticated')
    }

    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('taste-vectors', {
      body: { tasteText },
    })

    if (error) {
      console.error('[TasteVectorization] Edge function error:', error)
      throw new Error(error.message || 'Failed to generate taste vectors')
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Failed to generate taste vectors')
    }

    console.log('[TasteVectorization] Successfully generated taste vectors')
    return data.vectors || {}
  } catch (error) {
    console.error('[TasteVectorization] Error creating taste vectors:', error)

    // Return empty object on error to allow onboarding to continue
    // This prevents the onboarding flow from breaking if vectorization fails
    console.warn('[TasteVectorization] Returning empty vectors due to error')
    return {}
  }
}
