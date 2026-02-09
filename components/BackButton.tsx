import { Pressable } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useRouter } from 'expo-router'

interface BackButtonProps {
  onPress?: () => void
}

export default function BackButton({ onPress }: BackButtonProps) {
  const router = useRouter()

  const handlePress = () => {
    if (onPress) {
      onPress()
    } else {
      router.back()
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      style={{
        position: 'absolute',
        top: 56,
        left: 16,
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
        zIndex: 50,
      }}
    >
      <SymbolView name="chevron.left" size={20} tintColor="#000000" />
    </Pressable>
  )
}