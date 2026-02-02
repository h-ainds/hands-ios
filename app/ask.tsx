import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { LinearGradient } from 'expo-linear-gradient'
import ChatView from '@/components/chat/ChatView'
import { useRecipeChat } from '@/hooks/useRecipeChat'
import { supabase } from '@/lib/supabase/client'

export default function AskScreen() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // Use the custom hook for chat functionality
  const {
    messages,
    recipeCards,
    status,
    isLoading,
    sendMessage,
    cancelRequest,
  } = useRecipeChat({
    timeout: 30000,
    onError: (err) => {
      console.error('[AskScreen] Chat error:', err.message)
      // Optionally show an alert for certain errors
      if (err.message.includes('timed out')) {
        Alert.alert(
          'Connection Issue',
          'The request timed out. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        )
      }
    },
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

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const message = input.trim()
    setInput('')
    await sendMessage(message)
  }, [input, isLoading, sendMessage])

  const handleBack = useCallback(() => {
    if (isLoading) {
      cancelRequest()
    }
    router.back()
  }, [isLoading, cancelRequest, router])

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {/* Top Input (before conversation) */}
        {!isChatStarted && (
          <View className="px-4 pt-3">
            <View className="flex-row items-center gap-3">
              {/* Back Button */}
              <TouchableOpacity
                onPress={handleBack}
                className="w-10 h-10 rounded-full bg-white items-center justify-center"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <SymbolView name="chevron.left" size={20} tintColor="#000000" />
              </TouchableOpacity>

              {/* Input Container */}
              <View
                className="flex-1 flex-row items-center bg-white rounded-full px-4 py-2.5"
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 3,
                }}
              >
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask"
                  placeholderTextColor="#9F9F9F"
                  className="flex-1 text-black text-base pr-2"
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                  autoFocus
                  editable={!isLoading}
                />

                {/* Submit Button / Sparkle Icon */}
                {input.trim() ? (
                  <TouchableOpacity
                    onPress={handleSubmit}
                    activeOpacity={0.8}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={['#6ED308', '#A5E765']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ opacity: isLoading ? 0.5 : 1 }}
                    >
                      <SymbolView name="arrow.up" size={18} tintColor="#FFFFFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <View className="flex-row items-center gap-1">
                    <View className="w-8 h-8 rounded-full bg-white items-center justify-center shadow-sm">
                      <SymbolView name="sparkle" size={16} tintColor="#6ED308" />
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Chat View */}
        <View className="flex-1 mt-4">
          <ChatView
            messages={messages}
            isTyping={isTyping}
            recipeCards={recipeCards}
          />
        </View>

        {/* Bottom Input (during chat) */}
        {isChatStarted && (
          <View className="px-4 pb-4 pt-2 bg-white/80">
            <View className="flex-row items-end bg-[#F7F7F7] rounded-full px-4 py-2.5">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask something"
                placeholderTextColor="#9F9F9F"
                className="flex-1 text-black text-base max-h-24"
                multiline
                onSubmitEditing={handleSubmit}
                editable={!isLoading}
              />

              <TouchableOpacity
                onPress={handleSubmit}
                activeOpacity={0.8}
                className="ml-2"
                disabled={!input.trim() || isLoading}
              >
                <LinearGradient
                  colors={['#6ED308', '#A5E765']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ opacity: input.trim() && !isLoading ? 1 : 0.5 }}
                >
                  <SymbolView name="arrow.up" size={20} tintColor="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Loading Status Indicator */}
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
