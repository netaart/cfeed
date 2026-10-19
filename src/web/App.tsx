import { ArrowRightFromSquare, Comments } from '@gravity-ui/icons'
import { Button, Spinner, Tabs, Toast } from '@heroui/react'
import { useEffect, useState, type Key } from 'react'
import { api, UNAUTHORIZED_EVENT } from './api'
import { useT } from './i18n'
import { AppsPage } from './pages/Apps'
import { FeedbackPage } from './pages/Feedback'
import { KeysPage } from './pages/Keys'
import { LoginPage } from './pages/Login'

const TABS = ['feedback', 'apps', 'keys'] as const
type Tab = (typeof TABS)[number]
const tabFromHash = (): Tab => (TABS as readonly string[]).includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'feedback'

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

  return (
    <div className="min-h-screen">
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
          <Tabs selectedKey={tab} onSelectionChange={select}>
            <Tabs.ListContainer>
              <Tabs.List aria-label="Sections">
                {TABS.map((k) => (
                  <Tabs.Tab key={k} id={k} className="whitespace-nowrap">
                    {t(`nav.${k}`)}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
          <div className="flex items-center gap-1">
            <LangSwitch />
            <Button size="sm" variant="ghost" isIconOnly aria-label={t('action.logout')} onPress={logout}>
              <ArrowRightFromSquare />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {tab === 'feedback' && <FeedbackPage />}
        {tab === 'apps' && <AppsPage />}
        {tab === 'keys' && <KeysPage />}
      </main>
    </div>
  )
}
