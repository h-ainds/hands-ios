/**
 * Shared contracts for the recipe-chat feature.
 * Importable as '@/types/chat' in the RN app, '../../types/chat.ts' in Deno edge functions.
 * No runtime code — types only.
 */

// ─── Primitives ────────────────────────────────────────────────────────────────

/** Minimal display shape for a recipe, safe to cross edge ↔ RN. */
export interface RecipeCard {
  /** recipes.id always stringified so the boundary never casts. */
  id: string
  title: string
  image: string | null
  caption: string | null
  tags: string[] | null
}

/**
 * User preferences resolved from UserTasteProfiles before the edge fn runs.
 * diet / allergens / dislikes are parsed from raw_preferences by the caller;
 * raw_preferences is the verbatim taste_preferences[] stored in Supabase.
 */
export interface Prefs {
  diet: string[]        // e.g. ["vegetarian", "gluten-free"]
  allergens: string[]   // e.g. ["peanuts", "shellfish"]
  dislikes: string[]    // e.g. ["cilantro", "blue cheese"]
  raw_preferences: string[] | null  // taste_preferences column verbatim
}

// ─── API Request ───────────────────────────────────────────────────────────────

/** Body sent from the RN app to the streamv5 edge function. */
export interface ChatRequest {
  message: string
  conversation_id?: string
  /** Recipe IDs currently visible to the user — tells the model what to vary. */
  visible_recipe_ids?: string[]
  image_base64?: string
  mime_type?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
}

// ─── Tool I/O ──────────────────────────────────────────────────────────────────

export interface SearchRecipesInput {
  query: string
  limit?: number        // default 5
  diet_filter?: string[]
  /** Skip IDs already on screen to keep suggestions fresh. */
  exclude_ids?: string[]
}

export interface SearchRecipesOutput {
  recipes: RecipeCard[]
  total_found: number
}

export interface GetRecipeDetailsInput {
  recipe_id: string
}

export interface GetRecipeDetailsOutput {
  recipe: RecipeCard & {
    steps: string[] | null
    ingredients: Record<string, string[]> | null
    tags: string[] | null
    url: string | null
  }
}

// ─── SSE Events ────────────────────────────────────────────────────────────────

/** Named union of every event type the edge function emits over SSE. Discriminant: `t`. */
export type ServerEvent =
  | TextDeltaEvent
  | ToolCallStartedEvent
  | RecipeCardsEvent
  | ToolCallFailedEvent
  | MessageCompletedEvent
  | DoneEvent
  | ErrorEvent

export interface TextDeltaEvent {
  t: 'text.delta'
  delta: string
}

export interface ToolCallStartedEvent {
  t: 'tool.call.started'
  tool_use_id: string
  tool_name: 'search_recipes' | 'get_recipe_details'
  input: Record<string, unknown>
}

/** Emitted after search_recipes resolves so the client can render cards immediately. */
export interface RecipeCardsEvent {
  t: 'recipe.cards'
  items: RecipeCard[]
}

export interface ToolCallFailedEvent {
  t: 'tool.call.failed'
  tool_use_id: string
  message: string
}

export interface MessageCompletedEvent {
  t: 'message.completed'
  usage?: { input_tokens: number; output_tokens: number }
}

/** Terminal event — always the last frame on the stream. */
export interface DoneEvent {
  t: 'done'
}

export interface ErrorEvent {
  t: 'error'
  message: string
  code?: string
}

// ─── Client State ──────────────────────────────────────────────────────────────

export interface TextBlock {
  kind: 'text'
  content: string
}

export interface RecipeCardsBlock {
  kind: 'recipe_cards'
  items: RecipeCard[]
}

/** A discrete visual unit inside an assistant turn. */
export type Block = TextBlock | RecipeCardsBlock

export interface UserTurn {
  role: 'user'
  content: string
  image_uri?: string
}

export interface AssistantTurn {
  role: 'assistant'
  /** Ordered blocks built from the SSE stream — prose and cards interleaved. */
  blocks: Block[]
}

export type Turn = UserTurn | AssistantTurn
