import { ArrowRightFromSquare, Comments, Cubes3, Key as KeyIcon } from '@gravity-ui/icons'
import { Button, Chip, Spinner, Tabs, Toast } from '@heroui/react'
import { useEffect, useState, type Key } from 'react'
import { api, UNAUTHORIZED_EVENT } from './api'
import { useT } from './i18n'
import { AppsPage } from './pages/Apps'
import { FeedbackPage } from './pages/Feedback'
import { KeysPage } from './pages/Keys'
import { LoginPage } from './pages/Login'
import { MeContext, type Me } from './session'

const TABS = ['feedback', 'apps', 'keys'] as const
const TAB_ICONS = { feedback: Comments, apps: Cubes3, keys: KeyIcon }
type Tab = (typeof TABS)[number]
const tabsFor = (me: Me): readonly Tab[] => (me.kind === 'admin' ? TABS : ['feedback'])
const tabFromHash = (allowed: readonly Tab[]): Tab => {
  const h = location.hash.slice(1).split('/')[0]
  return (allowed as readonly string[]).includes(h) ? (h as Tab) : 'feedback'
}

export function App() {
  const [me, setMe] = useState<Me | null | false>(null)
  const loadMe = () => api<Me>('/api/v1/me').then(setMe, () => setMe(false))

  useEffect(() => {
    loadMe()
    const onUnauthorized = () => setMe(false)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  return (
    <>
      <Toast.Provider placement="top end" />
      {me === null ? (
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : me ? (
        <MeContext.Provider value={me}>
          <Shell me={me} onLogout={() => setMe(false)} />
        </MeContext.Provider>
      ) : (
        <LoginPage onSuccess={loadMe} />
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

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { t } = useT()
  const allowed = tabsFor(me)
  const [tab, setTab] = useState<Tab>(() => {
    const t = tabFromHash(allowed)
    if (!location.hash.startsWith(`#${t}`)) history.replaceState(null, '', `#${t}`)
    return t
  })

  useEffect(() => {
    const onHash = () => setTab(tabFromHash(allowed))
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
          {allowed.map((k) => {
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
          {allowed.length > 1 && <div className="hidden sm:block">{tabs(false)}</div>}
          <div className="flex min-w-0 items-center gap-1">
            {me.kind === 'key' && (
              <Chip size="sm" variant="soft" className="min-w-0" title={me.name}>
                <span className="truncate">
                  {me.app ?? t('keys.allApps')} · {t(me.scope === 'write' ? 'keys.write' : 'keys.read')}
                </span>
              </Chip>
            )}
            <LangSwitch />
            <Button size="sm" variant="ghost" isIconOnly aria-label={t('action.logout')} onPress={logout}>
              <ArrowRightFromSquare />
            </Button>
          </div>
        </div>
      </header>
      <main className={`mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:py-6 ${allowed.length > 1 ? 'pb-28' : 'pb-8'}`}>
        {tab === 'feedback' && <FeedbackPage />}
        {tab === 'apps' && <AppsPage />}
        {tab === 'keys' && <KeysPage />}
      </main>
      {allowed.length > 1 && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-background/90 px-3 pt-2 backdrop-blur sm:hidden">
          <div className="mb-2">{tabs(true)}</div>
        </nav>
      )}
    </div>
  )
}
