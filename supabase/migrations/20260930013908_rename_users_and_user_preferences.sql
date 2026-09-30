-- Simplify the profile tables:
--   "Users"             → users
--   "UserTasteProfiles" → user_preferences (id PK, preferences jsonb, created_at)
-- Drops the unused taste_text / vectors columns and the surrogate taste_id key (id, the user,
-- becomes the primary key → one row per user, so upserts update instead of inserting duplicates).
-- Also replaces the RLS policies: the old "Allow all operations on Users" policy exposed every
-- row to anyone with the anon key; only own-row policies remain.

-- 1. Backup of the columns being dropped (RLS on, no policies → not reachable through the API).
create table public.user_preferences_dropped_columns_backup_20260930 as
  select id, taste_id, taste_text, vectors from public."UserTasteProfiles";
alter table public.user_preferences_dropped_columns_backup_20260930 enable row level security;

-- 2. Rename tables.
alter table public."Users" rename to users;
alter table public."UserTasteProfiles" rename to user_preferences;

-- 3. users: lowercase constraint (and index) names.
alter table public.users rename constraint "Users_pkey" to users_pkey;
alter table public.users rename constraint "Users_email_key" to users_email_key;
alter table public.users rename constraint "Users_username_key" to users_username_key;
alter table public.users rename constraint "Users_id_fkey" to users_id_fkey;

-- 4. user_preferences: id becomes the primary key; drop legacy columns; rename the jsonb column.
alter table public.user_preferences drop constraint "UserTasteProfiles_pkey";
alter table public.user_preferences drop column taste_id, drop column taste_text, drop column vectors;
alter table public.user_preferences add constraint user_preferences_pkey primary key (id);
alter table public.user_preferences rename constraint "UserTasteProfiles_id_fkey" to user_preferences_id_fkey;
alter table public.user_preferences rename column taste_preferences to preferences;
alter table public.user_preferences rename constraint taste_preferences_is_object to preferences_is_object;

comment on table public.users is 'App profile for each auth user (first name, email).';
comment on table public.user_preferences is 'One row per user: onboarding answers and custom notes. See lib/preferences.ts.';
comment on column public.user_preferences.preferences is
  'Keyed preferences object: cooking_effort, cooking_for, meal_type (string); dietary_needs, preferred_cuisines, pantry_situation (string[]); notes (string[]). See lib/preferences.ts.';

-- 5. RLS: replace the duplicated / open policies with one own-row policy per operation.
--    Deletes go through the delete-account edge function (service role), so no delete policy.
drop policy "Allow all operations on Users" on public.users;
drop policy "Users can insert own profile" on public.users;
drop policy "Users can insert their own profile" on public.users;
drop policy "Users can update own profile" on public.users;
drop policy "Users can update their own profile" on public.users;
drop policy "Users can view own profile" on public.users;
drop policy "Users can view their own profile" on public.users;

drop policy "Allow users to insert their taste profiles" on public.user_preferences;
drop policy "Users can insert own taste profile" on public.user_preferences;
drop policy "Users can update own taste profile" on public.user_preferences;
drop policy "Users can view own taste profile" on public.user_preferences;
drop policy "Users can view their own taste profile" on public.user_preferences;

create policy "Users can view own profile" on public.users
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users can insert own profile" on public.users
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own profile" on public.users
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Users can view own preferences" on public.user_preferences
  for select to authenticated using ((select auth.uid()) = id);
create policy "Users can insert own preferences" on public.user_preferences
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update own preferences" on public.user_preferences
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
