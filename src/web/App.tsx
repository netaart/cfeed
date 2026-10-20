import { ArrowRightFromSquare, Comments, Cubes3, Key as KeyIcon } from '@gravity-ui/icons'
import { Button, Spinner, Tabs, Toast } from '@heroui/react'
import { useEffect, useState, type Key } from 'react'
import { api, UNAUTHORIZED_EVENT } from './api'
import { useT } from './i18n'
import { AppsPage } from './pages/Apps'
import { FeedbackPage } from './pages/Feedback'
import { KeysPage } from './pages/Keys'
import { LoginPage } from './pages/Login'

const TABS = ['feedback', 'apps', 'keys'] as const
const TAB_ICONS = { feedback: Comments, apps: Cubes3, keys: KeyIcon }
type Tab = (typeof TABS)[number]
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1).split('/')[0]
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'feedback'
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    api('/api/admin/me').then(() => setAuthed(true), () => setAuthed(false))
    const onUnauthorized = () => setAuthed(false)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  return (
    <>
      <Toast.Provider placement="top end" />
      {authed === null ? (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : authed ? (
        <Shell onLogout={() => setAuthed(false)} />
      ) : (
        <LoginPage onSuccess={() => setAuthed(true)} />
      )}
    </>
  )
}

export function LangSwitch() {
  const { lang, setLang } = useT()
  return (
    <Button size="sm" variant="ghost" onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
      {lang === 'zh' ? 'EN' : '中文'}
    </Button>
  )
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const select = (key: Key) => {
    history.replaceState(null, '', `#${key}`)
    setTab(key as Tab)
  }

  const logout = async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {})
    onLogout()
  }

  const tabs = (mobile: boolean) => (
    <Tabs selectedKey={tab} onSelectionChange={select} className={mobile ? 'w-full' : undefined}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Sections" className={mobile ? 'w-full' : undefined}>
          {TABS.map((k) => {
            const Icon = TAB_ICONS[k]
            return (
              <Tabs.Tab key={k} id={k} className={mobile ? 'h-auto flex-1 flex-col gap-0.5 py-1.5 text-xs' : 'whitespace-nowrap'}>
                {mobile && <Icon className="size-5" />}
                {t(`nav.${k}`)}
                <Tabs.Indicator />
              </Tabs.Tab>
            )
          })}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-separator bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Comments className="size-4" />
            </span>
            <div className="leading-tight">
              <div className="font-semibold">cfeed</div>
              <div className="hidden text-xs text-muted sm:block">{t('app.subtitle')}</div>
            </div>
          </div>
          <div className="hidden sm:block">{tabs(false)}</div>
          <div className="flex items-center gap-1">
            <LangSwitch />
            <Button size="sm" variant="ghost" isIconOnly aria-label={t('action.logout')} onPress={logout}>
              <ArrowRightFromSquare />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-4 pb-28 sm:px-6 sm:py-6">
        {tab === 'feedback' && <FeedbackPage />}
        {tab === 'apps' && <AppsPage />}
        {tab === 'keys' && <KeysPage />}
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-background/90 px-3 pt-2 backdrop-blur sm:hidden">
        <div className="mb-2">{tabs(true)}</div>
      </nav>
    </div>
  )
}
