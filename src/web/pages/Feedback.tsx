import { ArrowsRotateRight, Paperclip } from '@gravity-ui/icons'
import { Alert, Button, Card, Chip, Input, Label, SearchField, Spinner, Table, TextField } from '@heroui/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { fmtTime, join } from '../format'
import { useT } from '../i18n'
import { STATUSES, type AppSummary, type Feedback, type Stats } from '../types'
import { SimpleSelect, StatusChip } from '../ui'
import { FeedbackDetailModal } from './FeedbackDetail'

const ALL = '__all'
const EVERYTHING = '__everything'
const PAGE = 50

type Filters = { app: string; status: string; type: string; q: string; x: string }

function buildQuery(f: Filters, cursor?: string | null): string {
  const p = new URLSearchParams()
  if (f.app !== ALL) p.set('app', f.app)
  if (f.status === EVERYTHING) p.set('status', STATUSES.join(','))
  else if (f.status !== ALL) p.set('status', f.status)
  if (f.type !== ALL) p.set('type', f.type)
  if (f.q) p.set('q', f.q)
  for (const pair of f.x.split(/\s+/).filter(Boolean)) {
    const i = pair.indexOf('=')
    if (i > 0) p.set(`x.${pair.slice(0, i)}`, pair.slice(i + 1))
  }
  if (cursor) p.set('cursor', cursor)
  p.set('limit', String(PAGE))
  return p.toString()
}

export function FeedbackPage() {
  const { t, lang } = useT()
  const [filters, setFilters] = useState<Filters>({ app: ALL, status: ALL, type: ALL, q: '', x: '' })
  const [qDraft, setQDraft] = useState('')
  const [xDraft, setXDraft] = useState('')
  const [apps, setApps] = useState<AppSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<Feedback[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  const load = useCallback(
    async (more = false) => {
      setLoading(true)
      setError(null)
      try {
        const res = await api<{ items: Feedback[]; next_cursor: string | null }>(
          `/api/v1/feedback?${buildQuery(filters, more ? cursor : null)}`
        )
        setItems((prev) => (more ? [...prev, ...res.items] : res.items))
        setCursor(res.next_cursor)
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setLoading(false)
      }
    },
    [filters, cursor]
  )

  const loadStats = useCallback(() => {
    const qs = filters.app === ALL ? '' : `?app=${encodeURIComponent(filters.app)}`
    api<Stats>(`/api/v1/stats${qs}`).then(setStats, () => setStats(null))
  }, [filters.app])

  useEffect(() => void load(false), [filters])
  useEffect(loadStats, [loadStats])
  useEffect(() => {
    api<{ items: AppSummary[] }>('/api/v1/apps').then((r) => setApps(r.items), () => {})
  }, [])

  const applyText = (e?: FormEvent) => {
    e?.preventDefault()
    set({ q: qDraft.trim(), x: xDraft.trim() })
    loadStats()
  }

  const onChanged = (fb: Feedback) => {
    setItems((prev) => prev.map((i) => (i.id === fb.id ? fb : i)))
    loadStats()
  }
  const onDeleted = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setSelected(null)
    loadStats()
  }

  const statCards = [
    { label: t('fb.total'), value: stats?.total },
    ...(['open', 'in_progress', 'resolved', 'spam'] as const).map((s) => ({ label: t(`status.${s}`), value: stats?.by_status[s] ?? 0 }))
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statCards.map((c) => (
          <Card key={c.label} className="gap-1 p-4">
            <div className="text-xs text-muted">{c.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{c.value ?? '—'}</div>
          </Card>
        ))}
      </div>

      <form onSubmit={applyText} className="flex flex-wrap items-end gap-3">
        <SimpleSelect
          className="w-44"
          label={t('fb.app')}
          value={filters.app}
          onChange={(app) => set({ app, type: ALL })}
          options={[{ id: ALL, label: t('common.all') }, ...apps.map((a) => ({ id: a.app, label: a.name ? `${a.name} (${a.app})` : a.app }))]}
        />
        <SimpleSelect
          className="w-44"
          label={t('fb.status')}
          value={filters.status}
          onChange={(status) => set({ status })}
          options={[
            { id: ALL, label: t('status.hideSpam') },
            ...STATUSES.map((s) => ({ id: s, label: t(`status.${s}`) })),
            { id: EVERYTHING, label: t('status.everything') }
          ]}
        />
        <SimpleSelect
          className="w-36"
          label={t('fb.type')}
          value={filters.type}
          onChange={(type) => set({ type })}
          options={[{ id: ALL, label: t('common.all') }, ...Object.keys(stats?.by_type ?? {}).map((k) => ({ id: k, label: k }))]}
        />
        <SearchField
          className="w-56"
          value={qDraft}
          onChange={setQDraft}
          onClear={() => set({ q: '' })}
        >
          <Label>{t('fb.search')}</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <TextField className="w-60" value={xDraft} onChange={setXDraft}>
          <Label>{t('fb.extraFilter')}</Label>
          <Input placeholder={t('fb.extraFilterHint')} className="font-mono" />
        </TextField>
        <Button type="submit" variant="secondary" isIconOnly aria-label={t('action.refresh')}>
          <ArrowsRotateRight />
        </Button>
      </form>

      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}

      <Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t('nav.feedback')} className="min-w-[960px]" onRowAction={(key) => setSelected(String(key))}>
            <Table.Header>
              <Table.Column isRowHeader>{t('fb.content')}</Table.Column>
              <Table.Column>{t('fb.app')}</Table.Column>
              <Table.Column>{t('fb.status')}</Table.Column>
              <Table.Column>{t('fb.device')}</Table.Column>
              <Table.Column>{t('fb.location')}</Table.Column>
              <Table.Column>{t('fb.time')}</Table.Column>
            </Table.Header>
            <Table.Body
              items={items}
              renderEmptyState={() => (
                <div className="py-14 text-center text-sm text-muted">{loading ? <Spinner /> : t('fb.empty')}</div>
              )}
            >
              {(fb) => (
                <Table.Row id={fb.id} className="cursor-pointer">
                  <Table.Cell>
                    <div className="flex max-w-lg flex-col gap-1">
                      <span className="line-clamp-2 text-sm">{fb.content}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Chip size="sm" variant="secondary">
                          {fb.type}
                        </Chip>
                        {fb.attachment_count > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Paperclip className="size-3" />
                            {fb.attachment_count}
                          </span>
                        )}
                        {fb.tags.map((tag) => (
                          <Chip key={tag} size="sm" variant="soft" color="accent">
                            {tag}
                          </Chip>
                        ))}
                      </span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-xs">{fb.app}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusChip status={fb.status} />
                  </Table.Cell>
                  <Table.Cell>
                    <div className="text-sm">{join(fb.ua_os, fb.ua_browser) || '—'}</div>
                    <div className="text-xs text-muted">{fb.ua_device}</div>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm">{join(fb.country, fb.city) || '—'}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm whitespace-nowrap text-muted">{fmtTime(fb.created_at, lang)}</span>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      {cursor && (
        <div className="flex justify-center">
          <Button variant="tertiary" isPending={loading} onPress={() => load(true)}>
            {loading && <Spinner color="current" size="sm" />}
            {t('action.loadMore')}
          </Button>
        </div>
      )}

      <FeedbackDetailModal id={selected} onClose={() => setSelected(null)} onChanged={onChanged} onDeleted={onDeleted} />
    </div>
  )
}
