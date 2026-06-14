create table if not exists public.user_favorite_recipes (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id bigint not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists user_favorite_recipes_user_id_idx
  on public.user_favorite_recipes (user_id);

create index if not exists user_favorite_recipes_recipe_id_idx
  on public.user_favorite_recipes (recipe_id);

alter table public.user_favorite_recipes enable row level security;

create policy "Users can read their own favorites"
  on public.user_favorite_recipes
  for select
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.user_favorite_recipes
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorites"
  on public.user_favorite_recipes
  for delete
  using (auth.uid() = user_id);
