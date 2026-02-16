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
import {
  getCurrentUser,
  createUserProfile,
  checkOnboardingStatus,
  getAndClearSignupData,
  createTasteProfile,
} from '@/lib/auth'
import { createTasteVectors } from '@/lib/taste-vectorization'

function slugifyUsername(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '') // remove spaces
    .replace(/[^a-z0-9_]/g, '') // keep a-z, 0-9, _
}

function generateUsername(email?: string, firstName?: string) {
  const emailPrefix = email?.split('@')?.[0] || 'user'
  const baseRaw = firstName?.trim() ? firstName : emailPrefix
  const base = slugifyUsername(baseRaw) || 'user'
  const suffix = Math.floor(1000 + Math.random() * 9000) // 4 digits
  return `${base}${suffix}`
}

export default function OnboardingProfileScreen() {
  const router = useRouter()

  // UI states
  const [selectedTaste, setSelectedTaste] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [generatedChips, setGeneratedChips] = useState<string[]>([])
  const [showSuccessStep, setShowSuccessStep] = useState(false)

  // Data states
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')

  const hasCheckedAuth = useRef(false)

  useEffect(() => {
    if (hasCheckedAuth.current) return
    hasCheckedAuth.current = true

    async function auth() {
      try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
          router.push('/login')
          return
        }
        setUser(currentUser)

        const status = await checkOnboardingStatus(currentUser.id)
        if (!status.needsOnboarding) {
          router.push('/(tabs)/home')
          return
        }

        const signupData = await getAndClearSignupData(currentUser.id)
        if (signupData?.firstName) {
          setFirstName(signupData.firstName)
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
    if (!user?.id) {
      Alert.alert('Error', 'User session missing. Please log in again.')
      router.replace('/login')
      return
    }

    if (!selectedTaste.trim()) {
      Alert.alert('Error', 'Please tell us about your taste preferences')
      return
    }

    setSubmitting(true)

    try {
      const finalFirstName = firstName?.trim() || 'Friend'
      const finalUsername = generateUsername(user.email, finalFirstName)

      console.log('[Onboarding] Creating user profile for:', user.id)
      await createUserProfile({
        userId: user.id,
        firstName: finalFirstName,
        //username: finalUsername, // never null
        email: user.email,
      })

      console.log('[Onboarding] Creating taste vectors and preferences')
      const { vectors, preferences } = await createTasteVectors(selectedTaste)
      setGeneratedChips(preferences)

      console.log('[Onboarding] Creating taste profile')
      await createTasteProfile(user.id, selectedTaste, vectors, preferences)

      setShowSuccessStep(true)
    } catch (err: any) {
      console.error('[Onboarding] Error:', err)
      Alert.alert('Error', err.message || 'Failed to complete onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  const exampleTastes = [
    'I eat anything and everything except celery',
    'My favorite food is pizza, extra pineapple',
    "My kids love asian food, my daughter's vegetarian",
    "I don't like Irish stew and I'm not crazy about cod",
    'I really love a tuna melt',
    "I don't eat octopus 'cause they're super smart",
    'I love soup. Chicken tortilla soup.',
    'Love thai food, like noodle dishes like ramen',
    "I don't like dill. I can't stand dill",
    'big arugula salad, and I love it on top of pizza',
    'I do love lemon chicken with vegetables',
    "Couldn't live without sushi",
  ]

  // Success step: show chips (if any) and a Continue button before redirecting
  if (showSuccessStep) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-6">
          <View className="mt-12">
            <Text className="text-2xl font-extrabold tracking-tighter text-black">
              {generatedChips.length > 0 ? 'Your taste profile' : "You're all set"}
            </Text>
            <Text className="text-base tracking-tight text-black/60 mt-2">
              {generatedChips.length > 0
                ? "Here's what we picked up. You can always see this on your profile."
                : "Welcome to Hands. Get started below."}
            </Text>
          </View>
          {generatedChips.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-8">
              {generatedChips.map((label, index) => (
                <View
                  key={`${index}-${label}`}
                  className="bg-[#E8F5E0] rounded-full px-4 py-2.5"
                >
                  <Text className="text-base text-black/90">{label}</Text>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Success', 'Welcome to Hands!', [
                { text: 'Continue', onPress: () => router.replace('/(tabs)/home') },
              ])
            }}
            className="w-full bg-primary py-4 rounded-full items-center justify-center mt-10"
          >
            <Text className="text-white text-lg font-semibold">Continue to Hands</Text>
          </TouchableOpacity>
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
        <ScrollView
          className="flex-1 px-6 pt-6"
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) router.back()
              else router.replace('/(tabs)/home')
            }}
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
              <View className="flex-row items-center">
                <ActivityIndicator color="white" size="small" />
                <Text className="text-white text-lg font-medium ml-2">
                  Setting up your profile...
                </Text>
              </View>
            ) : (
              <Text
                className="text-lg font-medium"
                style={{ color: selectedTaste.trim() ? 'white' : '#374151' }}
              >
                Complete
              </Text>
            )}
          </TouchableOpacity>

          {/* Generated taste preference chips (after NLP) */}
          {generatedChips.length > 0 && (
            <View className="mt-6">
              <Text className="text-sm text-black/60 mb-2">Your taste profile</Text>
              <View className="flex-row flex-wrap gap-2">
                {generatedChips.map((label, index) => (
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
                  <SymbolView name="arrow.up.forward" size={16} tintColor="#00000099" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
