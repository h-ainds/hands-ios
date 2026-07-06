import { supabase } from '@/lib/supabase/client'

/**
 * Chat image attachments.
 *
 * Bytes live in the private `chat-attachments` Storage bucket; the
 * public.attachments table holds only metadata and binds each image to a single
 * chat bubble via (conversation_id, message_index). See migration
 * 20260705000000_create_chat_attachments.sql.
 *
 * Path convention: {user_id}/{attachment_id}.{ext} — the leading uid segment is
 * what the Storage RLS policies key off of, so a user can only read/write their
 * own folder (and thus only mint signed URLs for their own images).
 */

const BUCKET = 'chat-attachments'
const SIGNED_URL_TTL = 3600 // seconds — short-lived, regenerated on each render

export type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface UploadAttachmentParams {
  uri: string
  mimeType: MimeType
  userId: string
  width?: number
  height?: number
  /** Reports upload progress as 0..1 while bytes are transferred. */
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export interface UploadedAttachment {
  attachmentId: string
  storagePath: string
}

const EXT_BY_MIME: Record<MimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * PUT a blob to a Supabase signed upload URL via XHR so we get real byte-level
 * upload progress (the supabase-js upload path exposes none). Resolves on 2xx.
 */
function putWithProgress(
  signedUrl: string,
  body: ArrayBuffer,
  mimeType: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    // Raw body + explicit content-type matches supabase-js's non-FormData upload
    // path, which the /object/upload/sign endpoint accepts.
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.setRequestHeader('x-upsert', 'true')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
      } else {
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed: network error'))
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'))

    if (signal) {
      if (signal.aborted) return xhr.abort()
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(body)
  })
}

/**
 * Insert a metadata row, upload the bytes to Storage with progress, then record
 * the storage path. The message link (conversation_id, message_index) is set
 * later by finalizeAttachment once the owning message is sent.
 */
export async function uploadChatAttachment({
  uri,
  mimeType,
  userId,
  width,
  height,
  onProgress,
  signal,
}: UploadAttachmentParams): Promise<UploadedAttachment> {
  // arrayBuffer() (not blob()) — RN transmits an ArrayBuffer body reliably via
  // XHR, whereas a Blob body can silently send 0 bytes on some RN versions.
  const buffer = await (await fetch(uri)).arrayBuffer()

  // 1. Reserve a row so the DB mints the id we name the storage object after.
  const { data: row, error: insertError } = await supabase
    .from('attachments')
    .insert({
      user_id: userId,
      mime_type: mimeType,
      size_bytes: buffer.byteLength,
      width: width ?? null,
      height: height ?? null,
    })
    .select('id')
    .single()

  if (insertError || !row) {
    throw new Error(`Could not create attachment: ${insertError?.message ?? 'unknown error'}`)
  }

  const attachmentId = row.id as string
  const ext = EXT_BY_MIME[mimeType]
  const storagePath = `${userId}/${attachmentId}.${ext}`

  try {
    // 2. Signed upload URL → XHR PUT with progress.
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)
    if (signError || !signed) {
      throw new Error(`Could not sign upload: ${signError?.message ?? 'unknown error'}`)
    }

    await putWithProgress(signed.signedUrl, buffer, mimeType, onProgress, signal)

    // 3. Record where the bytes landed.
    const { error: updateError } = await supabase
      .from('attachments')
      .update({ storage_path: storagePath })
      .eq('id', attachmentId)
    if (updateError) throw new Error(`Could not record attachment path: ${updateError.message}`)

    return { attachmentId, storagePath }
  } catch (err) {
    // Best-effort cleanup so a failed upload leaves no dangling metadata row.
    await supabase.from('attachments').delete().eq('id', attachmentId)
    throw err
  }
}

/** Bind an uploaded attachment to the specific message it was sent with. */
export async function finalizeAttachment(
  attachmentId: string,
  conversationId: string,
  messageIndex: number,
): Promise<void> {
  const { error } = await supabase
    .from('attachments')
    .update({ conversation_id: conversationId, message_index: messageIndex })
    .eq('id', attachmentId)
  if (error) console.error('[attachments] finalize failed:', error.message)
}

/**
 * Load all attachments for a conversation and mint short-lived signed URLs,
 * returning a map of message_index → signed URL for history rendering.
 */
export async function signConversationAttachments(
  conversationId: string,
): Promise<Map<number, string>> {
  const byIndex = new Map<number, string>()

  const { data: rows, error } = await supabase
    .from('attachments')
    .select('message_index, storage_path')
    .eq('conversation_id', conversationId)
    .not('storage_path', 'is', null)
    .not('message_index', 'is', null)
  if (error || !rows || rows.length === 0) return byIndex

  const paths = rows.map((r) => r.storage_path as string)
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL)
  if (signError || !signed) return byIndex

  const urlByPath = new Map<string, string>()
  signed.forEach((s) => {
    if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl)
  })

  rows.forEach((r) => {
    const url = urlByPath.get(r.storage_path as string)
    if (url) byIndex.set(r.message_index as number, url)
  })

  return byIndex
}
