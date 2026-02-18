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

  useEffect(() => {
    loadRecipe()
  }, [id])

  const loadRecipe = async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      setRecipe(data)
      
      if (data?.id) {
        await trackRecipeView(data.id)
        console.log('Tracked view for recipe:', data.id)
      }
    } catch (error) {
      console.error('Error loading recipe:', error)
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

        {/* Caption - moved after tags */}
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
            <Text className="text-2xl font-bold mb-3">Ingredients</Text>
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
            <Text className="text-2xl font-bold mb-3">Steps</Text>
            {recipe.steps.map((step, index) => (
              <Text key={index} className="text-base mb-3 leading-6">
                {index + 1}. {step}
              </Text>
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