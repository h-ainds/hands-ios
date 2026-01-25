import { Image, Pressable, ActivityIndicator, ScrollView } from 'react-native'
import { Text, View } from 'react-native'
import { useRecipes } from '@/hooks/useRecipes'
import { useRouter } from 'expo-router'
import type { Recipe } from '@/types'
import Composer from '@/components/Composer'
import RecipeCard from '@/components/RecipeCard'


export default function HomeScreen() {
  const { recipes, loading, error } = useRecipes()
  const router = useRouter()

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
      <ScrollView className="flex-1" contentContainerClassName="pb-20">
        {/* Hero Section */}
        <View className="w-full h-[54vh] bg-gray-200 justify-center items-center">
          <Text className="text-2xl font-bold">Hero</Text>
          <Text className="text-gray-600">Placeholder for hero content</Text>
        </View>

        {/* Recent Recipes Section */}
        <View className="py-4">
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


{/* Recents Section */}
<View className="py-2">
  <Text className="text-[28px] font-bold tracking-tight mb-2 px-4">
    Recent Recipes
  </Text>

  <View className="px-2">
    {recentRecipes && recentRecipes.length > 0 ? (
      <View className="flex-row flex-wrap">
        {recentRecipes.map((recipe: Recipe) => (
          <View key={recipe.id} className="w-30 p-4">
            <RecipeCard
              title={recipe.title}
              image={recipe.image ?? undefined}
              cardType="vertical"
              rounded="xl"
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
      <View className="absolute bottom-4 left-0 right-0">
        <Composer 
          onAskPress={handleAskPress}
          onSearchPress={handleSearchPress}
        />
      </View>
    </View>
  )
}