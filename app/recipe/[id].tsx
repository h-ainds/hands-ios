import { ScrollView, Image, Pressable, ActivityIndicator } from 'react-native'
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

  // Extract ingredients array from JSONB object
  const ingredientsList = recipe.ingredients?.Ingredients || []

  // Function to get tag styling
  const getTagStyle = (index: number) => {
    if (index === 0) {
      return {
        className: 'bg-[#6CD401] text-white',
        style: {}
      }
    } else if (index === 1) {
      return {
        className: 'text-white',
        style: { backgroundColor: '#98E14D' }
      }
    } else {
      return {
        className: 'text-[#6ED308]',
        style: { backgroundColor: '#F0FBE5' }
      }
    }
  }

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
        
        {/* Tags - moved before caption */}
        {recipe.tags && recipe.tags.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerClassName="gap-2"
          >
            {recipe.tags.map((tag, index) => {
              const { className, style } = getTagStyle(index)
              return (
                <View 
                  key={`${tag}-${index}`} 
                  className={`px-4 py-2 rounded-full ${className}`}
                  style={style}
                >
                  <Text className={`text-sm font-medium ${index === 0 || index === 1 ? 'text-white' : 'text-[#6ED308]'}`}>
                    {tag}
                  </Text>
                </View>
              )
            })}
          </ScrollView>
        )}

        {/* Caption - moved after tags */}
        {recipe.caption ? (
          <View className="relative mb-6">
            <Text
              className="text-[15px] text-secondary-placeholder leading-6"
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
          <Text className="text-[15px] text-gray-400 mb-6 italic">
            No caption provided.
          </Text>
        )}

        {ingredientsList.length > 0 && (
          <View className="mt-6">
            <Text className="text-xl font-bold mb-3">Ingredients</Text>
            {ingredientsList.map((ingredient, index) => (
              <Text key={index} className="text-base mb-2">• {ingredient}</Text>
            ))}
          </View>
        )}

        {recipe.steps && recipe.steps.length > 0 && (
          <View className="mt-6">
            <Text className="text-xl font-bold mb-3">Steps</Text>
            {recipe.steps.map((step, index) => (
              <Text key={index} className="text-base mb-3 leading-6">
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        )}

        {recipe.url && (
          <View className="mt-6">
            <Text className="text-xl font-bold mb-3">Source</Text>
            <Text className="text-sm text-blue-600 underline">{recipe.url}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}