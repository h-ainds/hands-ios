// Threshold filtering and deduplication for recipe search results.
// Called after search_recipes_hybrid returns rows for each model-extracted label.

import type { RecipeCard } from '../../../types/chat.ts'

// ── Tuning constants ────────────────────────────────────────────────────────

/** Minimum cosine similarity to accept a semantic match. */
export const SEMANTIC_SIM_MIN = 0.70

/**
 * Minimum RRF score to accept a keyword-dominant match when semantic_sim is
 * below SEMANTIC_SIM_MIN. With default k=60 this is equivalent to keyword
 * rank ≤ 10: 1/(60+10) ≈ 0.0143.
 */
export const RRF_SCORE_MIN = 1 / (60 + 10)

// ── Types ───────────────────────────────────────────────────────────────────

/** Row returned by search_recipes_hybrid (bigints arrive as strings from Supabase JS). */
export interface SearchRow {
  recipe_id: string
  title: string
  image: string | null
  caption: string | null
  tags: string[] | null
  score: number
  semantic_sim: number
}

/** One label the model emitted, paired with its search results (best first). */
export interface LabelResult {
  label: string
  rows: SearchRow[]
}

export interface DeduplicateResult {
  /** Labels that resolved to a unique, above-threshold recipe. */
  matched: Array<{ label: string; recipe: RecipeCard }>
  /**
   * Labels with no above-threshold result, or whose best row was already
   * claimed by an earlier label. Caller may relay these back to the model.
   */
  unmatched: string[]
}

// ── Logic ───────────────────────────────────────────────────────────────────

/**
 * Returns true when a row clears the quality bar.
 * Passes on either a strong semantic match OR a strong keyword rank —
 * an OR gate so one-sided hits are not systematically dropped.
 */
export function passesThreshold(row: SearchRow): boolean {
  return row.semantic_sim >= SEMANTIC_SIM_MIN || row.score >= RRF_SCORE_MIN
}

/**
 * Processes label results in order. For each label, the first row that passes
 * the threshold is claimed; its recipe_id is added to a seen-set so later
 * labels resolving to the same recipe are not duplicated.
 *
 * A label goes to `unmatched` when:
 *   - none of its rows pass the threshold, or
 *   - its best passing row was already claimed by an earlier label.
 */
export function deduplicateByRecipeId(results: LabelResult[]): DeduplicateResult {
  const seen = new Set<string>()
  const matched: DeduplicateResult['matched'] = []
  const unmatched: string[] = []

  for (const { label, rows } of results) {
    const best = rows.find(passesThreshold)

    if (!best || seen.has(best.recipe_id)) {
      unmatched.push(label)
      continue
    }

    seen.add(best.recipe_id)
    matched.push({
      label,
      recipe: {
        id: best.recipe_id,
        title: best.title,
        image: best.image,
        caption: best.caption,
      },
    })
  }

  return { matched, unmatched }
}
