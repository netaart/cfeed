const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const enc = new TextEncoder()

export function ulid(now = Date.now()): string {
  let time = ''
  for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) time = B32[t % 32] + time
  let rand = ''
  for (const b of crypto.getRandomValues(new Uint8Array(16))) rand += B32[b % 32]
  return time + rand
}

export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return 'ck_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(input: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(input)))
}

export async function hmacHex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(input)))
}

// Hash first so both buffers have equal length, as timingSafeEqual requires.
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ])
  return crypto.subtle.timingSafeEqual(ha, hb)
}
