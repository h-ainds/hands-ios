import { useState, useEffect } from 'react'
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
import { signUp, resendVerificationEmail, getResendCooldownTime } from '@/lib/auth'

interface FormData {
  firstName: string
  email: string
  password: string
  confirmPassword: string
}

export default function SignupScreen() {
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'verification'>('form')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const router = useRouter()

  // Countdown timer for resend button
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    if (step === 'verification' && resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown(prev => (prev <= 1 ? 0 : prev - 1))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [step, resendCountdown])

  // Check initial resend cooldown when moving to verification step
  useEffect(() => {
    const checkCooldown = async () => {
      if (step === 'verification' && formData.email) {
        const { canResend, remainingSeconds } =
          await getResendCooldownTime(formData.email)
        if (!canResend) {
          setResendCountdown(remainingSeconds)
        }
      }
    }
    checkCooldown()
  }, [step, formData.email])

  const updateFormData = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = (): boolean => {
    if (!formData.firstName.trim()) {
      Alert.alert('Error', 'Please enter your first name')
      return false
    }

    if (!formData.email.trim()) {
      Alert.alert('Error', 'Please enter your email')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return false
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      Alert.alert('Error', "Passwords don't match")
      return false
    }

    return true
  }

  const handleSignUp = async () => {
    if (!validateForm()) return

    setLoading(true)

    try {
      console.log('[SignUp] Attempting signup for:', formData.email)

      const result = await signUp({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
      })

      console.log('[SignUp] Result:', {
        hasUser: !!result.user,
        hasSession: !!result.session,
        needsEmailVerification: result.needsEmailVerification,
        userId: result.user?.id,
      })

      if (result.needsEmailVerification) {
        setStep('verification')
        const { remainingSeconds } =
          await getResendCooldownTime(formData.email)
        setResendCountdown(remainingSeconds)
      } else {
        Alert.alert('Success', 'Account created successfully!')
        router.replace('/onboarding-profile')
      }
    } catch (error: any) {
      console.error('[SignUp] Error occurred:', {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
      })
      Alert.alert('Error', error.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleResendEmail = async () => {
    setResendLoading(true)

    try {
      const result = await resendVerificationEmail(formData.email)

      if (result.success) {
        Alert.alert('Success', 'Verification email sent!')
        setResendCountdown(60)
      } else {
        Alert.alert('Error', result.error || 'Failed to resend email')
        if (!result.canResend && result.nextResendTime) {
          const now = new Date()
          const remainingSeconds = Math.ceil(
            (result.nextResendTime.getTime() - now.getTime()) / 1000
          )
          setResendCountdown(remainingSeconds)
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend email')
    } finally {
      setResendLoading(false)
    }
  }

  // Verification Step
  if (step === 'verification') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-6">
          <TouchableOpacity
            onPress={() => setStep('form')}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <SymbolView name="chevron.left" size={24} tintColor="#00000099" />
          </TouchableOpacity>

          <View className="flex-1 items-center pt-16">
            <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-6">
              <SymbolView name="envelope" size={32} tintColor="#6CD401" />
            </View>

            <Text className="text-3xl font-extrabold text-black text-center">
              Check your email
            </Text>
            <Text className="text-black/60 mt-2 text-center">
              We've sent a verification link to
            </Text>
            <Text className="text-black font-medium mt-1">
              {formData.email}
            </Text>

            <TouchableOpacity
              onPress={handleResendEmail}
              disabled={resendLoading || resendCountdown > 0}
              className="w-full bg-[#F7F7F7] py-3.5 rounded-full mt-8 items-center justify-center"
            >
              {resendLoading ? (
                <ActivityIndicator color="black" />
              ) : resendCountdown > 0 ? (
                <Text className="text-black text-lg font-medium">
                  Resend email ({resendCountdown}s)
                </Text>
              ) : (
                <Text className="text-black text-lg font-medium">
                  Resend verification email
                </Text>
              )}
            </TouchableOpacity>

            <View className="flex-row mt-4">
              <Text className="text-black/60 text-sm">
                Already verified?
              </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text className="text-primary font-medium text-sm">
                    {' '}Log in
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // Signup Form
  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <SymbolView name="chevron.left" size={24} tintColor="#00000099" />
            </TouchableOpacity>

            <View className="mt-8">
              <Text className="text-3xl font-extrabold text-black">
                Create your account
              </Text>
              <Text className="text-black/60 mt-1">
                Enter your details to get started.
              </Text>
            </View>

            <View className="mt-8 space-y-4">
              <TextInput
                placeholder="First name"
                placeholderTextColor="#00000050"
                value={formData.firstName}
                onChangeText={v => updateFormData('firstName', v)}
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg"
              />

              <TextInput
                placeholder="Email"
                placeholderTextColor="#00000050"
                value={formData.email}
                onChangeText={v => updateFormData('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg mt-4"
              />

              <TextInput
                placeholder="Password"
                placeholderTextColor="#00000050"
                value={formData.password}
                onChangeText={v => updateFormData('password', v)}
                secureTextEntry
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg mt-4"
              />

              <TextInput
                placeholder="Confirm password"
                placeholderTextColor="#00000050"
                value={formData.confirmPassword}
                onChangeText={v => updateFormData('confirmPassword', v)}
                secureTextEntry
                className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg mt-4"
              />
            </View>

            <TouchableOpacity
              onPress={handleSignUp}
              disabled={loading}
              className="w-full bg-primary py-3.5 rounded-full mt-6 items-center justify-center"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-lg font-medium">
                  Create account
                </Text>
              )}
            </TouchableOpacity>

            <View className="flex-row justify-center mt-6">
              <Text className="text-black/60">
                Already have an account?
              </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text className="text-primary font-medium">
                    {' '}Log in
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
