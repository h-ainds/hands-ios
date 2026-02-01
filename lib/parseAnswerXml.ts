export type ParsedRecipe = {
  id: string
  title: string
  caption: string
  image: string
}

export type ParsedAnswer = {
  text: string
  items: ParsedRecipe[]
}

// Regex-based XML parsing (DOMParser not available in React Native)
export function parseAnswerXml(xml: string): ParsedAnswer | null {
  try {
    // Extract text content
    const textMatch = xml.match(/<text>([\s\S]*?)<\/text>/)
    const text = textMatch ? textMatch[1].trim() : ''

    // Extract all items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    const items: ParsedRecipe[] = []
    let itemMatch

    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const itemContent = itemMatch[1]

      const id = itemContent.match(/<id>(.*?)<\/id>/)?.[1]?.trim() ?? ''
      const title = itemContent.match(/<title>(.*?)<\/title>/)?.[1]?.trim() ?? ''
      const caption = itemContent.match(/<caption>(.*?)<\/caption>/)?.[1]?.trim() ?? ''
      const image = itemContent.match(/<image>(.*?)<\/image>/)?.[1]?.trim() ?? ''

      if (id && title) {
        items.push({ id, title, caption, image })
      }
    }

    return { text, items }
  } catch (err) {
    console.error('Failed to parse XML:', err)
    return null
  }
}
