import { useState, useEffect, useRef, useMemo } from 'react'
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

  type QuestionKey =
    | 'cooking_effort'
    | 'dietary_preferences'
    | 'cuisines'
    | 'cooking_for'
    | 'meal_type'
    | 'pantry_situation'

  type Question = {
    key: QuestionKey
    title: string
    options: string[]
    multi: boolean
    showNumbers?: boolean
  }

  const questions: Question[] = [
    {
      key: 'cooking_effort',
      title: 'What kind of cooking are you up for?',
      options: [
        'Quick & easy (under 30 min)',
        'Moderate effort (30-60 min)',
        'I enjoy longer projects',
        'It varies',
        'Something else ...',
      ],
      multi: false,
    },
    {
      key: 'dietary_preferences',
      title: 'Any dietary needs or preferences?',
      options: [
        'Vegetarian / vegan',
        'Gluten-free',
        'Low-carb / keto',
        'No restrictions',
        'Something else ...',
      ],
      multi: false,
    },
    {
      key: 'cuisines',
      title: 'What cuisines do you enjoy most?',
      options: [
        'Asian (Thai, Japanese, Chinese...)',
        'Mediterranean / Middle Eastern',
        'American / comfort food',
        'Latin / Mexican',
        'Something else ...',
      ],
      multi: true,
    },
    {
      key: 'cooking_for',
      title: 'Who are you usually cooking for?',
      options: [
        'Just myself',
        'Me + one other',
        'Family / group (4+)',
        'It varies',
        'Something else ...',
      ],
      multi: false,
      showNumbers: true,
    },
    {
      key: 'meal_type',
      title: 'What kind of meal do you need most?',
      options: [
        'Weeknight dinners',
        'Meal prep / batch cooking',
        'Impressive dinner party dishes',
        'All of the above',
        'Something else ...',
      ],
      multi: false,
      showNumbers: true,
    },
    {
      key: 'pantry_situation',
      title: "What's your fridge/pantry situation usually like?",
      options: [
        'Well-stocked with staples',
        'I prefer recipes with few ingredients',
        'I shop fresh for each meal',
        'I rely a lot on canned/frozen',
        'Something else ...',
      ],
      multi: true,
    },
  ]

  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<QuestionKey, string[]>>({
    cooking_effort: [],
    dietary_preferences: [],
    cuisines: [],
    cooking_for: [],
    meal_type: [],
    pantry_situation: [],
  })
  const [otherText, setOtherText] = useState<Record<QuestionKey, string>>({
    cooking_effort: '',
    dietary_preferences: '',
    cuisines: '',
    cooking_for: '',
    meal_type: '',
    pantry_situation: '',
  })
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

    const tasteText = questions
      .map((question) => {
        const selected = answers[question.key]
          .filter((option) => option !== 'Something else ...')
          .join(', ')
        const other = otherText[question.key].trim()
        const value = [selected, other].filter(Boolean).join(selected && other ? ', ' : '')
        return `${question.title} ${value || 'Not specified'}`
      })
      .join('\n')

    if (!tasteText.trim()) {
      Alert.alert('Error', 'Please answer at least one onboarding question')
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
      const { vectors, preferences } = await createTasteVectors(tasteText)
      setGeneratedChips(preferences)

      console.log('[Onboarding] Creating taste profile')
      await createTasteProfile(user.id, tasteText, vectors, preferences)

      setShowSuccessStep(true)
    } catch (err: any) {
      console.error('[Onboarding] Error:', err)
      Alert.alert('Error', err.message || 'Failed to complete onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  const question = questions[currentStep]
  const selectedForStep = answers[question.key]
  const otherForStep = otherText[question.key]
  const isOtherSelected = selectedForStep.includes('Something else ...')

  const progressValue = useMemo(
    () => ((currentStep + 1) / questions.length) * 100,
    [currentStep, questions.length]
  )

  const isCurrentStepValid = useMemo(() => {
    const hasSelection = selectedForStep.length > 0
    if (!hasSelection) return false
    if (isOtherSelected && !otherForStep.trim()) return false
    return true
  }, [selectedForStep, isOtherSelected, otherForStep])

  const toggleOption = (option: string) => {
    setAnswers((prev) => {
      const current = prev[question.key]
      if (question.multi) {
        const next = current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option]
        return { ...prev, [question.key]: next }
      }
      return { ...prev, [question.key]: [option] }
    })
  }

  const handleContinue = () => {
    if (!isCurrentStepValid) return
    if (currentStep === questions.length - 1) {
      handleCompleteOnboarding()
      return
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
      return
    }
    router.back()
  }

  // Success step: show chips (if any) and a Continue button before redirecting
  if (showSuccessStep) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-20">
          <View className="mt-0">
            <Text className="text-3xl font-extrabold tracking-tighter text-black">
              {generatedChips.length > 0 ? 'Your preferences' : "You're all set"}
            </Text>
            <Text className="text-base tracking-tighter text-secondary-placeholder mt-2">
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
                  className="bg-secondary rounded-full px-4 py-2.5"
                >
                  <Text className="text-base text-black/90">{label}</Text>
                </View>
              ))}
            </View>
          )}
<TouchableOpacity
  onPress={() => router.replace('/(tabs)/home')}
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
        <View className="flex-1 px-5 pt-6">
          <View className="flex-row items-center gap-4">
            <TouchableOpacity
              onPress={handleBack}
              className="w-12 h-12 rounded-full bg-[#F3F3F3] items-center justify-center"
            >
              <SymbolView name="chevron.left" size={20} tintColor="#000000" />
            </TouchableOpacity>
            <View className="flex-1 h-4 bg-[#D9D9D9] rounded-full overflow-hidden">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${progressValue}%` }}
              />
            </View>
          </View>

          <View className="flex-1 pt-6">
            <Text className="text-[26px] font-extrabold tracking-tight leading-[32px] text-black">
              {question.title}
            </Text>

            <View className="mt-7 gap-3">
              {question.options.map((option, index) => {
                const selected = selectedForStep.includes(option)
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => toggleOption(option)}
                    className="flex-row items-center"
                    activeOpacity={0.8}
                  >
                    {question.showNumbers ? (
                      <View className="w-9 h-9 rounded-full bg-[#EFEFEF] items-center justify-center mr-3">
                        <Text className={`text-[18px] ${selected ? 'text-primary' : 'text-black'}`}>
                          {index + 1}
                        </Text>
                      </View>
                    ) : (
                      <View className="w-9 h-9 rounded-full bg-[#EFEFEF] items-center justify-center mr-3">
                        {selected ? (
                          <SymbolView name="checkmark" size={16} tintColor="#6CD401" />
                        ) : null}
                      </View>
                    )}
                    <Text className={`text-[19px] leading-[26px] flex-1 ${option === 'Something else ...' ? 'text-gray-400' : 'text-black'}`}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {isOtherSelected && (
              <TextInput
                value={otherForStep}
                onChangeText={(value) =>
                  setOtherText((prev) => ({ ...prev, [question.key]: value }))
                }
                placeholder="Tell us more..."
                placeholderTextColor="#9CA3AF"
                className="mt-5 bg-[#F7F7F7] rounded-2xl px-4 py-3 text-black text-base"
              />
            )}
          </View>

          <View className="pb-8 pt-4">
            <TouchableOpacity
              onPress={handleContinue}
              disabled={!isCurrentStepValid || submitting}
              className="w-full py-4 rounded-full items-center justify-center"
              style={{ backgroundColor: isCurrentStepValid ? '#F1F1F1' : '#F3F3F3', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color="#000000" size="small" />
              ) : (
                <Text className="text-[16px] font-semibold text-black">Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/home')}
              className="items-center mt-4"
            >
              <Text className="text-[14px] text-gray-400">Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
