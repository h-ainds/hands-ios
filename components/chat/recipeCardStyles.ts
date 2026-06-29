import { StyleSheet } from 'react-native'

/** Card width in points — must match the skeleton and the live card exactly. */
export const CARD_WIDTH = 144

/**
 * Shared structural styles imported by both RecipeCardView and RecipeCardSkeleton.
 * styles.card drives the outer container (dimensions + clip); styles.image is the
 * absoluteFill used for both the real image and any animated wrapper over it.
 */
export const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    aspectRatio: 0.5,
    borderRadius: 24, // rounded-3xl
    overflow: 'hidden',
    backgroundColor: '#E5E7EB', // grey base visible during both skeleton stages
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})
