export function fmtTime(ms: number | null | undefined, lang: string): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(ms)
}

export function fmtShortTime(ms: number, lang: string): string {
  const sameYear = new Date(ms).getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: sameYear ? undefined : 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(ms)
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const join = (...parts: (string | number | null | undefined)[]) => parts.filter((p) => p !== null && p !== undefined && p !== '').join(' ')
