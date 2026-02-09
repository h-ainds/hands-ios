import React, { useState } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { trackRecipeCardTap } from '@/lib/supabase/track'

interface RecipeCardProps {
  id?: string
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
        return 'text-lg font-bold tracking-tighter leading-tight'
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
        return 'px-3 py-3'
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
    imageError || !image
      ? require('../assets/placeholder.png')
      : { uri: image }

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
      
      <View className="absolute inset-0 flex justify-end">
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0)']}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
          className={`w-full ${titlePadding}`}
        >
          <Text
            className={`text-white ${titleClasses}`}
            numberOfLines={2}
          >
            {title}
          </Text>
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