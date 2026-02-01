import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { getCurrentUser, createUserProfile, checkOnboardingStatus, getAndClearSignupData, createTasteProfile } from '@/lib/auth'
import { createTasteVectors } from '@/lib/taste-vectorization'

export default function OnboardingProfileScreen() {
  const router = useRouter()

  // UI states
  const [selectedTaste, setSelectedTaste] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Data states
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')
  const [username, setUsername] = useState('')

  const hasCheckedAuth = useRef(false)

  useEffect(() => {
    if (hasCheckedAuth.current) return
    hasCheckedAuth.current = true

    async function auth() {
      try {
        // 1. Check whether user logged in
        const currentUser = await getCurrentUser()
        if (!currentUser) {
          router.push('/login')
          return
        }
        setUser(currentUser)

        // 2. Check onboarding status for returning users
        const status = await checkOnboardingStatus(currentUser.id)

        if (!status.needsOnboarding) {
          router.push('/(tabs)/home')
          return
        }

        const signupData = await getAndClearSignupData(currentUser.id)

        if (signupData) {
          setFirstName(signupData.firstName)
          setUsername(signupData.username)
        }
      } catch (err) {
        console.error(err)
        Alert.alert('Error', 'Error loading onboarding. Please try again.')
        router.push('/login')
      }
    }

    auth()
  }, [router])

  const handleCompleteOnboarding = async () => {
    if (!selectedTaste.trim()) {
      Alert.alert('Error', 'Please tell us about your taste preferences')
      return
    }

    setSubmitting(true)

    try {
      console.log('[Onboarding] Creating user profile for:', user.id)
      await createUserProfile({
        userId: user.id,
        firstName,
        username: username || ' ',
        email: user.email,
      })

      console.log('[Onboarding] Creating taste vectors')
      const vectors = await createTasteVectors(selectedTaste)

      console.log('[Onboarding] Creating taste profile')
      await createTasteProfile(user.id, selectedTaste, vectors)

      Alert.alert('Success', 'Welcome to Hands!')
      setTimeout(() => router.replace('/(tabs)/home'), 500)
    } catch (err: any) {
      console.error('[Onboarding] Error:', err)
      Alert.alert('Error', err.message || 'Failed to complete onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  const exampleTastes = [
    "I eat anything and everything except celery",
    "My favorite food is pizza, extra pineapple",
    "My kids love asian food, my daughter's vegetarian",
    "I don't like Irish stew and I'm not crazy about cod",
    "I really love a tuna melt",
    "I don't eat octopus 'cause they're super smart",
    "I love soup. Chicken tortilla soup.",
    "Love thai food, like noodle dishes like ramen",
    "I don't like dill. I can't stand dill",
    "big arugula salad, and I love it on top of pizza",
    "I do love lemon chicken with vegetables",
    "Couldn't live without sushi",
  ]

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-6 pt-6"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <SymbolView name="chevron.left" size={24} tintColor="#00000099" />
          </TouchableOpacity>

          {/* Header */}
          <View className="mt-16">
            <Text className="text-3xl font-extrabold tracking-tighter text-black">
              What should we know about you?
            </Text>
            <Text className="text-base tracking-tight text-black/60 mt-2">
              For best results, tell us what your favorite meals are and what you don't like
            </Text>
          </View>

          {/* Input */}
          <TextInput
            value={selectedTaste}
            onChangeText={setSelectedTaste}
            placeholder="I love spicy food, prefer vegetarian options..."
            placeholderTextColor="#00000040"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!submitting}
            className="w-full h-14 px-6 rounded-full bg-[#F7F7F7] text-base text-black mt-8"
          />

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleCompleteOnboarding}
            disabled={!selectedTaste.trim() || submitting}
            className="w-full px-6 py-3.5 rounded-full mt-6 flex-row items-center justify-center"
            style={{
              backgroundColor: selectedTaste.trim() ? '#6CD401' : '#F7F7F7',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? (
              <>
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white text-lg font-medium ml-2">
                  Setting up your profile...
                </Text>
              </>
            ) : (
              <Text
                className="text-lg font-medium"
                style={{ color: selectedTaste.trim() ? 'white' : '#374151' }}
              >
                Complete
              </Text>
            )}
          </TouchableOpacity>

          {/* Example Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-8"
            contentContainerStyle={{ gap: 8, paddingRight: 24 }}
          >
            {exampleTastes.map((text, index) => (
              <View
                key={index}
                className="bg-[#F7F7F7] rounded-2xl px-4 relative flex-shrink-0"
                style={{ height: 96, width: 174 }}
              >
                <Text className="text-base text-black/80 mt-4" numberOfLines={4}>
                  {text}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedTaste(text)}
                  className="absolute bottom-2 right-2 p-1 rounded"
                >
                  <SymbolView
                    name="arrow.up.forward"
                    size={16}
                    tintColor="#00000099"
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
