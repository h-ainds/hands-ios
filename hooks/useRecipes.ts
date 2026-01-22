import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Recipe } from '@/types'

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRecipes()
  }, [])

  const loadRecipes = async () => {
    try {
      setLoading(true)
      console.log('Fetching recipes...')
      
      // Try to get current user, but don't fail if not logged in
      const { data: { user } } = await supabase.auth.getUser()
      console.log('User:', user?.id || 'Not logged in')

      // For testing: fetch ALL recipes (remove user filter)
      const { data, error: fetchError } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20) // Limit to 20 for testing

      if (fetchError) {
        console.error('Supabase error:', fetchError)
        setError(fetchError.message)
        return
      }

      console.log('Recipes fetched:', data?.length || 0)
      setRecipes(data || [])
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return { recipes, loading, error, refetch: loadRecipes }
}