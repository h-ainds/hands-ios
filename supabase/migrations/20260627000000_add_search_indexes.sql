-- Issue 0.2: Search indexes for the recipe-card chat feature.
--
-- GIN indexes on recipes.searchable_title and recipes.ingredient_tsv
-- already exist (as recipes_searchable_title_idx and idx_recipes_ingredient_tsv).
-- This migration adds only the missing piece:
--
-- HNSW cosine index on recipe_embeddings.embedding
--   Operator class: vector_cosine_ops  ↔  <=> cosine distance operator
--   m=16 / ef_construction=64 are pgvector defaults; tune ef_search at
--   query-time via SET hnsw.ef_search = 100 for higher recall if needed.
--   Requires pgvector ≥ 0.5.0 (Supabase ships this by default).

-- pgvector opclasses live in the extensions schema; include it so the
-- CREATE INDEX can resolve vector_cosine_ops without a schema prefix.
SET search_path TO extensions, public;

CREATE INDEX IF NOT EXISTS recipe_embeddings_embedding_hnsw_idx
  ON public.recipe_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
