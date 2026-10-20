import type { Bindings } from '../types'

export type WebhookFeedback = {
  id: string
  app: string
  content: string
  extra: Record<string, unknown>
  status: string
  created_at: number
  attachments: { id: string; filename: string; content_type: string; size: number }[]
  context: Record<string, string | number | null>
}

type Target = { url: string; secret: string | null }
type Flavor = 'feishu' | 'dingtalk' | 'wecom' | 'slack' | 'discord' | 'json'

const TIMEOUT_MS = 10_000
const enc = new TextEncoder()

export function webhookFlavor(url: string): Flavor {
  const u = new URL(url)
  const h = u.hostname
  if ((h === 'open.feishu.cn' || h === 'open.larksuite.com') && u.pathname.startsWith('/open-apis/bot/')) return 'feishu'
  if (h === 'oapi.dingtalk.com') return 'dingtalk'
  if (h === 'qyapi.weixin.qq.com') return 'wecom'
  if (h === 'hooks.slack.com') return 'slack'
  if ((h === 'discord.com' || h === 'discordapp.com') && u.pathname.startsWith('/api/webhooks/')) return 'discord'
  return 'json'
}

export function normalizeWebhookUrl(input: string): string | null {
  try {
    const u = new URL(input.trim())
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null
  } catch {
    return null
  }
}

function summary(fb: WebhookFeedback, links: { dashboard: string }): string {
  const ctx = fb.context
  const env = [ctx.ua_os, ctx.ua_browser].filter(Boolean).join(' ') || ctx.ua_device
  const where = [ctx.country, ctx.city].filter(Boolean).join(' ')
  const extra = Object.keys(fb.extra).length ? JSON.stringify(fb.extra) : ''
  return [
    `[cfeed] ${fb.app}`,
    fb.content.length > 1000 ? fb.content.slice(0, 1000) + '…' : fb.content,
    extra.length > 500 ? extra.slice(0, 500) + '…' : extra,
    [env, where, fb.attachments.length ? `📎 ${fb.attachments.length}` : ''].filter(Boolean).join(' · '),
    links.dashboard
  ]
    .filter(Boolean)
    .join('\n')
}

async function hmac(key: string, msg: string, out: 'hex' | 'base64'): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
  return out === 'hex' ? [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') : btoa(String.fromCharCode(...sig))
}

async function buildRequest(target: Target, event: string, fb: WebhookFeedback, origin: string) {
  const links = { dashboard: `${origin}/dashboard/#feedback/${fb.id}`, api: `${origin}/api/v1/feedback/${fb.id}` }
  const text = summary(fb, links)
  const ts = Math.floor(Date.now() / 1000)
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'cfeed-webhook/1' }
  let url = target.url
  let body: unknown

  switch (webhookFlavor(target.url)) {
    case 'feishu':
      body = { msg_type: 'text', content: { text } }
      if (target.secret) Object.assign(body as object, { timestamp: String(ts), sign: await hmac(`${ts}\n${target.secret}`, '', 'base64') })
      break
    case 'dingtalk': {
      body = { msgtype: 'text', text: { content: text } }
      if (target.secret) {
        const ms = Date.now()
        const sign = await hmac(target.secret, `${ms}\n${target.secret}`, 'base64')
        const u = new URL(url)
        u.searchParams.set('timestamp', String(ms))
        u.searchParams.set('sign', sign)
        url = u.toString()
      }
      break
    }
    case 'wecom':
      body = { msgtype: 'text', text: { content: text } }
      break
    case 'slack':
      body = { text }
      break
    case 'discord':
      body = { content: text.slice(0, 2000) }
      break
    default: {
      body = { event, feedback: fb, links }
      headers['x-cfeed-event'] = event
      headers['x-cfeed-delivery'] = fb.id
      if (target.secret) {
        headers['x-cfeed-timestamp'] = String(ts)
        headers['x-cfeed-signature'] = 'sha256=' + (await hmac(target.secret, `${ts}.${JSON.stringify(body)}`, 'hex'))
      }
    }
  }
  return { url, init: { method: 'POST', headers, body: JSON.stringify(body) } }
}

// Chat platforms answer 200 with an error code in the body (Feishu code, DingTalk/WeCom errcode).
function platformError(text: string): string | null {
  try {
    const j = JSON.parse(text)
    if (typeof j?.code === 'number' && j.code !== 0) return `code ${j.code}: ${j.msg ?? ''}`.trim()
    if (typeof j?.errcode === 'number' && j.errcode !== 0) return `errcode ${j.errcode}: ${j.errmsg ?? ''}`.trim()
  } catch {}
  return null
}

export type DeliveryResult = { status: number; error: string | null }

export async function deliverWebhook(env: Bindings, slug: string, target: Target, event: string, fb: WebhookFeedback, origin: string): Promise<DeliveryResult> {
  let result: DeliveryResult
  try {
    const { url, init } = await buildRequest(target, event, fb, origin)
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    const text = (await res.text()).slice(0, 500)
    const err = res.ok ? platformError(text) : `HTTP ${res.status}: ${text}`
    result = { status: res.status, error: err }
  } catch (e) {
    result = { status: 0, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  }
  if (result.error) console.error('webhook failed', slug, result.error)
  await env.DB.prepare('UPDATE apps SET webhook_last_at = ?, webhook_last_status = ?, webhook_last_error = ? WHERE slug = ?')
    .bind(Date.now(), result.status, result.error?.slice(0, 500) ?? null, slug)
    .run()
  return result
}
