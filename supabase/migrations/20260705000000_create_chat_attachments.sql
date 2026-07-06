-- Chat image attachments — private Storage bucket + per-message metadata table.
--
-- Images live in Storage (bytes); this table holds only metadata and binds each
-- attachment to a single chat bubble via (conversation_id, message_index).
-- The conversations.content jsonb message also carries attachment_id so the
-- client can map a bubble → attachment directly. content is append-only, so
-- message_index is a stable anchor.
--
-- Path convention: {user_id}/{attachment_id}.{ext}. The first path segment is
-- the owner's uid, which the Storage RLS policies below key off of so a user
-- can only read/write their own folder (and thus only mint signed URLs for
-- their own images). The bucket is private; history rendering uses short-lived
-- signed URLs generated on demand.

-- ── Private bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  5242880,  -- 5 MB
  array['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- ── Storage RLS — owner-folder scoped ───────────────────────────────────────
-- (storage.foldername(name))[1] is the leading path segment = the owner's uid.
create policy "chat-attachments owner select"
  on storage.objects for select
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat-attachments owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat-attachments owner update"
  on storage.objects for update
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat-attachments owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Metadata table ──────────────────────────────────────────────────────────
create table if not exists public.attachments (
  id               uuid         primary key default gen_random_uuid(),
  user_id          uuid         not null references auth.users(id) on delete cascade,
  -- Nullable until the owning message is sent; bound on finalize.
  conversation_id  uuid         references public.conversations(id) on delete cascade,
  message_index    int,
  storage_path     text,
  mime_type        text,
  size_bytes       int,
  width            int,
  height           int,
  created_at       timestamptz  not null default now()
);

-- Fetch all attachments for a conversation (history rendering) by message order.
create index if not exists attachments_conversation_idx
  on public.attachments (conversation_id, message_index);

alter table public.attachments enable row level security;

create policy "Users read their own attachments"
  on public.attachments for select
  using (user_id = auth.uid());

create policy "Users insert their own attachments"
  on public.attachments for insert
  with check (user_id = auth.uid());

create policy "Users update their own attachments"
  on public.attachments for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users delete their own attachments"
  on public.attachments for delete
  using (user_id = auth.uid());
