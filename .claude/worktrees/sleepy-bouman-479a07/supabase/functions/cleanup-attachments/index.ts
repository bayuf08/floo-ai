// Supabase Edge Function (Deno runtime).
//
// Deletes objects from the `message-attachments` bucket whose underlying
// chat_messages row references them but is older than 30 days. Designed
// to be invoked daily by Supabase Scheduled Triggers (cron).
//
// Deploy with:
//   supabase functions deploy cleanup-attachments --project-ref <ref>
//
// Schedule daily at 03:00 UTC (run from a SQL editor):
//   select cron.schedule(
//     'cleanup-attachments-daily',
//     '0 3 * * *',
//     $$ select net.http_post(
//          url := '<your-functions-base>/cleanup-attachments',
//          headers := jsonb_build_object(
//            'Authorization', 'Bearer ' || current_setting('app.cleanup_secret')
//          )
//        ); $$
//   );
//
// Authorization is via the same `Authorization: Bearer <CLEANUP_SECRET>` header
// the cron job sends. Set CLEANUP_SECRET as a function secret:
//   supabase secrets set CLEANUP_SECRET=<long-random-string>

// @ts-expect-error — Deno-specific imports resolved by the Edge runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-expect-error — Deno global
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLEANUP_SECRET = Deno.env.get('CLEANUP_SECRET')
const BUCKET = Deno.env.get('SUPABASE_STORAGE_BUCKET_ATTACHMENTS') ?? 'message-attachments'
const RETENTION_DAYS = Number(Deno.env.get('ATTACHMENT_RETENTION_DAYS') ?? '30')

declare const Deno: { env: { get(name: string): string | undefined } }

interface AttachmentRow {
  id: string
  metadata: { attachments?: Array<{ storage_path: string; name: string }> } | null
  created_at: string
}

serve(async (req: Request) => {
  // Lightweight bearer check so the function isn't openly callable.
  const auth = req.headers.get('authorization') ?? ''
  if (CLEANUP_SECRET && auth !== `Bearer ${CLEANUP_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Find old messages whose metadata still has attachment paths recorded.
  const { data: messages, error: queryErr } = await supabase
    .from('chat_messages')
    .select('id, metadata, created_at')
    .lt('created_at', cutoff)
    .not('metadata->attachments', 'is', null)
    .limit(1000)

  if (queryErr) {
    return new Response(JSON.stringify({ error: queryErr.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const rows = (messages ?? []) as AttachmentRow[]
  const allPaths: string[] = []
  const messageIds: string[] = []

  for (const m of rows) {
    const list = m.metadata?.attachments ?? []
    if (!list.length) continue
    messageIds.push(m.id)
    for (const a of list) if (a.storage_path) allPaths.push(a.storage_path)
  }

  if (allPaths.length === 0) {
    return new Response(JSON.stringify({ ok: true, deleted: 0, scanned: rows.length }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  // Storage delete is best-effort — we still clear metadata so we don't
  // re-process the same rows tomorrow.
  const { error: storageErr } = await supabase.storage.from(BUCKET).remove(allPaths)
  if (storageErr) {
    console.warn('[cleanup-attachments] storage remove failed', storageErr)
  }

  // Strip the attachments key from each affected message's metadata.
  for (const m of rows) {
    const { attachments, upload_warnings, ...rest } = m.metadata ?? {}
    await supabase.from('chat_messages').update({ metadata: rest }).eq('id', m.id)
  }

  return new Response(
    JSON.stringify({ ok: true, deleted: allPaths.length, scanned_messages: rows.length }),
    { headers: { 'content-type': 'application/json' } }
  )
})
