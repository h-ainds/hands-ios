import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { SymbolView, type SymbolViewProps } from 'expo-symbols'

// ─── Visual constants ─────────────────────────────────────────────────────────

const ICON_SIZE = 18
const ICON_WEIGHT = 'semibold' as const
const ICON_COLOR = '#B2B2B2'

/** Visible icon is 18×18; the tappable box around it is larger for usability. */
const HIT_BOX = 34
const HIT_SLOP = 5 // 34 + 5×2 = 44pt effective target

/**
 * Gap between hit boxes, tuned so glyph centres land ~40pt apart — a little
 * over two icon-widths, matching the airier spacing of the reference row.
 */
const GAP = 10

/**
 * Distance from the row's left edge to the first glyph's left edge: the icon is
 * centred in a box wider than itself. A parent aligning the row to a text
 * gutter should subtract this from its padding.
 */
export const MESSAGE_ACTIONS_EDGE_INSET = (HIT_BOX - ICON_SIZE) / 2

/** How long the copy button shows its confirmation before reverting. */
const COPIED_RESET_MS = 1600

// ─── Single action ────────────────────────────────────────────────────────────

interface ActionButtonProps {
  name: SymbolViewProps['name']
  label: string
  onPress?: () => void
}

function ActionButton({ name, label, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.hitBox, pressed && styles.pressed]}
    >
      <SymbolView name={name} size={ICON_SIZE} weight={ICON_WEIGHT} tintColor={ICON_COLOR} />
    </Pressable>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface MessageActionsProps {
  onCopy?: () => void
  onRetry?: () => void
  onShare?: () => void
  /** Positioning only — the row's own look is fixed. */
  style?: StyleProp<ViewStyle>
}

export default function MessageActions({ onCopy, onRetry, onShare, style }: MessageActionsProps) {
  // Local confirmation state only — the row still has no idea what was copied.
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  const handleCopy = onCopy
    ? () => {
        onCopy()
        setCopied(true)
        if (resetTimer.current) clearTimeout(resetTimer.current)
        resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
      }
    : undefined

  return (
    <View style={[styles.row, style]}>
      <ActionButton
        name={copied ? 'checkmark' : 'square.on.square'}
        label={copied ? 'Copied' : 'Copy'}
        onPress={handleCopy}
      />
      <ActionButton name="arrow.trianglehead.2.counterclockwise" label="Retry" onPress={onRetry} />
      <ActionButton name="square.and.arrow.up" label="Share" onPress={onShare} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: GAP,
  },
  hitBox: {
    width: HIT_BOX,
    height: HIT_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
})
