import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable } from 'react-native'
import RecipeCard from '@/components/RecipeCard'
import { supabase } from '@/lib/supabase/client'

interface RecipeItem {
  id: string
  title: string
  caption: string
  image: string
}

export default function RecipeCardWithImage({ item }: { item: RecipeItem }) {
  const router = useRouter()
  const [imageUrl, setImageUrl] = useState<string | undefined>(item.image?.trim() || undefined)

  // Always fetch image from DB by id (same query as recipe page) so the card shows the same image
  useEffect(() => {
    if (!item.id) return

    let cancelled = false
    supabase
      .from('recipes')
      .select('image')
      .eq('id', item.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error && data?.image) setImageUrl(data.image)
      })
    return () => { cancelled = true }
  }, [item.id])

  return (
    <Pressable onPress={() => router.push(`/recipe/${item.id}`)}>
      <RecipeCard
        id={item.id}
        title={item.title}
        image={imageUrl}
        cardType="vertical"
        showActionButton={false}
      />
    </Pressable>
  )
}
