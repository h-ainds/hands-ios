import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import BackButton from '@/components/BackButton'
import RecipeCard from '@/components/RecipeCard'
import { useFavorites } from '@/hooks/useFavorites'
import { useAuth } from '@/context/AuthContext'

export default function FavoritesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { favorites, loading, error, removeFavorite, pendingRecipeIds } = useFavorites()

  const handleRemoveFavorite = async (recipeId: string | number) => {
    try {
      await removeFavorite(recipeId)
    } catch (err) {
      console.error('Failed to remove favorite:', err)
      Alert.alert('Could not remove favorite')
    }
  }

  return (
    <View className="flex-1 bg-white">
      <BackButton />

      <View className="px-4 pt-16 pb-3">
        <Text className="text-3xl font-extrabold tracking-tighter pt-14">Favorites</Text>
      </View>

      {!user ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-gray-500 text-center">
            Sign in to save and view favorite recipes.
          </Text>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6CD401" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-red-500 text-center">{error}</Text>
        </View>
      ) : favorites.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-base text-gray-500 text-center">
            No favorites yet. Tap + on any recipe card to save one.
          </Text>
        </View>
      ) : (
        <FlatList
          key="favorites-horizontal"
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <RecipeCard
              recipeId={item.id}
              title={item.title}
              image={item.image ?? undefined}
              cardType="horizontal"
              rounded="3xl"
              showActionButton
              isFavorited
              favoriteLoading={pendingRecipeIds.has(Number(item.id))}
              onToggleFavorite={handleRemoveFavorite}
              onPress={() => router.push(`/recipe/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  )
}