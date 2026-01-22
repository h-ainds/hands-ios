import { StyleSheet, FlatList, Image, Pressable, ActivityIndicator } from 'react-native'
import { Text, View } from '@/components/Themed'
import { useRecipes } from '@/hooks/useRecipes'
import { useRouter } from 'expo-router'
import type { Recipe } from '@/types'

export default function HomeScreen() {
  const { recipes, loading, error } = useRecipes()
  const router = useRouter()

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Error: {error}</Text>
      </View>
    )
  }

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <Pressable
      style={styles.recipeCard}
      onPress={() => router.push(`/recipe/${item.id}`)}
    >
      {item.image && (
        <Image 
          source={{ uri: item.image }} 
          style={styles.recipeImage}
        />
      )}
      <Text style={styles.recipeTitle}>{item.title}</Text>
    </Pressable>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Recipes</Text>
      <FlatList
        data={recipes}
        renderItem={renderRecipe}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No recipes yet</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    padding: 16,
  },
  list: {
    padding: 8,
  },
  recipeCard: {
    flex: 1,
    margin: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  recipeImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#ddd',
  },
  recipeTitle: {
    padding: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: 'red',
    fontSize: 16,
  },
  empty: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#999',
  },
})