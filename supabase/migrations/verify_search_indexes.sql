-- Verification script for Issue 0.2 indexes.
-- Run via: npx supabase db query --linked -f supabase/migrations/verify_search_indexes.sql
-- Or paste into the Supabase Dashboard SQL editor.

-- 1. Confirm all three indexes exist
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE (tablename, indexname) IN (
  ('recipe_embeddings', 'recipe_embeddings_embedding_hnsw_idx'),  -- new (HNSW)
  ('recipes',           'recipes_searchable_title_idx'),           -- pre-existing (GIN)
  ('recipes',           'idx_recipes_ingredient_tsv')              -- pre-existing (GIN)
)
ORDER BY tablename, indexname;
-- Expected: 3 rows.


-- 2. Confirm opclass/operator match for the HNSW index
--    vector_cosine_ops must pair with the <=> cosine distance operator
SELECT
  am.amname         AS index_method,
  opc.opcname       AS opclass,
  idx.relname       AS index_name,
  col.attname       AS column_name
FROM pg_index        ix
JOIN pg_class        idx ON idx.oid    = ix.indexrelid
JOIN pg_class        tbl ON tbl.oid    = ix.indrelid
JOIN pg_attribute    col ON col.attrelid = tbl.oid
                        AND col.attnum   = ANY(ix.indkey)
JOIN pg_am           am  ON am.oid     = idx.relam
JOIN pg_opclass      opc ON opc.oid    = ANY(ix.indclass)
WHERE tbl.relname = 'recipe_embeddings'
  AND idx.relname = 'recipe_embeddings_embedding_hnsw_idx';
-- Expected: index_method=hnsw, opclass=vector_cosine_ops


-- 3. EXPLAIN: verify the planner picks the HNSW index for a cosine KNN query.
--    The vector must be a constant expression (not a sub-select) or the planner
--    falls back to a sequential scan. array_fill produces the right shape without
--    hard-coding 1536 float literals.
SET search_path TO extensions, public;
EXPLAIN (COSTS OFF)
SELECT recipe_id
FROM   recipe_embeddings
ORDER  BY embedding <=> array_fill(0.0, ARRAY[1536])::vector
LIMIT  5;
-- Expected plan:
--   Limit
--     -> Index Scan using recipe_embeddings_embedding_hnsw_idx on recipe_embeddings
--          Order By: (embedding <=> '...'::vector)
