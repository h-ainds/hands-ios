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
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { supabase } from '@/lib/supabase/client'

export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleUpdatePassword = async () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a new password')
      return
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', "Passwords don't match")
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      // Sign out the user after password update
      await supabase.auth.signOut()

      Alert.alert('Success', 'Your password has been updated. Please log in with your new password.', [
        {
          text: 'OK',
          onPress: () => router.replace('/login'),
        },
      ])
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update password')
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
              Set new password
            </Text>
            <Text className="text-black/60 mt-1">
              Enter your new password below.
            </Text>
          </View>

          {/* Form */}
          <View className="mt-8 space-y-4">
            <TextInput
              placeholder="New password"
              placeholderTextColor="#00000050"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
              className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg"
            />

            <TextInput
              placeholder="Confirm new password"
              placeholderTextColor="#00000050"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={!loading}
              className="w-full px-4 py-3.5 rounded-2xl bg-[#F7F7F7] text-black text-lg mt-4"
            />
          </View>

          {/* Update Button */}
          <TouchableOpacity
            onPress={handleUpdatePassword}
            disabled={loading}
            className="w-full bg-primary py-3.5 rounded-full mt-6 items-center justify-center flex-row"
            style={{ opacity: loading ? 0.5 : 1 }}
          >
            {loading ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white text-lg font-medium ml-2">
                  Updating...
                </Text>
              </>
            ) : (
              <Text className="text-white text-lg font-medium">
                Update password
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
