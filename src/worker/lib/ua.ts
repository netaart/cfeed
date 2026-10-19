export type ParsedUA = {
  browser: string | null
  browserVersion: string | null
  os: string | null
  osVersion: string | null
  device: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'cli' | 'unknown'
}

// Real crawlers and headless browsers only. HTTP libraries used by apps and scripts are not bots.
const BOT = /(?:bot|crawler|spider|slurp)(?:[\/;\s)_-]|$)|headless|facebookexternalhit|lighthouse|pingdom|uptimerobot/i
const NOT_BOT = /cubot/i

const CLI: [string, RegExp][] = [
  ['curl', /^curl\/([\d.]+)/i],
  ['Wget', /^wget\/([\d.]+)/i],
  ['HTTPie', /^httpie\/([\d.]+)/i],
  ['python-requests', /python-requests\/([\d.]+)/i],
  ['httpx', /python-httpx\/([\d.]+)/i],
  ['aiohttp', /aiohttp\/([\d.]+)/i],
  ['Python', /python-urllib\/([\d.]+)/i],
  ['Go', /go-http-client\/([\d.]+)/i],
  ['node-fetch', /node-fetch(?:\/([\d.]+))?/i],
  ['axios', /axios\/([\d.]+)/i],
  ['Node.js', /^(?:node|undici)(?:\/([\d.]+))?$/i],
  ['Postman', /postmanruntime\/([\d.]+)/i],
  ['Insomnia', /insomnia\/([\d.]+)/i],
  ['Java', /^java\/([\d.]+)/i],
  ['Apache HttpClient', /apache-httpclient\/([\d.]+)/i]
]

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
  ['Safari', /Version\/([\d.]+).*Safari/],
  ['OkHttp', /^okhttp\/([\d.]+)/i]
]

const OSES: [string, RegExp][] = [
  ['HarmonyOS', /(?:OpenHarmony|HarmonyOS)[\s/]?([\d.]*)/],
  ['iPadOS', /iPad.*?OS ([\d_.]+)/],
  ['iOS', /(?:iPhone|iPod).*?OS ([\d_.]+)/],
  ['Android', /Android ?([\d.]*)/],
  ['Windows', /Windows NT ([\d.]+)/],
  ['ChromeOS', /CrOS \S+ ([\d.]+)/],
  ['macOS', /Mac OS X ?([\d_.]*)/],
  ['Linux', /Linux()/],
  // Native Apple apps (NSURLSession): iOS and macOS send the same shape, so only Darwin is known.
  ['Darwin', /CFNetwork\/[\d.]+ Darwin\/([\d.]+)/]
]

// Apps that set their own UA, e.g. "CohubMobile/1.2.3 (Android 14; Pixel 8)".
const PRODUCT = /^([A-Za-z][\w.-]{0,40})\/(\d[\w.]*)/

const major = (v: string | undefined) => (v ? v.replace(/_/g, '.').split('.').slice(0, 2).join('.') || null : null)
const isBrowser = (ua: string) => /^Mozilla\//.test(ua)

export function parseUA(ua: string | null, mobileHint?: string | null): ParsedUA {
  if (!ua) return { browser: null, browserVersion: null, os: null, osVersion: null, device: 'unknown' }

  const cli = CLI.find(([, re]) => re.test(ua))
  let browser: string | null = null
  let browserVersion: string | null = null
  const b = cli ?? BROWSERS.find(([, re]) => re.test(ua))
  if (b) {
    browser = b[0]
    browserVersion = major(ua.match(b[1])?.[1])
  } else if (!isBrowser(ua)) {
    const m = ua.match(PRODUCT)
    if (m) [browser, browserVersion] = [m[1], major(m[2])]
  }

  const o = OSES.find(([, re]) => re.test(ua))
  let os = o?.[0] ?? null
  if (!os && browser === 'OkHttp') os = 'Android'

  let device: ParsedUA['device'] = 'unknown'
  if (BOT.test(ua) && !NOT_BOT.test(ua)) device = 'bot'
  else if (cli) device = 'cli'
  else if (/iPad|Tablet/i.test(ua) || (os === 'Android' && isBrowser(ua) && !/Mobile/.test(ua))) device = 'tablet'
  else if (mobileHint === '?1' || /Mobi|iPhone|iPod/.test(ua) || os === 'Android' || os === 'HarmonyOS' || os === 'iOS') device = 'mobile'
  else if (os && os !== 'Darwin') device = 'desktop'

  return { browser, browserVersion, os, osVersion: o ? major(ua.match(o[1])?.[1]) : null, device }
}
