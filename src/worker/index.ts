import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './types'
import { ApiError } from './lib/http'
import admin from './routes/admin'
import query from './routes/query'
import submit from './routes/submit'
import skill from '../../skills/cfeed/SKILL.md?raw'

const app = new Hono<AppEnv>()

app.get('/', (c) => c.json({ service: 'cfeed', repository: 'https://github.com/netaart/cfeed' }))

app.get('/skill.md', (c) =>
  c.body(skill, 200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300' })
)

app.route('/api/v1', submit)
app.route('/api/v1', query)
app.route('/api/admin', admin)

app.notFound((c) => c.json({ error: { code: 'not_found', message: `No route for ${c.req.method} ${c.req.path}` } }, 404))

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message } }, err.status)
  if (err instanceof HTTPException) return c.json({ error: { code: 'http_error', message: err.message } }, err.status)
  console.error(err)
  return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500)
})

export default app
