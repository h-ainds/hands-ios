import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useRouter, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { signIn, resendVerificationEmail, getResendCooldownTime, checkOnboardingStatus } from '@/lib/auth'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmailVerification, setShowEmailVerification] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendLoading, setResendLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const handleResendVerification = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    setResendLoading(true)
    try {
      const result = await resendVerificationEmail(email)

      if (result.success) {
        Alert.alert('Success', 'Verification email sent! Check your inbox.')
        setResendCooldown(60)

        if (timerRef.current) {
          clearInterval(timerRef.current)
        }

        timerRef.current = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) {
              if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
              }
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification email')
        if (result.nextResendTime) {
          const remainingMs = result.nextResendTime.getTime() - Date.now()
          setResendCooldown(Math.ceil(remainingMs / 1000))
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send verification email')
    } finally {
      setResendLoading(false)
    }
  }

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const { user, session } = await signIn({ email, password })

      if (user && session) {
        // Check if user needs onboarding
        const onboardingStatus = await checkOnboardingStatus(user.id)
        if (onboardingStatus.needsOnboarding) {
          router.replace('/onboarding-profile')
          return
        }
        router.replace('/(tabs)/home')
      }
    } catch (error: any) {
      // EMAIL VERIFICATION ERROR HANDLING DISABLED
      // To re-enable: Uncomment the code below when email verification is enabled
      // if (error.message?.includes('Email not confirmed') ||
      //     error.message?.includes('email_not_confirmed') ||
      //     error.message?.includes('not confirmed')) {
      //   setShowEmailVerification(true)
      //   const cooldownStatus = await getResendCooldownTime(email)
      //   setResendCooldown(cooldownStatus.remainingSeconds)
      // } else {
        Alert.alert('Error', error.message || 'Failed to sign in. Please check your credentials.')
      // }
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-6">
            {/* Back Button */}
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <SymbolView name="chevron.left" size={24} tintColor="#000000" />
            </TouchableOpacity>

            {/* Header */}
            <View className="mt-8">
              <Text className="text-3xl font-extrabold tracking-tight text-black">
                Welcome back
              </Text>
              <Text className="text-black/60 mt-1">
                Enter your details to log in.
              </Text>
            </View>

            {/* Form */}
            <View className="mt-8 space-y-4">
              <TextInput
                placeholder="Email"
                placeholderTextColor="#00000050"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!loading}
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg"
              />

              <TextInput
                placeholder="Password"
                placeholderTextColor="#00000050"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg mt-4"
              />
            </View>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleSignIn}
              disabled={loading}
              className="w-full bg-primary py-3.5 rounded-full mt-6 items-center justify-center flex-row"
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="white" size="small" />
                  <Text className="text-white text-lg font-medium ml-2">
                    Logging in...
                  </Text>
                </>
              ) : (
                <Text className="text-white text-lg font-medium">Log in</Text>
              )}
            </TouchableOpacity>

            {/* Email Verification Prompt */}
            {showEmailVerification && (
              <View className="mt-6 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                <Text className="text-lg font-semibold text-black text-center">
                  Please verify your email
                </Text>
                <Text className="text-black/70 text-center mt-2">
                  We sent a verification email to{' '}
                  <Text className="font-semibold">{email}</Text>. Please check
                  your inbox and click the verification link.
                </Text>

                <TouchableOpacity
                  onPress={handleResendVerification}
                  disabled={resendLoading || resendCooldown > 0}
                  className="w-full bg-primary py-2.5 rounded-full mt-4 items-center justify-center flex-row"
                  style={{ opacity: resendLoading || resendCooldown > 0 ? 0.5 : 1 }}
                >
                  {resendLoading ? (
                    <>
                      <ActivityIndicator color="white" size="small" />
                      <Text className="text-white font-medium ml-2">Sending...</Text>
                    </>
                  ) : resendCooldown > 0 ? (
                    <Text className="text-white font-medium">
                      Resend in {resendCooldown}s
                    </Text>
                  ) : (
                    <Text className="text-white font-medium">
                      Resend verification email
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowEmailVerification(false)}
                  className="mt-2"
                >
                  <Text className="text-black/60 text-sm text-center">
                    Try logging in again
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Links */}
            <View className="mt-6 items-center">
              <Link href="/forgot-password" asChild>
                <TouchableOpacity>
                  <Text className="text-secondary-muted">Forgot password?</Text>
                </TouchableOpacity>
              </Link>

              <View className="flex-row mt-3">
                <Text className="text-secondary-muted">No account yet? </Text>
                <Link href="/signup" asChild>
                  <TouchableOpacity>
                    <Text className="text-primary font-medium">Sign Up</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
