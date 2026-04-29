import { ScrollView, Image, Pressable, ActivityIndicator, Linking } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Recipe } from '@/types'
import BackButton from '@/components/BackButton'
import { trackRecipeView } from '@/lib/supabase/track'

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)

  useEffect(() => {
    loadRecipe()
  }, [id])

  const loadRecipe = async () => {
    try {
      const routeId = Array.isArray(id) ? id[0] : id
      const normalizedId = typeof routeId === 'string' ? Number(routeId) : Number(routeId)
      if (!Number.isFinite(normalizedId)) {
        console.warn(`[RecipeDetail] Invalid route id: ${String(routeId)}`)
        setRecipe(null)
        return
      }

      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, image, caption, steps, tags, created_at, updated_at, searchable_title, user_id, url, ingredients')
        .eq('id', normalizedId)
        .single()

      if (!error && data) {
        setRecipe(data)
        
        if (data?.id) {
          await trackRecipeView(data.id)
          console.log('Tracked view for recipe:', data.id)
        }
        return
      }

      // Backward-compatibility fallback:
      // if a legacy route uses featured_library.id, resolve to recipes.id.
      const { data: featuredRow, error: featuredError } = await supabase
        .from('featured_library')
        .select('recipe_id')
        .eq('id', normalizedId)
        .maybeSingle()

      if (featuredError) {
        console.error('[RecipeDetail] featured_library fallback failed:', featuredError)
        throw error ?? featuredError
      }

      if (!featuredRow?.recipe_id) {
        console.warn(`[RecipeDetail] No recipe found for route id=${routeId}`)
        setRecipe(null)
        return
      }

      console.warn(
        `[RecipeDetail] Resolved legacy featured_library.id=${routeId} to recipes.id=${featuredRow.recipe_id}`
      )

      const { data: fallbackRecipe, error: fallbackRecipeError } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', featuredRow.recipe_id)
        .maybeSingle()

      if (fallbackRecipeError || !fallbackRecipe) {
        if (fallbackRecipeError) {
          console.error('[RecipeDetail] Failed loading fallback recipe:', fallbackRecipeError)
        }
        setRecipe(null)
        return
      }

      setRecipe(fallbackRecipe)
      
      if (fallbackRecipe?.id) {
        await trackRecipeView(fallbackRecipe.id)
        console.log('Tracked view for recipe:', fallbackRecipe.id)
      }
    } catch (error) {
      console.error('Error loading recipe:', error instanceof Error ? error.message : JSON.stringify(error))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!recipe) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text>Recipe not found</Text>
      </View>
    )
  }

  // Parse ingredients - handle both flat array { "Ingredients": [...] }
  // and grouped object { "Dry Ingredients": [...], "Wet Ingredients": [...] }
  type IngredientsMap = Record<string, string[]>

  const parseIngredients = (raw: IngredientsMap | null): IngredientsMap => {
    if (!raw || typeof raw !== 'object') return {}
    const keys = Object.keys(raw)
    if (keys.length === 0) return {}
    // Flat format: single key named "Ingredients"
    if (keys.length === 1 && keys[0] === 'Ingredients') {
      return { '': raw['Ingredients'] }
    }
    // Grouped format: return as-is
    return raw
  }

  const ingredientsGrouped = parseIngredients(recipe.ingredients as IngredientsMap)
  const hasIngredients = Object.values(ingredientsGrouped).some(arr => arr?.length > 0)

  return (
    <ScrollView className="flex-1 bg-white">
      {/* Back Button */}
      <BackButton />
      <Pressable
        onPress={() => setIsFavorited((prev) => !prev)}
        className="absolute top-[56px] right-4 z-40 bg-white rounded-full w-9 h-9 items-center justify-center shadow-md"
      >
        <View className="w-6 h-6 items-center justify-center">
          {isFavorited ? (
            <SymbolView name="checkmark" size={16} weight="bold" tintColor="#16a34a" />
          ) : (
            <SymbolView name="plus" size={16} weight="bold" tintColor="#111827" />
          )}
        </View>
      </Pressable>
      
      {recipe.image && (
        <Image source={{ uri: recipe.image }} className="w-full h-[300px] bg-gray-300" />
      )}
      
      <View className="p-4">
        <Text className="text-3xl text-black font-extrabold tracking-tighter leading-none mb-4 mt-2">
          {recipe.title}
        </Text>
        
        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
  <Text className="text-sm font-medium text-secondary-placeholder mb-3">
    {recipe.tags.join(' • ')}
  </Text>
)}

        {/* Caption */}
        {recipe.caption ? (
          <View className="relative mb-3">
            <Text
              className="text-base text-secondary-placeholder leading-6"
              numberOfLines={isExpanded ? undefined : 2}
            >
              {recipe.caption}
            </Text>

            <Pressable
              onPress={() => setIsExpanded(!isExpanded)}
              className="absolute bottom-0 right-0 pl-1"
            >
              {/* Gradient fade */}
              {!isExpanded && (
                <View className="absolute inset-0 bg-white opacity-100" />
              )}

              <Text className="text-[15px] font-medium text-secondary-active">
                {isExpanded ? 'Less' : 'More'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text className="text-[15px] text-gray-400 mb-4 italic">
            No caption provided.
          </Text>
        )}

        {/* Ingredients - supports both flat and grouped formats */}
        {hasIngredients && (
          <View className="mt-4">
            <Text className="text-2xl tracking-tighter font-bold mb-3">Ingredients</Text>
            {Object.entries(ingredientsGrouped).map(([groupName, items]) => (
              <View key={groupName} className="mb-4">
                {/* Only render subheading if it's a named group (not the flat '' key) */}
                {groupName.length > 0 && (
                  <Text className="text-base font-semibold text-black mb-2 uppercase tracking-wide">
                    {/* Strip trailing colon if present, e.g. "Baking:" → "Baking" */}
                    {groupName.replace(/:$/, '')}
                  </Text>
                )}
                {items?.map((ingredient, index) => (
                  <Text key={index} className="text-base mb-2">• {ingredient}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

{recipe.steps && recipe.steps.length > 0 && (
  <View className="mt-6">
    <Text className="text-2xl font-bold mb-3 tracking-tighter">Steps</Text>
    {recipe.steps.map((step, index) => (
      <View key={index} className="mb-6">
        <Text className="text-2xl font-extrabold text-secondary-active leading-none mb-1">
          {index + 1}
        </Text>
        <Text className="text-base leading-6 text-black">
          {step}
        </Text>
      </View>
    ))}
  </View>
)}

{recipe.url && (
  <View className="mt-6 mb-6">
    <Text className="text-xl font-bold mb-3 text-secondary-active">Source</Text>
    <Pressable
onPress={() => recipe.url && Linking.openURL(recipe.url)}
      className="flex-row items-center bg-secondary rounded-full px-3 py-2 self-start max-w-full active:opacity-70"
    >
      <SymbolView name="link" style={{ width: 14, height: 14 }} tintColor="#58575C" />
      <Text
        className="text-sm text-secondary-active ml-1.5 flex-shrink"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {recipe.url}
      </Text>
    </Pressable>
  </View>
)}
 </View>
</ScrollView>
)
}