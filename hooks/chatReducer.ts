import type {
  ServerEvent,
  TextBlock,
  RecipeCardsBlock,
  Block,
  AssistantTurn,
  Turn,
} from "@/types/chat"

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * The reducer accepts every SSE ServerEvent directly as an action, plus a
 * synthetic user_turn action that the hook dispatches when the user sends a
 * message (before the SSE stream opens).
 */
export type ChatAction = ServerEvent | { t: "user_turn"; content: string }

// ─── State ────────────────────────────────────────────────────────────────────

export interface ChatState {
  turns: Turn[]
  /**
   * Maps tool_use_id → block index within the current assistant turn.
   * Built as tool.call.started events arrive; cleared after done.
   * Enables O(1) hydration even when recipe.cards events arrive out of
   * insertion order (e.g. two tool calls whose results interleave).
   */
  toolCallIndex: Record<string, number>
  status: "idle" | "streaming" | "error"
  error: string | null
}

export const initialChatState: ChatState = {
  turns: [],
  toolCallIndex: {},
  status: "idle",
  error: null,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastAssistantTurn(turns: Turn[]): AssistantTurn | null {
  const last = turns[turns.length - 1]
  return last?.role === "assistant" ? (last as AssistantTurn) : null
}

/** Returns state with an in-progress AssistantTurn at the end, creating one if absent. */
function withAssistantTurn(state: ChatState): ChatState {
  if (lastAssistantTurn(state.turns)) return state
  const fresh: AssistantTurn = { role: "assistant", blocks: [], done: false }
  return { ...state, turns: [...state.turns, fresh] }
}

/** Replaces the blocks of the last turn (assumed AssistantTurn). */
function setBlocks(state: ChatState, blocks: Block[]): ChatState {
  const turn = lastAssistantTurn(state.turns)!
  return {
    ...state,
    turns: [...state.turns.slice(0, -1), { ...turn, blocks }],
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.t) {
    // ── Synthetic: user sends a message ──────────────────────────────────────
    case "user_turn": {
      const userTurn: Turn = { role: "user", content: action.content }
      return {
        ...state,
        turns: [...state.turns, userTurn],
        toolCallIndex: {},
        status: "streaming",
        error: null,
      }
    }

    // ── text.delta: append to open TextBlock or push a fresh one ─────────────
    case "text.delta": {
      const s = withAssistantTurn(state)
      const turn = lastAssistantTurn(s.turns)!
      const blocks = turn.blocks
      const last = blocks[blocks.length - 1]

      let newBlocks: Block[]
      if (last?.kind === "text") {
        const appended: TextBlock = { ...last, content: last.content + action.delta }
        newBlocks = [...blocks.slice(0, -1), appended]
      } else {
        // Push a new text block — either at turn start or after a cards block.
        const fresh: TextBlock = { kind: "text", content: action.delta, final: false }
        newBlocks = [...blocks, fresh]
      }

      return setBlocks(s, newBlocks)
    }

    // ── tool.call.started: push a skeleton card block (search_recipes only) ──
    case "tool.call.started": {
      if (action.tool_name !== "search_recipes") return state

      const s = withAssistantTurn(state)
      const turn = lastAssistantTurn(s.turns)!
      const blockIndex = turn.blocks.length
      const skeleton: RecipeCardsBlock = {
        kind: "recipe_cards",
        status: "loading",
        tool_use_id: action.tool_use_id,
      }

      return {
        ...setBlocks(s, [...turn.blocks, skeleton]),
        toolCallIndex: { ...s.toolCallIndex, [action.tool_use_id]: blockIndex },
      }
    }

    // ── recipe.cards: hydrate the matching skeleton block ─────────────────────
    case "recipe.cards": {
      const turn = lastAssistantTurn(state.turns)
      if (!turn) return state
      const blockIndex = state.toolCallIndex[action.tool_use_id]
      if (blockIndex === undefined) return state

      const ready: RecipeCardsBlock = {
        kind: "recipe_cards",
        status: "ready",
        tool_use_id: action.tool_use_id,
        items: action.items,
      }
      return setBlocks(
        state,
        turn.blocks.map((b, i) => (i === blockIndex ? ready : b)),
      )
    }

    // ── tool.call.failed: mark the skeleton block as failed ───────────────────
    case "tool.call.failed": {
      const turn = lastAssistantTurn(state.turns)
      if (!turn) return state
      const blockIndex = state.toolCallIndex[action.tool_use_id]
      if (blockIndex === undefined) return state

      const failed: RecipeCardsBlock = {
        kind: "recipe_cards",
        status: "failed",
        tool_use_id: action.tool_use_id,
        error: action.message,
      }
      return setBlocks(
        state,
        turn.blocks.map((b, i) => (i === blockIndex ? failed : b)),
      )
    }

    // ── message.completed: seal all open text blocks ──────────────────────────
    case "message.completed": {
      const turn = lastAssistantTurn(state.turns)
      if (!turn) return state

      return setBlocks(
        state,
        turn.blocks.map((b): Block =>
          b.kind === "text" ? { ...b, final: true } : b,
        ),
      )
    }

    // ── done: mark turn settled, clear the correlation index ──────────────────
    case "done": {
      const turn = lastAssistantTurn(state.turns)
      if (!turn) return { ...state, status: "idle", toolCallIndex: {} }

      return {
        ...state,
        turns: [...state.turns.slice(0, -1), { ...turn, done: true }],
        status: "idle",
        toolCallIndex: {},
      }
    }

    // ── error: surface the error; stream is dead ──────────────────────────────
    case "error": {
      return { ...state, status: "error", error: action.message }
    }

    default:
      return state
  }
}
