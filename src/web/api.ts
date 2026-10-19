export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export const UNAUTHORIZED_EVENT = 'cfeed:unauthorized'

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new HttpError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? `HTTP ${res.status}`)
  }
  return data as T
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
