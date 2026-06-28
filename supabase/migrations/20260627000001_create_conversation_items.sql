-- Issue 0.3: conversation_items — ordered item log for a chat session.
--
-- Each row holds one event payload (Turn, Block, ToolUse, etc.) as jsonb.
-- seq is a global GENERATED ALWAYS AS IDENTITY bigint; ordering within a
-- conversation by seq gives exact arrival order even though the sequence
-- increments globally across all conversations.
--
-- The PRIMARY KEY on (conversation_id, seq) creates a btree index that serves
-- all "fetch items for conversation X in order" queries — no separate index
-- is needed or added.

CREATE TABLE IF NOT EXISTS public.conversation_items (
  conversation_id  uuid         NOT NULL
    REFERENCES public.conversations(id) ON DELETE CASCADE,
  seq              bigint       GENERATED ALWAYS AS IDENTITY,
  item             jsonb        NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT conversation_items_pkey PRIMARY KEY (conversation_id, seq)
);

-- Row-level security: users may only touch items in their own conversations.
ALTER TABLE public.conversation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own conversation items"
  ON public.conversation_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE  id      = conversation_id
        AND  user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert into their own conversations"
  ON public.conversation_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE  id      = conversation_id
        AND  user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own conversation items"
  ON public.conversation_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE  id      = conversation_id
        AND  user_id = auth.uid()
    )
  );
