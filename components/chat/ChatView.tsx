import { useEffect, useRef } from 'react'
import { View, Text, ScrollView } from 'react-native'
import RecipeCard from '@/components/RecipeCard'
import type { ChatMessage } from '@/hooks/useRecipeChat'

interface ChatViewProps {
  messages: ChatMessage[]
  isTyping?: boolean
}

export default function ChatView({ messages, isTyping }: ChatViewProps) {
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }, [messages, isTyping])

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {messages.map((msg, i) => (
        <View key={i} className="mb-4">
          {msg.role === 'user' ? (
            <View className="flex-row justify-end px-4">
              <View className="max-w-[80%] bg-[#F7F7F7] rounded-3xl px-4 py-3">
                <Text className="text-black text-base leading-snug">{msg.content}</Text>
              </View>
            </View>
          ) : msg.segments ? (
            // Segment renderer: text and recipe cards interleaved inline
            <View className="px-4">
              {msg.segments.map((seg, si) =>
                seg.type === 'text' ? (
                  <Text key={si} className="text-black text-base leading-snug py-1">
                    {seg.content}
                  </Text>
                ) : (
                  <View key={si} className="my-2">
                    <RecipeCard
                      recipeId={seg.id}
                      title={seg.title}
                      image={seg.image}
                      cardType="horizontal"
                      showActionButton={true}
                    />
                  </View>
                )
              )}
            </View>
          ) : (
            // Plain text (during typing or no cards)
            <View className="flex-row justify-start px-4">
              <View className="max-w-[85%]">
                <Text className="text-black text-base leading-snug py-2">{msg.content}</Text>
              </View>
            </View>
          )}
        </View>
      ))}

      {isTyping && (
        <View className="flex-row justify-start px-4 mb-4">
          <View className="flex-row items-center gap-1.5 px-3 py-3">
            <View className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce" />
            <View
              className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <View
              className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </View>
        </View>
      )}
    </ScrollView>
  )
}
