import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export function fail(status: ContentfulStatusCode, code: string, message: string): never {
  throw new ApiError(status, code, message)
}

export function intVar(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}
