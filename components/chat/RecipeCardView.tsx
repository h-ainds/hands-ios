import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
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
import type { RecipeCard } from '@/types/chat'
import { CARD_WIDTH, styles as card } from './recipeCardStyles'

interface Props {
  recipe: RecipeCard
  onPress?: () => void
}

/**
 * Renders a RecipeCard from the SSE stream.
 *
 * Stage B skeleton: the image area shows the grey base from card.card plus a
 * shimmer stripe while the remote image is in-flight.  On Image.onLoad the
 * shimmer cancels and the image cross-fades in (instant when reduced-motion is
 * active).
 */
export default function RecipeCardView({ recipe, onPress }: Props) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const [imgFailed, setImgFailed] = useState(false)
  // Prevent the shimmer from (re)starting if the image loads before useEffect fires.
  const imageReady = useRef(false)

  const secondary = recipe.caption ?? recipe.tags?.[0] ?? null
  const src =
    !imgFailed && recipe.image
      ? { uri: recipe.image }
      : require('../../assets/placeholder.png')

  // ── Stage B shimmer ──────────────────────────────────────────────────────────
  const tx = useSharedValue(0)
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }))

  useEffect(() => {
    if (reducedMotion || imageReady.current) return
    tx.value = withRepeat(
      withTiming(CARD_WIDTH * 2, { duration: 950, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(tx)
  }, [reducedMotion])

  // ── Image cross-fade ─────────────────────────────────────────────────────────
  const imgOpacity = useSharedValue(0)
  const imgStyle = useAnimatedStyle(() => ({ opacity: imgOpacity.value }))

  const revealImage = (instant: boolean) => {
    cancelAnimation(tx)
    imgOpacity.value = instant ? 1 : withTiming(1, { duration: 220 })
  }

  const handleLoad = () => {
    imageReady.current = true
    revealImage(reducedMotion ?? false)
  }

  const handleError = () => {
    setImgFailed(true)
    revealImage(true) // show placeholder without any transition
  }

  // ── Press ────────────────────────────────────────────────────────────────────
  const handlePress = () => {
    if (onPress) { onPress() } else { router.push(`/recipe/${recipe.id}`) }
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      style={card.card}
    >
      {/* Grey base is always visible (card.card.backgroundColor = #E5E7EB). */}

      {/* Stage B shimmer: sweeps across the image area while image is in-flight. */}
      {!reducedMotion && (
        <Animated.View style={[StyleSheet.absoluteFillObject, local.stripe, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}

      {/* Real image: starts invisible; fades in after onLoad. */}
      <Animated.View style={[card.image, imgStyle]}>
        <Image
          source={src}
          style={card.image}
          resizeMode="cover"
          onLoad={handleLoad}
          onError={handleError}
        />
      </Animated.View>

      {/* Gradient + text: always on top, visible immediately. */}
      <View style={[StyleSheet.absoluteFillObject, local.footer]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']}
          start={{ x: 0.5, y: 1 }}
          end={{ x: 0.5, y: 0 }}
        >
          <View style={local.textPad}>
            <Text
              style={local.title}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {recipe.title}
            </Text>
            {secondary !== null && (
              <Text style={local.secondary} numberOfLines={1} ellipsizeMode="tail">
                {secondary}
              </Text>
            )}
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  )
}

const local = StyleSheet.create({
  stripe: { left: -CARD_WIDTH, width: CARD_WIDTH },
  footer: { justifyContent: 'flex-end' },
  textPad: { paddingHorizontal: 10, paddingVertical: 10 },
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
