import { Image, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { Text, View } from 'react-native'
import { useRecipes } from '@/hooks/useRecipes'
import { useRouter } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import type { Recipe } from '@/types'
import Composer from '@/components/Composer'
import RecipeCard from '@/components/RecipeCard'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

export default function HomeScreen() {
  const { recipes, loading, error } = useRecipes()
  const router = useRouter()
  const { user } = useAuth()
  const [heroRecipe, setHeroRecipe] = useState<Recipe | null>(null)
  const [heroLoading, setHeroLoading] = useState(true)
  const [recentRecipes, setRecentRecipes] = useState<Recipe[]>([])
  const [recentLoading, setRecentLoading] = useState(true)

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

  // Load user's recent recipes
  const loadRecentRecipes = useCallback(async () => {
    if (!user) {
      setRecentLoading(false)
      return
    }

    try {
      console.log('Loading recent recipes for user:', user.id.substring(0, 8) + '...')
      
      const { data: recent, error } = await supabase
        .rpc('get_recent_recipes', {
          user_id_param: user.id,
          limit_param: 9
        })

      if (error) {
        console.error('Error fetching recent recipes:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        return
      }

      console.log('Recent recipes loaded:', recent?.length || 0)
      if (recent && recent.length > 0) {
        console.log('Recent recipes data:', recent?.slice(0, 3).map((r: any) => ({ 
          id: r.id, 
          title: r.title?.substring(0, 30) + '...', 
          viewed_at: r.viewed_at 
        })))
      }
      
      // Set data directly without additional frontend processing
      setRecentRecipes(recent as Recipe[] || [])
    } catch (error) {
      console.error('Error in loadRecentRecipes:', error)
    } finally {
      setRecentLoading(false)
    }
  }, [user])

  // Load recent recipes when user changes
  useEffect(() => {
    loadRecentRecipes()
  }, [loadRecentRecipes])

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

  // Our Picks recipes (use all recipes for grid)
  const ourPicksRecipes = recipes.slice(9)

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
      <View className="w-full">
  {heroLoading ? (
    <View className="h-[56vh] bg-gray-200 justify-center items-center">
      <ActivityIndicator size="large" />
    </View>
  ) : heroRecipe ? (
    <Pressable onPress={() => router.push(`/recipe/${heroRecipe.id}`)}>
      <View className="relative">
        <Image
          source={{ uri: heroRecipe.image ?? undefined }}
          className="w-full h-[56vh]"
          resizeMode="cover"
        />
        <View className="absolute bottom-0 p-4">
          <Text className="text-3xl text-white font-extrabold tracking-tighter leading-none">
            {heroRecipe.title}
          </Text>
        </View>
      </View>
    </Pressable>
  ) : (
    <View className="h-[56vh] bg-gray-200 justify-center items-center">
      <Text className="text-gray-600">No recipe available</Text>
    </View>
  )}
</View>

        {/* Recent Recipes Section */}
        <View className="py-5">
          <Text className="text-2xl font-bold tracking-tighter mb-2 px-4">
            Recents
          </Text>
          {recentLoading ? (
            <View className="px-4 py-8">
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-4 pb-4"
              contentContainerClassName="gap-2.5">
              {recentRecipes && recentRecipes.length > 0 ? (
                recentRecipes.slice(0, 10).map((recipe: Recipe) => (
                  <View key={recipe.id}>
                    <RecipeCard
                      title={recipe.title}
                      image={recipe.image ?? undefined}
                      cardType="vertical"
                      rounded="xl"
                      onPress={() => router.push(`/recipe/${recipe.id}`)}/>
                  </View>
                ))
              ) : (
                <Text className="text-gray-400 text-base">
                  {user ? 'No recent recipes yet' : 'Sign in to see recent recipes'}
                </Text>
              )}
            </ScrollView>
          )}
        </View>

        {/* Our Picks Section - 3 Column Grid */}
        <View className="py-2">
          <Text className="text-2xl font-bold tracking-tighter mb-2 px-4">
            Our Picks
          </Text>
          <View className="px-0">
            {ourPicksRecipes && ourPicksRecipes.length > 0 ? (
             <View
             style={{
             flexDirection: 'row',
             flexWrap: 'wrap',
             marginHorizontal: -1, // GRID_GAP / 2px
           }}>
      {ourPicksRecipes.map((recipe: Recipe) => (
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