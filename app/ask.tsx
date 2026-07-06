import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Image, ActionSheetIOS, Alert, ActivityIndicator } from 'react-native'

import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import RevenueCatUI from 'react-native-purchases-ui'
import ChatView from '@/components/chat/ChatView'
import { useRecipeChat } from '@/hooks/useRecipeChat'
import { useUsageTracking } from '@/hooks/useUsageTracking'
import { supabase } from '@/lib/supabase/client'
import { uploadChatAttachment, signConversationAttachments } from '@/lib/attachments'
import BackButton from '@/components/BackButton'
import type { Turn, Block } from '@/types/chat'

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
type ImageSource = 'camera' | 'library'
type UploadStatus = 'uploading' | 'done' | 'error'

type Attachment = {
  uri: string
  mimeType: MimeType
  width?: number
  height?: number
  attachmentId?: string
  /** 0..1 upload progress. */
  progress: number
  status: UploadStatus
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
  attachment_id?: string
  imageUri?: string
}

// Longest edge we allow before upload. Resizing here cuts upload size and,
// downstream, vision-model latency and cost. Output is always JPEG.
const MAX_EDGE = 1536

async function compressForUpload(
  uri: string,
  width?: number,
  height?: number,
): Promise<{ uri: string; width?: number; height?: number }> {
  // Only downscale (never upscale) — resize the longer edge to MAX_EDGE.
  const longest = Math.max(width ?? 0, height ?? 0)
  const actions =
    longest > MAX_EDGE
      ? [{ resize: (width ?? 0) >= (height ?? 0) ? { width: MAX_EDGE } : { height: MAX_EDGE } }]
      : []
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  return { uri: result.uri, width: result.width, height: result.height }
}

export default function AskScreen() {
  const router = useRouter()
  const { conversationId, imageUri, prompt: routePrompt, openCamera } = useLocalSearchParams()
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [conversationLoaded, setConversationLoaded] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)

  const { messages, recipeCards, status, isLoading, sendMessage, cancelRequest, setMessages, setRecipeCards } = useRecipeChat({
    timeout: 30000,
  })

  const { canSendMessage, canSendImage, incrementMessage, incrementImage } = useUsageTracking()

  const [isMultiline, setIsMultiline] = useState(false)

  const isChatStarted = messages.length > 0
  const isTyping = status === 'connecting' || status === 'streaming' || status === 'typing'

  // Adapt legacy messages/recipeCards → Turn[] for ChatView.
  // Assistant turns get a ready RecipeCardsBlock when recipeCards has an entry for that index.
  const turns = useMemo<Turn[]>(() =>
    messages.map((msg, i) => {
      if (msg.role === 'user') {
        return { role: 'user' as const, content: msg.content, image_uri: msg.imageUri }
      }
      const blocks: Block[] = []
      if (msg.content) {
        blocks.push({ kind: 'text' as const, content: msg.content, final: true })
      }
      const cardData = recipeCards.find((c: any) => c.messageIndex === i)
      if (cardData?.recipes?.items?.length) {
        blocks.push({
          kind: 'recipe_cards' as const,
          status: 'ready' as const,
          tool_use_id: `legacy-${i}`,
          items: cardData.recipes.items.map((item: any) => ({
            id: String(item.id ?? i),
            title: String(item.title ?? ''),
            image: item.image ?? null,
            caption: item.caption ?? null,
            tags: null,
          })),
        })
      }
      return { role: 'assistant' as const, blocks, done: true }
    }),
    [messages, recipeCards]
  )

  const isUploading = attachment?.status === 'uploading'
  const attachmentReady = attachment?.status === 'done' && !!attachment.attachmentId
  // Send is disabled while an upload is in flight — even if text is present.
  const canSubmit = !isUploading && (input.trim().length > 0 || attachmentReady)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    getUser()
  }, [])

  const clearAttachment = useCallback(() => {
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    setAttachment(null)
  }, [])

  // Compress then upload eagerly on pick so the bytes are in Storage before the
  // user hits send. Always produces a JPEG.
  const beginUpload = useCallback(
    async (rawUri: string, width?: number, height?: number) => {
      uploadAbortRef.current?.abort()
      const controller = new AbortController()
      uploadAbortRef.current = controller
      // Guards against a stale upload clobbering a newer pick's state.
      const isCurrent = () => uploadAbortRef.current === controller

      // Show the raw image immediately while we compress + upload.
      setAttachment({ uri: rawUri, mimeType: 'image/jpeg', width, height, progress: 0, status: 'uploading' })

      try {
        let uid = userId
        if (!uid) {
          const { data } = await supabase.auth.getUser()
          uid = data.user?.id ?? null
        }
        if (!uid) throw new Error('Not signed in')

        const compressed = await compressForUpload(rawUri, width, height)
        if (!isCurrent()) return
        setAttachment((prev) =>
          prev ? { ...prev, uri: compressed.uri, width: compressed.width, height: compressed.height } : prev
        )

        const { attachmentId } = await uploadChatAttachment({
          uri: compressed.uri,
          mimeType: 'image/jpeg',
          userId: uid,
          width: compressed.width,
          height: compressed.height,
          signal: controller.signal,
          onProgress: (fraction) => {
            if (isCurrent()) setAttachment((prev) => (prev ? { ...prev, progress: fraction } : prev))
          },
        })

        if (!isCurrent()) return
        setAttachment((prev) =>
          prev ? { ...prev, attachmentId, progress: 1, status: 'done' } : prev
        )
      } catch (e: any) {
        if (e?.name === 'AbortError' || !isCurrent()) return
        setAttachment((prev) => (prev ? { ...prev, status: 'error' } : prev))
        Alert.alert('Upload failed', 'Could not upload the image. Please try again.')
      }
    },
    [userId]
  )

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
      beginUpload(nextImageUri)
    }
    if (nextPrompt && !input.trim()) setInput(nextPrompt)
  }, [conversationId, imageUri, routePrompt])

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
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(pickerOptions)
          : await ImagePicker.launchImageLibraryAsync(pickerOptions)

      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      beginUpload(asset.uri, asset.width, asset.height)
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to pick image.')
    }
  }, [canSendImage, beginUpload])

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

        // Attach signed URLs for any images in this conversation, keyed by message index.
        const attachmentUrls = await signConversationAttachments(convId)
        const withImages = attachmentUrls.size > 0
          ? content.map((msg, index) =>
              attachmentUrls.has(index) ? { ...msg, imageUri: attachmentUrls.get(index) } : msg
            )
          : content

        // Load messages
        setMessages(withImages)
        setRecipeCards(loadedRecipeCards)
      }
      setConversationLoaded(true)
    } catch (error) {
      console.error('Error in loadConversation:', error)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (isLoading || !canSubmit) return

    if (!canSendMessage) {
      await RevenueCatUI.presentPaywall()
      return
    }

    const typedContext = input.trim()

    // Snapshot the attachment, then clear the composer preview immediately —
    // the chat bubble (pushed optimistically by sendMessage) becomes the single
    // place the image is shown while we wait for the assistant.
    const sentAttachment =
      attachment?.status === 'done' && attachment.attachmentId
        ? { attachmentId: attachment.attachmentId, imageUri: attachment.uri }
        : null

    setInput('')
    setIsMultiline(false)
    if (sentAttachment) clearAttachment()

    await incrementMessage()
    if (sentAttachment) await incrementImage()

    await sendMessage(
      typedContext,
      conversationId as string | undefined,
      sentAttachment
        ? { ...sentAttachment, context: typedContext }
        : { context: typedContext }
    )
  }, [input, isLoading, canSubmit, canSendMessage, sendMessage, conversationId, attachment, clearAttachment, incrementMessage, incrementImage])

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
          {!isChatStarted && !attachment && input.trim().length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-2.5xl font-semibold text-black text-center tracking-tighter">
                Turn leftovers into dinner
              </Text>
              <Text className="text-base text-secondary-muted text-center mt-2 tracking-tight leading-6">
                Get recipe ideas tailored to your ingredients and goals.
              </Text>
            </View>
          ) : (
            <ChatView turns={turns} isTyping={isTyping} />
          )}
        </View>

        {/* ── Composer — always anchored above keyboard ── */}
        <View className="px-4 pb-4">
          {/* Attachment preview — large embedded card with upload progress */}
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

              {/* Upload progress overlay */}
              {attachment.status === 'uploading' && (
                <View
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 6 }}>
                    {Math.round(attachment.progress * 100)}%
                  </Text>
                  {/* Thin determinate bar along the bottom */}
                  <View
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
                      backgroundColor: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <View
                      style={{
                        height: 4,
                        width: `${Math.round(attachment.progress * 100)}%`,
                        backgroundColor: '#6CD401',
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Error overlay — tap to retry */}
              {attachment.status === 'error' && (
                <Pressable
                  onPress={() => beginUpload(attachment.uri, attachment.width, attachment.height)}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SymbolView name="arrow.clockwise" size={22} tintColor="#FFFFFF" weight="semibold" />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                    Tap to retry
                  </Text>
                </Pressable>
              )}

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

          {/* Composer row: floating camera button + input pill */}
          <View className="flex-row items-end gap-2">

            {/* Floating camera button */}
            <Pressable
              onPress={() => pickAttachment('camera')}
              onLongPress={openLibrarySecondary}
              disabled={isLoading}
              hitSlop={6}
              style={{ opacity: isLoading ? 0.4 : 1 }}
            >
              <View className="w-14 h-14 rounded-full bg-white items-center justify-center shadow-drop">
                <SymbolView name="camera.viewfinder" size={25} tintColor="#000000" weight="semibold" />
              </View>
            </Pressable>

            {/* Input pill */}
            <View
              className="flex-1 flex-row bg-white pl-4 pr-2 shadow-drop"
              style={{
                alignItems: isMultiline ? 'flex-end' : 'center',
                borderRadius: isMultiline ? 24 : 9999,
                paddingVertical: isMultiline ? 8 : 4,
                minHeight: 48,
              }}
            >
              {/* Text input */}
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask"
                placeholderTextColor="#9F9F9F"
                className="flex-1 text-black"
                style={{ fontSize: 16, lineHeight: 20, paddingTop: 2, paddingBottom: 2 }}
                multiline
                scrollEnabled={false}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
                autoFocus={!conversationId}
                blurOnSubmit={false}
                onContentSizeChange={(e) =>
                  setIsMultiline(e.nativeEvent.contentSize.height > 26)
                }
              />

              {/* Submit button — always visible, muted or active */}
              <Pressable
                onPress={handleSubmit}
                disabled={isLoading || !canSubmit}
                hitSlop={6}
                style={{ marginLeft: 6, opacity: isLoading ? 0.4 : 1 }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: canSubmit ? '#6CD401' : '#F7F7F7' }}
                >
                  <SymbolView
                    name="arrow.up"
                    size={18}
                    tintColor={canSubmit ? '#FFFFFF' : '#B2B2B2'}
                    weight="semibold"
                  />
                </View>
              </Pressable>
            </View>

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
