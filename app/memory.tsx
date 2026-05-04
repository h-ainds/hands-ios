import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@/context/AuthContext'
import { getTasteProfile, updateTastePreferences } from '@/lib/auth'
import {
  formatOnboardingPreferenceLine,
  parsePreferenceLine,
} from '@/lib/onboarding-preference-lines'
import BackButton from '@/components/BackButton'

const MAX_CHIPS = 7
const MAX_WORDS = 25

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export default function MemoryScreen() {
  const { user } = useAuth()
  const [list, setList] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  /** When set, the stored line is an onboarding Q&A row — only `editDraft` (answer) is editable. */
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [addDraft, setAddDraft] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!user?.id) return
    setLoading(true)
    getTasteProfile(user.id).then((profile) => {
      const prefs = profile?.taste_preferences ?? null
      setList(Array.isArray(prefs) ? prefs : [])
      setLoading(false)
    })
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  const persist = useCallback(
    async (next: string[]) => {
      if (!user?.id) return
      setSaving(true)
      try {
        await updateTastePreferences(user.id, next)
        setList(next)
      } catch (e) {
        Alert.alert('Error', (e as Error).message ?? 'Failed to save preferences')
      } finally {
        setSaving(false)
      }
    },
    [user?.id]
  )

  const handleAdd = () => {
    if (list.length >= MAX_CHIPS) return
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setAddDraft('')
  }

  const handleSaveNew = () => {
    const trimmed = addDraft?.trim() ?? ''
    setAddDraft(null)
    if (!trimmed) return
    if (wordCount(trimmed) > MAX_WORDS) {
      Alert.alert('Invalid', 'Maximum 25 words per note.')
      return
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    persist([...list, trimmed])
  }

  const handleCancelAdd = () => setAddDraft(null)

  const handleEdit = (index: number) => {
    const line = list[index] ?? ''
    const parsed = parsePreferenceLine(line)
    setEditingIndex(index)
    setEditingQuestion(parsed.question)
    setEditDraft(parsed.answer)
  }

  const handleSaveEdit = () => {
    if (editingIndex == null) return
    const trimmed = editDraft.trim()
    if (trimmed && wordCount(trimmed) > MAX_WORDS) {
      Alert.alert('Invalid', 'Maximum 25 words per answer.')
      return
    }
    const idx = editingIndex
    const question = editingQuestion
    setEditingIndex(null)
    setEditingQuestion(null)
    setEditDraft('')
    if (!trimmed) {
      const next = list.filter((_, i) => i !== idx)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      persist(next)
      return
    }
    const line = question
      ? formatOnboardingPreferenceLine(question, trimmed)
      : trimmed
    const next = [...list]
    next[idx] = line
    persist(next)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setEditingQuestion(null)
    setEditDraft('')
  }

  const handleDelete = (index: number) => {
    Alert.alert('Delete this memory?', 'This preference is about to be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
          persist(list.filter((_, i) => i !== index))
        },
      },
    ])
  }
  
  const handleEllipsis = (index: number) => {
    Alert.alert('', '', [
      { text: 'Edit', onPress: () => handleEdit(index) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(index) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const limitWords = (text: string, max: number): string => {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length <= max) return text
    return words.slice(0, max).join(' ')
  }

  const onAddDraftChange = (text: string) => {
    const limited = limitWords(text, MAX_WORDS)
    setAddDraft(limited)
  }

  const onEditDraftChange = (text: string) => {
    const limited = limitWords(text, MAX_WORDS)
    setEditDraft(limited)
  }

  const addWords = addDraft != null ? wordCount(addDraft) : 0
  const editWords = editingIndex != null ? wordCount(editDraft) : 0

  return (
    <SafeAreaView className="flex-1 bg-white">
      <BackButton />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingTop: 80 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text className="text-3xl font-extrabold tracking-tighter text-black mb-2">Memory</Text>
          <Text className="text-sm text-black/55 mb-6 leading-5">
            Onboarding answers are shown as a fixed question with your reply below. You can only change the reply; add
            custom notes with Add.
          </Text>

          {loading ? (
            <ActivityIndicator size="small" className="py-4" />
          ) : (
            <>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm text-black/60">Saved preferences</Text>
                <TouchableOpacity
                  onPress={handleAdd}
                  disabled={list.length >= MAX_CHIPS || saving}
                  className="rounded-full bg-primary px-4 py-2"
                  style={{ opacity: list.length >= MAX_CHIPS || saving ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold">Add</Text>
                </TouchableOpacity>
              </View>

              <View className="gap-3">
                {list.map((line, index) => {
                  const parsed = parsePreferenceLine(line)
                  const isStructured = parsed.question != null

                  return editingIndex === index ? (
                    <View key={`edit-${index}`} className="w-full rounded-2xl bg-[#F7F7F7] p-4">
                      {parsed.question ? (
                        <Text className="text-xs text-black/50 mb-2 leading-5">{parsed.question}</Text>
                      ) : (
                        <Text className="text-xs text-black/45 mb-2">Custom note</Text>
                      )}
                      <TextInput
                        value={editDraft}
                        onChangeText={onEditDraftChange}
                        placeholder={isStructured ? 'Your answer' : 'Edit note (max 25 words)'}
                        placeholderTextColor="#9CA3AF"
                        className="text-base text-black min-h-[44px]"
                        multiline
                        autoFocus
                      />
                      <Text className="text-xs text-black/50 mt-1">
                        {editWords}/{MAX_WORDS} words
                        {editWords >= MAX_WORDS && ' — Maximum 25 words'}
                      </Text>
                      <View className="flex-row gap-2 mt-2">
                        <TouchableOpacity onPress={handleSaveEdit} className="bg-primary rounded-full px-3 py-1.5">
                          <Text className="text-white text-sm font-medium">Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleCancelEdit} className="bg-black/10 rounded-full px-3 py-1.5">
                          <Text className="text-black text-sm">Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View
                      key={`row-${index}`}
                      className="w-full flex-row items-start rounded-2xl bg-white pl-4 pr-2 py-3 gap-2"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.06,
                        shadowRadius: 9,
                        elevation: 2,
                      }}
                    >
                      <View className="flex-1 min-w-0 pr-1">
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
                      <TouchableOpacity onPress={() => handleEllipsis(index)} className="p-2 mt-0.5">
                        <SymbolView name="ellipsis" size={18} tintColor="#000000" />
                      </TouchableOpacity>
                    </View>
                  )
                })}

                {addDraft != null && (
                  <View className="w-full rounded-2xl bg-[#F7F7F7] p-4">
                    <Text className="text-xs text-black/45 mb-2">Custom note</Text>
                    <TextInput
                      value={addDraft}
                      onChangeText={onAddDraftChange}
                      placeholder="Anything else we should remember (max 25 words)"
                      placeholderTextColor="#9CA3AF"
                      className="text-base text-black min-h-[44px]"
                      multiline
                      autoFocus
                    />
                    <Text className="text-xs text-black/50 mt-1">
                      {addWords}/{MAX_WORDS} words
                      {addWords >= MAX_WORDS && ' — Maximum 25 words per preference'}
                    </Text>
                    <View className="flex-row gap-2 mt-2">
                      <TouchableOpacity
                        onPress={handleSaveNew}
                        disabled={!addDraft.trim() || addWords > MAX_WORDS}
                        className="bg-primary rounded-full px-3 py-1.5"
                        style={{ opacity: !addDraft.trim() || addWords > MAX_WORDS ? 0.5 : 1 }}
                      >
                        <Text className="text-white text-sm font-medium">Add</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleCancelAdd} className="bg-black/10 rounded-full px-3 py-1.5">
                        <Text className="text-black text-sm">Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {list.length === 0 && addDraft == null && !loading && (
                <Text className="text-base text-black/40 mt-2">
                  No preferences yet. Complete onboarding or tap Add for a custom note.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}