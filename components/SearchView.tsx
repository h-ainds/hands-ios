import { useEffect, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { supabase } from '../lib/supabase/client'  // Change this path
import RecipeCard from './RecipeCard'

interface SearchViewProps {
  query: string
  onSelect?: (item: any) => void
}

type RecipeResult = {
  id: string | number
  title: string
  image?: string | null
}

export default function SearchView({ query, onSelect }: SearchViewProps) {
  const [results, setResults] = useState<RecipeResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([])
      return
    }

    let isCancelled = false
    const timeout = setTimeout(async () => {
      try {
        setLoading(true)
        
        const { data: recipes, error } = await supabase
          .from('recipes')
          .select('id, title, image')
          .ilike('title', `%${query}%`)
          .limit(20)

        if (!isCancelled && !error) {
          setResults(
            (recipes || []).map((r: any) => ({
              id: r.id,
              title: r.title,
              image: r.image,
            }))
          )
        }
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        if (!isCancelled) setLoading(false)
      }
    }, 400)

    return () => {
      clearTimeout(timeout)
      isCancelled = true
    }
  }, [query])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6CD401" />
      </View>
    )
  }

  if (query.length === 0) {
    return (
      <View style={[styles.centered, { paddingHorizontal: 16 }]}>
        <Text style={styles.title}>Find your favorites</Text>
        <Text style={styles.subtitle}>Start typing to find any recipe.</Text>
      </View>
    )
  }

  if (results.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noResults}>No results found</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={results}
      keyExtractor={(item) => item.id.toString()}
      numColumns={2}
      contentContainerStyle={{ padding: 16 }}
      columnWrapperStyle={{ gap: 16 }}
      ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      renderItem={({ item }) => (
        <View style={{ flex: 1 }}>
          <Pressable onPress={() => onSelect?.(item)}>
            <RecipeCard
              title={item.title}
              image={item.image || undefined}
              cardType="square"
              onPress={() => onSelect?.(item)}
            />
          </Pressable>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  noResults: {
    color: '#6b7280',
  },
})