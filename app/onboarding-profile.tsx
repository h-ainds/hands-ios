import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { LinearGradient } from 'expo-linear-gradient'
import {
  getCurrentUser,
  createUserProfile,
  checkOnboardingStatus,
  getAndClearSignupData,
  createTasteProfile,
} from '@/lib/auth'
import { formatOnboardingPreferenceLine, parsePreferenceLine } from '@/lib/onboarding-preference-lines'

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
      showNumbers: true,
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
      multi: true,
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
  ]

  /** 0 = name, 1 … questions.length = questionnaire */
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
  /** Saved onboarding lines — same strings stored in Memory as taste_preferences (no AI chips). */
  const [savedPreferenceLines, setSavedPreferenceLines] = useState<string[]>([])
  const [showSuccessStep, setShowSuccessStep] = useState(false)

  // Data states
  const [user, setUser] = useState<any>(null)
  const [firstName, setFirstName] = useState('')

  const hasCheckedAuth = useRef(false)
  const otherInputRef = useRef<TextInput | null>(null)

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

    const memoryPreferences = questions.map((question) => {
      const selected = answers[question.key]
        .filter((option) => option !== 'Something else ...')
        .join(', ')
      const other = otherText[question.key].trim()
      const value = [selected, other].filter(Boolean).join(selected && other ? ', ' : '')
      return formatOnboardingPreferenceLine(question.title, value)
    })

    const tasteText = memoryPreferences.join('\n')

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

      // Store answers only — no taste-vectors / NLP step. Memory edits taste_preferences directly.
      console.log('[Onboarding] Saving taste profile (questionnaire lines only)')
      await createTasteProfile(user.id, tasteText, {}, memoryPreferences)

      setSavedPreferenceLines(memoryPreferences)
      setShowSuccessStep(true)
    } catch (err: any) {
      console.error('[Onboarding] Error:', err)
      Alert.alert('Error', err.message || 'Failed to complete onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  const totalSteps = 1 + questions.length
  const isNameStep = currentStep === 0
  const question = !isNameStep ? questions[currentStep - 1] : null
  const selectedForStep = question ? answers[question.key] : []
  const otherForStep = question ? otherText[question.key] : ''

  const progressValue = useMemo(
    () => ((currentStep + 1) / totalSteps) * 100,
    [currentStep, totalSteps]
  )

  const isCurrentStepValid = useMemo(() => {
    if (currentStep === 0) return firstName.trim().length > 0
    return selectedForStep.length > 0 || otherForStep.trim().length > 0
  }, [currentStep, firstName, selectedForStep, otherForStep])

  const toggleOption = useCallback(
    (option: string) => {
      if (currentStep === 0 || !question) return
      if (option === 'Something else ...') {
        otherInputRef.current?.focus()
        return
      }
      const key = question.key
      const multi = question.multi
      setAnswers((prev) => {
        const current = prev[key]
        if (multi) {
          const next = current.includes(option)
            ? current.filter((item) => item !== option)
            : [...current, option]
          return { ...prev, [key]: next }
        }
        return { ...prev, [key]: [option] }
      })
      if (!multi) {
        setOtherText((prev) => ({ ...prev, [key]: '' }))
      }
    },
    [currentStep, question]
  )

  const handleOtherTextChange = useCallback(
    (value: string) => {
      if (!question) return
      const key = question.key
      setOtherText((prev) => ({ ...prev, [key]: value }))
      if (!question.multi && value.trim().length > 0) {
        setAnswers((prev) => ({ ...prev, [key]: [] }))
      }
    },
    [question]
  )

  const handleContinue = () => {
    if (!isCurrentStepValid) return
    if (currentStep === 0) {
      setCurrentStep(1)
      return
    }
    if (currentStep === questions.length) {
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

  // Success step: show saved questionnaire lines (same items as Memory → taste_preferences)
  if (showSuccessStep) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-20">
          <View className="mt-0">
            <Text className="text-3xl font-extrabold tracking-tighter text-black">
              {savedPreferenceLines.length > 0
                ? `Nice to meet you, ${(firstName.trim() || 'Friend').split(/\s+/)[0]}`
                : "You're all set"}
            </Text>
            <Text className="text-base tracking-tighter text-secondary-placeholder mt-2">
              {savedPreferenceLines.length > 0
                ? "Here's what we saved. Edit anytime in Memory."
                : 'Welcome to Hands. Get started below.'}
            </Text>
          </View>
          {savedPreferenceLines.length > 0 && (
            <ScrollView
              className="mt-8 flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            >
              {savedPreferenceLines.map((line, index) => {
                const parsed = parsePreferenceLine(line)
                return (
                  <View
                    key={`${index}-${line.slice(0, 32)}`}
                    className="w-full rounded-2xl bg-white pl-4 pr-4 py-3"
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.06,
                      shadowRadius: 9,
                      elevation: 2,
                    }}
                  >
                    {parsed.question ? (
                      <>
                        <Text className="text-xs text-black/50 leading-5 mb-1">{parsed.question}</Text>
                        <Text className="text-base text-black leading-6">
                          {parsed.answer.trim() ? parsed.answer : '—'}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-base text-black leading-6">{line}</Text>
                    )}
                  </View>
                )
              })}
            </ScrollView>
          )}
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)/home')}
            className="w-full bg-primary py-4 rounded-full items-center justify-center mt-6 mb-4"
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
              className="w-12 h-12 rounded-full bg-white items-center justify-center"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 9,
                elevation: 2,
              }}
            >
              <SymbolView name="chevron.left" size={20} tintColor="#000000" />
            </TouchableOpacity>
            <View className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
              <View
                className="h-full rounded-full overflow-hidden"
                style={{ width: `${progressValue}%` }}
              >
                <LinearGradient
                  colors={['#6ED308', '#A7EB13']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>

          <View className="flex-1 pt-6">
            {isNameStep ? (
              <>
                <Text className="text-[26px] font-extrabold tracking-tighter leading-[32px] text-black">
                  What should I call you?
                </Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Your name"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoComplete="name-given"
                  maxLength={48}
                  className="mt-8 bg-[#F7F7F7] rounded-2xl px-4 py-4 text-black text-[19px] leading-7"
                  returnKeyType="done"
                  onSubmitEditing={handleContinue}
                />
              </>
            ) : question ? (
              <>
                <Text className="text-[26px] font-extrabold tracking-tighter leading-[32px] text-black">
                  {question.title}
                </Text>

                <View className="mt-7 gap-3">
                  {question.options.map((option, index) => {
                    const isOther = option === 'Something else ...'
                    const selected = isOther
                      ? otherForStep.trim().length > 0
                      : selectedForStep.includes(option)
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => toggleOption(option)}
                        className="flex-row items-center"
                        activeOpacity={0.8}
                      >
                        {question.showNumbers ? (
                          <View
                            className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${selected ? 'bg-primary' : 'bg-[#EFEFEF]'}`}
                          >
                            <Text
                              className={`text-[18px] ${selected ? 'text-white font-extrabold' : 'text-black'}`}
                            >
                              {index + 1}
                            </Text>
                          </View>
                        ) : (
                          <View
                            className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${selected ? 'bg-primary' : ''}`}
                            style={selected ? undefined : { borderWidth: 2, borderColor: '#DFE0E1' }}
                          >
                            {selected ? (
                              <SymbolView name="checkmark" size={16} tintColor="#FFFFFF" weight="heavy" />
                            ) : null}
                          </View>
                        )}
                        {isOther ? (
                          <TextInput
                            ref={otherInputRef}
                            value={otherForStep}
                            onChangeText={handleOtherTextChange}
                            placeholder="Something else ..."
                            placeholderTextColor="#9CA3AF"
                            returnKeyType="done"
                            className="text-[19px] leading-[26px] flex-1 text-black"
                          />
                        ) : (
                          <Text className="text-[19px] leading-[26px] flex-1 text-black">
                            {option}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            ) : null}
          </View>

          <View className="pb-8 pt-4">
            <TouchableOpacity
              onPress={handleContinue}
              disabled={!isCurrentStepValid || submitting}
              className={`w-full py-4 rounded-full items-center justify-center ${isCurrentStepValid ? 'bg-primary' : 'bg-[#F3F3F3]'}`}
              style={{ opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color={isCurrentStepValid ? '#FFFFFF' : '#000000'} size="small" />
              ) : (
                <Text
                  className={`text-[16px] font-semibold ${isCurrentStepValid ? 'text-white' : 'text-black'}`}
                >
                  Continue
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
