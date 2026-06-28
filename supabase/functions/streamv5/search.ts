// Threshold filtering and deduplication for recipe search results.
// Called after search_recipes_hybrid returns rows for each model-extracted label.

import type { RecipeCard } from '../../../types/chat.ts'

// ── Tuning constants ────────────────────────────────────────────────────────

/** Minimum cosine similarity to accept a semantic match outright. */
export const SEMANTIC_SIM_MIN = 0.75

/**
 * Minimum RRF score to accept a keyword-dominant match.
 * Equivalent to keyword rank ≤ 10 with default k=60: 1/(60+10) ≈ 0.0143.
 */
export const RRF_SCORE_MIN = 1 / (60 + 10)

/**
 * Minimum semantic_sim required for a *hybrid* hit (recipe appeared in both
 * CTEs) that is passing via keyword rank rather than SEMANTIC_SIM_MIN.
 *
 * Without this floor, a nonsense query that contains one real word (e.g.
 * "marshmallow") can land at keyword rank #1 and sneak through the RRF gate
 * despite very low semantic relevance (~0.46). A pure keyword-only hit
 * (semantic_sim === 0 — recipe not in the semantic over-fetch pool at all)
 * is exempt and relies solely on RRF_SCORE_MIN.
 */
export const SEMANTIC_SIM_FLOOR = 0.50

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
 *
 * Pass conditions (first match wins):
 *   1. Strong semantic: semantic_sim >= SEMANTIC_SIM_MIN
 *   2. Strong keyword + coherent semantic: score >= RRF_SCORE_MIN AND
 *      (semantic_sim === 0 OR semantic_sim >= SEMANTIC_SIM_FLOOR)
 *
 * The `semantic_sim === 0` branch allows pure keyword-only hits (recipe was
 * not in the semantic over-fetch pool) to pass on keyword rank alone.
 * Hybrid hits must clear SEMANTIC_SIM_FLOOR to prevent accidental keyword
 * collisions (e.g. "durian marshmallow stew" matching "marshmallow" in an
 * unrelated recipe) from producing cards.
 */
export function passesThreshold(row: SearchRow): boolean {
  if (row.semantic_sim >= SEMANTIC_SIM_MIN) return true
  if (row.score >= RRF_SCORE_MIN) {
    return row.semantic_sim === 0 || row.semantic_sim >= SEMANTIC_SIM_FLOOR
  }
  return false
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
