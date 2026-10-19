import { hmacHex } from './id'
import { parseUA } from './ua'

const cut = (v: string | null | undefined, n: number) => (v ? v.slice(0, n) : null)

export async function requestContext(req: Request, ipSalt: string) {
  const h = req.headers
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf
  const ua = cut(h.get('user-agent'), 1024)
  const parsed = parseUA(ua, h.get('sec-ch-ua-mobile'))

  const hints: Record<string, string> = {}
  for (const name of ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform']) {
    const v = h.get(name)
    if (v) hints[name] = v.slice(0, 256)
  }

  const ip = h.get('cf-connecting-ip') ?? h.get('x-real-ip')
  return {
    ua,
    ua_browser: parsed.browser,
    ua_browser_version: parsed.browserVersion,
    ua_os: parsed.os,
    ua_os_version: parsed.osVersion,
    ua_device: parsed.device,
    client_hints: Object.keys(hints).length ? JSON.stringify(hints) : null,
    ip_hash: ip ? (await hmacHex(ipSalt, ip)).slice(0, 32) : null,
    country: (cf?.country as string | undefined) ?? null,
    region: cf?.region ?? null,
    city: cf?.city ?? null,
    timezone: cf?.timezone ?? null,
    asn: cf?.asn ?? null,
    colo: cf?.colo ?? null,
    language: cut(h.get('accept-language')?.split(',')[0]?.trim(), 35),
    referer: cut(h.get('referer'), 2048),
    origin: cut(h.get('origin'), 256)
  }
}
