import { Hono } from 'hono'
import { deleteCookie, setSignedCookie } from 'hono/cookie'
import type { AppEnv } from '../types'
import { ADMIN_COOKIE, adminToken, requireAuth } from '../lib/auth'
import { APP_SLUG, appRowToJson, type AppRow } from '../lib/config'
import { fail } from '../lib/http'
import { hmacHex, newApiKey, safeEqual, sha256Hex, ulid } from '../lib/id'

const admin = new Hono<AppEnv>()
const MIME = /^[\w.+-]+\/([\w.+-]+|\*)$/
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

admin.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const { success } = await c.env.SUBMIT_LIMITER.limit({ key: `login:${await hmacHex(adminToken(c), ip)}` })
  if (!success) fail(429, 'rate_limited', 'Too many login attempts, try again later')

  const body = await c.req.json().catch(() => ({}))
  if (typeof body.token !== 'string' || !(await safeEqual(body.token, adminToken(c)))) {
    fail(401, 'unauthorized', 'Invalid admin token')
  }
  await setSignedCookie(c, ADMIN_COOKIE, 'admin', adminToken(c), {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/',
    maxAge: 7 * 86400
  })
  return c.json({ ok: true })
})

admin.post('/logout', (c) => {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

admin.use('*', requireAuth('admin'))

admin.get('/me', (c) => c.json({ kind: 'admin' }))

admin.get('/keys', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, key_prefix, app, scope, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC'
  ).all()
  return c.json({ items: results })
})

admin.post('/keys', async (c) => {
  const body = await c.req.json().catch(() => fail(400, 'invalid_json', 'Malformed JSON body'))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) fail(400, 'invalid_field', 'name is required (max 100 characters)')
  const app = body.app ? String(body.app) : null
  if (app && !APP_SLUG.test(app)) fail(400, 'invalid_field', `app must match ${APP_SLUG}`)
  const scope = body.scope ?? 'read'
  if (scope !== 'read' && scope !== 'write') fail(400, 'invalid_field', 'scope must be read or write')

  const key = newApiKey()
  const row = { id: ulid(), name, key_prefix: key.slice(0, 10), app, scope, created_at: Date.now() }
  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, name, key_hash, key_prefix, app, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(row.id, name, await sha256Hex(key), row.key_prefix, app, scope, row.created_at)
    .run()
  return c.json({ ...row, key, last_used_at: null, revoked_at: null }, 201)
})

admin.post('/keys/:id/revoke', async (c) => {
  const res = await c.env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(Date.now(), c.req.param('id'))
    .run()
  if (!res.meta.changes) fail(404, 'not_found', 'Key not found or already revoked')
  return c.json({ ok: true })
})

admin.get('/apps', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM apps ORDER BY slug').all<AppRow>()
  return c.json({ items: results.map(appRowToJson) })
})

function optInt(v: unknown, name: string, min: number, max: number): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(400, 'invalid_field', `${name} must be an integer between ${min} and ${max}`)
  return n
}

admin.put('/apps/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!APP_SLUG.test(slug)) fail(400, 'invalid_app', `slug must match ${APP_SLUG}`)
  const b = await c.req.json().catch(() => fail(400, 'invalid_json', 'Malformed JSON body'))

  const name = b.name ? String(b.name).trim().slice(0, 100) : null
  const status = b.status ?? 'active'
  if (status !== 'active' && status !== 'disabled') fail(400, 'invalid_field', 'status must be active or disabled')

  const origins = b.allowed_origins ?? []
  if (!Array.isArray(origins) || origins.length > 50) fail(400, 'invalid_field', 'allowed_origins must be an array (max 50)')
  const normOrigins = origins.map((o: unknown) => {
    try {
      const u = new URL(String(o))
      if (u.origin === 'null') throw 0
      return u.origin
    } catch {
      fail(400, 'invalid_field', `Invalid origin: ${String(o)}`)
    }
  })

  let mime: string[] | null = null
  if (b.allowed_mime !== undefined && b.allowed_mime !== null) {
    if (!Array.isArray(b.allowed_mime) || !b.allowed_mime.every((m: unknown) => typeof m === 'string' && MIME.test(m)))
      fail(400, 'invalid_field', 'allowed_mime must be an array of MIME types such as image/png or image/*')
    mime = b.allowed_mime
  }

  const now = Date.now()
  const row = await c.env.DB.prepare(
    `INSERT INTO apps (slug, name, allowed_origins, max_files, max_file_bytes, allowed_mime, retention_days, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, allowed_origins = excluded.allowed_origins, max_files = excluded.max_files, max_file_bytes = excluded.max_file_bytes,
       allowed_mime = excluded.allowed_mime, retention_days = excluded.retention_days, status = excluded.status, updated_at = excluded.updated_at
     RETURNING *`
  )
    .bind(
      slug,
      name,
      JSON.stringify([...new Set(normOrigins)]),
      optInt(b.max_files, 'max_files', 0, 20),
      optInt(b.max_file_bytes, 'max_file_bytes', 1, MAX_UPLOAD_BYTES),
      mime ? JSON.stringify(mime) : null,
      optInt(b.retention_days, 'retention_days', 1, 36500),
      status,
      now,
      now
    )
    .first<AppRow>()
  return c.json(appRowToJson(row!))
})

admin.delete('/apps/:slug', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM apps WHERE slug = ?').bind(c.req.param('slug')).run()
  if (!res.meta.changes) fail(404, 'not_found', 'App config not found')
  return c.body(null, 204)
})

export default admin
