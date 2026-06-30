/**
 * Retrieval test harness for search_recipes_hybrid (Issue 1.4).
 *
 * Run from the project root:
 *   deno task --config supabase/functions/streamv5/deno.json test:retrieval
 *
 * Or directly:
 *   deno test --allow-net --allow-env --allow-read \
 *     supabase/functions/streamv5/search_test.ts
 *
 * Required env vars (export or place in a .env file loaded by your shell):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS for reads
 *   OPENAI_API_KEY
 *
 * IMPORTANT: EMBED_MODEL below must match the model used to populate
 * recipe_embeddings. Mismatched models produce low semantic_sim and the
 * keyword leg will carry the weight — the latency report will surface this.
 */

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  passesThreshold,
  deduplicateByRecipeId,
  SEMANTIC_SIM_MIN,
  RRF_SCORE_MIN,
} from './search.ts'
import type { SearchRow, LabelResult } from './search.ts'

// ── Config ────────────────────────────────────────────────────────────────────

const EMBED_MODEL      = 'text-embedding-3-small'
const EMBED_DIMS       = 1536
const LATENCY_BUDGET_MS = 350   // embed + RPC combined ceiling

// ── Fixtures ──────────────────────────────────────────────────────────────────

const POSITIVE_LABELS = [
  'lemon tart dessert',
  'pasta carbonara',
  'chocolate chip cookies',
  'grilled salmon with herbs',
]

const NO_MATCH_LABELS = [
  'durian marshmallow stew',
  'battery acid xylophone soup with gravel',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIMS }),
  })
  if (!res.ok) throw new Error(`Embed API ${res.status}: ${await res.text()}`)
  const { data } = await res.json()
  return data[0].embedding as number[]
}

interface TimedResult {
  rows: SearchRow[]
  embedMs: number
  rpcMs: number
  totalMs: number
}

async function search(
  label: string,
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  openAiKey: string,
): Promise<TimedResult> {
  const t0 = performance.now()
  const embedding = await embed(label, openAiKey)
  const embedMs = performance.now() - t0

  const t1 = performance.now()
  const { data, error } = await supabase.rpc('search_recipes_hybrid', {
    query_embedding: embedding,
    query_text: label,
    match_count: 5,
  })
  const rpcMs = performance.now() - t1

  if (error) throw new Error(`RPC error for "${label}": ${error.message}`)

  return { rows: (data ?? []) as SearchRow[], embedMs, rpcMs, totalMs: embedMs + rpcMs }
}

// ── Test suite ────────────────────────────────────────────────────────────────

Deno.test('search_recipes_hybrid retrieval harness', async (t) => {
  const SUPABASE_URL         = requireEnv('SUPABASE_URL')
  const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const OPENAI_API_KEY       = requireEnv('OPENAI_API_KEY')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Collected across steps for dedup and latency checks
  const allResults: LabelResult[] = []
  const latencies: Array<{ label: string; embedMs: number; rpcMs: number; totalMs: number }> = []

  // ── Positive labels ──────────────────────────────────────────────────────────
  await t.step('positive labels — at least one row passes threshold', async () => {
    for (const label of POSITIVE_LABELS) {
      const result = await search(label, supabase, OPENAI_API_KEY)
      latencies.push({ label, ...result })
      allResults.push({ label, rows: result.rows })

      const passing = result.rows.filter(passesThreshold)
      assert(
        passing.length > 0,
        `"${label}": ${result.rows.length} rows returned, none passed ` +
        `(SEMANTIC_SIM_MIN=${SEMANTIC_SIM_MIN}, RRF_SCORE_MIN=${RRF_SCORE_MIN.toFixed(5)}). ` +
        `Top row: ${JSON.stringify(result.rows[0] ?? null)}`,
      )
    }
  })

  // ── No-match labels ──────────────────────────────────────────────────────────
  await t.step('no-match labels — zero rows pass threshold', async () => {
    for (const label of NO_MATCH_LABELS) {
      const result = await search(label, supabase, OPENAI_API_KEY)
      latencies.push({ label, ...result })
      allResults.push({ label, rows: result.rows })

      const passing = result.rows.filter(passesThreshold)
      assertEquals(
        passing.length,
        0,
        `"${label}" should yield 0 passing rows but got ${passing.length}: ` +
        JSON.stringify(passing),
      )
    }
  })

  // ── Dedup: same recipe from two labels → one card ────────────────────────────
  await t.step('dedup — two labels resolving to the same recipe yield one card', async () => {
    const dupLabel = POSITIVE_LABELS[0]
    const { rows } = await search(dupLabel, supabase, OPENAI_API_KEY)

    const { matched, unmatched } = deduplicateByRecipeId([
      { label: `${dupLabel} (a)`, rows },
      { label: `${dupLabel} (b)`, rows },   // identical rows → same recipe_id
    ])

    assertEquals(matched.length,   1, 'duplicate label pair must yield exactly 1 card')
    assertEquals(unmatched.length, 1, 'second duplicate must land in unmatched')
    assertEquals(unmatched[0], `${dupLabel} (b)`, 'later label must be the one dropped')
  })

  // ── Dedup: no-match labels flow into unmatched ───────────────────────────────
  await t.step('dedup — no-match labels flow into unmatched', async () => {
    const noMatchResults: LabelResult[] = NO_MATCH_LABELS.map(label => {
      const found = allResults.find(r => r.label === label)
      return found ?? { label, rows: [] }
    })

    const { matched, unmatched } = deduplicateByRecipeId(noMatchResults)

    assertEquals(matched.length,   0,                   'no-match labels must not produce cards')
    assertEquals(unmatched.length, NO_MATCH_LABELS.length, 'all no-match labels must be in unmatched')
  })

  // ── Latency report ───────────────────────────────────────────────────────────
  // Report only — no assertion. LATENCY_BUDGET_MS is the production edge
  // runtime target (embed + RPC co-located with Supabase). Local test runs
  // include cross-network TLS overhead that inflates numbers 5–10×.
  await t.step(`latency report — production target ${LATENCY_BUDGET_MS} ms`, () => {
    const col = (s: string, w: number) => s.slice(0, w).padEnd(w)
    const ms  = (n: number)            => `${n.toFixed(0).padStart(6)}ms`

    console.log(`\n${'─'.repeat(70)}`)
    console.log(`  Retrieval latency  (production target ≤ ${LATENCY_BUDGET_MS} ms)`)
    console.log(`  Note: local runs include network overhead; edge runtime will be faster.`)
    console.log(`${'─'.repeat(70)}`)
    console.log(`  ${col('Label', 38)}  ${'Embed'.padStart(7)}  ${'RPC'.padStart(7)}  ${'Total'.padStart(7)}`)
    console.log(`${'─'.repeat(70)}`)

    let overBudgetCount = 0
    for (const { label, embedMs, rpcMs, totalMs } of latencies) {
      const flag = totalMs > LATENCY_BUDGET_MS ? '  ⚠' : ''
      console.log(`  ${col(label, 38)}  ${ms(embedMs)}  ${ms(rpcMs)}  ${ms(totalMs)}${flag}`)
      if (totalMs > LATENCY_BUDGET_MS) overBudgetCount++
    }

    const avg = latencies.reduce((s, l) => s + l.totalMs, 0) / latencies.length
    console.log(`${'─'.repeat(70)}`)
    console.log(`  ${col('Average', 38)}  ${''.padStart(7)}  ${''.padStart(7)}  ${ms(avg)}`)
    if (overBudgetCount > 0) {
      console.log(`  ⚠  ${overBudgetCount} label(s) over production target (expected locally)`)
    }
    console.log(`${'─'.repeat(70)}\n`)
  })
})
