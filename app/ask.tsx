import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Image, ActionSheetIOS, Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { LinearGradient } from 'expo-linear-gradient'
import ChatView from '@/components/chat/ChatView'
import { useRecipeChat } from '@/hooks/useRecipeChat'
import { supabase } from '@/lib/supabase/client'
import BackButton from '@/components/BackButton'

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
type ImageSource = 'camera' | 'library'

type Attachment = {
  uri: string
  base64: string
  mimeType: MimeType
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

  const isChatStarted = messages.length > 0
  const isTyping = status === 'connecting' || status === 'streaming' || status === 'typing'

  const [inputHeight, setInputHeight] = useState(40)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
    }
    getUser()
  }, [])

  // ⭐ LOAD CONVERSATION IF conversationId IS PROVIDED
  useEffect(() => {
    if (conversationId && !conversationLoaded) {
      loadConversation(conversationId as string)
    }
  }, [conversationId])

  // Pre-populate composer when navigated with legacy params.
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

    // Legacy: previous scan flow pushed imageUri + a fully constructed prompt.
    // We keep this for any deep links/history that still include those params.
    if (nextImageUri) {
      // NOTE: no base64 available from legacy route; user will need to re-attach for VI.
      // We still preview the image for continuity.
      setAttachment({
        uri: nextImageUri,
        base64: '',
        mimeType: 'image/jpeg',
      })
    }
    if (nextPrompt && !input.trim()) setInput(nextPrompt)
  }, [conversationId, imageUri, routePrompt])

  const clearAttachment = useCallback(() => {
    setAttachment(null)
  }, [])

  const pickAttachment = useCallback(async (source: ImageSource) => {
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

      setAttachment({
        uri: asset.uri,
        base64: asset.base64,
        mimeType,
      })
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to pick image.')
    }
  }, [])

  const openLibrarySecondary = useCallback(() => {
    // iOS: native action sheet. Android: simple alert list.
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Photo Library', 'Cancel'],
          cancelButtonIndex: 1,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) pickAttachment('library')
        }
      )
      return
    }

    Alert.alert('Attach photo', 'Choose a source', [
      { text: 'Photo Library', onPress: () => pickAttachment('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [pickAttachment])

  // Repurposed camera entry point: /ask?openCamera=1
  useEffect(() => {
    if (conversationId) return
    const shouldOpen =
      openCamera === '1' || (Array.isArray(openCamera) && openCamera[0] === '1')
    if (!shouldOpen) return

    // Fire and forget (permission prompts are handled inside).
    pickAttachment('camera')
  }, [conversationId, openCamera, pickAttachment])

  const loadConversation = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', convId)
        .single()

      if (error) {
        console.error('Error loading conversation:', error)
        return
      }

      if (data?.content) {
        // Load messages
        setMessages(data.content)

        // Load recipe cards from saved messages
        const loadedRecipeCards: any[] = []
        data.content.forEach((msg: any, index: number) => {
          if (msg.role === 'assistant' && msg.recipes && msg.recipes.length > 0) {
            loadedRecipeCards.push({
              messageIndex: index,
              recipes: {
                text: msg.content,
                items: msg.recipes
              }
            })
          }
        })
        setRecipeCards(loadedRecipeCards)
      }

      setConversationLoaded(true)
    } catch (error) {
      console.error('Error in loadConversation:', error)
    }
  }

  const handleSubmit = useCallback(async () => {
    if (isLoading) return

    const typedContext = input.trim()
    const hasImage = !!attachment?.base64

    if (!typedContext && !hasImage) return

    // UX: the text field is optional context. If user sends only an image, the backend
    // will apply a default prompt (“What can I make with these ingredients?”).
    const displayText = typedContext || 'Sent a photo'
    setInput('')

    await sendMessage(
      displayText,
      conversationId as string | undefined,
      hasImage
        ? {
            imageBase64: attachment!.base64,
            mimeType: attachment!.mimeType,
            context: typedContext,
          }
        : { context: typedContext }
    )

    // Clear attachment after sending.
    if (hasImage) clearAttachment()
  }, [input, isLoading, sendMessage, conversationId, attachment, clearAttachment])

  const handleBack = useCallback(() => {
    if (isLoading) cancelRequest()
    router.back()
  }, [isLoading, cancelRequest, router])

  const SubmitButton = ({ disabled }: { disabled: boolean }) => (
    <Pressable onPress={handleSubmit} disabled={disabled}>
      <View
        className="px-2 py-2 rounded-full items-center justify-center bg-primary"
        style={{ opacity: disabled ? 0.5 : 1 }}  >
        <SymbolView 
        name="arrow.up" 
        size={18} 
        tintColor="#FFFFFF" 
        weight="semibold"
        />
      </View>
    </Pressable>
  )

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
{isChatStarted && <BackButton />}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Top Input */}
        {!isChatStarted && (
          <View className="px-4 pt-3">
            <View className="flex-row items-center gap-3">
              {/* Back */}
              {!isChatStarted && (
  <Pressable
    onPress={handleBack}
    className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-hands"
  >
    <SymbolView name="chevron.left" size={20} tintColor="#000000" />
  </Pressable>
)}

              {/* Input */}
              <View className="flex-1">
                {attachment?.uri && (
                  <View className="flex-row items-center bg-secondary rounded-2xl px-3 py-2 mb-2">
                    <Image
                      source={{ uri: attachment.uri }}
                      className="w-14 h-14 rounded-2xl bg-white"
                    />
                    <Pressable
                      onPress={clearAttachment}
                      className="ml-3 p-2 rounded-full bg-white"
                    >
                      <SymbolView name="xmark" size={16} tintColor="#6B7280" />
                    </Pressable>
                  </View>
                )}

                <View className="flex-row items-center bg-white rounded-full px-4 py-2.5 shadow-hands">
                  <Pressable
                    onPress={() => pickAttachment('camera')}
                    onLongPress={openLibrarySecondary}
                    disabled={isLoading}
                    className="mr-2"
                    style={{ opacity: isLoading ? 0.5 : 1 }}
                  >
                    <View className="w-9 h-9 rounded-full bg-secondary items-center justify-center">
                      <SymbolView name="camera.fill" size={16} tintColor="#9F9F9F" />
                    </View>
                  </Pressable>

                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="Additional context..."
                    placeholderTextColor="#9F9F9F"
                    className="flex-1 text-black text-base mr-2"
                    onSubmitEditing={handleSubmit}
                    returnKeyType="send"
                    autoFocus
                    editable={!isLoading}
                  />

                  {(input.trim().length > 0 || !!attachment?.base64) && (
                    <SubmitButton disabled={isLoading} />
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Chat */}
        <View className="flex-1 mt-4">
          <ChatView messages={messages} isTyping={isTyping} recipeCards={recipeCards} />
        </View>

        {/* Bottom Input */}
        {isChatStarted && (
          <View className="px-16 pb-12 pt-2 bg-transparent">
            {attachment?.uri && (
              <View className="flex-row items-center bg-secondary rounded-2xl px-3 py-2 mb-3">
                <Image
                  source={{ uri: attachment.uri }}
                  className="w-14 h-14 rounded-2xl bg-white"
                />
                <Pressable
                  onPress={clearAttachment}
                  className="ml-3 p-2 rounded-full bg-white"
                >
                  <SymbolView name="xmark" size={16} tintColor="#6B7280" />
                </Pressable>
              </View>
            )}

            <View
              className="flex-row items-center bg-white rounded-full px-4"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 9,
                elevation: 2,
                paddingVertical: 10,
              }}
            >
              <Pressable
                onPress={() => pickAttachment('camera')}
                onLongPress={openLibrarySecondary}
                disabled={isLoading}
                className="mr-2"
                style={{ opacity: isLoading ? 0.5 : 1 }}
              >
                <View className="w-9 h-9 rounded-full bg-secondary items-center justify-center">
                  <SymbolView name="camera.fill" size={16} tintColor="#9F9F9F" />
                </View>
              </Pressable>

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Additional context..."
                placeholderTextColor="#9F9F9F"
                className="flex-1 text-black text-base"
                style={{
                  paddingTop: 2,
                  paddingBottom: 2,
                  lineHeight: 20,
                  textAlignVertical: 'center',
                }}
                multiline
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />

              {(input.trim().length > 0 || !!attachment?.base64) && (
                <SubmitButton disabled={isLoading} />
              )}
            </View>

            {isLoading && (
              <View className="items-center mt-2">
                <Text className="text-xs text-secondary-placeholder">
                  {status === 'connecting' && 'Getting recipes...'}
                  {status === 'streaming' && 'Getting recipes...'}
                  {status === 'typing' && 'Typing...'}
                </Text>
              </View>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}