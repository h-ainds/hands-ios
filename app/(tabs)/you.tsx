import { useState, useEffect } from 'react'
import { View, Text, Image, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import { clearAllUserData } from '@/lib/storage'
import { getTasteProfile } from '@/lib/auth'

export default function ProfileScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [tastePreferences, setTastePreferences] = useState<string[] | null>(null)

  useEffect(() => {
    if (!user?.id) return
    getTasteProfile(user.id).then((profile) => {
      setTastePreferences(profile?.taste_preferences ?? null)
    })
  }, [user?.id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) {
              Alert.alert('Error', 'User session not found. Please log in again.')
              return
            }

            try {
              const { data: { session }, error: sessionError } = await supabase.auth.getSession()
              if (sessionError || !session) {
                Alert.alert('Error', 'Session expired. Please log in again.')
                return
              }

              const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
              const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

              if (!supabaseUrl || !anonKey) {
                throw new Error('Supabase configuration missing')
              }

              const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': anonKey,
                  'Authorization': `Bearer ${session.access_token}`,
                },
              })

              const result = await response.json()

              if (!response.ok) {
                const errorMessage = result.error || `Server error (${response.status})`
                console.error('[DeleteAccount] Server error:', errorMessage)
                Alert.alert(
                  'Error',
                  `Failed to delete account: ${errorMessage}. Your account was not deleted.`
                )
                return
              }

              if (!result.ok) {
                console.error('[DeleteAccount] Unexpected response:', result)
                Alert.alert('Error', 'Account deletion failed. Please try again.')
                return
              }

              console.log('[DeleteAccount] Account deleted successfully, cleaning up client state')
              await clearAllUserData()
              const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
              if (signOutError) console.error('[DeleteAccount] Sign out error:', signOutError)
              router.replace('/login')
            } catch (error: any) {
              console.error('[DeleteAccount] Error:', error)
              Alert.alert(
                'Error',
                `Failed to delete account: ${error.message || 'Unknown error'}. Your account was not deleted.`
              )
            }
          },
        },
      ]
    )
  }

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  const firstName = user?.user_metadata?.first_name || 'You'
  const email = user?.email || ''

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 pt-16">
        {/* Avatar & Name */}
        <View className="items-center mb-8">
          <View className="w-[118px] h-[118px] rounded-full bg-gray-100 items-center justify-center mb-3">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} className="w-[118px] h-[118px] rounded-full" />
            ) : (
              <SymbolView name="person.fill" size={48} tintColor="#9F9F9F" />
            )}
          </View>
          <Text className="text-2.5xl font-bold text-black">{firstName}</Text>
          <Text className="text-base text-secondary-muted">{email}</Text>
        </View>

        {/* Your taste profile (saved from onboarding) */}
        {tastePreferences && tastePreferences.length > 0 && (
          <View className="mb-6">
            <Text className="text-sm text-black/60 mb-2">Your taste profile</Text>
            <View className="flex-row flex-wrap gap-2">
              {tastePreferences.map((label, index) => (
                <View
                  key={`${index}-${label}`}
                  className="bg-[#E8F5E0] rounded-full px-4 py-2"
                >
                  <Text className="text-base text-black/90">{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Memory Button */}
        <Pressable
          onPress={() => router.push('/memory')}
          className="bg-white rounded-xl p-4 mb-2 flex-row items-center active:opacity-70"
        >
          <SymbolView name="brain.head.profile" size={20} tintColor="#000" />
          <Text className="text-black ml-3 text-xl font-bold flex-1">Memory</Text>
          <SymbolView name="chevron.right" size={16} tintColor="#9F9F9F" />
        </Pressable>

        {/* Logout Button */}
        <Pressable
          onPress={handleLogout}
          className="bg-white rounded-xl p-4 mb-2 flex-row items-center active:opacity-70"
        >
          <SymbolView name="rectangle.portrait.and.arrow.right" size={20} tintColor="#000" />
          <Text className="text-black ml-3 text-xl font-bold flex-1">Logout</Text>
          <SymbolView name="chevron.right" size={16} tintColor="#9F9F9F" />
        </Pressable>

        {/* Delete Account Button */}
        <Pressable
          onPress={handleDeleteAccount}
          className="bg-white rounded-xl p-4 flex-row items-center active:opacity-70"
        >
          <SymbolView name="trash.fill" size={20} tintColor="#ef4444" />
          <Text className="text-red-600 ml-3 text-xl font-bold flex-1">Delete Account</Text>
          <SymbolView name="chevron.right" size={16} tintColor="#9F9F9F" />
        </Pressable>
      </View>
    </SafeAreaView>
  )
}