import { useEffect, useRef } from 'react'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import Markdown from 'react-native-markdown-display'
import type { AssistantTurn, Block, Turn } from '@/types/chat'
import RecipeCard from '@/components/RecipeCard'
import RecipeCardSkeleton from './RecipeCardSkeleton'
import MessageActions, { MESSAGE_ACTIONS_EDGE_INSET } from './MessageActions'

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

/** Horizontal gutter every message block sits on (matches the px-4 on text blocks). */
const GUTTER = 24

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
      <View key={`cards-${block.tool_use_id}`} style={cards.container}>
        {Array.from({ length: SKELETON_COUNT }, (_, k) => (
          <RecipeCardSkeleton key={k} />
        ))}
      </View>
    )
  }

  if (block.status === 'ready') {
    return (
      <View key={`cards-${block.tool_use_id}`} style={cards.container}>
        {block.items.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipeId={recipe.id}
            title={recipe.title}
            image={recipe.image ?? undefined}
            rounded="3xl"
            showActionButton
          />
        ))}
      </View>
    )
  }

  // status === 'failed': model text will explain; render nothing
  return null
}

function AssistantBubble({ turn }: { turn: AssistantTurn }) {
  return <>{turn.blocks.map((block, i) => renderBlock(block, i))}</>
}

/**
 * Flattens an assistant turn into the plain text a user would expect on the
 * clipboard or in a share sheet: prose as written, card blocks as a titles
 * list. Rendering concern only — the screen decides what to do with it.
 */
function assistantPlainText(turn: AssistantTurn): string {
  return turn.blocks
    .map((block) => {
      if (block.kind === 'text') return block.content.trim()
      if (block.status === 'ready') return block.items.map((r) => `• ${r.title}`).join('\n')
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Action row for one assistant turn; renders nothing if there is no content to act on. */
function AssistantActions({
  turn,
  onCopy,
  onShare,
  onRetry,
}: {
  turn: AssistantTurn
  onCopy?: (text: string) => void
  onShare?: (text: string) => void
  onRetry?: () => void
}) {
  const text = assistantPlainText(turn)
  if (!text) return null

  return (
    <MessageActions
      // Back off the button's own inset so the first glyph's left edge — not
      // the edge of its larger hit box — lands on the text gutter.
      style={{ paddingLeft: GUTTER - MESSAGE_ACTIONS_EDGE_INSET, paddingTop: 2 }}
      onCopy={onCopy && (() => onCopy(text))}
      onShare={onShare && (() => onShare(text))}
      onRetry={onRetry}
    />
  )
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

interface ChatViewProps {
  turns: Turn[]
  isTyping?: boolean
  /**
   * Actions for the latest answer. ChatView supplies the flattened text; what
   * copy/share/retry actually do is entirely the screen's business.
   */
  onCopyMessage?: (text: string) => void
  onShareMessage?: (text: string) => void
  onRetryMessage?: () => void
}

export default function ChatView({
  turns,
  isTyping,
  onCopyMessage,
  onShareMessage,
  onRetryMessage,
}: ChatViewProps) {
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [turns, isTyping])

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 104 }} // this adjusts the bottom padding after recipe cards and llm response
      showsVerticalScrollIndicator={false}
    >
      {turns.map((turn, i) => (
        <View key={i} className="mb-4 mt-2">
          {turn.role === 'user' ? (
            <View className="px-4 items-end">
              {turn.image_uri && (
                <Image
                  source={{ uri: turn.image_uri }}
                  className="w-36 rounded-3xl mb-2"
                  style={{ aspectRatio: 1 }}
                  resizeMode="cover"
                />
              )}
              {!!turn.content && (
                <View className="max-w-[80%] bg-[#F7F7F7] rounded-3xl px-4 py-3">
                  <Text className="text-black text-[17px] leading-snug">{turn.content}</Text>
                </View>
              )}
            </View>
          ) : (
            <>
              <AssistantBubble turn={turn} />
              {/* Actions sit under the latest settled answer only — retry on an
                  older turn would mean rewriting history behind it. */}
              {i === turns.length - 1 && turn.done && !isTyping && (
                <AssistantActions
                  turn={turn}
                  onCopy={onCopyMessage}
                  onShare={onShareMessage}
                  onRetry={onRetryMessage}
                />
              )}
            </>
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

const cards = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, rowGap: 12 },
})
