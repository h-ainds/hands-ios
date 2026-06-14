/**
 * Onboarding stores each taste_preferences row as: `${questionTitle} ${answer}`.
 * Memory uses these helpers so the UI shows the question as read-only and edits only the answer.
 */

export const ONBOARDING_QUESTION_TITLES = [
  'What kind of cooking are you up for?',
  'Any dietary needs or preferences?',
  'What cuisines do you enjoy most?',
  'Who are you usually cooking for?',
  'What kind of meal do you need most?',
  "What's your fridge/pantry situation usually like?",
] as const

export function formatOnboardingPreferenceLine(title: string, value: string): string {
  const v = value.trim() || 'Not specified'
  return `${title} ${v}`
}

export function parsePreferenceLine(line: string): { question: string | null; answer: string } {
  const titles = [...ONBOARDING_QUESTION_TITLES].sort((a, b) => b.length - a.length)
  for (const title of titles) {
    if (line.startsWith(title)) {
      const answer = line.slice(title.length).replace(/^\s+/, '')
      return { question: title, answer }
    }
  }
  return { question: null, answer: line }
}
