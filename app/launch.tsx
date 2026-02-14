import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { signInWithGoogle, signInWithApple } from '@/lib/auth-oauth'
import { supabase } from '@/lib/supabase/client'
import { checkOnboardingStatus } from '@/lib/auth'
import { Ionicons } from '@expo/vector-icons'

export default function LaunchScreen() {
  const router = useRouter()
  const [oauthLoading, setOauthLoading] = useState(false)

  const finishAuthRedirect = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const onboardingStatus = await checkOnboardingStatus(user.id)
      if (onboardingStatus.needsOnboarding) {
        router.replace('/onboarding-profile')
        return
      }
    }
    router.replace('/(tabs)/home')
  }

  const handleGoogle = async () => {
    setOauthLoading(true)
    try {
      const res = await signInWithGoogle()
      if (!res.success) throw new Error(res.error)
      await finishAuthRedirect()
    } catch (e: any) {
      console.error(e?.message || e)
    } finally {
      setOauthLoading(false)
    }
  }

  const handleApple = async () => {
    setOauthLoading(true)
    try {
      const res = await signInWithApple()
      if (!res.success) throw new Error(res.error)
      await finishAuthRedirect()
    } catch (e: any) {
      console.error(e?.message || e)
    } finally {
      setOauthLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        {/* Logo */}
        <Text className="text-center text-primary font-extrabold text-2xl">
          Hands
        </Text>

        {/* Headline */}
        <View className="mt-10">
          <Text className="text-5xl font-extrabold text-black leading-tight">
            Your kitchen{"\n"}co-pilot.
          </Text>

          {/* Bigger + bolder + aligned with headline */}
          <Text className="text-black text-2xl font-extrabold mt-6 leading-8">
            Get recipe ideas, plan meals, and shop groceries faster.
          </Text>
        </View>

        {/* Buttons */}
        <View className="mt-10">
          {/* Apple */}
          <TouchableOpacity
            onPress={handleApple}
            disabled={oauthLoading}
            className="w-full bg-black py-4 rounded-full"
            style={{ opacity: oauthLoading ? 0.6 : 1 }}
          >
            {oauthLoading ? (
              <View className="items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View className="relative items-center justify-center">
                {/* Icon near left edge */}
                <View className="absolute left-5">
                  <Ionicons name="logo-apple" size={22} color="white" />
                </View>

                {/* Centered label */}
                <Text className="text-white text-lg font-semibold">
                  Continue with Apple
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Google */}
          <TouchableOpacity
            onPress={handleGoogle}
            disabled={oauthLoading}
            className="w-full bg-white border-2 border-gray-200 py-4 rounded-full mt-4"
            style={{ opacity: oauthLoading ? 0.6 : 1 }}
          >
            {oauthLoading ? (
              <View className="items-center justify-center">
                <ActivityIndicator color="#000" />
              </View>
            ) : (
              <View className="relative items-center justify-center">
                {/* Google image near left edge */}
                <View className="absolute left-5">
                  <Image
                    source={require('../assets/images/Google-Logo.png')}
                    style={{ width: 20, height: 20 }}
                    resizeMode="contain"
                  />
                </View>

                {/* Centered label */}
                <Text className="text-black text-lg font-semibold">
                  Continue with Google
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Sign up */}
          <TouchableOpacity
            onPress={() => router.push('/signup')}
            className="w-full bg-primary py-4 rounded-full items-center justify-center mt-4"
          >
            <Text className="text-white text-lg font-semibold">Sign up</Text>
          </TouchableOpacity>

          {/* Log in */}
          <TouchableOpacity
            onPress={() => router.push('/login')}
            className="w-full bg-[#F2F2F2] py-4 rounded-full items-center justify-center mt-4"
          >
            <Text className="text-black text-lg font-semibold">Log in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}
