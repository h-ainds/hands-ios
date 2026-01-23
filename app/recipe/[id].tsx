import { StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native'
import { Text, View } from 'react-native';
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

  // Extract ingredients array from JSONB object
  const ingredientsList = recipe.ingredients?.Ingredients || []

  return (
    <ScrollView style={styles.container}>
      {recipe.image && (
        <Image source={{ uri: recipe.image }} style={styles.image} />
      )}
      
      <View style={styles.content}>
        <Text style={styles.title}>{recipe.title}</Text>
        
        {recipe.caption && (
          <Text style={styles.caption}>{recipe.caption}</Text>
        )}

        {recipe.tags && recipe.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {recipe.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {ingredientsList.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {ingredientsList.map((ingredient, index) => (
              <Text key={index} style={styles.item}>• {ingredient}</Text>
            ))}
          </View>
        )}

        {recipe.steps && recipe.steps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {recipe.steps.map((step, index) => (
              <Text key={index} style={styles.instruction}>
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        )}

        {recipe.url && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Source</Text>
            <Text style={styles.url}>{recipe.url}</Text>
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
  caption: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    lineHeight: 22,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 8,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: '#333',
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
  url: {
    fontSize: 14,
    color: '#0066cc',
    textDecorationLine: 'underline',
  },
})