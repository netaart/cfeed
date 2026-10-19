import { fail } from './http'

export const FIELD_TYPES = ['string', 'number', 'boolean', 'enum', 'object', 'array'] as const
export type FieldDef = {
  name: string
  type: (typeof FIELD_TYPES)[number]
  required?: boolean
  values?: string[]
}

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const MAX_DEPTH = 5

function depth(v: unknown): number {
  if (v === null || typeof v !== 'object') return 0
  const children = Array.isArray(v) ? v : Object.values(v)
  return 1 + children.reduce<number>((m, c) => Math.max(m, depth(c)), 0)
}

function typeOk(def: FieldDef, v: unknown): boolean {
  switch (def.type) {
    case 'string': return typeof v === 'string'
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'boolean': return typeof v === 'boolean'
    case 'enum': return typeof v === 'string' && !!def.values?.includes(v)
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v)
    case 'array': return Array.isArray(v)
  }
}

export function validateExtra(raw: unknown, defs: FieldDef[], strict: boolean, maxBytes: number): Record<string, unknown> {
  let extra = raw ?? {}
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra)
    } catch {
      fail(400, 'invalid_extra', 'extra must be a JSON object')
    }
  }
  if (extra === null || typeof extra !== 'object' || Array.isArray(extra)) fail(400, 'invalid_extra', 'extra must be a JSON object')
  const obj = extra as Record<string, unknown>

  if (new TextEncoder().encode(JSON.stringify(obj)).length > maxBytes) fail(413, 'extra_too_large', `extra exceeds ${maxBytes} bytes`)
  if (depth(obj) > MAX_DEPTH) fail(400, 'invalid_extra', `extra nesting exceeds depth ${MAX_DEPTH}`)

  for (const def of defs) {
    const v = obj[def.name]
    if (v === undefined || v === null) {
      if (def.required) fail(400, 'invalid_extra', `extra.${def.name} is required`)
      continue
    }
    if (!typeOk(def, v)) {
      const expect = def.type === 'enum' ? `one of ${def.values?.join(', ')}` : def.type
      fail(400, 'invalid_extra', `extra.${def.name} must be ${expect}`)
    }
  }
  if (strict) {
    const known = new Set(defs.map((d) => d.name))
    const unknown = Object.keys(obj).filter((k) => !known.has(k))
    if (unknown.length) fail(400, 'invalid_extra', `undeclared extra fields: ${unknown.join(', ')}`)
  }
  return obj
}

export function validateFieldDefs(raw: unknown): FieldDef[] {
  if (!Array.isArray(raw)) fail(400, 'invalid_fields', 'fields must be an array')
  if (raw.length > 50) fail(400, 'invalid_fields', 'at most 50 fields')
  const seen = new Set<string>()
  return raw.map((d, i): FieldDef => {
    const at = `fields[${i}]`
    if (!d || typeof d !== 'object') fail(400, 'invalid_fields', `${at} must be an object`)
    const { name, type, required, values } = d as Record<string, unknown>
    if (typeof name !== 'string' || !FIELD_NAME.test(name)) fail(400, 'invalid_fields', `${at}.name must match ${FIELD_NAME}`)
    if (seen.has(name)) fail(400, 'invalid_fields', `duplicate field ${name}`)
    seen.add(name)
    if (!FIELD_TYPES.includes(type as FieldDef['type'])) fail(400, 'invalid_fields', `${at}.type must be one of ${FIELD_TYPES.join(', ')}`)
    const def: FieldDef = { name, type: type as FieldDef['type'] }
    if (required !== undefined) def.required = !!required
    if (type === 'enum') {
      if (!Array.isArray(values) || !values.length || !values.every((v) => typeof v === 'string'))
        fail(400, 'invalid_fields', `${at}.values must be a non-empty string array`)
      def.values = values as string[]
    }
    return def
  })
}
