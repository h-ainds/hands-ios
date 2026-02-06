import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase/client'
import { checkOnboardingStatus } from '@/lib/auth'

export default function AuthCallback() {
  const params = useLocalSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState('Verifying...')

  useEffect(() => {
    const handleCallback = async () => {
      const { access_token, refresh_token, error, error_description, type, code } = params

      if (error) {
        setStatus((error_description as string) || 'Verification failed')
        setTimeout(() => router.replace('/login'), 3000)
        return
      }

      // Handle OAuth code exchange (PKCE flow)
      if (code) {
        try {
          const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code as string)
          
          if (exchangeError) throw exchangeError
          
          if (sessionData?.session) {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              const onboardingStatus = await checkOnboardingStatus(user.id)
              if (onboardingStatus.needsOnboarding) {
                router.replace('/onboarding-profile')
                return
              }
            }
            router.replace('/(tabs)/home')
            return
          }
        } catch (err) {
          console.error('Code exchange error:', err)
          setStatus('Session error. Please try again.')
          setTimeout(() => router.replace('/login'), 3000)
          return
        }
      }

      if (access_token && refresh_token) {
        try {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          })

          if (sessionError) throw sessionError

          // Handle password reset vs email verification
          if (type === 'recovery') {
            router.replace('/update-password')
          } else {
            // Email verification - check if user needs onboarding
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
        } catch (err) {
          console.error('Session error:', err)
          setStatus('Session error. Please try again.')
          setTimeout(() => router.replace('/login'), 3000)
        }
      } else {
        // No tokens provided, might be an error or malformed URL
        setStatus('Invalid verification link')
        setTimeout(() => router.replace('/login'), 3000)
      }
    }

    handleCallback()
  }, [params])

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator size="large" color="#6CD401" />
      <Text className="mt-4 text-lg text-black">{status}</Text>
    </View>
  )
}
