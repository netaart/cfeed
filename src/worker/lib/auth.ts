import type { Context, MiddlewareHandler } from 'hono'
import { getSignedCookie } from 'hono/cookie'
import type { AppEnv, Auth } from '../types'
import { fail } from './http'
import { safeEqual, sha256Hex } from './id'

export const ADMIN_COOKIE = 'cfeed_admin'
const TOUCH_INTERVAL_MS = 60 * 60 * 1000

export function adminToken(c: Context<AppEnv>): string {
  const token = c.env.ADMIN_TOKEN
  if (!token) fail(500, 'misconfigured', 'ADMIN_TOKEN secret is not set (wrangler secret put ADMIN_TOKEN)')
  return token
}

type KeyRow = { id: string; name: string; app: string | null; scope: 'read' | 'write'; last_used_at: number | null }

async function activeKey(c: Context<AppEnv>, column: 'key_hash' | 'id', value: string): Promise<Auth | null> {
  const row = await c.env.DB.prepare(`SELECT id, name, app, scope, last_used_at FROM api_keys WHERE ${column} = ? AND revoked_at IS NULL`)
    .bind(value)
    .first<KeyRow>()
  if (!row) return null
  const now = Date.now()
  if (!row.last_used_at || now - row.last_used_at > TOUCH_INTERVAL_MS) {
    c.executionCtx.waitUntil(c.env.DB.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(now, row.id).run())
  }
  return { kind: 'key', id: row.id, name: row.name, app: row.app, scope: row.scope }
}

/** Resolves a raw credential (ADMIN_TOKEN or ck_ key) to an identity. */
export async function credentialAuth(c: Context<AppEnv>, credential: string): Promise<Auth | null> {
  if (await safeEqual(credential, adminToken(c))) return { kind: 'admin' }
  return credential.startsWith('ck_') ? activeKey(c, 'key_hash', await sha256Hex(credential)) : null
}

// The session cookie holds "admin" or "key:<id>", signed with ADMIN_TOKEN. Key sessions are re-checked
// against api_keys on every request, so revoking a key ends its console sessions immediately.
export const sessionValue = (auth: Auth) => (auth.kind === 'admin' ? 'admin' : `key:${auth.id}`)

async function resolveAuth(c: Context<AppEnv>): Promise<Auth | null> {
  const bearer = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) return credentialAuth(c, bearer)
  const session = await getSignedCookie(c, adminToken(c), ADMIN_COOKIE)
  if (session === 'admin') return { kind: 'admin' }
  if (typeof session === 'string' && session.startsWith('key:')) return activeKey(c, 'id', session.slice(4))
  return null
}

export function requireAuth(level: 'read' | 'write' | 'admin'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = await resolveAuth(c)
    if (!auth) fail(401, 'unauthorized', 'Missing or invalid credentials (Authorization: Bearer <ck_… | ADMIN_TOKEN>)')
    if (auth.kind === 'key') {
      if (level === 'admin') fail(403, 'forbidden', 'This endpoint requires ADMIN_TOKEN')
      if (level === 'write' && auth.scope !== 'write') fail(403, 'forbidden', 'This key is read-only')
    }
    c.set('auth', auth)
    await next()
  }
}

export function pinnedApp(auth: Auth): string | null {
  return auth.kind === 'key' ? auth.app : null
}
