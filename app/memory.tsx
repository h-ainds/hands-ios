import { useState, useEffect } from 'react'
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { getTasteProfile } from '@/lib/auth'

export default function MemoryScreen() {
  const { user } = useAuth()
  const [tastePreferences, setTastePreferences] = useState<string[] | null>(null)

  useEffect(() => {
    if (!user?.id) return
    getTasteProfile(user.id).then((profile) => {
      setTastePreferences(profile?.taste_preferences ?? null)
    })
  }, [user?.id])

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 pt-8">
        <Text className="text-2xl font-bold text-black mb-6">Memory</Text>

        {tastePreferences && tastePreferences.length > 0 ? (
          <View>
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
        ) : (
          <Text className="text-base text-black/40">No taste preferences saved yet.</Text>
        )}
      </View>
    </SafeAreaView>
  )
}