import { fail } from './http'

const SEGMENT = /^[A-Za-z0-9_]+$/
export const MAX_PATH_SEGMENTS = 5
const MAX_INDEXED_VALUE = 256
const MAX_INDEXED_ENTRIES = 256

export function parseExtra(raw: unknown, maxBytes: number): Record<string, unknown> {
  let extra = raw ?? {}
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra)
    } catch {
      fail(400, 'invalid_extra', 'extra must be a JSON object')
    }
  }
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) fail(400, 'invalid_extra', 'extra must be a JSON object')
  if (new TextEncoder().encode(JSON.stringify(extra)).length > maxBytes) fail(413, 'extra_too_large', `extra exceeds ${maxBytes} bytes`)
  return extra as Record<string, unknown>
}

// Leaves outside these limits are still stored in extra, just not filterable via x.<path>.
export function extraIndexEntries(extra: Record<string, unknown>): [string, string][] {
  const seen = new Set<string>()
  const out: [string, string][] = []
  const walk = (v: unknown, path: string[]) => {
    if (out.length >= MAX_INDEXED_ENTRIES) return
    if (Array.isArray(v)) {
      for (const el of v) if (el === null || typeof el !== 'object') walk(el, path)
    } else if (v !== null && typeof v === 'object') {
      if (path.length >= MAX_PATH_SEGMENTS) return
      for (const [k, child] of Object.entries(v)) if (SEGMENT.test(k)) walk(child, [...path, k])
    } else if (path.length) {
      const p = path.join('.')
      const text = JSON.stringify(v)
      if (text === undefined || text.length > MAX_INDEXED_VALUE || seen.has(p + '\0' + text)) return
      seen.add(p + '\0' + text)
      out.push([p, text])
    }
  }
  walk(extra, [])
  return out
}
