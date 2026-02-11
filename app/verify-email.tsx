import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase/client'

export default function VerifyEmailScreen() {
  const router = useRouter()
  const { email } = useLocalSearchParams<{ email: string }>()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleVerify = async () => {
    const cleanEmail = (email || '').trim()
    const cleanCode = code.trim()

    if (!cleanEmail) {
      Alert.alert('Error', 'Missing email. Please sign up again.')
      router.replace('/signup')
      return
    }

    if (cleanCode.length !== 6) {
      Alert.alert('Error', 'Enter the 6-digit code')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'email',
      })
      if (error) throw error

      // After verifyOtp, you should now have a session
      router.replace('/onboarding-profile')
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Invalid code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 justify-center">
        <Text className="text-3xl font-extrabold text-black text-center">Verify your email</Text>
        <Text className="text-black/60 text-center mt-2">Enter the 6-digit code sent to</Text>
        <Text className="text-black text-center font-semibold mt-1">{email}</Text>

        <TextInput
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          placeholderTextColor="#00000040"
          className="w-full mt-8 px-6 py-4 rounded-2xl bg-[#F7F7F7] text-center text-2xl tracking-widest"
        />

        <TouchableOpacity
          onPress={handleVerify}
          disabled={loading}
          className="w-full bg-primary py-4 rounded-full mt-6 items-center justify-center"
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="text-white text-lg font-semibold">Verify</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
