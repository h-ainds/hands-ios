import { createClient } from "@supabase/supabase-js"

// deno-lint-ignore no-explicit-any
type AnyClient = ReturnType<typeof createClient<any, any, any>>

// Matches AgentInputItem from @openai/agents-core@0.12.0 — any Responses API item shape.
type AgentInputItem = Record<string, unknown>

/**
 * SupabaseSession — Session interface over public.conversation_items.
 *
 * Method names verified against @openai/agents-core@0.12.0
 * dist/memory/session.d.ts: getSessionId / getItems / addItems / popItem / clearSession.
 *
 * Assumes the conversations row already exists (FK constraint is enforced even
 * under the service-role key). addItems() will throw if the row is missing.
 */
export class SupabaseSession {
  readonly #id: string
  readonly #db: AnyClient

  constructor(conversationId: string, supabase: AnyClient) {
    this.#id = conversationId
    this.#db = supabase
  }

  getSessionId(): Promise<string> {
    return Promise.resolve(this.#id)
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (limit !== undefined && limit > 0) {
      // Fetch most-recent N rows then reverse to restore chronological order.
      const { data, error } = await this.#db
        .from("conversation_items")
        .select("item")
        .eq("conversation_id", this.#id)
        .order("seq", { ascending: false })
        .limit(limit)
      if (error) throw new Error(`SupabaseSession.getItems: ${error.message}`)
      return ((data ?? []) as { item: AgentInputItem }[]).map((r) => r.item).reverse()
    }

    const { data, error } = await this.#db
      .from("conversation_items")
      .select("item")
      .eq("conversation_id", this.#id)
      .order("seq", { ascending: true })
    if (error) throw new Error(`SupabaseSession.getItems: ${error.message}`)
    return ((data ?? []) as { item: AgentInputItem }[]).map((r) => r.item)
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    if (items.length === 0) return
    const rows = items.map((item) => ({ conversation_id: this.#id, item }))
    const { error } = await this.#db.from("conversation_items").insert(rows)
    if (error) throw new Error(`SupabaseSession.addItems: ${error.message}`)
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const { data, error } = await this.#db
      .from("conversation_items")
      .select("seq, item")
      .eq("conversation_id", this.#id)
      .order("seq", { ascending: false })
      .limit(1)
    if (error) throw new Error(`SupabaseSession.popItem (select): ${error.message}`)
    if (!data || (data as unknown[]).length === 0) return undefined

    const row = (data as { seq: number; item: AgentInputItem }[])[0]
    const { error: delErr } = await this.#db
      .from("conversation_items")
      .delete()
      .eq("conversation_id", this.#id)
      .eq("seq", row.seq)
    if (delErr) throw new Error(`SupabaseSession.popItem (delete): ${delErr.message}`)

    return row.item
  }

  async clearSession(): Promise<void> {
    const { error } = await this.#db
      .from("conversation_items")
      .delete()
      .eq("conversation_id", this.#id)
    if (error) throw new Error(`SupabaseSession.clearSession: ${error.message}`)
  }
}
