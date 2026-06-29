import { useEffect, useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'
import Markdown from 'react-native-markdown-display'
import type { AssistantTurn, Block, Turn } from '@/types/chat'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import RecipeCardView from './RecipeCardView'

// ─── Markdown styles (unchanged) ──────────────────────────────────────────────

const markdownStyles = {
  body:        { color: '#000000', fontSize: 17, lineHeight: 24 },
  paragraph:   { marginTop: 0, marginBottom: 8, color: '#000000', fontSize: 17, lineHeight: 24 },
  strong:      { fontWeight: '600' as const, color: '#000000' },
  em:          { fontStyle: 'italic' as const, color: '#000000' },
  heading1:    { fontSize: 20, fontWeight: '700' as const, color: '#000000', marginBottom: 8, marginTop: 4 },
  heading2:    { fontSize: 18, fontWeight: '600' as const, color: '#000000', marginBottom: 6, marginTop: 4 },
  heading3:    { fontSize: 17, fontWeight: '600' as const, color: '#000000', marginBottom: 4, marginTop: 4 },
  bullet_list: { marginBottom: 8 },
  ordered_list:{ marginBottom: 8 },
  list_item:   { marginBottom: 4, flexDirection: 'row' as const },
  bullet_list_icon:  { color: '#000000', fontSize: 17, lineHeight: 24, marginRight: 6 },
  ordered_list_icon: { color: '#000000', fontSize: 17, lineHeight: 24, marginRight: 6 },
  code_inline: { backgroundColor: '#F0F0F0', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, fontFamily: 'Menlo', fontSize: 14, color: '#1A1A1A' },
  fence:       { backgroundColor: '#F7F7F7', borderRadius: 8, padding: 12, marginBottom: 8 },
  code_block:  { backgroundColor: '#F7F7F7', borderRadius: 8, padding: 12, marginBottom: 8, fontFamily: 'Menlo', fontSize: 13, color: '#1A1A1A' },
  blockquote:  { backgroundColor: '#F7F7F7', borderLeftColor: '#D1D1D1', borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginBottom: 8, borderRadius: 2 },
  hr:          { backgroundColor: '#E5E5E5', height: 1, marginVertical: 12 },
  link:        { color: '#6CD401', textDecorationLine: 'none' as const },
}

// ─── Block renderer ────────────────────────────────────────────────────────────

const SKELETON_COUNT = 3

function renderBlock(block: Block, i: number) {
  if (block.kind === 'text') {
    return (
      <View key={`text-${i}`} className="px-4 py-1">
        <Markdown style={markdownStyles}>{block.content}</Markdown>
      </View>
    )
  }

  // recipe_cards — key on tool_use_id so the node survives loading→ready transition
  if (block.status === 'loading') {
    return (
      <View key={`cards-${block.tool_use_id}`} className="mt-2 mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {Array.from({ length: SKELETON_COUNT }, (_, k) => (
            <RecipeCardSkeleton key={k} />
          ))}
        </ScrollView>
      </View>
    )
  }

  if (block.status === 'ready') {
    return (
      <View key={`cards-${block.tool_use_id}`} className="mt-2 mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {block.items.map((recipe) => (
            <RecipeCardView key={recipe.id} recipe={recipe} />
          ))}
        </ScrollView>
      </View>
    )
  }

  // status === 'failed': model text will explain; render nothing
  return null
}

function AssistantBubble({ turn }: { turn: AssistantTurn }) {
  return <>{turn.blocks.map((block, i) => renderBlock(block, i))}</>
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

interface ChatViewProps {
  turns: Turn[]
  isTyping?: boolean
}

export default function ChatView({ turns, isTyping }: ChatViewProps) {
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [turns, isTyping])

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {turns.map((turn, i) => (
        <View key={i} className="mb-4 mt-2">
          {turn.role === 'user' ? (
            <View className="flex-row justify-end px-4">
              <View className="max-w-[80%] bg-[#F7F7F7] rounded-3xl px-4 py-4">
                <Text className="text-black text-[17px] leading-snug">{turn.content}</Text>
              </View>
            </View>
          ) : (
            <AssistantBubble turn={turn} />
          )}
        </View>
      ))}

      {isTyping && (
        <View className="flex-row justify-start px-4 mb-4">
          <View className="flex-row items-center gap-1.5 px-3 py-3">
            <View className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce" />
            <View className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <View className="w-2 h-2 bg-secondary-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </View>
        </View>
      )}
    </ScrollView>
  )
}
