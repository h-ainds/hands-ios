import { View, Text, Image, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'expo-router'
import { SymbolView } from 'expo-symbols'

export default function ProfileScreen() {
  const { user } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch('/api/delete-user', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id }),
              })
              await supabase.auth.signOut()
              router.replace('/')
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account')
            }
          },
        },
      ]
    )
  }

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  const firstName = user?.user_metadata?.first_name || 'User'
  const username = user?.user_metadata?.username || 'User'
  const email = user?.email || ''

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="p-4">
        {/* Avatar & Name */}
        <View className="items-center mb-8">
          <View className="w-28 h-28 rounded-full bg-white items-center justify-center mb-2">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} className="w-28 h-28 rounded-full" />
            ) : (
              <SymbolView name="person.circle.fill" size={80} tintColor="#9F9F9F" />
            )}
          </View>
          <Text className="text-2xl font-bold text-black">{firstName}</Text>
          <Text className="text-gray-400">{username} • {email}</Text>
        </View>

        {/* Logout Button */}
        <Pressable
          onPress={handleLogout}
          className="bg-white rounded-xl p-4 mb-2 flex-row items-center active:opacity-70"
        >
          <SymbolView name="rectangle.portrait.and.arrow.right" size={20} tintColor="#000" />
          <Text className="text-black ml-3">Logout</Text>
        </Pressable>

        {/* Delete Account Button */}
        <Pressable
          onPress={handleDeleteAccount}
          className="bg-white rounded-xl p-4 flex-row items-center active:opacity-70"
        >
          <SymbolView name="trash.fill" size={20} tintColor="#ef4444" />
          <Text className="text-red-600 ml-3">Delete Account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}