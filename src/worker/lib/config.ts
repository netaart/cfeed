import type { Bindings } from '../types'
import { intVar } from './http'

export const APP_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/

export type AppRow = {
  slug: string
  name: string | null
  allowed_origins: string
  max_files: number | null
  max_file_bytes: number | null
  allowed_mime: string | null
  retention_days: number | null
  status: 'active' | 'disabled'
  created_at: number
  updated_at: number
}

export type AppConfig = {
  slug: string
  registered: boolean
  status: 'active' | 'disabled'
  allowedOrigins: string[]
  maxFiles: number
  maxFileBytes: number
  allowedMime: string[]
}

export function defaultMime(env: Bindings): string[] {
  return env.DEFAULT_ALLOWED_MIME.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function loadAppConfig(env: Bindings, slug: string): Promise<AppConfig> {
  const row = await env.DB.prepare('SELECT * FROM apps WHERE slug = ?').bind(slug).first<AppRow>()
  return {
    slug,
    registered: !!row,
    status: row?.status ?? 'active',
    allowedOrigins: row ? JSON.parse(row.allowed_origins) : [],
    maxFiles: row?.max_files ?? intVar(env.DEFAULT_MAX_FILES, 5),
    maxFileBytes: row?.max_file_bytes ?? intVar(env.DEFAULT_MAX_FILE_BYTES, 10 * 1024 * 1024),
    allowedMime: row?.allowed_mime ? JSON.parse(row.allowed_mime) : defaultMime(env)
  }
}

export function appRowToJson(row: AppRow) {
  return {
    ...row,
    allowed_origins: JSON.parse(row.allowed_origins) as string[],
    allowed_mime: row.allowed_mime ? (JSON.parse(row.allowed_mime) as string[]) : null
  }
}

export function mimeAllowed(type: string, allowed: string[]): boolean {
  return allowed.some((a) => a === type || (a.endsWith('/*') && type.startsWith(a.slice(0, -1))))
}
