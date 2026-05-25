export type TextSegment = { type: 'text'; content: string }
export type CardSegment = { type: 'card'; id: string; title: string; image: string; caption: string }
export type MessageSegment = TextSegment | CardSegment

export function parseSegments(
  text: string,
  recipeMap: Map<string, Omit<CardSegment, 'type'>>,
): MessageSegment[] {
  const parts = text.split(/\[\[recipe:([^\]]+)\]\]/)
  return parts.flatMap((part, i): MessageSegment[] => {
    if (i % 2 === 0) {
      const trimmed = part.trim()
      return trimmed ? [{ type: 'text', content: trimmed }] : []
    }
    const recipe = recipeMap.get(part)
    return recipe ? [{ type: 'card', ...recipe }] : []
  })
}

export function stripMarkers(text: string): string {
  return text.replace(/\[\[recipe:[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim()
}
