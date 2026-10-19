import { AlertDialog, Button, Chip, Label, ListBox, Select } from '@heroui/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useT } from './i18n'
import type { Status } from './types'

const DEVICES = ['desktop', 'mobile', 'tablet', 'bot', 'cli', 'unknown'] as const

export function useDeviceLabel() {
  const { t } = useT()
  return (d: string | null) => (d && (DEVICES as readonly string[]).includes(d) ? t(`device.${d as (typeof DEVICES)[number]}`) : d)
}

const MARK_COLOR = { resolved: 'success', spam: 'danger' } as const

export function StatusChip({ status }: { status: Status }) {
  const { t } = useT()
  if (status === 'open') return null
  return (
    <Chip size="sm" variant="soft" color={MARK_COLOR[status]} className="whitespace-nowrap">
      {t(`status.${status}`)}
    </Chip>
  )
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm [overflow-wrap:anywhere]">{children ?? '—'}</dd>
    </div>
  )
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
        {desc && <p className="mt-1 max-w-2xl text-sm text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

export function CodeBlock({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl bg-default p-3 font-mono text-xs leading-relaxed">{children}</pre>
}

export type Option = { id: string; label: string }

export function SimpleSelect(props: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  className?: string
}) {
  return (
    <Select className={props.className} value={props.value} onChange={(v) => v !== null && props.onChange(String(v))}>
      <Label>{props.label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {props.options.map((o) => (
            <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function ConfirmButton(props: {
  label: ReactNode
  title: string
  desc: string
  onConfirm: () => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  iconOnly?: boolean
}) {
  const { t } = useT()
  return (
    <AlertDialog>
      <Button size={props.size ?? 'md'} variant="danger-soft" isIconOnly={props.iconOnly} aria-label={props.ariaLabel}>
        {props.label}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{props.title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>{props.desc}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t('action.cancel')}
              </Button>
              <Button slot="close" variant="danger" onPress={props.onConfirm}>
                {t('action.confirm')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

const MOBILE_QUERY = '(max-width: 639px)'

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = matchMedia(MOBILE_QUERY)
    const on = () => setMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return mobile
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-12 text-center text-sm text-muted">{children}</div>
}
