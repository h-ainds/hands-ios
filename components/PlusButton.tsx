import React, { useState } from 'react'
import { Pressable, Modal, View, Text, Alert, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useFavorites } from '@/hooks/useFavorites'

interface PlusButtonProps {
  recipeId: string | number | undefined
  variant?: 'card' | 'detail'
  style?: StyleProp<ViewStyle>
}

export default function PlusButton({ recipeId, variant = 'card', style }: PlusButtonProps) {
  const { isFavorite, toggleFavorite, pendingRecipeIds, favoritesAvailable } = useFavorites()
  const numericId = Number(recipeId)
  const isValid = recipeId != null && Number.isFinite(numericId) && numericId > 0
  const favorited = isValid ? isFavorite(numericId) : false
  const loading = isValid && pendingRecipeIds.has(numericId)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const iconSize = variant === 'detail' ? 20 : 17

  const openSheet = () => {
    if (loading) return
    setIsSheetOpen(true)
  }
  const closeSheet = () => setIsSheetOpen(false)

  const handleToggle = async () => {
    if (!isValid) return
    closeSheet()
    try {
      const result = await toggleFavorite(numericId)
      if (!result && !favoritesAvailable) {
        Alert.alert('Favorites setup needed', 'Run your latest Supabase migration to enable Favorites.')
      }
    } catch (err) {
      console.error('Failed to update favorite:', err)
      Alert.alert('Could not update favorites')
    }
  }

  return (
    <>
      <Pressable
        onPress={(e) => {
          e.stopPropagation()
          openSheet()
        }}
        disabled={loading}
        style={[
          styles.button,
          variant === 'card' && styles.buttonCard,
          loading && styles.disabled,
          style,
        ]}
      >
        {favorited ? (
          <SymbolView name="checkmark" size={iconSize} weight="semibold" tintColor="#16a34a" />
        ) : (
          <SymbolView name="plus" size={iconSize} weight="semibold" tintColor="#000000" />
        )}
      </Pressable>
      <Modal visible={isSheetOpen} transparent animationType="none" onRequestClose={closeSheet}>
        <View className="flex-1 justify-end">
          <View className="absolute inset-0 bg-black/30" />
          <Pressable className="absolute inset-0" onPress={closeSheet} />
          <View className="bg-white rounded-t-3xl px-4 pt-0 pb-8">
            <View className="w-14 h-1.5 bg-gray-300 rounded-full self-center mb-4" />
            <Pressable className="py-4 px-2" onPress={handleToggle}>
              <Text className="text-lg font-semibold text-black">
                {favorited ? 'Remove from Favorites' : 'Add to Favorites'}
              </Text>
            </Pressable>
            <Pressable className="py-4 px-2 border-t border-gray-100" onPress={closeSheet}>
              <Text className="text-lg font-semibold text-black">Reply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCard: {
    width: 34,
    height: 34,
    borderRadius: 18,
  },
  disabled: {
    opacity: 0.7,
  },
})