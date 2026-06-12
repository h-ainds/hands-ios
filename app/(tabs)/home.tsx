import { Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { Text, View } from 'react-native'
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
          .limit(1000)
        
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

      const recentList = Array.isArray(recent) ? recent : []

      // Strict sanitization:
      // 1) keep only rows with a plausible numeric recipes.id
      // 2) rehydrate from recipes table (source of truth) to ensure backing rows exist
      const orderedIds = recentList
        .map((r: any) => (r?.id != null ? Number(r.id) : NaN))
        .filter((id: number) => Number.isFinite(id) && id > 0)

      if (orderedIds.length === 0) {
        console.warn('[Home][Recents] No valid recent recipe IDs returned from RPC.')
        setRecentRecipes([])
        return
      }

      const uniqueIds = Array.from(new Set(orderedIds))
      const { data: recipeRows, error: recipeError } = await supabase
        .from('recipes')
        .select('id,title,image,caption,steps,tags,created_at,updated_at,searchable_title,url,ingredients')
        .in('id', uniqueIds)

      if (recipeError) {
        console.error('[Home][Recents] Failed to rehydrate recents from recipes:', recipeError)
        // Fail closed: don't render potentially orphaned/blank cards.
        setRecentRecipes([])
        return
      }

      const byId = new Map<number, Recipe>()
      ;(recipeRows as Recipe[] | null | undefined)?.forEach((row) => {
        if (row?.id != null) byId.set(Number(row.id), row)
      })

      const hydratedOrdered = orderedIds
        .map((id) => byId.get(id))
        .filter((r): r is Recipe => Boolean(r && r.id && r.title))

      const droppedCount = orderedIds.length - hydratedOrdered.length
      if (droppedCount > 0) {
        console.warn(`[Home][Recents] Dropped ${droppedCount} orphan/blank recent item(s) before render.`)
      }

      setRecentRecipes(hydratedOrdered.slice(0, 9))
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
        <ActivityIndicator size="large" color="#6CD401" />
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

  
  return (
    <View className="flex-1 bg-white">
    
{/* Chat History Button - Top Left */}
<Pressable
  onPress={() => setIsChatHistoryOpen(true)}
  className="absolute w-12 h-12 rounded-full bg-white items-center justify-center z-50 left-4 top-[50px] shadow-hands"
>
  <SymbolView
    name="clock.arrow.trianglehead.counterclockwise.rotate.90"
    size={23}
    weight="semibold"
    tintColor="#000000"
  />
</Pressable>

{/* Search Button - Top Right */}
<Pressable
  onPress={handleSearchPress}
  className="absolute w-12 h-12 rounded-full bg-white items-center justify-center z-50 right-4 top-[50px] shadow-hands"
>
  <SymbolView
    name="magnifyingglass"
    size={23}
    weight="semibold"
    tintColor="#000000"
  />
</Pressable>

      <ScrollView className="flex-1" contentContainerClassName="pb-20 pt-[110px]">
        {/* Quick Actions */}
        <View className="flex-row gap-3 px-4 mb-5">
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/ask',
                params: { prompt: "Find 3 new recipes I'd be excited to cook this week." },
              })
            }
            className="flex-1 flex-row items-center justify-center gap-1 bg-white rounded-full py-4 shadow-drop"
          >
            <SymbolView name="fork.knife" size={18} weight="semibold" tintColor="#000000" />
            <Text className="text-base font-semibold text-black">Plan meals</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/ask',
                params: { prompt: 'Can you make me a one-week grocery list for healthy meals?' },
              })
            }
            className="flex-1 flex-row items-center justify-center gap-1 bg-white rounded-full py-4 shadow-drop"
          >
            <SymbolView name="cart" size={18} weight="semibold" tintColor="#000000" />
            <Text className="text-base font-semibold text-black">Create</Text>
          </Pressable>
        </View>

        {/* Today Section */}
        <View className="pb-4">
          <Text className="text-2xl font-bold tracking-tighter mb-3 px-4">
            Today
          </Text>
          <View className="px-4">
            {heroLoading ? (
              <View className="w-full aspect-[2.38] bg-gray-200 rounded-xl justify-center items-center">
                <ActivityIndicator size="large" />
              </View>
            ) : heroRecipe ? (
              <RecipeCard
                recipeId={heroRecipe.id}
                title={heroRecipe.title}
                image={heroRecipe.image ?? undefined}
                cardType="horizontal"
                rounded="3xl"
                showActionButton
                onPress={() => router.push(`/recipe/${heroRecipe.id}`)}
              />
            ) : (
              <View className="w-full aspect-[2.38] bg-gray-200 rounded-xl justify-center items-center">
                <Text className="text-gray-600">No recipe available</Text>
              </View>
            )}
          </View>
        </View>

        {/* Recent Recipes Section */}
        <View className="py-5">
          <Text className="text-2xl font-bold tracking-tighter mb-3 px-4">
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
                  <RecipeCard
                    key={recipe.id}
                    recipeId={recipe.id}
                    title={recipe.title}
                    image={recipe.image ?? undefined}
                    cardType="vertical"
                    rounded="2xl"
                    showActionButton
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                  />
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
                  <RecipeCard
                    key={recipe.id}
                    recipeId={recipe.id}
                    title={recipe.title}
                    image={recipe.image ?? undefined}
                    cardType="vertical"
                    rounded="2xl"
                    showActionButton
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                  />
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
      <View className="absolute flex-row items-center bottom-4 shadow-drop">
        <Composer
          onAskPress={handleAskPress}
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