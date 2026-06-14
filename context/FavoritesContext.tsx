import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import type { Recipe } from '@/types'

type FavoriteRecipeRow = {
  recipe_id: number
  recipes: Recipe | null
}

function isMissingFavoritesTable(error: unknown) {
  const maybeError = error as { code?: string } | null
  return maybeError?.code === 'PGRST205'
}

interface FavoritesContextValue {
  favorites: Recipe[]
  favoriteIds: Set<number>
  loading: boolean
  error: string | null
  isFavorite: (recipeId: string | number) => boolean
  addFavorite: (recipeId: string | number) => Promise<boolean>
  removeFavorite: (recipeId: string | number) => Promise<boolean>
  toggleFavorite: (recipeId: string | number) => Promise<boolean | undefined>
  refresh: () => Promise<void>
  pendingRecipeIds: Set<number>
  favoritesAvailable: boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [favorites, setFavorites] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [favoritesAvailable, setFavoritesAvailable] = useState(true)

  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteIds(new Set())
      setFavorites([])
      setFavoritesAvailable(true)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('user_favorite_recipes')
        .select(
          'recipe_id, recipes!inner(id,title,image,caption,steps,tags,created_at,updated_at,searchable_title,url,ingredients)'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setFavoritesAvailable(true)

      const rows = (data ?? []) as FavoriteRecipeRow[]
      const ids = new Set<number>()
      const recipeList: Recipe[] = []

      rows.forEach((row) => {
        const id = Number(row.recipe_id)
        if (Number.isFinite(id) && id > 0) ids.add(id)
        if (row.recipes?.id && row.recipes?.title) recipeList.push(row.recipes)
      })

      setFavoriteIds(ids)
      setFavorites(recipeList)
    } catch (err) {
      if (isMissingFavoritesTable(err)) {
        setFavoritesAvailable(false)
        setFavoriteIds(new Set())
        setFavorites([])
        setError(null)
        return
      }
      console.error('Error loading favorites:', err)
      setError(err instanceof Error ? err.message : 'Failed to load favorites')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const isFavorite = useCallback(
    (recipeId: string | number) => {
      const numericId = Number(recipeId)
      return Number.isFinite(numericId) && favoriteIds.has(numericId)
    },
    [favoriteIds]
  )

  const addFavorite = useCallback(
    async (recipeId: string | number) => {
      if (!user) throw new Error('You must be signed in to favorite recipes')
      if (!favoritesAvailable) return false
      const numericId = Number(recipeId)
      if (!Number.isFinite(numericId) || numericId <= 0) return false

      setFavoriteIds((prev) => new Set(prev).add(numericId))
      setPendingIds((prev) => new Set(prev).add(numericId))

      try {
        const { error: insertError } = await supabase
          .from('user_favorite_recipes')
          .insert({ user_id: user.id, recipe_id: numericId })

        if (insertError) throw insertError
        await loadFavorites()
        return true
      } catch (err) {
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          next.delete(numericId)
          return next
        })
        if (isMissingFavoritesTable(err)) {
          setFavoritesAvailable(false)
          return false
        }
        throw err
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(numericId)
          return next
        })
      }
    },
    [favoritesAvailable, loadFavorites, user]
  )

  const removeFavorite = useCallback(
    async (recipeId: string | number) => {
      if (!user) throw new Error('You must be signed in to modify favorites')
      if (!favoritesAvailable) return false
      const numericId = Number(recipeId)
      if (!Number.isFinite(numericId) || numericId <= 0) return false

      setFavoriteIds((prev) => {
        const next = new Set(prev)
        next.delete(numericId)
        return next
      })
      setPendingIds((prev) => new Set(prev).add(numericId))
      setFavorites((prev) => prev.filter((recipe) => Number(recipe.id) !== numericId))

      try {
        const { error: deleteError } = await supabase
          .from('user_favorite_recipes')
          .delete()
          .eq('user_id', user.id)
          .eq('recipe_id', numericId)

        if (deleteError) throw deleteError
        await loadFavorites()
        return true
      } catch (err) {
        setFavoriteIds((prev) => new Set(prev).add(numericId))
        if (isMissingFavoritesTable(err)) {
          setFavoritesAvailable(false)
          return false
        }
        throw err
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(numericId)
          return next
        })
      }
    },
    [favoritesAvailable, loadFavorites, user]
  )

  const toggleFavorite = useCallback(
    async (recipeId: string | number) => {
      if (isFavorite(recipeId)) {
        return removeFavorite(recipeId)
      }
      return addFavorite(recipeId)
    },
    [addFavorite, isFavorite, removeFavorite]
  )

  const pendingRecipeIds = useMemo(() => pendingIds, [pendingIds])

  const value: FavoritesContextValue = {
    favorites,
    favoriteIds,
    loading,
    error,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    refresh: loadFavorites,
    pendingRecipeIds,
    favoritesAvailable,
  }

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider')
  return ctx
}
