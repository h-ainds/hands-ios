-- Issue 1.2: get_recipe_details — fetch a single recipe row for the model.
--
-- The ingredients column is JSONB shaped as { "Section": ["item", ...], ... }.
-- This function flattens all section arrays into a single text[] so callers
-- never have to deal with the object structure.
--
-- Guards
--   • NULL ingredients  → returns '{}'   (jsonb_each on NULL yields no rows)
--   • Non-array section → skipped        (WHERE jsonb_typeof(val) = 'array')
--   • NULL steps/tags   → returns '{}'   (coalesce)
--
-- tsvector columns (searchable_title, ingredient_tsv) are intentionally excluded.

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.get_recipe_details(p_recipe_id bigint)
RETURNS TABLE (
  id          bigint,
  title       text,
  caption     text,
  image       text,
  url         text,
  tags        text[],
  steps       text[],
  ingredients text[]
)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    r.id,
    r.title,
    r.caption,
    r.image,
    r.url,
    coalesce(r.tags,  '{}'::text[]) AS tags,
    coalesce(r.steps, '{}'::text[]) AS steps,
    -- Flatten { "Section": ["item", ...] } → text[].
    -- jsonb_typeof guard skips any section whose value is not a JSON array,
    -- so one malformed key can never throw for the whole row.
    ARRAY(
      SELECT elem
      FROM   jsonb_each(r.ingredients)         AS kv(key, val),
             jsonb_array_elements_text(kv.val) AS elem
      WHERE  jsonb_typeof(kv.val) = 'array'
    )                               AS ingredients
  FROM recipes r
  WHERE r.id = p_recipe_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_recipe_details(bigint)
  TO authenticated, service_role;
