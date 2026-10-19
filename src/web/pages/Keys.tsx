import { Copy, Plus } from '@gravity-ui/icons'
import { Alert, Button, Chip, Description, Input, Label, Modal, Table, TextField, toast } from '@heroui/react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import { fmtTime } from '../format'
import { useT } from '../i18n'
import type { ApiKey } from '../types'
import { CodeBlock, ConfirmButton, EmptyState, PageHeader, SimpleSelect, useIsMobile } from '../ui'

export function KeysPage() {
  const { t, lang } = useT()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [open, setOpen] = useState(false)
  const mobile = useIsMobile()

  const load = () => api<{ items: ApiKey[] }>('/api/admin/keys').then((r) => setKeys(r.items), (e) => toast.danger(errorMessage(e)))
  useEffect(() => void load(), [])

  const revoke = async (id: string) => {
    try {
      await api(`/api/admin/keys/${id}/revoke`, { method: 'POST' })
      load()
    } catch (e) {
      toast.danger(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader
        title={t('keys.title')}
        desc={t('keys.desc')}
        actions={
          <Button onPress={() => setOpen(true)} isIconOnly={mobile} aria-label={t('keys.new')}>
            <Plus />
            {!mobile && t('keys.new')}
          </Button>
        }
      />
      {mobile ? (
        <div className="flex flex-col gap-2">
          {keys.length === 0 && <EmptyState>{t('common.none')}</EmptyState>}
          {keys.map((k) => (
            <div key={k.id} className={`rounded-2xl bg-surface p-3.5 shadow-sm ${k.revoked_at ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{k.name}</div>
                  <div className="font-mono text-xs text-muted">{k.key_prefix}…</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Chip size="sm" variant="soft" color={k.scope === 'write' ? 'warning' : 'default'}>
                    {t(k.scope === 'write' ? 'keys.write' : 'keys.read')}
                  </Chip>
                  <Chip size="sm" variant="soft" color={k.revoked_at ? 'danger' : 'success'}>
                    {t(k.revoked_at ? 'keys.revoked' : 'keys.active')}
                  </Chip>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="min-w-0">
                  <dt className="text-muted">{t('keys.app')}</dt>
                  <dd className="truncate font-mono">{k.app ?? t('keys.allApps')}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('keys.lastUsed')}</dt>
                  <dd>{fmtTime(k.last_used_at, lang)}</dd>
                </div>
              </dl>
              {!k.revoked_at && (
                <div className="mt-3 flex justify-end">
                  <ConfirmButton size="sm" label={t('keys.revoke')} title={`${t('keys.revoke')} ${k.name}?`} desc={t('keys.revokeConfirm')} onConfirm={() => revoke(k.id)} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label={t('keys.title')} className="min-w-[860px]">
              <Table.Header>
                <Table.Column isRowHeader>{t('keys.name')}</Table.Column>
                <Table.Column>{t('keys.prefix')}</Table.Column>
                <Table.Column>{t('keys.app')}</Table.Column>
                <Table.Column>{t('keys.scope')}</Table.Column>
                <Table.Column>{t('keys.created')}</Table.Column>
                <Table.Column>{t('keys.lastUsed')}</Table.Column>
                <Table.Column>{t('fb.status')}</Table.Column>
                <Table.Column> </Table.Column>
              </Table.Header>
              <Table.Body items={keys} renderEmptyState={() => <div className="py-12 text-center text-sm text-muted">{t('common.none')}</div>}>
                {(k) => (
                  <Table.Row id={k.id}>
                    <Table.Cell>{k.name}</Table.Cell>
                    <Table.Cell>
                      <span className="font-mono text-xs">{k.key_prefix}…</span>
                    </Table.Cell>
                    <Table.Cell>{k.app ? <span className="font-mono text-xs">{k.app}</span> : <span className="text-muted">{t('keys.allApps')}</span>}</Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft" color={k.scope === 'write' ? 'warning' : 'default'}>
                        {t(k.scope === 'write' ? 'keys.write' : 'keys.read')}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-muted">{fmtTime(k.created_at, lang)}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <span className="text-sm text-muted">{fmtTime(k.last_used_at, lang)}</span>
                    </Table.Cell>
                    <Table.Cell>
                      <Chip size="sm" variant="soft" color={k.revoked_at ? 'danger' : 'success'}>
                        {t(k.revoked_at ? 'keys.revoked' : 'keys.active')}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      {!k.revoked_at && (
                        <ConfirmButton size="sm" label={t('keys.revoke')} title={`${t('keys.revoke')} ${k.name}?`} desc={t('keys.revokeConfirm')} onConfirm={() => revoke(k.id)} />
                      )}
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
      <IssueKeyModal isOpen={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  )
}

function IssueKeyModal({ isOpen, onOpenChange, onCreated }: { isOpen: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [app, setApp] = useState('')
  const [scope, setScope] = useState('read')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<ApiKey | null>(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setApp('')
      setScope('read')
      setCreated(null)
    }
  }, [isOpen])

  const submit = async () => {
    setPending(true)
    try {
      const k = await api<ApiKey>('/api/admin/keys', { body: { name: name.trim(), app: app.trim() || null, scope } })
      setCreated(k)
      onCreated()
    } catch (e) {
      toast.danger(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(created!.key!)
    toast.success(t('action.copied'))
  }

  const origin = location.origin
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{t('keys.new')}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {created ? (
              <div className="flex flex-col gap-4">
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t('keys.secretOnce')}</Alert.Title>
                  </Alert.Content>
                </Alert>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-default px-3 py-2 font-mono text-sm break-all">{created.key}</code>
                  <Button isIconOnly variant="secondary" aria-label={t('action.copy')} onPress={copy}>
                    <Copy />
                  </Button>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted">{t('keys.usage')}</div>
                  <CodeBlock>{`curl -H 'Authorization: Bearer ${created.key}' \\\n  '${origin}/api/v1/feedback?status=open&limit=20'`}</CodeBlock>
                </div>
              </div>
            ) : (
              <form
                id="issue-key"
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <TextField value={name} onChange={setName} isRequired autoFocus>
                  <Label>{t('keys.name')}</Label>
                  <Input placeholder="grafana-readonly" />
                </TextField>
                <TextField value={app} onChange={setApp}>
                  <Label>{t('keys.app')}</Label>
                  <Input placeholder="memos-desktop" className="font-mono" />
                  <Description>{t('keys.appHint')}</Description>
                </TextField>
                <SimpleSelect
                  label={t('keys.scope')}
                  value={scope}
                  onChange={setScope}
                  options={[
                    { id: 'read', label: t('keys.read') },
                    { id: 'write', label: t('keys.write') }
                  ]}
                />
              </form>
            )}
          </Modal.Body>
          <Modal.Footer>
            {created ? (
              <Button slot="close">{t('action.close')}</Button>
            ) : (
              <>
                <Button slot="close" variant="tertiary">
                  {t('action.cancel')}
                </Button>
                <Button type="submit" form="issue-key" isPending={pending}>
                  {t('keys.new')}
                </Button>
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
