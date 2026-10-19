export type ParsedUA = {
  browser: string | null
  browserVersion: string | null
  os: string | null
  osVersion: string | null
  device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown'
}

const BOT = /bot|crawl|spider|slurp|curl\/|wget|python-requests|httpx|aiohttp|go-http-client|okhttp|node-fetch|axios|undici|postman|insomnia|headless/i

const BROWSERS: [string, RegExp][] = [
  ['WeChat', /MicroMessenger\/([\d.]+)/],
  ['Feishu', /(?:Lark|Feishu)\/([\d.]+)/],
  ['DingTalk', /DingTalk\/([\d.]+)/],
  ['QQ', /(?:\sQQ|MQQBrowser)\/([\d.]+)/],
  ['Electron', /Electron\/([\d.]+)/],
  ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['UC Browser', /UCBrowser\/([\d.]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari/]
]

const OSES: [string, RegExp][] = [
  ['HarmonyOS', /(?:OpenHarmony|HarmonyOS)[\s/]?([\d.]*)/],
  ['iPadOS', /iPad.*?OS ([\d_]+)/],
  ['iOS', /(?:iPhone|iPod).*?OS ([\d_]+)/],
  ['Android', /Android ?([\d.]*)/],
  ['Windows', /Windows NT ([\d.]+)/],
  ['ChromeOS', /CrOS \S+ ([\d.]+)/],
  ['macOS', /Mac OS X ?([\d_.]*)/],
  ['Linux', /Linux()/]
]

const major = (v: string | undefined) => (v ? v.replace(/_/g, '.').split('.').slice(0, 2).join('.') || null : null)

export function parseUA(ua: string | null, mobileHint?: string | null): ParsedUA {
  if (!ua) return { browser: null, browserVersion: null, os: null, osVersion: null, device: 'unknown' }

  const b = BROWSERS.find(([, re]) => re.test(ua))
  const o = OSES.find(([, re]) => re.test(ua))

  let device: ParsedUA['device'] = 'unknown'
  if (BOT.test(ua)) device = 'bot'
  else if (/iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'tablet'
  else if (mobileHint === '?1' || /Mobi|iPhone|iPod|Android/.test(ua)) device = 'mobile'
  else if (o) device = 'desktop'

  return {
    browser: b?.[0] ?? null,
    browserVersion: b ? major(ua.match(b[1])?.[1]) : null,
    os: o?.[0] ?? null,
    osVersion: o ? major(ua.match(o[1])?.[1]) : null,
    device
  }
}
