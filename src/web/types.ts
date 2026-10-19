export type Status = 'open' | 'resolved' | 'spam'
export type Mark = Exclude<Status, 'open'>
export const STATUSES: Status[] = ['open', 'resolved', 'spam']
export const MARKS: Mark[] = ['resolved', 'spam']

export type Feedback = {
  id: string
  app: string
  content: string
  status: Status
  tags: string[]
  extra: Record<string, unknown>
  note: string | null
  ua: string | null
  ua_browser: string | null
  ua_browser_version: string | null
  ua_os: string | null
  ua_os_version: string | null
  ua_device: string | null
  client_hints: Record<string, string> | null
  ip_hash: string | null
  country: string | null
  region: string | null
  city: string | null
  timezone: string | null
  asn: number | null
  colo: string | null
  language: string | null
  referer: string | null
  origin: string | null
  attachment_count: number
  created_at: number
  updated_at: number
}

export type Attachment = { id: string; filename: string; content_type: string; size: number; url: string }
export type FeedbackDetail = Feedback & { attachments: Attachment[] }

export type AppSummary = {
  app: string
  name: string | null
  count: number
  last_at: number | null
  registered: boolean
  status: 'active' | 'disabled'
}

export type AppConfig = {
  slug: string
  name: string | null
  allowed_domains: string[]
  max_files: number | null
  max_file_bytes: number | null
  allowed_mime: string[] | null
  status: 'active' | 'disabled'
}

export type ApiKey = {
  id: string
  name: string
  key_prefix: string
  app: string | null
  scope: 'read' | 'write'
  created_at: number
  last_used_at: number | null
  revoked_at: number | null
  key?: string
}

export type Stats = {
  total: number
  by_status: Partial<Record<Status, number>>
  daily: { date: string; count: number }[]
}
