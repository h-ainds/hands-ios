-- Reshape UserTasteProfiles.taste_preferences from display lines to a keyed object.
--   Before: ["What cuisines do you enjoy most? Latin / Mexican", "Prefers lemon-flavored dishes"]
--   After:  {"preferred_cuisines": ["Latin / Mexican"], "notes": ["Prefers lemon-flavored dishes"]}
-- Keys and titles mirror PREFERENCE_QUESTIONS in lib/preferences.ts. Multi-select answers are
-- arrays, single-select answers are strings, and lines that aren't onboarding answers go to notes.

-- 1. Backup of the pre-migration data (RLS on, no policies → not reachable through the API).
create table if not exists public."UserTasteProfiles_prefs_backup_20260929" as
  select id, taste_preferences from public."UserTasteProfiles";
alter table public."UserTasteProfiles_prefs_backup_20260929" enable row level security;

-- 2. Convert legacy string arrays.
with questions(key, title, multi) as (values
  ('cooking_effort',     'What kind of cooking are you up for?',               false),
  ('dietary_needs',      'Any dietary needs or preferences?',                  true),
  ('preferred_cuisines', 'What cuisines do you enjoy most?',                   true),
  ('cooking_for',        'Who are you usually cooking for?',                   false),
  ('pantry_situation',   'What''s your fridge/pantry situation usually like?', true),
  ('meal_type',          'What kind of meal do you need most?',                false)
),
lines as (
  select p.id, trim(e.line) as line, e.pos
  from public."UserTasteProfiles" p
  cross join lateral jsonb_array_elements_text(p.taste_preferences) with ordinality as e(line, pos)
  where jsonb_typeof(p.taste_preferences) = 'array' and trim(e.line) <> ''
),
matched as (
  select l.id, l.line, l.pos, q.key, q.multi, trim(substr(l.line, length(q.title) + 1)) as answer
  from lines l
  left join questions q on starts_with(l.line, q.title)
),
answers as (
  select id, key,
    case when multi then (
      -- The Asian option contains commas, so mask it before splitting on ','.
      select jsonb_agg(v order by o)
      from (
        select trim(replace(part, chr(1), 'Asian (Thai, Japanese, Chinese...)')) as v, o
        from unnest(string_to_array(replace(answer, 'Asian (Thai, Japanese, Chinese...)', chr(1)), ','))
          with ordinality as t(part, o)
      ) parts
      where v <> ''
    ) else to_jsonb(answer) end as value
  from matched
  where key is not null and answer not in ('', 'Not specified')
),
converted as (
  select p.id,
    nullif(
      coalesce((select jsonb_object_agg(a.key, a.value) from answers a where a.id = p.id and a.value is not null), '{}'::jsonb)
      || coalesce((select jsonb_build_object('notes', jsonb_agg(m.line order by m.pos))
                   from matched m where m.id = p.id and m.key is null having count(*) > 0), '{}'::jsonb),
      '{}'::jsonb
    ) as prefs
  from public."UserTasteProfiles" p
  where jsonb_typeof(p.taste_preferences) = 'array'
)
update public."UserTasteProfiles" p
set taste_preferences = c.prefs
from converted c
where p.id = c.id;

-- 3. Only keyed objects from now on. Old app builds that write a string[] get an error instead of
--    overwriting the object (the constraint name contains "taste_preferences", so their onboarding
--    retries without the column and still completes).
alter table public."UserTasteProfiles"
  add constraint taste_preferences_is_object
  check (taste_preferences is null or jsonb_typeof(taste_preferences) = 'object');

comment on column public."UserTasteProfiles".taste_preferences is
  'Keyed preferences object: cooking_effort, cooking_for, meal_type (string); dietary_needs, preferred_cuisines, pantry_situation (string[]); notes (string[]). See lib/preferences.ts.';
