import { ChevronRight, Gear, Plus } from '@gravity-ui/icons'
import { Button, Card, Chip, Description, Input, Label, Modal, Switch, Table, TextArea, TextField, toast } from '@heroui/react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import { fmtTime } from '../format'
import { useT } from '../i18n'
import type { AppConfig, AppSummary } from '../types'
import { CodeBlock, ConfirmButton, EmptyState, PageHeader, useIsMobile } from '../ui'

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/
const ANY_MIME = '*/*'

export function AppsPage() {
  const { t, lang } = useT()
  const [apps, setApps] = useState<AppSummary[]>([])
  const mobile = useIsMobile()
  const [configs, setConfigs] = useState<AppConfig[]>([])
  const [editing, setEditing] = useState<{ slug: string; config: AppConfig | null } | null>(null)

  const load = () => {
    api<{ items: AppSummary[] }>('/api/v1/apps').then((r) => setApps(r.items), (e) => toast.danger(errorMessage(e)))
    api<{ items: AppConfig[] }>('/api/admin/apps').then((r) => setConfigs(r.items), () => {})
  }
  useEffect(load, [])

  const edit = (slug: string) => setEditing({ slug, config: configs.find((c) => c.slug === slug) ?? null })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('apps.title')}
        desc={t('apps.desc')}
        actions={
          <Button onPress={() => setEditing({ slug: '', config: null })} isIconOnly={mobile} aria-label={t('apps.new')}>
            <Plus />
            {!mobile && t('apps.new')}
          </Button>
        }
      />

      {mobile ? (
        <div className="flex flex-col gap-2">
          {apps.length === 0 && <EmptyState>{t('common.none')}</EmptyState>}
          {apps.map((a) => (
            <button
              key={a.app}
              type="button"
              onClick={() => edit(a.app)}
              className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left shadow-sm transition-transform active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm">{a.app}</span>
                  {a.status === 'disabled' ? (
                    <Chip size="sm" variant="soft" color="danger">
                      {t('apps.disabled')}
                    </Chip>
                  ) : (
                    <Chip size="sm" variant="soft" color={a.registered ? 'accent' : 'default'}>
                      {t(a.registered ? 'apps.registered' : 'apps.unregistered')}
                    </Chip>
                  )}
                </div>
                {a.name && <div className="truncate text-xs text-muted">{a.name}</div>}
                <div className="mt-1 text-xs text-muted">
                  {t('apps.count')} <span className="text-foreground tabular-nums">{a.count}</span> · {fmtTime(a.last_at, lang)}
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label={t('apps.title')} className="min-w-[720px]">
              <Table.Header>
                <Table.Column isRowHeader>{t('fb.app')}</Table.Column>
                <Table.Column>{t('apps.count')}</Table.Column>
                <Table.Column>{t('apps.last')}</Table.Column>
                <Table.Column>{t('apps.config')}</Table.Column>
                <Table.Column> </Table.Column>
              </Table.Header>
              <Table.Body items={apps.map((a) => ({ ...a, id: a.app }))} renderEmptyState={() => <div className="py-12 text-center text-sm text-muted">{t('common.none')}</div>}>
                {(a) => (
                  <Table.Row id={a.app}>
                    <Table.Cell>
                      <div className="font-mono text-sm">{a.app}</div>
                      {a.name && <div className="text-xs text-muted">{a.name}</div>}
                    </Table.Cell>
                    <Table.Cell>
                      <span className="tabular-nums">{a.count}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-muted">{fmtTime(a.last_at, lang)}</span>
                    </Table.Cell>
                    <Table.Cell>
                      {a.status === 'disabled' ? (
                        <Chip size="sm" variant="soft" color="danger">
                          {t('apps.disabled')}
                        </Chip>
                      ) : (
                        <Chip size="sm" variant="soft" color={a.registered ? 'accent' : 'default'}>
                          {t(a.registered ? 'apps.registered' : 'apps.unregistered')}
                        </Chip>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Button size="sm" variant="tertiary" onPress={() => edit(a.app)}>
                        <Gear />
                        {t('apps.config')}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <Card>
        <Card.Header>
          <Card.Title>{t('apps.usage')}</Card.Title>
          <Card.Description>{t('apps.usageDesc')}</Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <CodeBlock>{`curl -X POST ${location.origin}/api/v1/feedback \\
  -H 'content-type: application/json' \\
  -d '{"app":"my-app","content":"Great app!","extra":{"version":"1.0.0"}}'`}</CodeBlock>
          <CodeBlock>{`curl -X POST ${location.origin}/api/v1/feedback \\
  -F app=my-app -F content='Save button does nothing' \\
  -F extra='{"type":"bug","version":"1.0.0"}' -F files=@screenshot.png`}</CodeBlock>
        </Card.Content>
      </Card>

      <AppConfigModal editing={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  )
}

type Form = {
  slug: string
  name: string
  active: boolean
  domains: string
  maxFiles: string
  maxFileMb: string
  mime: string
  anyMime: boolean
  webhookUrl: string
  webhookSecret: string
}

function toForm(slug: string, c: AppConfig | null): Form {
  return {
    slug,
    name: c?.name ?? '',
    active: (c?.status ?? 'active') === 'active',
    domains: c?.allowed_domains.join('\n') ?? '',
    maxFiles: c?.max_files?.toString() ?? '',
    maxFileMb: c?.max_file_bytes ? String(+(c.max_file_bytes / 1024 / 1024).toFixed(2)) : '',
    mime: c?.allowed_mime?.filter((m) => m !== ANY_MIME).join(', ') ?? '',
    anyMime: !!c?.allowed_mime?.includes(ANY_MIME),
    webhookUrl: c?.webhook_url ?? '',
    webhookSecret: c?.webhook_secret ?? ''
  }
}

function AppConfigModal({
  editing,
  onClose,
  onSaved
}: {
  editing: { slug: string; config: AppConfig | null } | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t, lang } = useT()
  const [form, setForm] = useState<Form>(toForm('', null))
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [delivery, setDelivery] = useState<{ at: number | null; status: number | null; error: string | null }>({ at: null, status: null, error: null })
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const isNew = !editing?.slug
  const mobile = useIsMobile()

  useEffect(() => {
    if (!editing) return
    setForm(toForm(editing.slug, editing.config))
    const c = editing.config
    setDelivery({ at: c?.webhook_last_at ?? null, status: c?.webhook_last_status ?? null, error: c?.webhook_last_error ?? null })
  }, [editing])

  const save = async (close = true): Promise<boolean> => {
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const mb = num(form.maxFileMb)
    setPending(true)
    try {
      await api(`/api/admin/apps/${encodeURIComponent(form.slug)}`, {
        method: 'PUT',
        body: {
          name: form.name.trim() || null,
          status: form.active ? 'active' : 'disabled',
          allowed_domains: form.domains.split(/[\s,，]+/).filter(Boolean),
          max_files: num(form.maxFiles),
          max_file_bytes: mb === null ? null : Math.round(mb * 1024 * 1024),
          allowed_mime: form.anyMime ? [ANY_MIME] : form.mime.trim() ? form.mime.split(/[,\s]+/).filter(Boolean) : null,
          webhook_url: form.webhookUrl.trim() || null,
          webhook_secret: form.webhookSecret.trim() || null
        }
      })
      onSaved()
      if (close) {
        toast.success(t('common.saved'))
        onClose()
      }
      return true
    } catch (e) {
      toast.danger(errorMessage(e))
      return false
    } finally {
      setPending(false)
    }
  }

  const testWebhook = async () => {
    setTesting(true)
    try {
      if (!(await save(false))) return
      const r = await api<{ ok: boolean; status: number; error: string | null }>(`/api/admin/apps/${encodeURIComponent(form.slug)}/webhook/test`, { method: 'POST' })
      setDelivery({ at: Date.now(), status: r.status, error: r.error })
      if (r.ok) toast.success(t('apps.webhookTestOk'))
      else toast.danger(r.error ?? `HTTP ${r.status}`)
    } catch (e) {
      toast.danger(errorMessage(e))
    } finally {
      setTesting(false)
    }
  }

  const remove = async () => {
    try {
      await api(`/api/admin/apps/${encodeURIComponent(form.slug)}`, { method: 'DELETE' })
      toast.success(t('common.deleted'))
      onSaved()
      onClose()
    } catch (e) {
      toast.danger(errorMessage(e))
    }
  }

  return (
    <Modal.Backdrop isOpen={!!editing} onOpenChange={(o) => !o && onClose()}>
      <Modal.Container size={mobile ? 'full' : 'lg'} scroll="inside">
        <Modal.Dialog className="sm:max-w-2xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              {isNew ? t('apps.new') : t('apps.edit')}
              {!isNew && <span className="ml-2 font-mono text-sm font-normal text-muted">{form.slug}</span>}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <form
              id="app-config"
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              {isNew && (
                <TextField value={form.slug} onChange={(slug) => set({ slug })} isRequired autoFocus isInvalid={!!form.slug && !SLUG.test(form.slug)}>
                  <Label>{t('apps.slug')}</Label>
                  <Input placeholder="my-app" className="font-mono" />
                  <Description>{t('apps.slugHint')}</Description>
                </TextField>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField value={form.name} onChange={(name) => set({ name })}>
                  <Label>{t('apps.name')}</Label>
                  <Input />
                </TextField>
                <div className="flex items-end pb-2">
                  <Switch isSelected={form.active} onChange={(active) => set({ active })}>
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      {t('apps.enabled')}
                    </Switch.Content>
                  </Switch>
                </div>
              </div>
              <TextField value={form.domains} onChange={(domains) => set({ domains })}>
                <Label>{t('apps.domains')}</Label>
                <TextArea rows={3} className="font-mono text-xs" placeholder={'neta.art\n*.neta.art'} />
                <Description>{t('apps.domainsHint')}</Description>
              </TextField>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField value={form.maxFiles} onChange={(maxFiles) => set({ maxFiles })}>
                  <Label>{t('apps.maxFiles')}</Label>
                  <Input type="number" min={0} max={20} placeholder={t('common.default')} />
                </TextField>
                <TextField value={form.maxFileMb} onChange={(maxFileMb) => set({ maxFileMb })}>
                  <Label>{t('apps.maxFileMb')}</Label>
                  <Input type="number" min={0} step="any" placeholder={t('common.default')} />
                </TextField>
              </div>
              <div className="flex flex-col gap-2">
                <TextField value={form.mime} onChange={(mime) => set({ mime })} isDisabled={form.anyMime}>
                  <Label>{t('apps.mime')}</Label>
                  <Input className="font-mono text-xs" placeholder="image/*, application/pdf" />
                  <Description>{t('apps.mimeHint')}</Description>
                </TextField>
                <Switch isSelected={form.anyMime} onChange={(anyMime) => set({ anyMime })}>
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    {t('apps.anyMime')}
                  </Switch.Content>
                </Switch>
                {form.anyMime && <p className="text-xs text-muted">{t('apps.anyMimeHint')}</p>}
              </div>
              <div className="flex flex-col gap-3 border-t border-separator pt-4">
                <TextField value={form.webhookUrl} onChange={(webhookUrl) => set({ webhookUrl })}>
                  <Label>{t('apps.webhook')}</Label>
                  <Input type="url" className="font-mono text-xs" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…" />
                  <Description>{t('apps.webhookHint')}</Description>
                </TextField>
                <TextField value={form.webhookSecret} onChange={(webhookSecret) => set({ webhookSecret })} isDisabled={!form.webhookUrl.trim()}>
                  <Label>{t('apps.webhookSecret')}</Label>
                  <Input className="font-mono text-xs" autoComplete="off" />
                  <Description>{t('apps.webhookSecretHint')}</Description>
                </TextField>
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" isPending={testing} isDisabled={!form.webhookUrl.trim() || !SLUG.test(form.slug)} onPress={testWebhook}>
                    {t('apps.webhookTest')}
                  </Button>
                  {delivery.at && (
                    <span className={`text-xs [overflow-wrap:anywhere] ${delivery.error ? 'text-danger' : 'text-success'}`}>
                      {t('apps.webhookLast')} {fmtTime(delivery.at, lang)} · {delivery.error ?? `HTTP ${delivery.status}`}
                    </span>
                  )}
                </div>
              </div>
            </form>
          </Modal.Body>
          <Modal.Footer className="pb-safe justify-between">
            <div>
              {editing?.config && <ConfirmButton label={t('apps.deleteConfig')} title={t('apps.deleteConfig')} desc={t('apps.deleteConfirm')} onConfirm={remove} />}
            </div>
            <div className="flex gap-2">
              <Button slot="close" variant="tertiary">
                {t('action.cancel')}
              </Button>
              <Button type="submit" form="app-config" isPending={pending} isDisabled={!SLUG.test(form.slug)}>
                {t('action.save')}
              </Button>
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
