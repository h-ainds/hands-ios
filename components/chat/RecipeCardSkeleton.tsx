import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { CARD_WIDTH, styles as card } from './recipeCardStyles'

/**
 * Stage A skeleton — rendered the moment tool.call.started arrives, before
 * recipe.cards hydrates the block.  Exact same footprint as RecipeCardView so
 * the layout never shifts when the real card replaces it.
 *
 * Reduced-motion: static grey only (no shimmer, no animation).
 */
export default function RecipeCardSkeleton() {
  const reducedMotion = useReducedMotion()
  const tx = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion) return
    // Shimmer stripe sweeps left→right across the card on the UI thread.
    tx.value = withRepeat(
      withTiming(CARD_WIDTH * 2, { duration: 950, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(tx)
  }, [reducedMotion])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }))

  return (
    <View style={card.card}>
      {!reducedMotion && (
        // Stripe starts CARD_WIDTH off-screen to the left; translateX carries it
        // to CARD_WIDTH off-screen to the right (full 2×CARD_WIDTH travel).
        // card.card's overflow:hidden clips it to the rounded card shape.
        <Animated.View style={[StyleSheet.absoluteFillObject, local.stripe, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
      )}
    </View>
  )
}

const local = StyleSheet.create({
  // Left-offset by one card width so the stripe enters from off-screen.
  stripe: { left: -CARD_WIDTH, width: CARD_WIDTH },
})
