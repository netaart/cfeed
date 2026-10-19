import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from '../types'
import { APP_SLUG, domainAllowed, loadAppConfig, mimeAllowed } from '../lib/config'
import { requestContext } from '../lib/context'
import { extraIndexEntries, parseExtra } from '../lib/extra'
import { ApiError, fail, intVar } from '../lib/http'
import { hmacHex, ulid } from '../lib/id'

const submit = new Hono<AppEnv>()

submit.on(['POST', 'OPTIONS'], '/feedback', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Content-Type'], maxAge: 86400 }))

type Input = Record<string, unknown>
const FIELDS = new Set(['app', 'content', 'extra', 'website'])

function optString(input: Input, key: string, max: number): string | null {
  const v = input[key]
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string') fail(400, 'invalid_field', `${key} must be a string`)
  const s = v.trim()
  if (s.length > max) fail(400, 'invalid_field', `${key} exceeds ${max} characters`)
  return s || null
}

function cleanFilename(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(-200) || 'file'
}

submit.post('/feedback', async (c) => {
  const env = c.env
  const salt = env.IP_SALT
  if (!salt) fail(500, 'misconfigured', 'IP_SALT secret is not set (wrangler secret put IP_SALT)')

  // Limit before reading the body so abusive clients cannot make us buffer large uploads.
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip') ?? 'unknown'
  const { success } = await env.SUBMIT_LIMITER.limit({ key: `submit:${await hmacHex(salt, ip)}` })
  if (!success) fail(429, 'rate_limited', 'Too many submissions, try again later')

  const ct = c.req.header('content-type') ?? ''
  let input: Input
  let files: File[] = []
  if (ct.startsWith('multipart/form-data') || ct.startsWith('application/x-www-form-urlencoded')) {
    let form: FormData
    try {
      form = await c.req.raw.formData()
    } catch {
      fail(400, 'invalid_body', 'Malformed form data')
    }
    input = {}
    for (const [k, v] of form.entries()) if (typeof v === 'string' && k !== 'files') input[k] = v
    files = form.getAll('files').filter((f): f is File => typeof f !== 'string' && f.size > 0)
  } else if (ct.startsWith('application/json')) {
    const body = await c.req.json().catch(() => fail(400, 'invalid_json', 'Malformed JSON body'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json', 'Body must be a JSON object')
    input = body as Input
  } else {
    fail(415, 'unsupported_media_type', 'Use application/json or multipart/form-data')
  }

  const unknown = Object.keys(input).find((k) => !FIELDS.has(k))
  if (unknown) fail(400, 'unknown_field', `Unknown field "${unknown}": put app-specific data in extra, e.g. extra.${unknown}`)

  const app = optString(input, 'app', 64) ?? c.req.query('app') ?? 'default'
  if (!APP_SLUG.test(app)) fail(400, 'invalid_app', `app must match ${APP_SLUG}`)

  const now = Date.now()
  const id = ulid(now)
  if (typeof input.website === 'string' && input.website) {
    return c.json({ id, app, created_at: now, attachments: [] }, 201)
  }

  const cfg = await loadAppConfig(env, app)
  if (cfg.status === 'disabled') fail(403, 'app_disabled', `app "${app}" is not accepting feedback`)
  // Only browser requests carry Origin; servers and native clients without it are not restricted.
  const origin = c.req.header('origin')
  if (origin && cfg.allowedDomains.length && !domainAllowed(origin, cfg.allowedDomains)) {
    fail(403, 'origin_not_allowed', `Origin ${origin} is not allowed for app "${app}"`)
  }

  const maxContent = intVar(env.MAX_CONTENT_CHARS, 10000)
  const content = optString(input, 'content', maxContent)
  if (!content) fail(400, 'invalid_field', 'content is required')

  const extra = parseExtra(input.extra, intVar(env.MAX_EXTRA_BYTES, 16384))
  const extraIndex = extraIndexEntries(extra)

  if (files.length > cfg.maxFiles) fail(400, 'too_many_files', `At most ${cfg.maxFiles} files allowed`)
  for (const f of files) {
    if (f.size > cfg.maxFileBytes) fail(413, 'file_too_large', `${f.name} exceeds ${cfg.maxFileBytes} bytes`)
    if (!mimeAllowed(f.type || 'application/octet-stream', cfg.allowedMime)) {
      fail(415, 'file_type_not_allowed', `${f.name}: ${f.type || 'unknown type'} is not allowed`)
    }
  }

  const ctx = await requestContext(c.req.raw, salt)
  const attachments = files.map((f) => {
    const attId = ulid(now)
    return {
      id: attId,
      file: f,
      r2_key: `${app}/${id}/${attId}`,
      filename: cleanFilename(f.name),
      content_type: f.type || 'application/octet-stream'
    }
  })

  const stored: string[] = []
  try {
    await Promise.all(
      attachments.map(async (a) => {
        await env.BUCKET.put(a.r2_key, a.file, {
          httpMetadata: { contentType: a.content_type },
          customMetadata: { feedback_id: id, filename: a.filename }
        })
        stored.push(a.r2_key)
      })
    )
  } catch (err) {
    if (stored.length) await env.BUCKET.delete(stored)
    console.error('r2 put failed', err)
    fail(502, 'storage_error', 'Failed to store attachments')
  }

  const row = {
    id,
    app,
    content,
    extra: JSON.stringify(extra),
    ...ctx,
    attachment_count: attachments.length,
    created_at: now,
    updated_at: now
  }
  const cols = Object.keys(row)
  const stmts = [
    env.DB.prepare(`INSERT INTO feedback (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(
      ...Object.values(row)
    ),
    ...(extraIndex.length
      ? [
          env.DB.prepare(
            "INSERT OR IGNORE INTO feedback_extra (path, value, feedback_id) SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), ? FROM json_each(?) j"
          ).bind(id, JSON.stringify(extraIndex))
        ]
      : []),
    ...attachments.map((a) =>
      env.DB.prepare(
        'INSERT INTO attachments (id, feedback_id, r2_key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(a.id, id, a.r2_key, a.filename, a.content_type, a.file.size, now)
    )
  ]
  try {
    await env.DB.batch(stmts)
  } catch (err) {
    if (stored.length) await env.BUCKET.delete(stored)
    if (err instanceof ApiError) throw err
    console.error('d1 insert failed', err)
    fail(500, 'db_error', 'Failed to save feedback')
  }

  return c.json(
    {
      id,
      app,
      created_at: now,
      attachments: attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.file.size }))
    },
    201
  )
})

export default submit
