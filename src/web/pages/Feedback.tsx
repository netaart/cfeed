import { ArrowsRotateRight, Paperclip, Sliders } from '@gravity-ui/icons'
import { Alert, Button, Card, Chip, Drawer, Input, Label, SearchField, Spinner, Table, TextField } from '@heroui/react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { fmtShortTime, fmtTime, join } from '../format'
import { useT } from '../i18n'
import { MARKS, STATUSES, type AppSummary, type Feedback, type Stats } from '../types'
import { SimpleSelect, StatusChip, useIsMobile } from '../ui'
import { FeedbackDetailModal } from './FeedbackDetail'

const ALL = '__all'
const EVERYTHING = '__everything'
const PAGE = 50

type Filters = { app: string; status: string; q: string; x: string }

function buildQuery(f: Filters, cursor?: string | null): string {
  const p = new URLSearchParams()
  if (f.app !== ALL) p.set('app', f.app)
  if (f.status === EVERYTHING) p.set('status', STATUSES.join(','))
  else if (f.status !== ALL) p.set('status', f.status)
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
  const [filters, setFilters] = useState<Filters>({ app: ALL, status: ALL, q: '', x: '' })
  const [qDraft, setQDraft] = useState('')
  const [xDraft, setXDraft] = useState('')
  const [apps, setApps] = useState<AppSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [items, setItems] = useState<Feedback[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const mobile = useIsMobile()

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
    ...MARKS.map((s) => ({ label: t(`status.${s}`), value: stats?.by_status[s] ?? 0 }))
  ]

  const activeFilters = [filters.app !== ALL, filters.status !== ALL, !!filters.x].filter(Boolean).length

  const selects = (
    <>
      <SimpleSelect
        className="w-full sm:w-44"
        label={t('fb.app')}
        value={filters.app}
        onChange={(app) => set({ app })}
        options={[{ id: ALL, label: t('common.all') }, ...apps.map((a) => ({ id: a.app, label: a.name ? `${a.name} (${a.app})` : a.app }))]}
      />
      <SimpleSelect
        className="w-full sm:w-44"
        label={t('fb.status')}
        value={filters.status}
        onChange={(status) => set({ status })}
        options={[
          { id: ALL, label: t('status.hideSpam') },
          ...STATUSES.map((s) => ({ id: s, label: t(`status.${s}`) })),
          { id: EVERYTHING, label: t('status.everything') }
        ]}
      />
    </>
  )

  const extraField = (
    <TextField className="w-full sm:w-60" value={xDraft} onChange={setXDraft}>
      <Label>{t('fb.extraFilter')}</Label>
      <Input placeholder={t('fb.extraFilterHint')} className="font-mono" />
    </TextField>
  )

  const search = (
    <SearchField className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={qDraft} onChange={setQDraft} onClear={() => set({ q: '' })} aria-label={t('fb.search')}>
      {!mobile && <Label>{t('fb.search')}</Label>}
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={mobile ? t('fb.search') : undefined} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  )

  const refreshButton = (
    <Button type="submit" variant="secondary" isIconOnly aria-label={t('action.refresh')} className="shrink-0">
      <ArrowsRotateRight />
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {statCards.map((c) => (
          <Card key={c.label} className="gap-0.5 p-3 sm:gap-1 sm:p-4">
            <div className="text-xs whitespace-nowrap text-muted">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums sm:text-2xl">{c.value ?? '—'}</div>
          </Card>
        ))}
      </div>

      {mobile ? (
        <form onSubmit={applyText} className="flex items-center gap-2">
          {search}
          <Button variant="secondary" className="relative shrink-0" isIconOnly aria-label={t('fb.filters')} onPress={() => setFiltersOpen(true)}>
            <Sliders />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
                {activeFilters}
              </span>
            )}
          </Button>
          {refreshButton}
        </form>
      ) : (
        <form onSubmit={applyText} className="flex flex-wrap items-end gap-3">
          {selects}
          {search}
          {extraField}
          {refreshButton}
        </form>
      )}

      {mobile && (
        <Drawer.Backdrop isOpen={filtersOpen} onOpenChange={setFiltersOpen}>
          <Drawer.Content placement="bottom">
            <Drawer.Dialog>
              <Drawer.Handle />
              <Drawer.Header>
                <Drawer.Heading>{t('fb.filters')}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body>
                <form
                  id="mobile-filters"
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    applyText(e)
                    setFiltersOpen(false)
                  }}
                >
                  {selects}
                  {extraField}
                </form>
              </Drawer.Body>
              <Drawer.Footer className="pb-safe">
                <Button
                  variant="tertiary"
                  onPress={() => {
                    setXDraft('')
                    set({ app: ALL, status: ALL, x: '' })
                  }}
                >
                  {t('fb.reset')}
                </Button>
                <Button type="submit" form="mobile-filters" className="flex-1">
                  {t('fb.apply')}
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      )}

      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}

      {mobile ? (
        <div className="flex flex-col gap-2">
          {items.length === 0 && (
            <div className="py-14 text-center text-sm text-muted">{loading ? <Spinner /> : t('fb.empty')}</div>
          )}
          {items.map((fb) => (
            <button
              key={fb.id}
              type="button"
              onClick={() => setSelected(fb.id)}
              className="w-full rounded-2xl bg-surface p-3.5 text-left shadow-sm transition-transform active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <StatusChip status={fb.status} />
                  <span className="truncate font-mono text-xs text-muted">{fb.app}</span>
                </div>
                <span className="shrink-0 text-xs text-muted tabular-nums">{fmtShortTime(fb.created_at, lang)}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed break-words">{fb.content}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{join(fb.ua_os, fb.ua_browser) || fb.ua_device || '—'}</span>
                {(fb.country || fb.city) && <span>· {join(fb.country, fb.city)}</span>}
                {fb.attachment_count > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    · <Paperclip className="size-3" />
                    {fb.attachment_count}
                  </span>
                )}
                {fb.tags.map((tag) => (
                  <Chip key={tag} size="sm" variant="soft" color="accent">
                    {tag}
                  </Chip>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
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
                      {fb.status === 'open' ? <span className="text-muted">—</span> : <StatusChip status={fb.status} />}
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
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button variant="tertiary" isPending={loading} onPress={() => load(true)} className="w-full sm:w-auto">
            {loading && <Spinner color="current" size="sm" />}
            {t('action.loadMore')}
          </Button>
        </div>
      )}

      <FeedbackDetailModal id={selected} onClose={() => setSelected(null)} onChanged={onChanged} onDeleted={onDeleted} />
    </div>
  )
}
