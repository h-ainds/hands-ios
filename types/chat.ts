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

/** Named union of every event type the edge function emits over SSE. */
export type ServerEvent =
  | MessageStartEvent
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | RecipeCardsEvent
  | MessageStopEvent
  | ErrorEvent

export interface MessageStartEvent {
  type: 'message_start'
  conversation_id: string
}

export interface TextDeltaEvent {
  type: 'text_delta'
  delta: string
}

export interface ToolUseEvent {
  type: 'tool_use'
  tool_use_id: string
  tool_name: 'search_recipes' | 'get_recipe_details'
  input: SearchRecipesInput | GetRecipeDetailsInput
}

export interface ToolResultEvent {
  type: 'tool_result'
  tool_use_id: string
  output: SearchRecipesOutput | GetRecipeDetailsOutput
}

/** Emitted after tool results resolve so the client can render cards immediately. */
export interface RecipeCardsEvent {
  type: 'recipe_cards'
  items: RecipeCard[]
}

export interface MessageStopEvent {
  type: 'message_stop'
  usage?: { input_tokens: number; output_tokens: number }
}

export interface ErrorEvent {
  type: 'error'
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
