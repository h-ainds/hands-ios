import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { resetPassword } from '@/lib/auth'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const router = useRouter()

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      await resetPassword(email)
      setEmailSent(true)
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-6">
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <SymbolView name="chevron.left" size={24} tintColor="#00000099" />
          </TouchableOpacity>

          <View className="flex-1 items-center pt-16">
            {/* Mail Icon */}
            <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center mb-6">
              <SymbolView name="envelope" size={32} tintColor="#6CD401" />
            </View>

            <Text className="text-3xl font-extrabold tracking-tight text-black text-center">
              Check your email
            </Text>
            <Text className="text-black/60 mt-2 text-center px-4">
              We've sent a password reset link to
            </Text>
            <Text className="text-black font-medium mt-1">{email}</Text>
            <Text className="text-black/60 text-sm mt-4 text-center px-4">
              Click the link in the email to reset your password.
            </Text>

            {/* Send to different email */}
            <TouchableOpacity
              onPress={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="w-full bg-[#F7F7F7] py-3.5 rounded-full mt-8 items-center justify-center"
            >
              <Text className="text-black text-lg font-medium">
                Send to different email
              </Text>
            </TouchableOpacity>

            <Link href="/login" asChild>
              <TouchableOpacity className="mt-4">
                <Text className="text-primary font-medium">Back to login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-6">
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <SymbolView name="chevron.left" size={24} tintColor="#00000099" />
          </TouchableOpacity>

          {/* Header */}
          <View className="mt-8">
            <Text className="text-3xl font-extrabold tracking-tight text-black">
              Forgot password?
            </Text>
            <Text className="text-black/60 mt-1">
              Enter your email and we'll send you a reset link.
            </Text>
          </View>

          {/* Form */}
          <View className="mt-8">
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
          </View>

          {/* Reset Button */}
          <TouchableOpacity
            onPress={handleResetPassword}
            disabled={loading}
            className="w-full bg-primary py-3.5 rounded-full mt-6 items-center justify-center flex-row"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            {loading ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white text-lg font-medium ml-2">
                  Sending...
                </Text>
              </>
            ) : (
              <Text className="text-white text-lg font-medium">
                Send reset link
              </Text>
            )}
          </TouchableOpacity>

          {/* Back to Login */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-black/60">Remember your password? </Text>
            <Link href="/login" asChild>
              <TouchableOpacity>
                <Text className="text-primary font-medium">Log in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
