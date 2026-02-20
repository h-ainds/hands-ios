import React, { useState, useEffect } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { trackRecipeCardTap } from '@/lib/supabase/track'
import { supabase } from '@/lib/supabase/client'

interface RecipeCardProps {
  id?: string | number
  title: string
  image?: string
  cardType?: 'vertical' | 'square' | 'horizontal'
  rounded?: 'lg' | 'xl' | '2xl'| 'none'
  backgroundColor?: string
  showActionButton?: boolean
  onPress?: () => void
}

const PlusIcon = () => (
  <Text className="text-black text-2xl font-bold">+</Text>
)

const CheckIcon = () => (
  <Text className="text-green-500 text-2xl font-bold">✓</Text>
)

export default function RecipeCard({
  id,
  title,
  image,
  cardType = 'vertical',
  rounded = 'xl',
  backgroundColor = 'bg-gray-300',
  showActionButton = false,
  onPress,
}: RecipeCardProps) {
  const router = useRouter()
  const [isAdded, setIsAdded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)

  // Fetch image from database if image prop is missing/empty but id is provided
  useEffect(() => {
    // If we have an image prop that's not empty and not "undefined", use it
    const trimmedImage = image?.trim()
    // Treat "undefined" and "null" strings as if there's no image
    if (trimmedImage && trimmedImage !== 'undefined' && trimmedImage !== 'null') {
      setImageUrl(trimmedImage)
      return
    }

    // If no image but we have an id, fetch from database
    if (id) {
      let cancelled = false
      // Convert id to number if it's a string (database uses numeric IDs)
      // Supabase can handle both, but being explicit helps
      const recipeId = typeof id === 'string' && !isNaN(Number(id)) ? Number(id) : id
      
      supabase
        .from('recipes')
        .select('image')
        .eq('id', recipeId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!cancelled) {
            if (error) {
              console.error('Error fetching recipe image:', error)
            } else if (data?.image) {
              setImageUrl(data.image)
            }
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Error fetching recipe image:', err)
          }
        })
      return () => { cancelled = true }
    } else {
      // No id and no image, clear imageUrl
      setImageUrl(undefined)
    }
  }, [id, image])

  // Reset error state when image URL changes so a newly fetched URL can display
  useEffect(() => {
    setImageError(false)
  }, [imageUrl])

  const getContainerClasses = () => {
    switch (cardType) {
      case 'vertical':
        return 'w-36 aspect-[1/2]'
      case 'square':
        return 'w-full aspect-square'
      case 'horizontal':
        return 'w-full h-24 flex-row'
      default:
        return 'w-36 aspect-[1/2]'
    }
  }

  const getRoundedClass = () => {
    switch (rounded) {
      case 'none':
        return 'rounded-none'
      case 'lg':
        return 'rounded-lg'
      case 'xl':
        return 'rounded-xl'
      case '2xl':
        return 'rounded-2xl'
      default:
        return 'rounded-xl'
    }
  }

  const getTitleClasses = () => {
    switch (cardType) {
      case 'vertical':
        return 'text-base font-bold tracking-tighter leading-tighter'
      case 'square':
        return 'text-base font-extrabold leading-tight tracking-tighter'
      case 'horizontal':
        return 'text-base font-bold tracking-tight'
      default:
        return 'text-lg font-bold tracking-tight'
    }
  }

  const getTitlePadding = () => {
    switch (cardType) {
      case 'vertical':
        return 'px-2 py-2'
      case 'square':
        return 'px-4 py-5'
      case 'horizontal':
        return 'px-3 py-3'
      default:
        return 'px-3 py-3'
    }
  }

  const handleActionPress = () => {
    setIsAdded(!isAdded)
  }

  const handleCardPress = async () => {
    // Track the tap FIRST
    if (id) {
      await trackRecipeCardTap(id)
      console.log('Tracked tap for recipe:', id)
    }

    // Then navigate
    if (onPress) {
      onPress()
    } else if (id) {
      router.push(`/recipe/${id}`)
    }
  }

  const containerClasses = getContainerClasses()
  const roundedClass = getRoundedClass()
  const titleClasses = getTitleClasses()
  const titlePadding = getTitlePadding()

  const imageSource =
    imageError || !imageUrl
      ? require('../assets/placeholder.png')
      : { uri: imageUrl }

  return (
    <Pressable
      onPress={handleCardPress}
      className={`${containerClasses} ${roundedClass} ${backgroundColor} overflow-hidden relative`}
    >
      <Image
        source={imageSource}
        className="absolute inset-0 w-full h-full"
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
      
      <View className="absolute inset-0 justify-end">
  <LinearGradient
    colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']}
    start={{ x: 0.5, y: 1 }}
    end={{ x: 0.5, y: 0 }}
    className="w-full"
  >
    <View className={titlePadding}>
      <Text
        className={`text-white ${titleClasses}`}
        numberOfLines={2}
      >
        {title}
      </Text>
    </View>
  </LinearGradient>
</View>


      {showActionButton && (
        <Pressable
          onPress={handleActionPress}
          className={`absolute ${
            cardType === 'square' ? 'bottom-4' : 'top-3'
          } right-3 bg-white rounded-full p-1 shadow-md`}
        >
          <View className="w-6 h-6 items-center justify-center">
            {isAdded ? <CheckIcon /> : <PlusIcon />}
          </View>
        </Pressable>
      )}
    </Pressable>
  )
}