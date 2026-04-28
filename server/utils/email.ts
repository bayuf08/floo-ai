/**
 * Email sender — wraps Resend's HTTPS API directly so we don't need to add
 * the `resend` SDK as a dependency. Falls back to console.log in dev when
 * RESEND_API_KEY isn't configured.
 */
import type { H3Event } from 'h3'

export interface EmailMessage {
  to: string
  subject: string
  /** Rich HTML body */
  html: string
  /** Plain-text fallback */
  text?: string
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
  /** True when no API key is configured and we just logged the email. */
  mock?: boolean
}

/**
 * Treat obvious placeholder values (the strings shipped in `.env.example`)
 * as if they weren't set at all. Without this, a fresh `cp .env.example .env`
 * leaves `RESEND_API_KEY=re_your-resend-api-key`, which is non-empty and
 * therefore skips the mock branch — but Resend then rejects the request with
 * "Invalid API key", surfacing as a confusing "email failed to send" toast.
 */
function isPlaceholder(value: string): boolean {
  if (!value) return true
  const v = value.toLowerCase().trim()
  return (
    v === 're_your-resend-api-key' ||
    v.includes('your-resend') ||
    v.includes('@yourdomain.com') ||
    v === 'floo@example.com'
  )
}

export async function sendEmail(event: H3Event, msg: EmailMessage): Promise<SendResult> {
  const config = useRuntimeConfig(event)
  const apiKey = config.resendApiKey
  const from = config.resendFromEmail || 'floo@example.com'

  // Mock mode covers two cases: (1) no API key at all, and (2) the key/from
  // are still the placeholder strings from .env.example. Both should log to
  // the server console rather than ping Resend with garbage.
  if (isPlaceholder(apiKey) || isPlaceholder(from)) {
    const reason = isPlaceholder(apiKey)
      ? 'RESEND_API_KEY is empty or still a placeholder'
      : 'RESEND_FROM_EMAIL is still a placeholder (e.g. @yourdomain.com)'
    console.log(`[email mock — ${reason}]`)
    console.log('  To:      ', msg.to)
    console.log('  Subject: ', msg.subject)
    console.log('  HTML:    ', msg.html.slice(0, 280) + (msg.html.length > 280 ? '…' : ''))
    return { ok: true, mock: true }
  }

  try {
    const res = await $fetch<{ id?: string }>('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? stripHtml(msg.html),
      },
    })
    return { ok: true, id: res?.id }
  } catch (err: any) {
    // Surface the most useful message: Resend usually puts a structured
    // reason in `data.message`; fall back to err.message for anything else.
    const reason =
      err?.data?.message ||
      err?.data?.error ||
      err?.statusMessage ||
      err?.message ||
      'Resend request failed'
    console.warn('[email] Resend rejected request:', reason)
    return { ok: false, error: reason }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Branded HTML template for invite emails. */
export function inviteEmailHtml(args: {
  inviterName: string
  targetType: 'workspace' | 'project'
  targetName: string
  acceptUrl: string
  role: string
}): string {
  const verb = args.targetType === 'workspace' ? 'workspace' : 'project'
  return `<!doctype html>
<html><body style="font-family:'Inter',system-ui,sans-serif;background:#FAF8F5;color:#1B1726;margin:0;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E2DA;border-radius:14px;padding:32px;box-shadow:0 6px 18px rgba(27,23,38,0.06);">
    <div style="font-family:'Funnel Display','Inter',sans-serif;font-weight:800;font-size:22px;letter-spacing:-0.02em;margin-bottom:6px;">
      Floo<span style="color:#5B479D;">·</span>Content
    </div>
    <p style="font-size:14px;color:#4A4458;margin:0 0 18px;">An invitation to collaborate</p>

    <p style="font-size:15px;line-height:1.55;color:#1B1726;margin:0 0 14px;">
      <strong>${escapeHtml(args.inviterName)}</strong> invited you to join the
      ${verb} <strong>"${escapeHtml(args.targetName)}"</strong> as a
      <strong style="text-transform:capitalize;">${escapeHtml(args.role)}</strong>.
    </p>

    <a href="${escapeHtml(args.acceptUrl)}"
       style="display:inline-block;margin:18px 0;padding:12px 22px;background:#FBB040;color:#1B1726;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none;">
      Accept invitation
    </a>

    <p style="font-size:12px;color:#847D90;line-height:1.5;margin:14px 0 0;">
      Or copy this link into your browser:<br/>
      <span style="word-break:break-all;color:#5B479D;">${escapeHtml(args.acceptUrl)}</span>
    </p>

    <p style="font-size:11px;color:#847D90;margin-top:24px;border-top:1px solid #EFEBE3;padding-top:14px;">
      This invitation expires in 14 days. If you weren't expecting this email, ignore it — no action is required.
    </p>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
