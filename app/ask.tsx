import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { LinearGradient } from 'expo-linear-gradient'
import ChatView from '@/components/chat/ChatView'
import { useRecipeChat } from '@/hooks/useRecipeChat'
import { supabase } from '@/lib/supabase/client'
import BackButton from '@/components/BackButton'

export default function AskScreen() {
  const router = useRouter()
  const { conversationId } = useLocalSearchParams()  // ← GET conversationId from URL
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [conversationLoaded, setConversationLoaded] = useState(false)

  const { messages, recipeCards, status, isLoading, sendMessage, cancelRequest, setMessages, setRecipeCards } = useRecipeChat({
    timeout: 30000,
  })

  const isChatStarted = messages.length > 0
  const isTyping = status === 'connecting' || status === 'streaming' || status === 'typing'

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
    if (!input.trim() || isLoading) return

    const message = input.trim()
    setInput('')
    await sendMessage(message, conversationId as string | undefined)
  }, [input, isLoading, sendMessage, conversationId])

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
        size={16} 
        tintColor="#FFFFFF" />
      </View>
    </Pressable>
  )

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <BackButton />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Top Input */}
        {!isChatStarted && (
          <View className="px-4 pt-3">
            <View className="flex-row items-center gap-3">
              {/* Back */}
              <Pressable
                onPress={handleBack}
                className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-hands"
              >
                <SymbolView name="chevron.left" size={20} tintColor="#000000" />
              </Pressable>

              {/* Input */}
              <View className="flex-1 flex-row items-center bg-white rounded-full px-4 py-2.5 shadow-hands">
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask"
                  placeholderTextColor="#9F9F9F"
                  className="flex-1 text-black text-base mr-2"
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                  autoFocus
                  editable={!isLoading}
                />

                {input.trim().length > 0 && (
                  <SubmitButton disabled={isLoading} />
                )}
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
          <View className="px-12 pb-12 pt-2 bg-white/80">
            <View className="flex-row items-end bg-[#F7F7F7] rounded-full px-4 py-2.5">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask something else"
                placeholderTextColor="#9F9F9F"
                className="flex-1 text-black text-base mr-2"
                multiline
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />

              {input.trim().length > 0 && (
                <SubmitButton disabled={isLoading} />
              )}
            </View>

            {isLoading && (
              <View className="items-center mt-2">
                <Text className="text-xs text-gray-400">
                  {status === 'connecting' && 'Connecting...'}
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