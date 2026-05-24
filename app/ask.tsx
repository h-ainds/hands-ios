import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Image, ActionSheetIOS, Alert } from 'react-native'

import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import RevenueCatUI from 'react-native-purchases-ui'
import ChatView from '@/components/chat/ChatView'
import { useRecipeChat } from '@/hooks/useRecipeChat'
import { useUsageTracking } from '@/hooks/useUsageTracking'
import { supabase } from '@/lib/supabase/client'
import BackButton from '@/components/BackButton'

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
type ImageSource = 'camera' | 'library'

type Attachment = {
  uri: string
  base64: string
  mimeType: MimeType
}

type PersistedRecipe = {
  id?: string | number
  title?: string
  caption?: string
  image?: string
}

type PersistedConversationMessage = {
  role: 'user' | 'assistant'
  content: string
  recipes?: PersistedRecipe[]
}

export default function AskScreen() {
  const router = useRouter()
  const { conversationId, imageUri, prompt: routePrompt, openCamera } = useLocalSearchParams()
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)

  const { messages, recipeCards, status, isLoading, sendMessage, cancelRequest, setMessages, setRecipeCards } = useRecipeChat({
    timeout: 30000,
  })

  const { canSendMessage, canSendImage, incrementMessage, incrementImage } = useUsageTracking()

  const isChatStarted = messages.length > 0
  const isTyping = status === 'connecting' || status === 'streaming' || status === 'typing'
  const hasContent = input.trim().length > 0 || !!attachment?.base64

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    getUser()
  }, [])

  useEffect(() => {
    if (conversationId && !conversationLoaded) {
      loadConversation(conversationId as string)
    }
  }, [conversationId])

  useEffect(() => {
    if (conversationId) return

    const nextImageUri =
      typeof imageUri === 'string' ? imageUri : Array.isArray(imageUri) ? imageUri[0] : undefined
    const nextPrompt =
      typeof routePrompt === 'string'
        ? routePrompt
        : Array.isArray(routePrompt)
          ? routePrompt[0]
          : undefined

    if (nextImageUri) {
      setAttachment({ uri: nextImageUri, base64: '', mimeType: 'image/jpeg' })
    }
    if (nextPrompt && !input.trim()) setInput(nextPrompt)
  }, [conversationId, imageUri, routePrompt])

  const clearAttachment = useCallback(() => setAttachment(null), [])

  const pickAttachment = useCallback(async (source: ImageSource) => {
    if (!canSendImage) {
      await RevenueCatUI.presentPaywall()
      return
    }
    try {
      if (source === 'camera') {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync()
        if (cameraStatus !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required to take a photo.')
          return
        }
      } else {
        const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (libraryStatus !== 'granted') {
          Alert.alert('Permission needed', 'Photo library permission is required to pick an image.')
          return
        }
      }

      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions)

      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      if (!asset.base64) {
        Alert.alert('Error', 'Failed to read image data.')
        return
      }

      const uriLower = asset.uri.toLowerCase()
      const mimeType: MimeType = uriLower.endsWith('.png')
        ? 'image/png'
        : uriLower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg'

      setAttachment({ uri: asset.uri, base64: asset.base64, mimeType })
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to pick image.')
    }
  }, [canSendImage])

  const openLibrarySecondary = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Photo Library', 'Cancel'], cancelButtonIndex: 1 },
        (buttonIndex) => { if (buttonIndex === 0) pickAttachment('library') }
      )
      return
    }
    Alert.alert('Attach photo', 'Choose a source', [
      { text: 'Photo Library', onPress: () => pickAttachment('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [pickAttachment])

  useEffect(() => {
    if (conversationId) return
    const shouldOpen = openCamera === '1' || (Array.isArray(openCamera) && openCamera[0] === '1')
    if (!shouldOpen) return
    pickAttachment('camera')
  }, [conversationId, openCamera, pickAttachment])

  const loadConversation = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single()

      if (error) { console.error('Error loading conversation:', error); return }

      if (data?.content) {
        const content = (data.content ?? []) as PersistedConversationMessage[]
        const candidateRecipeIds = Array.from(
          new Set(
            content
              .flatMap((msg) => (Array.isArray(msg?.recipes) ? msg.recipes : []))
              .map((recipe) => String(recipe?.id ?? '').trim())
              .filter(Boolean)
          )
        )

        let validRecipeIdSet = new Set<string>()
        if (candidateRecipeIds.length > 0) {
          const numericIds = candidateRecipeIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))

          if (numericIds.length > 0) {
            const { data: existingRecipes, error: existingRecipeError } = await supabase
              .from('recipes')
              .select('id')
              .in('id', numericIds)

            if (existingRecipeError) {
              console.error('[Ask] Failed to validate conversation recipe IDs:', existingRecipeError)
            } else {
              validRecipeIdSet = new Set((existingRecipes ?? []).map((row) => String(row.id)))
            }
          }
        }

        const loadedRecipeCards: any[] = []
        let filteredInvalidCount = 0

        content.forEach((msg, index) => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.recipes) || msg.recipes.length === 0) {
            return
          }

          const validItems = msg.recipes.filter((recipe) => {
            const rawId = String(recipe?.id ?? '').trim()
            if (!rawId || !validRecipeIdSet.has(rawId)) {
              filteredInvalidCount += 1
              return false
            }
            return Boolean(recipe?.title)
          })

          if (validItems.length > 0) {
            loadedRecipeCards.push({
              messageIndex: index,
              recipes: {
                text: msg.content,
                items: validItems
              }
            })
          }
        })

        if (filteredInvalidCount > 0) {
          console.warn(
            `[Ask] Filtered ${filteredInvalidCount} invalid recipe cards while reloading conversation ${convId}.`
          )
        }

        // Load messages
        setMessages(content)
        setRecipeCards(loadedRecipeCards)
      }
      setConversationLoaded(true)
    } catch (error) {
      console.error('Error in loadConversation:', error)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (isLoading || !hasContent) return

    if (!canSendMessage) {
      await RevenueCatUI.presentPaywall()
      return
    }

    const typedContext = input.trim()
    const hasImage = !!attachment?.base64
    const displayText = typedContext || 'Sent a photo'

    setInput('')
    await incrementMessage()
    if (hasImage) await incrementImage()

    await sendMessage(
      displayText,
      conversationId as string | undefined,
      hasImage
        ? { imageBase64: attachment!.base64, mimeType: attachment!.mimeType, context: typedContext }
        : { context: typedContext }
    )

    if (hasImage) clearAttachment()
  }, [input, isLoading, hasContent, canSendMessage, sendMessage, conversationId, attachment, clearAttachment, incrementMessage, incrementImage])

  const handleBack = useCallback(() => {
    if (isLoading) cancelRequest()
    router.back()
  }, [isLoading, cancelRequest, router])

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        className="flex-1"
      >
        {/* ── Chat area fills all available space ── */}
        <View className="flex-1">
          {!isChatStarted && !hasContent ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-2.5xl font-semibold text-black text-center tracking-tighter">
                Turn leftovers into dinner
              </Text>
              <Text className="text-base text-secondary-muted text-center mt-2 tracking-tight leading-6">
                Get recipe ideas tailored to your ingredients and goals.
              </Text>
            </View>
          ) : (
            <ChatView messages={messages} isTyping={isTyping} recipeCards={recipeCards} />
          )}
        </View>

        {/* ── Composer — always anchored above keyboard ── */}
        <View className="px-4 pb-4">
          {/* Attachment preview — large embedded card */}
          {attachment?.uri && (
            <View
              className="w-36 rounded-3xl overflow-hidden mb-3"
              style={{ aspectRatio: 1 }}
            >
              <Image
                source={{ uri: attachment.uri }}
                className="w-full h-full"
                resizeMode="cover"
              />
              {/* Dismiss button — oversized, floating top-right */}
              <Pressable
                onPress={clearAttachment}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SymbolView name="xmark" size={14} tintColor="#000000" weight="bold" />
              </Pressable>
            </View>
          )}

          {/* Text Input Composer */}
          <View
            className="flex-row items-center bg-white rounded-full px-2"
            style={{
              height: 48,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {/* Camera button */}
            <Pressable
              onPress={() => pickAttachment('camera')}
              onLongPress={openLibrarySecondary}
              disabled={isLoading}
              hitSlop={6}
              style={{ opacity: isLoading ? 0.4 : 1, marginRight: 6 }}
            >
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center">
                <SymbolView name="camera" size={18} tintColor="#000000" weight="semibold" />
              </View>
            </Pressable>

            {/* Text input */}
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask"
              placeholderTextColor="#9F9F9F"
              className="flex-1 text-black"
              style={{ fontSize: 16, paddingVertical: 0, lineHeight: 18 }}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              editable={!isLoading}
              autoFocus={!conversationId}
              blurOnSubmit={false}
            />

            {/* Submit button — always visible, muted or green */}
            <Pressable
              onPress={handleSubmit}
              disabled={isLoading}
              hitSlop={6}
              style={{ marginLeft: 6, opacity: isLoading ? 0.4 : 1 }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: hasContent ? '#6CD401' : '#F7F7F7' }}
              >
                <SymbolView
                  name="arrow.up"
                  size={18}
                  tintColor={hasContent ? '#FFFFFF' : '#B2B2B2'}
                  weight="semibold"
                />
              </View>
            </Pressable>
          </View>

          {/* Streaming status hint */}
          {isLoading && (
            <View className="items-center mt-1.5">
              <Text style={{ fontSize: 14, color: '#F7F7F7' }}>
                {status === 'connecting' || status === 'streaming'
                  ? 'Finding recipes...'
                  : 'Typing...'}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Back button — always floating above all content, outside scroll/keyboard flow */}
      <BackButton onPress={handleBack} />
    </SafeAreaView>
  )
}