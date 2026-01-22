import { StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native'
import { Text, View } from '@/components/Themed'
import { useLocalSearchParams } from 'expo-router'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Recipe } from '@/types'

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)

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
    } catch (error) {
      console.error('Error loading recipe:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!recipe) {
    return (
      <View style={styles.container}>
        <Text>Recipe not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      {recipe.image && (
        <Image source={{ uri: recipe.image }} style={styles.image} />
      )}
      <View style={styles.content}>
        <Text style={styles.title}>{recipe.title}</Text>
        
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {recipe.ingredients.map((ingredient, index) => (
              <Text key={index} style={styles.item}>• {ingredient}</Text>
            ))}
          </View>
        )}

        {recipe.instructions && recipe.instructions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.instructions.map((instruction, index) => (
              <Text key={index} style={styles.instruction}>
                {index + 1}. {instruction}
              </Text>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: '#ddd',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  item: {
    fontSize: 16,
    marginBottom: 8,
  },
  instruction: {
    fontSize: 16,
    marginBottom: 12,
    lineHeight: 24,
  },
})