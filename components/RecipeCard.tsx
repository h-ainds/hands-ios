import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { trackRecipeCardTap } from '@/lib/supabase/track'
import { supabase } from '@/lib/supabase/client'
import PlusButton from '@/components/PlusButton'

interface RecipeCardProps {
  // Must always be recipes.id (source-of-truth table)
  recipeId?: string | number
  title: string
  image?: string
  cardType?: 'vertical' | 'square' | 'horizontal'
  rounded?: 'lg' | 'xl' | '2xl' | '3xl' | 'none'
  backgroundColor?: string
  showActionButton?: boolean
  onPress?: () => void
}

export default function RecipeCard({
  recipeId,
  title,
  image,
  cardType = 'vertical',
  rounded = 'xl',
  backgroundColor = 'bg-gray-300',
  showActionButton = false,
  onPress,
}: RecipeCardProps) {
  const router = useRouter()

  const [imageError, setImageError] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [dbFetched, setDbFetched] = useState(false)

  const normalizedRecipeId =
    typeof recipeId === 'string' && !isNaN(Number(recipeId))
      ? Number(recipeId)
      : recipeId

  const hasValidRecipeId =
    normalizedRecipeId != null &&
    (typeof normalizedRecipeId === 'number'
      ? Number.isFinite(normalizedRecipeId) &&
        normalizedRecipeId > 0
      : String(normalizedRecipeId).trim().length > 0)

  const getContainerStyle = () => {
    switch (cardType) {
      case 'vertical':
        return {
          width: 144,
          aspectRatio: 0.5,
        }

      case 'square':
        return {
          width: '100%',
          aspectRatio: 1,
        }

      case 'horizontal':
        return {
          width: '100%',
          aspectRatio: 2.38,
        }

      default:
        return {
          width: 144,
          aspectRatio: 0.5,
        }
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
      case '3xl':
        return 'rounded-3xl'
      default:
        return 'rounded-xl'
    }
  }

  const getTitleClasses = () => {
    switch (cardType) {
      case 'vertical':
        return 'text-base font-bold tracking-tighter leading-tighter'

      case 'square':
        return 'text-base font-bold tracking-tighter leading-tighter'

      case 'horizontal':
        return 'text-base font-bold tracking-tighter leading-tighter'

      default:
        return 'text-lg font-bold tracking-tight'
    }
  }

  const getTitlePadding = () => {
    switch (cardType) {
      case 'vertical':
        return 'px-2 py-2'

      case 'square':
        return 'px-3 py-3'

      case 'horizontal':
        return 'px-3 py-3'

      default:
        return 'px-3 py-3'
    }
  }

  const containerStyle = getContainerStyle()
  const roundedClass = getRoundedClass()
  const titleClasses = getTitleClasses()
  const titlePadding = getTitlePadding()

  // Use image prop if valid, otherwise fetch from DB
  useEffect(() => {
    const cancelled = { value: false }

    const trimmedImage = image?.trim()

    if (
      trimmedImage &&
      trimmedImage !== 'undefined' &&
      trimmedImage !== 'null'
    ) {
      setImageUrl(trimmedImage)
      setImageError(false)
      setDbFetched(false)
    } else if (hasValidRecipeId) {
      supabase
        .from('recipes')
        .select('image')
        .eq('id', normalizedRecipeId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!cancelled.value) {
            if (error) {
              console.error(
                'Error fetching recipe image:',
                error
              )
            } else if (data?.image) {
              setImageUrl(data.image)
            }
          }
        })
        .catch((err) => {
          if (!cancelled.value) {
            console.error(
              'Error fetching recipe image:',
              err
            )
          }
        })
    }

    return () => {
      cancelled.value = true
    }
  }, [
    recipeId,
    image,
    hasValidRecipeId,
    normalizedRecipeId,
  ])

  // If the image URL fails to load and we haven't tried DB yet
  useEffect(() => {
    if (
      !imageError ||
      dbFetched ||
      !hasValidRecipeId
    ) {
      return
    }

    setDbFetched(true)

    const cancelled = { value: false }

    supabase
      .from('recipes')
      .select('image')
      .eq('id', normalizedRecipeId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled.value) {
          if (error) {
            console.error(
              'Error fetching recipe image:',
              error
            )
          } else if (data?.image) {
            setImageError(false)
            setImageUrl(data.image)
          }
        }
      })
      .catch((err) => {
        if (!cancelled.value) {
          console.error(
            'Error fetching recipe image:',
            err
          )
        }
      })

    return () => {
      cancelled.value = true
    }
  }, [
    imageError,
    dbFetched,
    hasValidRecipeId,
    normalizedRecipeId,
  ])

  const handleCardPress = async () => {
    if (!onPress && !hasValidRecipeId) {
      console.warn(
        '[RecipeCard] Press ignored: missing valid recipeId.'
      )
      return
    }

    // Track FIRST
    if (hasValidRecipeId) {
      await trackRecipeCardTap(
        normalizedRecipeId as any
      )

      console.log(
        'Tracked tap for recipe:',
        normalizedRecipeId
      )
    }

    // Navigate second
    if (onPress) {
      onPress()
    } else if (hasValidRecipeId) {
      router.push(`/recipe/${normalizedRecipeId}`)
    }
  }

  const imageSource =
    imageError || !imageUrl
      ? require('../assets/placeholder.png')
      : { uri: imageUrl }

  return (
    <Pressable
      onPress={handleCardPress}
      disabled={!onPress && !hasValidRecipeId}
      style={containerStyle}
      className={`${roundedClass} ${backgroundColor} overflow-hidden relative`}
    >
      <Image
        source={imageSource}
        className="absolute inset-0 w-full h-full"
        resizeMode="cover"
        onError={() => setImageError(true)}
      />

      <View className="absolute inset-0 justify-end">
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.7)',
            'rgba(0,0,0,0)',
          ]}
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
        <PlusButton recipeId={normalizedRecipeId} variant="card" style={{ top: 12, right: 12 }} />
      )}
    </Pressable>
  )
}