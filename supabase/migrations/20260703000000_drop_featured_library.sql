-- Retire the legacy featured_library table and its recipes -> featured_library mirroring.
--
-- Background: featured_library was a duplicate of recipes kept in sync by two
-- AFTER INSERT triggers on recipes. Introspection confirmed the mirroring is
-- one-way and INSERT-only, and that NO foreign key, view, or rule pointed back at
-- recipes -- so dropping featured_library cannot cascade into recipes (verified by
-- deleting a single featured_library row with zero effect on its recipes row).
--
-- Order matters: get_recent_recipes() must stop referencing featured_library
-- before the table is dropped, otherwise the next call errors at runtime
-- (plpgsql binds relation names lazily, so the DROP itself would not be blocked).

-- 1. Sever the write linkage (recipes -> featured_library).
DROP TRIGGER IF EXISTS trigger_add_recipe_to_featured ON public.recipes;
DROP TRIGGER IF EXISTS trigger_add_to_featured_library ON public.recipes;
DROP FUNCTION IF EXISTS public.add_recipe_to_featured_library();
DROP FUNCTION IF EXISTS public.add_to_featured_library();  -- orphan, no trigger

-- 2. Rewrite get_recent_recipes() to source purely from recipes.
--    Legacy is_featured = true interactions stored recipe_id in the
--    featured_library id-space (which overlaps recipes.id), so they are filtered
--    out to avoid resolving to a coincidental wrong recipe.
CREATE OR REPLACE FUNCTION public.get_recent_recipes(user_id_param uuid, limit_param integer DEFAULT 9)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', recipe_id,
                'title', title,
                'image', image,
                'caption', caption,
                'tags', tags,
                'steps', steps,
                'created_at', created_at,
                'updated_at', updated_at,
                'user_id', user_id_param,
                'viewed_at', viewed_at
            ) ORDER BY viewed_at DESC
        ), '[]'::json)
        FROM (
            SELECT DISTINCT ON (ri.recipe_id)
                ri.recipe_id::integer,
                ri.viewed_at,
                r.title,
                r.image,
                r.caption,
                r.tags,
                r.steps,
                r.created_at,
                r.updated_at
            FROM recipe_interactions ri
            JOIN recipes r ON r.id = ri.recipe_id::integer
            WHERE ri.user_id = user_id_param
              AND ri.is_featured IS NOT TRUE
            ORDER BY ri.recipe_id, ri.viewed_at DESC
        ) recent
        LIMIT limit_param
    );
END;
$function$;

-- 3. Drop the table (its RLS policy, indexes, unique constraint, PK and sequence
--    are owned objects and drop with it). No incoming FKs / views / rules exist.
DROP TABLE IF EXISTS public.featured_library;
