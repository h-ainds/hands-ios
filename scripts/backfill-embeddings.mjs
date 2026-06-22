#!/usr/bin/env node
/**
 * Backfill recipe embeddings for recipes that don't have one yet.
 *
 * Usage:
 *   node scripts/backfill-embeddings.mjs
 *   node scripts/backfill-embeddings.mjs --dry-run      # show counts only
 *   node scripts/backfill-embeddings.mjs --batch 50     # override batch size (default 100)
 *   node scripts/backfill-embeddings.mjs --concurrency 3
 *
 * Reads credentials from .env.local (EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

function loadEnv(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) env[key.trim()] = rest.join('=').trim()
  }
  return env
}

const env = loadEnv(envPath)
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_MODEL = 'text-embedding-3-small'

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  console.error('Missing required env vars: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY')
  process.exit(1)
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH_SIZE = parseInt(args[args.indexOf('--batch') + 1] || '100', 10) || 100
const CONCURRENCY = parseInt(args[args.indexOf('--concurrency') + 1] || '5', 10) || 5

// ── Supabase helpers ──────────────────────────────────────────────────────────

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function sbGet(path, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${params}`, { headers: sbHeaders })
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`Supabase upsert ${table} failed: ${res.status} ${await res.text()}`)
}

async function fetchAllIds(endpoint, idCol, pageSize = 1000) {
  const ids = new Set()
  let offset = 0
  while (true) {
    const rows = await sbGet(endpoint, `?select=${idCol}&limit=${pageSize}&offset=${offset}`)
    if (!rows.length) break
    rows.forEach(r => ids.add(r[idCol]))
    offset += pageSize
    if (rows.length < pageSize) break
  }
  return ids
}

// ── Recipe content formatting ─────────────────────────────────────────────────

function formatContent(recipe) {
  const tags = Array.isArray(recipe.tags) ? recipe.tags.join(', ') : ''
  const ingredients = recipe.ingredients
    ? Object.values(recipe.ingredients).flat().filter(Boolean).join(', ')
    : ''
  const steps = Array.isArray(recipe.steps) ? recipe.steps.join(',') : ''

  return [
    `Title: ${recipe.title || ''}`,
    `Caption: ${recipe.caption || ''}`,
    `Tags: ${tags}`,
    `Ingredients: ${ingredients}`,
    `Instructions: ${steps}`,
  ].join('\n')
}

function formatMetadata(recipe) {
  return {
    title: recipe.title || '',
    caption: recipe.caption || '',
    image: recipe.image || '',
    tags: recipe.tags || [],
  }
}

// ── OpenAI embedding ──────────────────────────────────────────────────────────

async function getEmbedding(text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    })

    if (res.status === 429 || res.status >= 500) {
      const wait = attempt * 2000
      console.warn(`  OpenAI ${res.status} — waiting ${wait}ms before retry ${attempt}/${retries}`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }

    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    return data.data[0].embedding
  }
  throw new Error('OpenAI embedding failed after retries')
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runWithConcurrency(tasks, limit) {
  const results = []
  const executing = new Set()
  for (const task of tasks) {
    const p = task().then(r => { executing.delete(p); return r })
    executing.add(p)
    results.push(p)
    if (executing.size >= limit) await Promise.race(executing)
  }
  return Promise.all(results)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching recipe IDs...')
  const recipeIds = await fetchAllIds('recipes', 'id')
  console.log(`Total recipes: ${recipeIds.size}`)

  console.log('Fetching embedded recipe IDs...')
  const embeddedIds = await fetchAllIds('recipe_embeddings', 'recipe_id')
  console.log(`Total embeddings: ${embeddedIds.size}`)

  const missingIds = [...recipeIds].filter(id => !embeddedIds.has(id)).sort((a, b) => a - b)
  console.log(`\nRecipes needing embeddings: ${missingIds.length}`)

  if (DRY_RUN || missingIds.length === 0) {
    if (missingIds.length === 0) console.log('Nothing to backfill!')
    else console.log('Dry run — exiting without changes.')
    return
  }

  let processed = 0
  let failed = 0
  const failedIds = []

  // Process in batches to avoid loading too many recipes into memory
  for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
    const batchIds = missingIds.slice(i, i + BATCH_SIZE)
    const idList = batchIds.join(',')

    // Fetch full recipe data for this batch
    const recipes = await sbGet('recipes', `?id=in.(${idList})&select=id,title,caption,tags,ingredients,steps,image`)

    const tasks = recipes.map(recipe => async () => {
      try {
        const content = formatContent(recipe)
        const embedding = await getEmbedding(content)
        return { recipe_id: recipe.id, content, embedding: JSON.stringify(embedding), metadata: formatMetadata(recipe) }
      } catch (err) {
        console.error(`  Failed recipe ${recipe.id}: ${err.message}`)
        failedIds.push(recipe.id)
        failed++
        return null
      }
    })

    const rows = (await runWithConcurrency(tasks, CONCURRENCY)).filter(Boolean)

    if (rows.length > 0) {
      await sbUpsert('recipe_embeddings', rows)
    }

    processed += batchIds.length
    const pct = ((processed / missingIds.length) * 100).toFixed(1)
    console.log(`[${pct}%] ${processed}/${missingIds.length} processed — ${failed} failed`)
  }

  console.log(`\nDone! Embedded ${processed - failed} recipes.`)
  if (failedIds.length > 0) {
    console.log(`Failed IDs (${failedIds.length}): ${failedIds.join(', ')}`)
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
