import { supabase } from './client'

export async function trackRecipeView(recipeId: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('recipe_interactions')
      .upsert(
        { 
          user_id: user.id, 
          recipe_id: recipeId, 
          viewed_at: new Date().toISOString(),
          is_featured: false
        },
        { onConflict: 'user_id,recipe_id,is_featured' }
      )
    
    if (error) {
      console.error('Recipe view tracking error:', error)
    }
  } catch (err) {
    console.error('Failed to track recipe view:', err)
  }
}

export async function trackRecipeInteraction(
  recipeId: string, 
  interactionType: 'view' | 'tap' | 'share' | 'save' = 'view'
) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const timestamp = new Date().toISOString()
    const updateData: Record<string, any> = {
      user_id: user.id,
      recipe_id: recipeId,
    }

    updateData.viewed_at = timestamp
    updateData.is_featured = false

    const { error } = await supabase
      .from('recipe_interactions')
      .upsert(updateData, { onConflict: 'user_id,recipe_id,is_featured' })
    
    if (error) {
      console.error(`Recipe ${interactionType} tracking error:`, error)
    }
  } catch (err) {
    console.error(`Failed to track recipe ${interactionType}:`, err)
  }
}

export async function trackRecipeCardView(recipeId: string) {
  return trackRecipeInteraction(recipeId, 'view')
}

export async function trackRecipeCardTap(recipeId: string) {
  return trackRecipeInteraction(recipeId, 'tap')
}