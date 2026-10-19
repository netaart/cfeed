import { Hono } from 'hono'
import type { AppEnv, Auth } from '../types'
import { pinnedApp, requireAuth } from '../lib/auth'
import { fail } from '../lib/http'

const query = new Hono<AppEnv>()

const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'spam'] as const
const LIST_FILTERS = ['status', 'type', 'user_id', 'country', 'ua_os', 'ua_device'] as const
const X_PATH = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,4}$/
const MAX_X_FILTERS = 5
const SAFE_INLINE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

type FeedbackRow = Record<string, unknown> & {
  id: string
  app: string
  created_at: number
  tags: string
  extra: string
  client_hints: string | null
}

const csv = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : [])
const placeholders = (n: number) => Array(n).fill('?').join(', ')

function parseTime(v: string | undefined, name: string, endOfDay: boolean): number | null {
  if (!v) return null
  if (/^\d+$/.test(v)) return Number(v)
  const t = Date.parse(v)
  if (Number.isNaN(t)) fail(400, 'invalid_query', `${name} must be YYYY-MM-DD, ISO 8601, or a millisecond timestamp`)
  return endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v) ? t + 86_400_000 : t
}

function scopeApps(auth: Auth, requested: string[]): string[] {
  const pinned = pinnedApp(auth)
  if (!pinned) return requested
  if (requested.some((a) => a !== pinned)) fail(403, 'forbidden', `This key can only access app "${pinned}"`)
  return [pinned]
}

// Matches the JSON text produced by `extra -> path`, so "3" finds both 3 and "3", "true" finds true and "true".
function xCandidates(v: string): string[] {
  const out = [JSON.stringify(v)]
  if (v === 'true' || v === 'false' || v === 'null') out.push(v)
  else if (v.trim() !== '' && Number.isFinite(Number(v))) out.push(String(Number(v)))
  return out
}

function mapRow(r: FeedbackRow) {
  return {
    ...r,
    tags: JSON.parse(r.tags) as string[],
    extra: JSON.parse(r.extra) as Record<string, unknown>,
    client_hints: r.client_hints ? (JSON.parse(r.client_hints) as Record<string, string>) : null
  }
}

const encodeCursor = (r: { created_at: number; id: string }) => btoa(`${r.created_at}:${r.id}`)
function decodeCursor(v: string): [number, string] {
  try {
    const [t, id] = atob(v).split(':')
    if (/^\d+$/.test(t) && id) return [Number(t), id]
  } catch {}
  fail(400, 'invalid_query', 'Invalid cursor')
}

async function loadScoped(c: { env: AppEnv['Bindings'] }, auth: Auth, id: string) {
  const row = await c.env.DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).first<FeedbackRow>()
  const pinned = pinnedApp(auth)
  if (!row || (pinned && row.app !== pinned)) fail(404, 'not_found', `Feedback ${id} not found`)
  return row
}

query.get('/feedback', requireAuth('read'), async (c) => {
  const q = c.req.query()
  const where: string[] = []
  const params: unknown[] = []
  const add = (sql: string, ...values: unknown[]) => {
    where.push(sql)
    params.push(...values)
  }

  const apps = scopeApps(c.get('auth'), csv(q.app))
  if (apps.length) add(`app IN (${placeholders(apps.length)})`, ...apps)

  for (const col of LIST_FILTERS) {
    const values = csv(q[col])
    if (values.length) add(`${col} IN (${placeholders(values.length)})`, ...values)
  }
  if (!q.status) add(`status != 'spam'`)

  const from = parseTime(q.from, 'from', false)
  const to = parseTime(q.to, 'to', true)
  if (from !== null) add('created_at >= ?', from)
  if (to !== null) add('created_at < ?', to)

  if (q.q) add(`content LIKE ? ESCAPE '\\'`, `%${q.q.replace(/[\\%_]/g, (m) => '\\' + m)}%`)
  if (q.has_attachments === '1') add('attachment_count > 0')
  if (q.has_attachments === '0') add('attachment_count = 0')

  const xKeys = Object.keys(q).filter((k) => k.startsWith('x.'))
  if (xKeys.length > MAX_X_FILTERS) fail(400, 'invalid_query', `At most ${MAX_X_FILTERS} x.<path> filters`)
  for (const k of xKeys) {
    const path = k.slice(2)
    if (!X_PATH.test(path)) fail(400, 'invalid_query', `Invalid extra path "${path}"`)
    const cands = xCandidates(q[k])
    add(`(extra -> ?) IN (${placeholders(cands.length)})`, `$.${path}`, ...cands)
  }

  if (q.cursor) {
    const [t, id] = decodeCursor(q.cursor)
    add('(created_at < ? OR (created_at = ? AND id < ?))', t, t, id)
  }

  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100)
  const sql = `SELECT * FROM feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ?`
  const { results } = await c.env.DB.prepare(sql).bind(...params, limit + 1).all<FeedbackRow>()
  const items = results.slice(0, limit)
  return c.json({
    items: items.map(mapRow),
    next_cursor: results.length > limit ? encodeCursor(items[items.length - 1]) : null
  })
})

query.get('/feedback/:id', requireAuth('read'), async (c) => {
  const row = await loadScoped(c, c.get('auth'), c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    'SELECT id, filename, content_type, size, created_at FROM attachments WHERE feedback_id = ? ORDER BY id'
  )
    .bind(row.id)
    .all<{ id: string }>()
  return c.json({ ...mapRow(row), attachments: results.map((a) => ({ ...a, url: `/api/v1/attachments/${a.id}` })) })
})

query.patch('/feedback/:id', requireAuth('write'), async (c) => {
  const row = await loadScoped(c, c.get('auth'), c.req.param('id'))
  const body = await c.req.json().catch(() => fail(400, 'invalid_json', 'Malformed JSON body'))
  const sets: string[] = []
  const params: unknown[] = []

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) fail(400, 'invalid_field', `status must be one of ${STATUSES.join(', ')}`)
    sets.push('status = ?')
    params.push(body.status)
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.length > 20 || !body.tags.every((t: unknown) => typeof t === 'string' && t.trim() && t.length <= 32))
      fail(400, 'invalid_field', 'tags must be up to 20 non-empty strings of at most 32 characters')
    sets.push('tags = ?')
    params.push(JSON.stringify([...new Set((body.tags as string[]).map((t) => t.trim()))]))
  }
  if (body.note !== undefined) {
    if (body.note !== null && (typeof body.note !== 'string' || body.note.length > 5000))
      fail(400, 'invalid_field', 'note must be a string of at most 5000 characters, or null')
    sets.push('note = ?')
    params.push(body.note || null)
  }
  if (!sets.length) fail(400, 'invalid_body', 'Nothing to update: provide status, tags, or note')

  const updated = await c.env.DB.prepare(`UPDATE feedback SET ${sets.join(', ')}, updated_at = ? WHERE id = ? RETURNING *`)
    .bind(...params, Date.now(), row.id)
    .first<FeedbackRow>()
  return c.json(mapRow(updated!))
})

query.delete('/feedback/:id', requireAuth('write'), async (c) => {
  const row = await loadScoped(c, c.get('auth'), c.req.param('id'))
  const { results } = await c.env.DB.prepare('SELECT r2_key FROM attachments WHERE feedback_id = ?')
    .bind(row.id)
    .all<{ r2_key: string }>()
  await c.env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(row.id).run()
  if (results.length) await c.env.BUCKET.delete(results.map((r) => r.r2_key))
  return c.body(null, 204)
})

query.get('/attachments/:id', requireAuth('read'), async (c) => {
  const att = await c.env.DB.prepare(
    'SELECT a.r2_key, a.filename, a.content_type, f.app FROM attachments a JOIN feedback f ON f.id = a.feedback_id WHERE a.id = ?'
  )
    .bind(c.req.param('id'))
    .first<{ r2_key: string; filename: string; content_type: string; app: string }>()
  const pinned = pinnedApp(c.get('auth'))
  if (!att || (pinned && att.app !== pinned)) fail(404, 'not_found', 'Attachment not found')

  const obj = await c.env.BUCKET.get(att.r2_key)
  if (!obj) fail(404, 'attachment_missing', `Object ${att.r2_key} is missing from R2`)

  // Anything that is not a plain raster image is forced to download so it can never run on this origin.
  const inline = SAFE_INLINE.has(att.content_type)
  const ascii = att.filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return new Response(obj.body, {
    headers: {
      'content-type': inline ? att.content_type : 'application/octet-stream',
      'content-length': String(obj.size),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, max-age=3600'
    }
  })
})

query.get('/stats', requireAuth('read'), async (c) => {
  const apps = scopeApps(c.get('auth'), csv(c.req.query('app')))
  const scope = apps.length ? `WHERE app IN (${placeholders(apps.length)})` : ''
  const since = Date.now() - 30 * 86_400_000
  const [byStatus, byType, daily] = await c.env.DB.batch<{ k: string; n: number }>([
    c.env.DB.prepare(`SELECT status AS k, COUNT(*) AS n FROM feedback ${scope} GROUP BY status`).bind(...apps),
    c.env.DB.prepare(`SELECT type AS k, COUNT(*) AS n FROM feedback ${scope} GROUP BY type ORDER BY n DESC LIMIT 20`).bind(...apps),
    c.env.DB.prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS k, COUNT(*) AS n FROM feedback ${scope ? scope + ' AND' : 'WHERE'} created_at >= ? GROUP BY k ORDER BY k`
    ).bind(...apps, since)
  ])
  const toMap = (rows: { k: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.k, r.n]))
  return c.json({
    total: byStatus.results.reduce((s, r) => s + r.n, 0),
    by_status: toMap(byStatus.results),
    by_type: toMap(byType.results),
    daily: daily.results.map((r) => ({ date: r.k, count: r.n }))
  })
})

query.get('/apps', requireAuth('read'), async (c) => {
  const pinned = pinnedApp(c.get('auth'))
  const [seen, registered] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare(
      `SELECT app, COUNT(*) AS count, MAX(created_at) AS last_at FROM feedback ${pinned ? 'WHERE app = ?' : ''} GROUP BY app`
    ).bind(...(pinned ? [pinned] : [])),
    c.env.DB.prepare(`SELECT slug, name, status FROM apps ${pinned ? 'WHERE slug = ?' : ''}`).bind(...(pinned ? [pinned] : []))
  ])
  const out = new Map<string, { app: string; name: string | null; count: number; last_at: number | null; registered: boolean; status: string }>()
  for (const r of registered.results)
    out.set(r.slug as string, { app: r.slug as string, name: r.name as string | null, count: 0, last_at: null, registered: true, status: r.status as string })
  for (const r of seen.results) {
    const cur = out.get(r.app as string)
    out.set(r.app as string, {
      app: r.app as string,
      name: cur?.name ?? null,
      registered: !!cur,
      status: cur?.status ?? 'active',
      count: r.count as number,
      last_at: r.last_at as number
    })
  }
  return c.json({ items: [...out.values()].sort((a, b) => (b.last_at ?? 0) - (a.last_at ?? 0)) })
})

export default query
