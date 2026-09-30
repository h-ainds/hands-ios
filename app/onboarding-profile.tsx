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
  saveUserPreferences,
} from '@/lib/auth'
import {
  OTHER_OPTION,
  PREFERENCE_QUESTIONS,
  preferenceRows,
  type PreferenceKey,
  type UserPreferences,
} from '@/lib/preferences'

const emptyByKey = <T,>(value: T) =>
  Object.fromEntries(PREFERENCE_QUESTIONS.map((q) => [q.key, value])) as Record<PreferenceKey, T>

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

  const questions = PREFERENCE_QUESTIONS

  /** 0 = name, 1 … questions.length = questionnaire */
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<PreferenceKey, string[]>>(() => emptyByKey<string[]>([]))
  const [otherText, setOtherText] = useState<Record<PreferenceKey, string>>(() => emptyByKey(''))
  const [submitting, setSubmitting] = useState(false)
  /** Saved onboarding answers — the same keyed object stored in user_preferences.preferences. */
  const [savedPreferences, setSavedPreferences] = useState<UserPreferences>({})
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

    // Multi-select → string[], single-select → string; unanswered questions are omitted.
    const preferences = Object.fromEntries(
      questions.flatMap((question) => {
        const selected = answers[question.key].filter((option) => option !== OTHER_OPTION)
        const other = otherText[question.key].trim()
        const values = other ? [...selected, other] : selected
        if (values.length === 0) return []
        return [[question.key, question.multi ? values : values.join(', ')]]
      })
    ) as UserPreferences

    if (Object.keys(preferences).length === 0) {
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

      console.log('[Onboarding] Saving preferences')
      await saveUserPreferences(user.id, preferences)

      setSavedPreferences(preferences)
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
      if (option === OTHER_OPTION) {
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

  // Success step: show saved answers (same rows as the Preferences screen)
  if (showSuccessStep) {
    const savedRows = preferenceRows(savedPreferences)
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-20">
          <View className="mt-0">
            <Text className="text-3xl font-extrabold tracking-tighter text-black">
              {savedRows.length > 0
                ? `Nice to meet you, ${(firstName.trim() || 'Friend').split(/\s+/)[0]}`
                : "You're all set"}
            </Text>
            <Text className="text-base tracking-tighter text-secondary-placeholder mt-2">
              {savedRows.length > 0
                ? "Here's what we saved. Edit anytime in Preferences."
                : 'Welcome to Hands. Get started below.'}
            </Text>
          </View>
          {savedRows.length > 0 && (
            <ScrollView
              className="mt-8 flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            >
              {savedRows.map((row) => (
                <View
                  key={row.kind === 'answer' ? row.key : `note-${row.index}`}
                  className="w-full rounded-2xl bg-white pl-4 pr-4 py-3"
                  style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 9,
                    elevation: 2,
                  }}
                >
                  {row.label ? (
                    <Text className="text-xs text-black/50 leading-5 mb-1">{row.label}</Text>
                  ) : null}
                  <Text className="text-base text-black leading-6">{row.text}</Text>
                </View>
              ))}
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
                    const isOther = option === OTHER_OPTION
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
