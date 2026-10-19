import { TrashBin } from '@gravity-ui/icons'
import { Alert, Button, Description, Input, Label, Modal, Spinner, TextArea, TextField, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api'
import { fmtBytes, fmtTime, join } from '../format'
import { useT } from '../i18n'
import { MARKS, type Feedback, type FeedbackDetail, type Status } from '../types'
import { CodeBlock, ConfirmButton, KV, StatusChip, useDeviceLabel, useIsMobile } from '../ui'

type Props = {
  id: string | null
  onClose: () => void
  onChanged: (fb: Feedback) => void
  onDeleted: (id: string) => void
}

export function FeedbackDetailModal({ id, onClose, onChanged, onDeleted }: Props) {
  const { t, lang } = useT()
  const [fb, setFb] = useState<FeedbackDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('open')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const mobile = useIsMobile()
  const deviceLabel = useDeviceLabel()

  useEffect(() => {
    if (!id) return
    setFb(null)
    setError(null)
    api<FeedbackDetail>(`/api/v1/feedback/${id}`).then(
      (d) => {
        setFb(d)
        setStatus(d.status)
        setTags(d.tags.join(', '))
        setNote(d.note ?? '')
      },
      (e) => setError(errorMessage(e))
    )
  }, [id])

  const save = async () => {
    if (!fb) return
    setSaving(true)
    try {
      const updated = await api<Feedback>(`/api/v1/feedback/${fb.id}`, {
        method: 'PATCH',
        body: { status, tags: tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean), note: note.trim() || null }
      })
      setFb({ ...fb, ...updated })
      onChanged(updated)
      toast.success(t('common.saved'))
    } catch (e) {
      toast.danger(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!fb) return
    try {
      await api(`/api/v1/feedback/${fb.id}`, { method: 'DELETE' })
      toast.success(t('common.deleted'))
      onDeleted(fb.id)
    } catch (e) {
      toast.danger(errorMessage(e))
    }
  }

  const images = fb?.attachments.filter((a) => /^image\/(png|jpeg|webp|gif)$/.test(a.content_type)) ?? []
  const others = fb?.attachments.filter((a) => !images.includes(a)) ?? []

  return (
    <Modal.Backdrop isOpen={!!id} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size={mobile ? 'full' : 'lg'} scroll="inside">
        <Modal.Dialog className="sm:max-w-3xl">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading className="flex flex-wrap items-center gap-2 pr-8">
              {t('fb.detail')}
              {fb && (
                <>
                  <StatusChip status={fb.status} />
                  <span className="w-full font-mono text-xs font-normal break-all text-muted sm:w-auto">
                    {fb.app} · {fb.id}
                  </span>
                </>
              )}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Content>
              </Alert>
            )}
            {!fb && !error && (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            )}
            {fb && (
              <div className="flex flex-col gap-6">
                <section>
                  <p className="text-base leading-relaxed break-words whitespace-pre-wrap">{fb.content}</p>
                  <p className="mt-2 text-xs text-muted">{fmtTime(fb.created_at, lang)}</p>
                </section>

                {Object.keys(fb.extra).length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-medium">{t('fb.extra')}</h3>
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {Object.entries(fb.extra).map(([k, v]) =>
                        v !== null && typeof v === 'object' ? (
                          <div key={k} className="col-span-2 sm:col-span-3">
                            <KV label={k}>
                              <CodeBlock>{JSON.stringify(v, null, 2)}</CodeBlock>
                            </KV>
                          </div>
                        ) : (
                          <KV key={k} label={k}>
                            {typeof v === 'string' ? v : <span className="font-mono">{JSON.stringify(v)}</span>}
                          </KV>
                        )
                      )}
                    </dl>
                  </section>
                )}

                {(images.length > 0 || others.length > 0) && (
                  <section>
                    <h3 className="mb-2 text-sm font-medium">{t('fb.files')}</h3>
                    <div className="flex flex-wrap gap-3">
                      {images.map((a) => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={a.filename}>
                          <img src={a.url} alt={a.filename} className="h-28 w-auto max-w-full rounded-lg border border-separator object-cover sm:max-w-56" />
                        </a>
                      ))}
                    </div>
                    {others.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1 text-sm">
                        {others.map((a) => (
                          <li key={a.id} className="break-all">
                            <a className="text-accent hover:underline" href={a.url}>
                              {a.filename}
                            </a>{' '}
                            <span className="text-xs text-muted">
                              {a.content_type} · {fmtBytes(a.size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('fb.env')}</h3>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <KV label={t('fb.browser')}>{join(fb.ua_browser, fb.ua_browser_version) || null}</KV>
                    <KV label={t('fb.os')}>{join(fb.ua_os, fb.ua_os_version) || null}</KV>
                    <KV label={t('fb.device')}>{deviceLabel(fb.ua_device)}</KV>
                    <KV label={t('fb.location')}>{join(fb.country, fb.region, fb.city) || null}</KV>
                    <KV label={t('fb.timezone')}>{fb.timezone}</KV>
                    <KV label={t('fb.language')}>{fb.language}</KV>
                    <KV label={t('fb.network')}>{fb.asn ? `AS${fb.asn} · ${fb.colo ?? ''}` : null}</KV>
                    <KV label={t('fb.referer')}>{fb.referer ?? fb.origin}</KV>
                    <KV label={t('fb.ipHash')}>
                      {fb.ip_hash && <span className="font-mono text-xs">{fb.ip_hash.slice(0, 12)}</span>}
                    </KV>
                  </dl>
                  {fb.ua && <p className="mt-3 font-mono text-xs break-all text-muted">{fb.ua}</p>}
                </section>

                <section className="flex flex-col gap-3 rounded-2xl border border-separator p-3 sm:p-4">
                  <h3 className="text-sm font-medium">{t('fb.manage')}</h3>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t('fb.mark')}</Label>
                    <ToggleButtonGroup
                      selectionMode="single"
                      selectedKeys={status === 'open' ? [] : [status]}
                      onSelectionChange={(keys) => setStatus(([...keys][0] as Status | undefined) ?? 'open')}
                      isDetached
                    >
                      {MARKS.map((m) => (
                        <ToggleButton key={m} id={m}>
                          {t(`status.${m}`)}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                    <Description>{t('fb.markHint')}</Description>
                  </div>
                  <TextField value={tags} onChange={setTags}>
                    <Label>{t('fb.tags')}</Label>
                    <Input placeholder={t('fb.tagsHint')} />
                  </TextField>
                  <TextField value={note} onChange={setNote}>
                    <Label>{t('fb.note')}</Label>
                    <TextArea rows={3} />
                  </TextField>
                </section>
              </div>
            )}
          </Modal.Body>
          {fb && (
            <Modal.Footer className="pb-safe justify-between">
              <ConfirmButton
                label={
                  <>
                    <TrashBin />
                    {t('action.delete')}
                  </>
                }
                title={t('action.delete')}
                desc={t('fb.deleteConfirm')}
                onConfirm={remove}
              />
              <Button isPending={saving} onPress={save}>
                {t('action.save')}
              </Button>
            </Modal.Footer>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
