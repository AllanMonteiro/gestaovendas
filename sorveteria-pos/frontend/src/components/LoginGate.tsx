import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api/client'
import { type AuthSession, clearTokens } from '../app/auth'
import { Badge, Button, Card, Input, LoadingState } from './ui'
import { useAuth } from '../hooks/useAuth'

type LoginGateProps = {
  children?: React.ReactNode
  mode?: 'entry' | 'protect'
}

type BootstrapStatusResponse = {
  required?: boolean
}

const emptyBootstrap = { name: 'Administrador', email: 'admin@admin.com', password: 'admin123' }
const sessionRetryDelaysMs = [0, 700, 1800]

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const getErrorStatus = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: unknown } }).response?.status === 'number'
  ) {
    return (error as { response: { status: number } }).response.status
  }
  return null
}

const isTemporarySessionError = (error: unknown) => {
  const status = getErrorStatus(error)
  return status === null || [408, 425, 429, 500, 502, 503, 504].includes(status)
}

type SystemAccessScreenProps = {
  email: string
  password: string
  bootstrap: typeof emptyBootstrap
  feedback: string
  busy: boolean
  bootstrapRequired: boolean | null
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onBootstrapChange: (field: keyof typeof emptyBootstrap, value: string) => void
  onLogin: () => void
  onBootstrap: () => void
  onRetry?: () => void
}

const SystemAccessScreen: React.FC<SystemAccessScreenProps> = ({
  email,
  password,
  bootstrap,
  feedback,
  busy,
  bootstrapRequired,
  onEmailChange,
  onPasswordChange,
  onBootstrapChange,
  onLogin,
  onBootstrap,
  onRetry,
}) => (
  <div className="mx-auto flex min-h-[76vh] max-w-6xl items-center justify-center px-3 py-6 sm:px-4 lg:px-6">
    <div className="grid w-full gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <Card className="overflow-hidden p-0">
        <div className="grid gap-8 p-6 sm:p-8">
          <div className="space-y-4">
            <Badge variant="brand">Acesso ao sistema</Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Entrar no Sorveteria POS
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Acesse PDV, caixa, relatorios e configuracoes com um fluxo mais leve, rapido e pronto para o dia a dia da operacao.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="ui-inline-card">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Operacao</p>
                <p className="mt-2 text-sm text-slate-600">Vendas, cozinha e delivery no mesmo ambiente.</p>
              </div>
              <div className="ui-inline-card">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Seguranca</p>
                <p className="mt-2 text-sm text-slate-600">Acesso por usuario com permissoes por perfil.</p>
              </div>
              <div className="ui-inline-card">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Suporte</p>
                <p className="mt-2 text-sm text-slate-600">Validacao de sessao e bootstrap do admin inicial.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <Input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="Login (e-mail)"
              label="Usuario"
              autoComplete="username"
            />
            <Input
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Senha"
              type="password"
              label="Senha"
              autoComplete="current-password"
            />
            <div className="flex flex-wrap gap-3 pt-1">
              <Button onClick={onLogin} disabled={busy} variant="primary" size="lg">
                {busy ? 'Entrando...' : 'Entrar'}
              </Button>
              {onRetry ? (
                <Button onClick={onRetry} disabled={busy} variant="secondary" size="lg">
                  Tentar validar sessao
                </Button>
              ) : null}
            </div>
            {feedback ? (
              <div className="ui-soft-alert ui-soft-alert-danger">
                {feedback}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card tone="accent" className="p-6 sm:p-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-950">Administrador inicial</h2>
            <Badge variant={bootstrapRequired === true ? 'warning' : 'success'}>
              {bootstrapRequired === null
                ? 'Verificando'
                : bootstrapRequired
                  ? 'Disponivel'
                  : 'Ja configurado'}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-slate-600">
            Se este for o primeiro acesso, crie aqui o usuario administrador que vai liberar os demais logins e permissoes.
          </p>
        </div>

        <div className="mt-6 grid gap-3">
          <Input
            value={bootstrap.name}
            onChange={(event) => onBootstrapChange('name', event.target.value)}
            placeholder="Nome"
            label="Nome do administrador"
          />
          <Input
            value={bootstrap.email}
            onChange={(event) => onBootstrapChange('email', event.target.value)}
            placeholder="Login (e-mail)"
            label="Login"
            autoComplete="username"
          />
          <Input
            value={bootstrap.password}
            onChange={(event) => onBootstrapChange('password', event.target.value)}
            placeholder="Senha inicial"
            type="password"
            label="Senha inicial"
            autoComplete="new-password"
          />
          <Button
            onClick={onBootstrap}
            disabled={busy || bootstrapRequired !== true}
            variant="secondary"
            size="lg"
          >
            {bootstrapRequired === null
              ? 'Verificando disponibilidade...'
              : bootstrapRequired
                ? 'Criar administrador'
                : 'Administrador ja configurado'}
          </Button>
        </div>
      </Card>
    </div>
  </div>
)

export const LoginGate: React.FC<LoginGateProps> = ({ children, mode = 'protect' }) => {
  const { login, logout, refreshSession } = useAuth()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [sessionValidationFailed, setSessionValidationFailed] = useState(false)
  const [email, setEmail] = useState('admin@admin.com')
  const [password, setPassword] = useState('admin123')
  const [bootstrap, setBootstrap] = useState(emptyBootstrap)
  const [bootstrapRequired, setBootstrapRequired] = useState<boolean | null>(null)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBootstrapStatus = useCallback(async () => {
    try {
      const response = await api.get<BootstrapStatusResponse>('/api/auth/bootstrap')
      setBootstrapRequired(Boolean(response.data?.required))
    } catch {
      setBootstrapRequired(null)
    }
  }, [])

  const loadSession = useCallback(async () => {
    setLoading(true)
    setFeedback('')
    setSessionValidationFailed(false)
    let lastError: unknown = null

    for (const delay of sessionRetryDelaysMs) {
      if (delay > 0) {
        setFeedback('Conectando ao servidor...')
        await wait(delay)
      }

      try {
        const response = await refreshSession()
        setSession(response)
        setBootstrapRequired(response?.bootstrap_required ?? null)
        setSessionValidationFailed(false)
        setFeedback('')
        setLoading(false)
        return
      } catch (error) {
        lastError = error
        const status = getErrorStatus(error)
        if (status === 401 || status === 403) {
          clearTokens()
          break
        }
        if (!isTemporarySessionError(error)) {
          break
        }
      }
    }

    setSession(null)
    setSessionValidationFailed(true)
    setFeedback(
      isTemporarySessionError(lastError)
        ? 'O servidor ainda nao respondeu como esperado. O sistema tentou novamente antes de mostrar este aviso.'
        : 'Erro ao carregar sessao. Verifique se o servidor esta rodando.'
    )
    setLoading(false)
  }, [refreshSession])

  useEffect(() => {
    void loadSession()
    void loadBootstrapStatus()
  }, [loadBootstrapStatus, loadSession])

  const requiresLogin = useMemo(
    () => Boolean(session?.require_auth && !session?.authenticated),
    [session]
  )
  const entryFeedback = useMemo(() => {
    if (feedback) {
      return feedback
    }
    if (sessionValidationFailed) {
      return 'O sistema nao conseguiu validar a sessao automaticamente. Ainda assim, voce pode tentar entrar ou repetir a conexao.'
    }
    if (bootstrapRequired === true) {
      return 'Crie o administrador inicial ao lado para liberar o primeiro acesso.'
    }
    if (requiresLogin) {
      return 'Informe seu login e senha para entrar no sistema.'
    }
    return ''
  }, [bootstrapRequired, feedback, requiresLogin, sessionValidationFailed])

  const handleLogin = async () => {
    setBusy(true)
    try {
      const nextSession = await login(email, password)
      setSession(nextSession)
      setBootstrapRequired(nextSession.bootstrap_required)
      setSessionValidationFailed(false)
      setFeedback('')
    } catch (error) {
      const status = getErrorStatus(error)
      setFeedback(
        status === null
          ? 'Nao foi possivel falar com o servidor agora. Verifique a conexao e tente novamente.'
          : 'Login ou senha invalidos.'
      )
    } finally {
      setBusy(false)
    }
  }

  const handleBootstrap = async () => {
    setBusy(true)
    try {
      await api.post('/api/auth/bootstrap', bootstrap)
      setFeedback('Administrador criado. Entre com o login e senha cadastrados.')
      setBootstrap(emptyBootstrap)
      await loadBootstrapStatus()
      await loadSession()
    } catch {
      setFeedback('Falha ao criar o administrador inicial.')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    const nextSession = await logout()
    setSession(nextSession)
  }

  useEffect(() => {
    const handler = () => {
      void handleLogout()
    }
    window.addEventListener('sorveteria:logout', handler)
    return () => window.removeEventListener('sorveteria:logout', handler)
  }, [logout])

  if (loading) {
    return (
      <div className="ui-screen-narrow px-3 py-6 sm:px-4">
        <Card className="p-6">
          <LoadingState
            title="Carregando sessao"
            description="Estamos validando seu acesso e preparando o ambiente."
          />
        </Card>
      </div>
    )
  }

  if (mode === 'entry') {
    if (session && !requiresLogin) {
      return <Navigate to="/caixa" replace />
    }
    return (
      <SystemAccessScreen
        email={email}
        password={password}
        bootstrap={bootstrap}
        feedback={entryFeedback}
        busy={busy}
        bootstrapRequired={bootstrapRequired}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onBootstrapChange={(field, value) => setBootstrap((prev) => ({ ...prev, [field]: value }))}
        onLogin={() => void handleLogin()}
        onBootstrap={() => void handleBootstrap()}
        onRetry={sessionValidationFailed ? () => void loadSession() : undefined}
      />
    )
  }

  if (session === null || requiresLogin) {
    return <Navigate to="/entrar" replace />
  }

  return <>{children}</>
}
