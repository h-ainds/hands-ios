his file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Supabase project ID**: `lxueztdlrxoystjehjay` — use this as the `project_id` for all Supabase MCP tool calls (SQL queries, migrations, advisors) so you always target the right database.

**Hands** — an Expo / React Native (iOS-first) app: an AI personal chef. Users chat for recipe ideas and get interactive recipe cards streamed inline. Backend is Supabase (Postgres + Auth + Edge Functions); the AI runs in a Deno edge function that calls the OpenAI Responses API with tool-calling over a hybrid vector+keyword recipe search.

## Commands

Package manager is **yarn** (yarn.lock is committed; a package-lock.json also exists — prefer yarn).

```bash
yarn start          # expo start (Metro)
yarn ios            # expo run:ios (native dev build)
yarn android        # expo run:android
yarn web            # expo start --web
npx tsc --noEmit    # typecheck (strict mode; the only "test" gate in the repo)
```

There is **no test runner, linter, or CI configured** — `react-test-renderer` is installed but no test script exists. `search_test.ts` in `streamv5/` is a Deno test file, not wired into any command. Don't invent `yarn test`/`yarn lint`.

Edge functions & DB (Supabase CLI, installed as a dev dependency — use `npx supabase`):

```bash
npx supabase functions serve streamv5     # run an edge function locally
npx supabase db push                       # apply migrations in supabase/migrations
npx supabase functions deploy streamv5     # deploy
```

Two app variants exist via `APP_VARIANT=development` (see `app.config.js`, `eas.json`) — dev uses bundle id `com.handsai.hands.dev`.

## Architecture

### Client (React Native + Expo Router)
- **Routing** is file-based via `expo-router` with typed routes. `app/_layout.tsx` is the root: it wraps everything in `AuthProvider → FavoritesProvider → SubscriptionProvider` and gates navigation on auth state (`PUBLIC_ROUTES` list controls what unauthenticated users can reach). `app/(tabs)/` is the authenticated shell (Home / center camera button that routes to `/ask` / You).
- **Import alias**: `@/*` maps to repo root (`tsconfig.json`). `supabase/functions` is excluded from the app's tsconfig — edge functions are a separate Deno project.
- **Styling**: NativeWind (Tailwind) via `className`. Brand palette lives in `tailwind.config.js` (`primary` = `#6CD401` green) and `constants/Colors.ts`. `app/global.css` is imported once in the root layout.
- **State**: React Context for cross-cutting concerns (`context/AuthContext`, `FavoritesContext`, `SubscriptionContext`); data fetching via hooks in `hooks/` (`useRecipes`, `useFavorites`, `useRecipeChat`, `useUsageTracking`). Subscriptions use RevenueCat (`react-native-purchases`).
- **Supabase client** (`lib/supabase/client.ts`): a single shared client. Session storage adapter is platform-aware — `expo-secure-store` on native, `localStorage` on web. Reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Chat pipeline (the core feature)
The chat flow spans three layers that share type contracts in **`types/chat.ts`** (imported as `@/types/chat` in the app and via relative path in Deno). Treat that file as the source of truth for the edge↔client boundary.

1. **`hooks/useRecipeChat.ts`** — client hook. POSTs to the `streamv5` edge function, reads the SSE stream, and accumulates `text.delta` events into the assistant message plus `recipe.cards` events into `recipeCards`. Persists each turn to the `conversations` table (a `content` jsonb array) for chat history.
2. **`supabase/functions/streamv5/`** — the Deno edge function (JWT-verified; see `config.toml`):
   - `index.ts` — request handler + agent loop. Runs up to `MAX_ROUNDS` (5) turns of the OpenAI Responses API (`store: false`), executing tool calls between rounds and streaming `ServerEvent`s (discriminant field `t`) back over SSE.
   - `agent.ts` — `SYSTEM_PROMPT` and the two tool schemas: `search_recipes` (batches every dish named in one reply into a single call) and `get_recipe_details`.
   - `session.ts` — `SupabaseSession`: multi-turn state persisted in the `conversation_items` table (ordered by a global `seq`). This is the **sole** state mechanism — `previous_response_id` is rejected at the boundary by design.
   - `search.ts` — threshold filtering + dedup of hybrid-search rows (semantic-similarity and RRF-score gates).
   - `emit.ts` — SSE emitter.
3. **Rendering**: `components/chat/ChatView.tsx` + `RecipeCard.tsx` map streamed cards (`RecipeCardData.messageIndex` links a card block to its assistant message) with a `RecipeCardSkeleton` while a tool call is in flight.

### Search (DB side)
`search_recipes` calls the `search_recipes_hybrid` Postgres RPC (`supabase/migrations/20260628000000_*.sql`): cosine KNN over `recipe_embeddings` (HNSW index) fused with full-text search over `recipes` via **Reciprocal Rank Fusion**. Embeddings use OpenAI `text-embedding-3-small` (1536 dims). The RPC is a pure relevance ranker — **all diet/allergen/dislike filtering is done by the model**, not SQL. `get_recipe_details` is a separate RPC.

### Other edge functions
`analyze-image` (ingredient detection from a photo — feeds the camera flow), `taste-vectors` (user taste-preference embeddings), `delete-account`.

## Data model notes
- `recipes.id` is a **bigint**; `types/chat.ts` stringifies it at every boundary (`RecipeCard.id: string`) so the edge/client never casts. `types/index.ts` `Recipe` uses `id: number`.
- Key tables: `recipes`, `recipe_embeddings`, `conversations` (chat history as jsonb), `conversation_items` (agent session log), `user_favorite_recipes`, `UserTasteProfiles`.
- Auth redirect setup (OAuth deep links, email confirmation) is documented in `docs/SUPABASE_AUTH_REDIRECTS.md` — non-obvious Supabase dashboard config lives there.

## ⚠️ Database safety — read before touching Supabase
The **`featured_library`** table is a dangerous legacy remnant: it is linked to the main **`recipes`** table such that changes mirror between them, and **deleting `featured_library` can cascade into deleting `recipes`** (months of production data). Before any schema/RLS/trigger change, inspect the linkage (triggers, rules, views, functions, RLS policies, foreign keys) and plan/test carefully. Never drop or bulk-modify these tables without explicit confirmation. Prefer read-only introspection first; test on a branch, not production.