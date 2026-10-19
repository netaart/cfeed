import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from './types'
import { ApiError } from './lib/http'
import admin from './routes/admin'
import query from './routes/query'
import submit from './routes/submit'

const app = new Hono<AppEnv>()

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
