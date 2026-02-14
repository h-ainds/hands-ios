import { Image, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRecipes } from '@/hooks/useRecipes'
import { useRouter } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import type { Recipe } from '@/types'
import Composer from '@/components/Composer'
import RecipeCard from '@/components/RecipeCard'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import ChatHistorySheet from '@/components/ChatHistorySheet'
import { SymbolView } from 'expo-symbols'
import { useFocusEffect } from 'expo-router'

export default function HomeScreen() {
  const { recipes, loading, error } = useRecipes()
  const router = useRouter()
  const { user } = useAuth()
  const [heroRecipe, setHeroRecipe] = useState<Recipe | null>(null)
  const [ourPicks, setOurPicks] = useState<Recipe[]>([])
  const [heroLoading, setHeroLoading] = useState(true)
  const [recentRecipes, setRecentRecipes] = useState<Recipe[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false)

  // Fetch random recipes for hero and our picks
  useEffect(() => {
    async function fetchRandomRecipes() {
      try {
        const { data, error } = await supabase
          .from('recipes')
          .select('*')
          .limit(500)
        
        if (error) throw error
        
        if (data && data.length > 0) {
          const shuffled = [...data].sort(() => Math.random() - 0.5)
          setHeroRecipe(shuffled[0])
          setOurPicks(shuffled.slice(1, 10))
        }
      } catch (err) {
        console.error('Error fetching random recipes:', err)
      } finally {
        setHeroLoading(false)
      }
    }

    fetchRandomRecipes()
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
      
      setRecentRecipes(recent as Recipe[] || [])
    } catch (error) {
      console.error('Error in loadRecentRecipes:', error)
    } finally {
      setRecentLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadRecentRecipes()
  }, [loadRecentRecipes])

  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log('Home screen focused - reloading recent recipes')
        loadRecentRecipes()
      }
    }, [user, loadRecentRecipes])
  )

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

  const handleAskPress = () => {
    router.push('/ask')
  }

  const handleSearchPress = () => {
    router.push('/search')
  }

  const handleYouPress = () => {
    router.push('/you')
  }

  return (
    <View className="flex-1 bg-white">
      {/* Chat History Button - Top Left */}
      <Pressable
        onPress={() => setIsChatHistoryOpen(true)}
        style={{
          position: 'absolute',
          top: 56,
          left: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'white',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}
      >
        <SymbolView name="text.alignleft" size={20} tintColor="#000000" />
      </Pressable>
      
      <ScrollView className="flex-1" contentContainerClassName="pb-20">
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
                {/* Gradient Overlay */}
                <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)']}
                locations={[0.5, 1]}
                style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                }}
               pointerEvents="none"
               />
                {/* Hero TEXT */}
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

        {/* Our Picks Section */}
        <View className="py-2">
          <Text className="text-2xl font-bold tracking-tighter mb-2 px-4">
            Our Picks
          </Text>
          {heroLoading ? (
            <View className="px-4 py-8">
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-4 pb-4"
              contentContainerClassName="gap-2.5">
              {ourPicks.length > 0 ? (
                ourPicks.map((recipe: Recipe) => (
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
                  No recipes yet
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </ScrollView>

      {/* Composer Fixed at Bottom */}
      <View className="absolute flex-row items-center bottom-4">
        <Composer 
          onAskPress={handleAskPress}
          onSearchPress={handleSearchPress}
          onYouPress={handleYouPress}
        />
      </View>
      
      <ChatHistorySheet
        userId={user?.id ?? null}
        isOpen={isChatHistoryOpen}
        onClose={() => setIsChatHistoryOpen(false)}
      />
    </View>
  )
}