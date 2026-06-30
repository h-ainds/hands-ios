-- Issue 1.1: search_recipes_hybrid — hybrid vector + keyword search fused with RRF.
--
-- Parameters
--   query_embedding : pre-computed 1536-dim embedding for the user query
--   query_text      : raw query string for FTS (same text the caller embedded)
--   match_count     : number of results to return (default 5)
--   rrf_k           : RRF constant k; higher k flattens score differences (default 60)
--   semantic_weight : multiplier on the semantic RRF term (default 1.0)
--   keyword_weight  : multiplier on the keyword  RRF term (default 1.0)
--
-- Diet, allergen, and dislike filtering is intentionally absent — the model
-- handles all preference logic. This function is a pure relevance ranker.
--
-- Algorithm
--   1. Semantic CTE — cosine KNN over recipe_embeddings (HNSW index, <=> operator).
--                     Over-fetches 4× match_count (min 20) for RRF pool diversity.
--   2. Keyword CTE  — FTS over searchable_title + ingredient_tsv with ts_rank_cd.
--                     websearch_to_tsquery handles multi-word user queries naturally.
--                     Over-fetches 4× match_count (min 20).
--   3. RRF fusion   — FULL OUTER JOIN on recipe_id.
--                     score = semantic_weight/(k+sem_rank) + keyword_weight/(k+kw_rank)
--                     COALESCE ensures one-sided hits contribute 0 from the missing leg.
--
-- Returned columns
--   recipe_id, title, image, caption, tags, score (weighted RRF), semantic_sim

SET search_path TO extensions, public;

CREATE OR REPLACE FUNCTION public.search_recipes_hybrid(
  query_embedding vector(1536),
  query_text      text,
  match_count     int     DEFAULT 5,
  rrf_k           float8  DEFAULT 60.0,
  semantic_weight float8  DEFAULT 1.0,
  keyword_weight  float8  DEFAULT 1.0
)
RETURNS TABLE (
  recipe_id    bigint,
  title        text,
  image        text,
  caption      text,
  tags         text[],
  score        float8,
  semantic_sim float8
)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = extensions, public
AS $$

WITH
  -- ── 1. Semantic leg ──────────────────────────────────────────────────────────
  -- HNSW index (recipe_embeddings_embedding_hnsw_idx) serves the ORDER BY <=>
  -- without a seq-scan. Distance stored separately so the window ORDER BY
  -- uses the raw float rather than recomputing.
  semantic_raw AS (
    SELECT
      re.recipe_id,
      (re.embedding <=> query_embedding)        AS dist,
      1.0 - (re.embedding <=> query_embedding)  AS sim
    FROM recipe_embeddings re
    ORDER BY re.embedding <=> query_embedding
    LIMIT GREATEST(match_count * 4, 20)
  ),
  semantic AS (
    SELECT
      recipe_id,
      sim,
      ROW_NUMBER() OVER (ORDER BY dist) AS rnk
    FROM semantic_raw
  ),

  -- ── 2. Keyword leg ───────────────────────────────────────────────────────────
  -- websearch_to_tsquery returns NULL for empty / stop-word-only input;
  -- the WHERE guard skips the leg entirely in that case.
  kw_query AS (
    SELECT websearch_to_tsquery('english', query_text) AS q
  ),
  keyword_raw AS (
    SELECT
      r.id AS recipe_id,
      ts_rank_cd(coalesce(r.searchable_title, ''::tsvector), q.q)
        + ts_rank_cd(coalesce(r.ingredient_tsv,  ''::tsvector), q.q) AS kw_score
    FROM recipes r, kw_query q
    WHERE
      q.q IS NOT NULL
      AND (
        coalesce(r.searchable_title, ''::tsvector) @@ q.q
        OR coalesce(r.ingredient_tsv,  ''::tsvector) @@ q.q
      )
    ORDER BY kw_score DESC
    LIMIT GREATEST(match_count * 4, 20)
  ),
  keyword AS (
    SELECT
      recipe_id,
      ROW_NUMBER() OVER (ORDER BY kw_score DESC) AS rnk
    FROM keyword_raw
  ),

  -- ── 3. RRF fusion ────────────────────────────────────────────────────────────
  -- FULL OUTER JOIN keeps recipes found by only one leg.
  -- COALESCE(1/(k+rank), 0) contributes 0 for the missing leg of a one-sided hit.
  fused AS (
    SELECT
      COALESCE(s.recipe_id, k.recipe_id)                        AS recipe_id,
      COALESCE(semantic_weight / (rrf_k + s.rnk), 0.0)
        + COALESCE(keyword_weight  / (rrf_k + k.rnk), 0.0)     AS rrf_score,
      COALESCE(s.sim, 0.0)                                       AS semantic_sim
    FROM      semantic s
    FULL OUTER JOIN keyword k ON k.recipe_id = s.recipe_id
  )

SELECT
  r.id        AS recipe_id,
  r.title,
  r.image,
  r.caption,
  r.tags,
  f.rrf_score AS score,
  f.semantic_sim
FROM fused f
JOIN recipes r ON r.id = f.recipe_id
ORDER BY f.rrf_score DESC
LIMIT match_count;

$$;

GRANT EXECUTE ON FUNCTION public.search_recipes_hybrid(
  vector(1536), text, int, float8, float8, float8
) TO authenticated, service_role;
