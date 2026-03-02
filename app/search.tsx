import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase/client'
import RecipeCard from '@/components/RecipeCard'
import BackButton from '@/components/BackButton'

type RecipeResult = {
  id: string | number
  title: string
  image?: string | null
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecipeResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    let isCancelled = false

    const timeout = setTimeout(async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('recipes')
          .select('id, title, image')
          .ilike('title', `%${query}%`)

        if (!isCancelled && !error) {
          setResults(data || [])
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
{/* Header */}
<View className="px-4 pt-16 pb-4 bg-white">
  <View className="flex-row items-center">
    {/* Back button */}
    <BackButton />

    {/* Search input */}
    <TextInput
      value={query}
      onChangeText={setQuery}
      placeholder="Search recipes..."
      placeholderTextColor="#9CA3AF"
      autoFocus
      className="flex-1 ml-3 bg-white rounded-full px-4 py-2.5 text-base shadow-hands"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      }}
    />
  </View>
</View>
      {/* Loading */}
      {loading && (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6CD401" />
        </View>
      )}

      {/* Empty state */}
      {!loading && query.length === 0 && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-2xl font-bold text-black mb-2">Find your favorites</Text>
          <Text className="text-sm text-gray-500">Start typing to find any recipe.</Text>
        </View>
      )}

      {/* No results */}
      {!loading && query.length > 0 && results.length === 0 && (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-500">No results found</Text>
        </View>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={{ padding: 16 }}
          columnWrapperStyle={{ gap: 16 }}
          ItemSeparatorComponent={() => <View className="h-4" />}
          renderItem={({ item }) => (
            <View className="flex-1">
              <Pressable onPress={() => router.push(`/recipe/${item.id}` as any)}>
                <RecipeCard
                  title={item.title}
                  image={item.image || undefined}
                  cardType="square"
                  onPress={() => router.push(`/recipe/${item.id}` as any)}
                />
              </Pressable>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  )
}