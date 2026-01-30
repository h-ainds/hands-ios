import { useState } from 'react'
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import SearchView from '@/components/SearchView'

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: 'white' }}
    >
      {/* Search Input at Top */}
      <View style={{ padding: 16, paddingTop: 64, borderBottomWidth: 1, borderBottomColor: '#e5e5e5', backgroundColor: 'white' }}>
        <View style={{ backgroundColor: '#f3f4f6', borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 12 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes..."
            style={{ fontSize: 16 }}
            placeholderTextColor="#999"
            autoFocus
          />
        </View>
      </View>

      {/* Search Results */}
      <SearchView 
        query={query} 
        onSelect={(recipe: any) => router.push(`/recipe/${recipe.id}` as any)}
      />
    </KeyboardAvoidingView>
  )
}