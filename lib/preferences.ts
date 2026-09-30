/**
 * User preferences, stored in user_preferences.preferences as a keyed jsonb object:
 *   { cooking_effort: "Quick & easy (under 30 min)", preferred_cuisines: ["Latin / Mexican"], notes: ["..."] }
 * Single-select answers are strings, multi-select answers are string arrays, and free-form
 * notes (custom notes + legacy AI chips) live in `notes`. Question titles are display-only.
 */

type SingleKey = 'cooking_effort' | 'cooking_for' | 'meal_type'
type MultiKey = 'dietary_needs' | 'preferred_cuisines' | 'pantry_situation'
export type PreferenceKey = SingleKey | MultiKey

export type UserPreferences = { [K in SingleKey]?: string } & { [K in MultiKey]?: string[] } & {
  notes?: string[]
}

export type PreferenceQuestion = {
  key: PreferenceKey
  title: string
  options: string[]
  multi: boolean
  showNumbers?: boolean
}

export const OTHER_OPTION = 'Something else ...'

export const PREFERENCE_QUESTIONS: PreferenceQuestion[] = [
  {
    key: 'cooking_effort',
    title: 'What kind of cooking are you up for?',
    options: [
      'Quick & easy (under 30 min)',
      'Moderate effort (30-60 min)',
      'I enjoy longer projects',
      'It varies',
      OTHER_OPTION,
    ],
    multi: false,
    showNumbers: true,
  },
  {
    key: 'dietary_needs',
    title: 'Any dietary needs or preferences?',
    options: ['Vegetarian / vegan', 'Gluten-free', 'Low-carb / keto', 'No restrictions', OTHER_OPTION],
    multi: true,
  },
  {
    key: 'preferred_cuisines',
    title: 'What cuisines do you enjoy most?',
    options: [
      'Asian (Thai, Japanese, Chinese...)',
      'Mediterranean / Middle Eastern',
      'American / comfort food',
      'Latin / Mexican',
      OTHER_OPTION,
    ],
    multi: true,
  },
  {
    key: 'cooking_for',
    title: 'Who are you usually cooking for?',
    options: ['Just myself', 'Me + one other', 'Family / group (4+)', 'It varies', OTHER_OPTION],
    multi: false,
    showNumbers: true,
  },
  {
    key: 'pantry_situation',
    title: "What's your fridge/pantry situation usually like?",
    options: [
      'Well-stocked with staples',
      'I prefer recipes with few ingredients',
      'I shop fresh for each meal',
      'I rely a lot on canned/frozen',
      OTHER_OPTION,
    ],
    multi: true,
  },
  {
    key: 'meal_type',
    title: 'What kind of meal do you need most?',
    options: [
      'Weeknight dinners',
      'Meal prep / batch cooking',
      'Impressive dinner party dishes',
      'All of the above',
      OTHER_OPTION,
    ],
    multi: false,
    showNumbers: true,
  },
]

const QUESTIONS_BY_KEY = Object.fromEntries(PREFERENCE_QUESTIONS.map((q) => [q.key, q])) as Record<
  PreferenceKey,
  PreferenceQuestion
>

function cleanList(values: unknown[]): string[] {
  const out: string[] = []
  for (const v of values) {
    if (typeof v !== 'string') continue
    const s = v.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/**
 * Turns free text into a multi-select answer list. Known options are matched first so an
 * option containing commas ("Asian (Thai, Japanese, Chinese...)") isn't split apart.
 */
function splitMultiAnswer(key: PreferenceKey, text: string): string[] {
  const options = QUESTIONS_BY_KEY[key].options.filter((o) => o !== OTHER_OPTION)
  let masked = text
  options.forEach((option, i) => {
    masked = masked.split(option).join(`\u0000${i}\u0000`)
  })
  return cleanList(
    masked.split(',').map((part) => part.replace(/\u0000(\d+)\u0000/g, (_, n) => options[Number(n)]))
  )
}

/** Returns a copy of `prefs` with `key` set from free text, or removed when the text is empty. */
export function withAnswer(prefs: UserPreferences, key: PreferenceKey, text: string): UserPreferences {
  const next: Record<string, unknown> = { ...prefs }
  const value = QUESTIONS_BY_KEY[key].multi ? splitMultiAnswer(key, text) : text.trim()
  if (value.length > 0) next[key] = value
  else delete next[key]
  return next as UserPreferences
}

/** Legacy rows were stored as `${questionTitle} ${answer}` strings; unmatched lines become notes. */
function fromLegacyLines(lines: string[]): UserPreferences {
  let prefs: UserPreferences = {}
  const notes: string[] = []
  const byTitleLength = [...PREFERENCE_QUESTIONS].sort((a, b) => b.title.length - a.title.length)
  for (const line of cleanList(lines)) {
    const question = byTitleLength.find((q) => line.startsWith(q.title))
    if (!question) {
      notes.push(line)
      continue
    }
    const answer = line.slice(question.title.length).trim()
    if (answer && answer !== 'Not specified') prefs = withAnswer(prefs, question.key, answer)
  }
  return notes.length > 0 ? { ...prefs, notes } : prefs
}

/** Accepts whatever is in user_preferences.preferences (keyed object, or a legacy string[]) and returns a clean object. */
export function normalizePreferences(raw: unknown): UserPreferences {
  if (Array.isArray(raw)) return fromLegacyLines(raw.filter((x): x is string => typeof x === 'string'))
  if (raw == null || typeof raw !== 'object') return {}

  const source = raw as Record<string, unknown>
  let prefs: UserPreferences = {}
  for (const { key, multi } of PREFERENCE_QUESTIONS) {
    const value = source[key]
    if (typeof value === 'string') prefs = withAnswer(prefs, key, value)
    else if (Array.isArray(value)) {
      const list = cleanList(value)
      if (list.length > 0) prefs = { ...prefs, [key]: multi ? list : list.join(', ') }
    }
  }
  const notes = Array.isArray(source.notes) ? cleanList(source.notes) : []
  return notes.length > 0 ? { ...prefs, notes } : prefs
}

export function formatAnswer(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value
}

export type PreferenceRow =
  | { kind: 'answer'; key: PreferenceKey; label: string; text: string }
  | { kind: 'note'; index: number; label: null; text: string }

/** Display rows in question order, followed by notes. */
export function preferenceRows(prefs: UserPreferences): PreferenceRow[] {
  const rows: PreferenceRow[] = []
  for (const { key, title } of PREFERENCE_QUESTIONS) {
    const value = prefs[key]
    if (value != null && value.length > 0) {
      rows.push({ kind: 'answer', key, label: title, text: formatAnswer(value) })
    }
  }
  ;(prefs.notes ?? []).forEach((text, index) => rows.push({ kind: 'note', index, label: null, text }))
  return rows
}

/** Returns a copy of `prefs` with the row's text replaced; empty text removes the row. */
export function withRowText(prefs: UserPreferences, row: PreferenceRow, text: string): UserPreferences {
  if (row.kind === 'answer') return withAnswer(prefs, row.key, text)
  const trimmed = text.trim()
  const notes = (prefs.notes ?? []).flatMap((note, i) => (i !== row.index ? [note] : trimmed ? [trimmed] : []))
  const { notes: _previous, ...rest } = prefs
  return notes.length > 0 ? { ...rest, notes } : rest
}
