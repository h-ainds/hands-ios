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
  Switch,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@/context/AuthContext'
import { getUserPreferences, saveUserPreferences } from '@/lib/auth'
import {
  preferenceRows,
  withRowText,
  type PreferenceRow,
  type UserPreferences,
} from '@/lib/preferences'
import { getPreferencesEnabled, setPreferencesEnabled } from '@/lib/personalization'
import BackButton from '@/components/BackButton'

const MAX_WORDS = 25

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 9,
  elevation: 2,
}

function wordCount(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export default function PersonalizationScreen() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<UserPreferences>({})
  const [loading, setLoading] = useState(true)
  /** Whether preferences personalize chat replies. Stored on the device; off by default. */
  const [personalized, setPersonalized] = useState(false)
  /** Row being edited. For onboarding answers the question is read-only — only `editDraft` (answer) is editable. */
  const [editingRow, setEditingRow] = useState<PreferenceRow | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const load = useCallback(() => {
    if (!user?.id) return
    setLoading(true)
    getUserPreferences(user.id).then((next) => {
      setPrefs(next)
      setLoading(false)
    })
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getPreferencesEnabled().then(setPersonalized)
  }, [])

  const handleTogglePersonalized = (next: boolean) => {
    setPersonalized(next)
    setPreferencesEnabled(next).catch((e) => {
      setPersonalized(!next)
      Alert.alert('Error', (e as Error).message ?? 'Failed to save setting')
    })
  }

  const persist = useCallback(
    async (next: UserPreferences) => {
      if (!user?.id) return
      try {
        await saveUserPreferences(user.id, next)
        setPrefs(next)
      } catch (e) {
        Alert.alert('Error', (e as Error).message ?? 'Failed to save preferences')
      }
    },
    [user?.id]
  )

  const rows = preferenceRows(prefs)

  const handleEdit = (row: PreferenceRow) => {
    setEditingRow(row)
    setEditDraft(row.text)
  }

  const handleSaveEdit = () => {
    if (editingRow == null) return
    const trimmed = editDraft.trim()
    if (trimmed && wordCount(trimmed) > MAX_WORDS) {
      Alert.alert('Invalid', 'Maximum 25 words per answer.')
      return
    }
    const row = editingRow
    setEditingRow(null)
    setEditDraft('')
    if (!trimmed) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    persist(withRowText(prefs, row, trimmed))
  }

  const handleCancelEdit = () => {
    setEditingRow(null)
    setEditDraft('')
  }

  const handleDelete = (row: PreferenceRow) => {
    Alert.alert('Delete this preference?', 'This preference is about to be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
          persist(withRowText(prefs, row, ''))
        },
      },
    ])
  }
  
  const handleEllipsis = (row: PreferenceRow) => {
    Alert.alert('', '', [
      { text: 'Edit', onPress: () => handleEdit(row) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(row) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const limitWords = (text: string, max: number): string => {
    const words = text.trim().split(/\s+/).filter(Boolean)
    if (words.length <= max) return text
    return words.slice(0, max).join(' ')
  }

  const onEditDraftChange = (text: string) => {
    const limited = limitWords(text, MAX_WORDS)
    setEditDraft(limited)
  }

  const editWords = editingRow != null ? wordCount(editDraft) : 0
  const rowId = (row: PreferenceRow) => (row.kind === 'answer' ? row.key : `note-${row.index}`)

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
          <Text className="text-3xl font-extrabold tracking-tighter text-black mb-6">Personalization</Text>

          {/* Preferences toggle */}
          <View className="w-full flex-row items-center rounded-2xl bg-white pl-4 pr-3 py-3" style={CARD_SHADOW}>
            <Text className="flex-1 text-lg font-medium text-black">Preferences</Text>
            <Switch
              value={personalized}
              onValueChange={handleTogglePersonalized}
              trackColor={{ false: '#B2B2B2', true: '#6CD401' }}
              ios_backgroundColor="#B2B2B2"
            />
          </View>
          <Text className="text-sm text-black/45 leading-5 px-4 mt-2 mb-6">
            Your preferences will apply to all conversations.
          </Text>

          {loading ? (
            <ActivityIndicator size="small" className="py-4" />
          ) : (
            <>
              <View className="gap-3">
                {rows.map((row) => {
                  const isStructured = row.label != null

                  return editingRow != null && rowId(editingRow) === rowId(row) ? (
                    <View key={`edit-${rowId(row)}`} className="w-full rounded-2xl bg-[#F7F7F7] p-4">
                      {row.label ? (
                        <Text className="text-xs text-black/50 mb-2 leading-5">{row.label}</Text>
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
                      key={`row-${rowId(row)}`}
                      className="w-full flex-row items-start rounded-2xl bg-white pl-4 pr-2 py-3 gap-2"
                      style={CARD_SHADOW}
                    >
                      <View className="flex-1 min-w-0 pr-1">
                        {row.label ? (
                          <Text className="text-xs text-black/50 leading-5 mb-1">{row.label}</Text>
                        ) : null}
                        <Text className="text-base text-black leading-6">{row.text}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleEllipsis(row)} className="p-2 mt-0.5">
                        <SymbolView name="ellipsis" size={18} tintColor="#000000" />
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>

              {rows.length === 0 && (
                <Text className="text-base text-black/40 mt-2">
                  No preferences yet. Complete onboarding to add some.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}