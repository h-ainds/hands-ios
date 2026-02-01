import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native'
import RecipeCard from '@/components/RecipeCard'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface RecipeItem {
  id: string
  title: string
  caption: string
  image: string
}

interface ChatViewProps {
  messages: Message[]
  isTyping?: boolean
  recipeCards?: { messageIndex: number; recipes: { items: RecipeItem[] } }[]
}

export default function ChatView({
  messages,
  isTyping,
  recipeCards = [],
}: ChatViewProps) {
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 100)
  }, [messages, isTyping])

  const getRecipesForMessage = (index: number) => {
    return recipeCards.find(card => card.messageIndex === index)
  }

  // Empty state
  if ((!messages || messages.length === 0) && !isTyping) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-semibold text-black text-center">
          Make dinner from leftovers
        </Text>
        <Text className="text-sm text-secondary-muted text-center mt-2 max-w-[280px]">
          Get recipe ideas, meal plans, substitutions, and budget-friendly tips.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {messages.map((msg, i) => {
        const recipesForThisMessage = getRecipesForMessage(i)

        return (
          <View key={i} className="mb-4">
            {msg.role === 'user' ? (
              // User message - right aligned
              <View className="flex-row justify-end px-4">
                <View className="max-w-[80%] bg-[#F7F7F7] rounded-3xl px-4 py-3">
                  <Text className="text-black text-base leading-snug">
                    {msg.content}
                  </Text>
                </View>
              </View>
            ) : (
              // Assistant message - left aligned
              <>
                <View className="flex-row justify-start px-4">
                  <View className="max-w-[85%]">
                    <Text className="text-black text-base leading-snug py-2">
                      {msg.content}
                    </Text>
                  </View>
                </View>

                {/* Recipe Cards Carousel */}
                {recipesForThisMessage &&
                  recipesForThisMessage.recipes.items.length > 0 && (
                    <View className="mt-2 mb-2">
                      <FlatList
                        data={recipesForThisMessage.recipes.items}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                        keyExtractor={item => item.id}
                        renderItem={({ item }) => (
                          <RecipeCard
                            id={item.id}
                            title={item.title}
                            image={item.image}
                            cardType="vertical"
                            showActionButton
                          />
                        )}
                      />
                    </View>
                  )}
              </>
            )}
          </View>
        )
      })}

      {/* Typing Indicator */}
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
