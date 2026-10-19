import { Comments } from '@gravity-ui/icons'
import { Alert, Button, Card, Input, Label, TextField } from '@heroui/react'
import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { LangSwitch } from '../App'
import { useT } from '../i18n'

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useT()
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await api('/api/admin/login', { body: { token } })
      onSuccess()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LangSwitch />
      </div>
      <Card className="w-full max-w-sm">
        <Card.Header>
          <span className="mb-2 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Comments className="size-5" />
          </span>
          <Card.Title>{t('login.title')}</Card.Title>
          <Card.Description>{t('login.desc')}</Card.Description>
        </Card.Header>
        <Card.Content>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <TextField value={token} onChange={setToken} type="password" isRequired autoFocus>
              <Label>{t('login.token')}</Label>
              <Input />
            </TextField>
            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{error}</Alert.Title>
                </Alert.Content>
              </Alert>
            )}
            <Button type="submit" fullWidth isPending={pending}>
              {t('login.submit')}
            </Button>
          </form>
        </Card.Content>
      </Card>
    </div>
  )
}
