import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { trackRecipeCardTap } from '@/lib/supabase/track'
import { supabase } from '@/lib/supabase/client'
import PlusButton from '@/components/PlusButton'

export interface RecipeCardData {
  recipeId?: string | number
  title: string
  image?: string | null
  subtitle?: string | null
  tags?: string[] | null
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
  subtitle,
  tags,
  cardType = 'horizontal',
  rounded = 'xl',
  backgroundColor = 'bg-gray-300',
  showActionButton = false,
  onPress,
}: RecipeCardData) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  const secondary = subtitle ?? tags?.[0] ?? null

  // ── Normalize recipeId ────────────────────────────────────────────────────────
  const normalizedRecipeId =
    typeof recipeId === 'string' && !isNaN(Number(recipeId))
      ? Number(recipeId)
      : recipeId

  const hasValidRecipeId =
    normalizedRecipeId != null &&
    (typeof normalizedRecipeId === 'number'
      ? Number.isFinite(normalizedRecipeId) && normalizedRecipeId > 0
      : String(normalizedRecipeId).trim().length > 0)

  // ── Image state ───────────────────────────────────────────────────────────────
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [imageError, setImageError] = useState(false)
  const [dbFetched, setDbFetched] = useState(false)

  // ── Shimmer + cross-fade ──────────────────────────────────────────────────────
  const cardWidthSV = useSharedValue(0)
  const tx = useSharedValue(0)
  const imgOpacity = useSharedValue(0)
  const imageReady = useRef(false)

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
    left: -cardWidthSV.value,
    width: cardWidthSV.value,
  }))

  const imgAnimStyle = useAnimatedStyle(() => ({ opacity: imgOpacity.value }))

  const revealImage = (instant: boolean) => {
    cancelAnimation(tx)
    imgOpacity.value = instant ? 1 : withTiming(1, { duration: 220 })
  }

  const handleImageLoad = () => {
    imageReady.current = true
    revealImage(reducedMotion ?? false)
  }

  const handleImageError = () => {
    setImageError(true)
    revealImage(true)
  }

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (cardWidthSV.value === w || w === 0) return
    cardWidthSV.value = w
    if (!reducedMotion && !imageReady.current) {
      cancelAnimation(tx)
      tx.value = withRepeat(
        withTiming(w * 2, { duration: 950, easing: Easing.linear }),
        -1,
        false,
      )
    }
  }

  // ── DB fetch: primary (image prop absent or invalid) ──────────────────────────
  useEffect(() => {
    const cancelled = { value: false }
    const trimmedImage = image?.trim()

    if (trimmedImage && trimmedImage !== 'undefined' && trimmedImage !== 'null') {
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
            if (error) console.error('Error fetching recipe image:', error)
            else if (data?.image) setImageUrl(data.image)
          }
        })
        .catch((err) => {
          if (!cancelled.value) console.error('Error fetching recipe image:', err)
        })
    }

    return () => { cancelled.value = true }
  }, [recipeId, image, hasValidRecipeId, normalizedRecipeId])

  // ── DB fetch: fallback (image URL failed to load) ─────────────────────────────
  useEffect(() => {
    if (!imageError || dbFetched || !hasValidRecipeId) return

    setDbFetched(true)
    const cancelled = { value: false }

    supabase
      .from('recipes')
      .select('image')
      .eq('id', normalizedRecipeId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled.value) {
          if (error) console.error('Error fetching recipe image:', error)
          else if (data?.image) {
            setImageError(false)
            setImageUrl(data.image)
          }
        }
      })
      .catch((err) => {
        if (!cancelled.value) console.error('Error fetching recipe image:', err)
      })

    return () => { cancelled.value = true }
  }, [imageError, dbFetched, hasValidRecipeId, normalizedRecipeId])

  // ── Press handler ─────────────────────────────────────────────────────────────
  const handleCardPress = async () => {
    if (!onPress && !hasValidRecipeId) {
      console.warn('[RecipeCard] Press ignored: missing valid recipeId.')
      return
    }
    if (hasValidRecipeId) {
      await trackRecipeCardTap(normalizedRecipeId as any)
    }
    if (onPress) {
      onPress()
    } else if (hasValidRecipeId) {
      router.push(`/recipe/${normalizedRecipeId}`)
    }
  }

  // ── Dimensions ────────────────────────────────────────────────────────────────
  const containerStyle = (() => {
    switch (cardType) {
      case 'vertical':   return { width: 144, aspectRatio: 0.5 } as const
      case 'square':     return { width: '100%', aspectRatio: 1 } as const
      case 'horizontal': return { width: '100%', aspectRatio: 2.38 } as const
      default:           return { width: '100%', aspectRatio: 2.38 } as const
    }
  })()

  const roundedClass = (() => {
    switch (rounded) {
      case 'none': return 'rounded-none'
      case 'lg':   return 'rounded-lg'
      case 'xl':   return 'rounded-xl'
      case '2xl':  return 'rounded-2xl'
      case '3xl':  return 'rounded-3xl'
      default:     return 'rounded-xl'
    }
  })()

  const imageSource =
    imageError || !imageUrl
      ? require('../assets/placeholder.png')
      : { uri: imageUrl }

  return (
    <Pressable
      onPress={handleCardPress}
      onLayout={handleLayout}
      disabled={!onPress && !hasValidRecipeId}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={containerStyle}
      className={`${roundedClass} ${backgroundColor} overflow-hidden relative`}
    >
      {/* Stage B shimmer — sweeps while image is in-flight */}
      {!reducedMotion && (
        <Animated.View style={[StyleSheet.absoluteFillObject, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      {/* Real image: starts invisible, cross-fades in after onLoad */}
      <Animated.View style={[StyleSheet.absoluteFillObject, imgAnimStyle]}>
        <Image
          source={imageSource}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </Animated.View>

      {/* Gradient + text overlay — always on top */}
      <View style={[StyleSheet.absoluteFillObject, local.footer]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
        >
          <View style={local.textPad}>
            <Text style={local.title} numberOfLines={2} ellipsizeMode="tail">
              {title}
            </Text>
            {secondary !== null && (
              <Text style={local.secondary} numberOfLines={1} ellipsizeMode="tail">
                {secondary}
              </Text>
            )}
          </View>
        </LinearGradient>
      </View>

      {showActionButton && (
        <PlusButton
          recipeId={normalizedRecipeId}
          variant="card"
          style={{ top: 12, right: 12 }}
        />
      )}
    </Pressable>
  )
}

const local = StyleSheet.create({
  footer:    { justifyContent: 'flex-end' },
  textPad:   { paddingHorizontal: 12, paddingVertical: 12 },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 19,
  },
  secondary: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    letterSpacing: -0.3,
    marginTop: 2,
  },
})
