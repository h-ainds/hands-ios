import { Image, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { Text, View } from 'react-native'
import { useRecipes } from '@/hooks/useRecipes'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import type { Recipe } from '@/types'
import Composer from '@/components/Composer'
import RecipeCard from '@/components/RecipeCard'
import { supabase } from '@/lib/supabase/client'

export default function HomeScreen() {
  const { recipes, loading, error } = useRecipes()
  const router = useRouter()
  const [heroRecipe, setHeroRecipe] = useState<Recipe | null>(null)
  const [heroLoading, setHeroLoading] = useState(true)

  // Fetch random hero recipe
  useEffect(() => {
    async function fetchHeroRecipe() {
      try {
        const { data: featured, error } = await supabase
          .from('recipes')
          .select('*')
          .limit(500)
        
        if (error) throw error
        
        if (featured && featured.length > 0) {
          // Pick a random recipe
          const randomIndex = Math.floor(Math.random() * featured.length)
          setHeroRecipe(featured[randomIndex])
        }
      } catch (err) {
        console.error('Error fetching hero recipe:', err)
      } finally {
        setHeroLoading(false)
      }
    }

    fetchHeroRecipe()
  }, [])

  if (loading) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (error) {
    return (
      <View className="flex-1 bg-white justify-center items-center">
        <Text className="text-red-500 text-base">{error}</Text>
      </View>
    )
  }

  // Featured/Our Picks recipes (first 5)
  const featuredRecipes = recipes.slice(0, 9)
  // Recent recipes (rest)
  const recentRecipes = recipes.slice(5)

  const handleAskPress = () => {
    router.push('/ask')
  }

  const handleSearchPress = () => {
    router.push('/search')
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView className="flex-1" 
      contentContainerClassName="pb-20">
      
      {/* Hero Section */}
        <View className="w-full h-[54vh]">
          {heroLoading ? (
            <View className="flex-1 bg-gray-200 justify-center items-center">
              <ActivityIndicator size="large" />
            </View>
          ) : heroRecipe ? (
            <RecipeCard
              title={heroRecipe.title}
              image={heroRecipe.image ?? undefined}
              cardType="square"
              rounded="none"
              onPress={() => router.push(`/recipe/${heroRecipe.id}`)}
            />
          ) : (
            <View className="flex-1 bg-gray-200 justify-center items-center">
              <Text className="text-gray-600">No hero recipe available</Text>
            </View>
          )}
        </View>

        {/* Recent Recipes Section */}
        <View className="py-1">
          <Text className="text-[28px] font-bold tracking-tight mb-2 px-4">
            Recents
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="px-4 pb-4"
            contentContainerClassName="gap-3">
            {featuredRecipes && featuredRecipes.length > 0 ? (
              featuredRecipes.map((recipe: Recipe) => (
                <View key={recipe.id} className="w-30">
                  <RecipeCard
                    title={recipe.title}
                    image={recipe.image ?? undefined}
                    cardType="vertical"
                    rounded="xl"
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                  />
                </View>
              ))
            ) : (
              <Text className="text-gray-400 text-base">
                No featured recipes
              </Text>
            )}
          </ScrollView>
        </View>

        {/* Our Picks Section - 3 Column Grid */}
        <View className="py-2">
          <Text className="text-[28px] font-bold tracking-tight mb-2 px-4">
            Our Picks
          </Text>
          <View className="px-4">
  {recentRecipes && recentRecipes.length > 0 ? (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -1, // GRID_GAP / 2
      }}
    >
      {recentRecipes.map((recipe: Recipe) => (
        <View
          key={recipe.id}
          style={{
            flexBasis: '33.333%',
            maxWidth: '33.333%',
            paddingHorizontal: 1,
            paddingBottom: 2,
          }}
        >
          <RecipeCard
            title={recipe.title}
            image={recipe.image ?? undefined}
            cardType="square"
            rounded="none"
            onPress={() => router.push(`/recipe/${recipe.id}`)}
          />
        </View>
      ))}
    </View>
  ) : (
    <Text className="text-center text-gray-400 text-base mt-12">
      No recipes yet
    </Text>
  )}
</View>

        </View>
      </ScrollView>

      {/* Composer Fixed at Bottom */}
      <View className="absolute flex-row items-center bottom-4">
        <Composer 
          onAskPress={handleAskPress}
          onSearchPress={handleSearchPress}
        />
      </View>
    </View>
  )
}