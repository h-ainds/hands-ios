import { useState } from 'react'
import { Text } from 'react-native'

const VERBS = [
  'Baking', 'Blanching', 'Brewing', 'Bunning', 'Caramelizing', 'Churning',
  'Cooking', 'Crunching', 'Crystallizing', 'Drizzling', 'Evaporating',
  'Fermenting', 'Flambéing', 'Frosting', 'Garnishing', 'Infusing',
  'Marinating', 'Misting', 'Mulling', 'Percolating', 'Proofing', 'Sautéing',
  'Smooshing', 'Sprouting', 'Stewing', 'Swirling', 'Tempering', 'Twisting',
  'Whisking', 'Zesting',
]

/**
 * Loading state for the assistant: a static kitchen verb ("Whisking…"),
 * picked at random each time the indicator mounts. Replaces the old • • • dots.
 */
export default function LoadingVerb() {
  const [verb] = useState(() => VERBS[Math.floor(Math.random() * VERBS.length)])

  return (
    <Text
      accessibilityRole="progressbar"
      style={{ fontSize: 17, lineHeight: 24, fontWeight: '500', color: '#B2B2B2' }}
    >
      {verb}…
    </Text>
  )
}
