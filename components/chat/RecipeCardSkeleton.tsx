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

/**
 * Stage A skeleton — shown the moment tool.call.started arrives, before
 * recipe.cards hydrates the block.  Exact same footprint as RecipeCard
 * (horizontal preset: width 100%, aspectRatio 2.38) so layout never shifts.
 *
 * Reduced-motion: static grey only (no shimmer).
 */
export default function RecipeCardSkeleton() {
  const reducedMotion = useReducedMotion()
  const tx = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion) return
    tx.value = withRepeat(
      withTiming(600, { duration: 950, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(tx)
  }, [reducedMotion])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }))

  return (
    <View style={local.card}>
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
    </View>
  )
}

const local = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 2.38,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  // Stripe starts off-screen left; overflow:hidden clips it to the card shape.
  stripe: { left: -300, width: 300 },
})
