import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api/client'
import { type AuthSession, clearTokens } from '../app/auth'
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
  <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center px-3 py-6 sm:px-4">
    <div className="grid w-full gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="panel p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Acesso ao sistema</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">Entrar no Sorveteria POS</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          Use o login do usuario para acessar o PDV, caixa, relatorios e configuracoes conforme as permissoes recebidas.
        </p>

        <div className="mt-6 grid gap-3">
          <input
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="Login (e-mail)"
            className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
          />
          <input
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Senha"
            type="password"
            className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={onLogin}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        {feedback ? <p className="mt-4 text-sm text-rose-600">{feedback}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700"
            >
              Tentar validar sessao
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <h2 className="text-xl font-semibold text-slate-900">Administrador inicial</h2>
        <p className="mt-2 text-sm text-slate-500">
          Se este for o primeiro acesso, cadastre abaixo o usuario administrador que vai liberar os demais usuarios e permissoes.
        </p>
        <div className="mt-6 grid gap-3">
          <input
            value={bootstrap.name}
            onChange={(event) => onBootstrapChange('name', event.target.value)}
            placeholder="Nome"
            className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
          />
          <input
            value={bootstrap.email}
            onChange={(event) => onBootstrapChange('email', event.target.value)}
            placeholder="Login (e-mail)"
            className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
          />
          <input
            value={bootstrap.password}
            onChange={(event) => onBootstrapChange('password', event.target.value)}
            placeholder="Senha inicial"
            type="password"
            className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
          />
          <button
            type="button"
            onClick={onBootstrap}
            disabled={busy || bootstrapRequired !== true}
            className="rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bootstrapRequired === null
              ? 'Verificando disponibilidade...'
              : bootstrapRequired
                ? 'Criar administrador'
                : 'Administrador ja configurado'}
          </button>
        </div>
      </section>
    </div>
  </div>
)

export const LoginGate: React.FC<LoginGateProps> = ({ children, mode = 'protect' }) => {
  const { login, logout, refreshSession } = useAuth()
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AuthSession | null>(null)
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

  const handleLogin = async () => {
    setBusy(true)
    try {
      const nextSession = await login(email, password)
      setSession(nextSession)
      setBootstrapRequired(nextSession.bootstrap_required)
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
    return <div className="panel p-6 text-sm text-slate-500">Carregando sessao...</div>
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
        feedback={
          feedback ||
          'O sistema nao conseguiu validar a sessao automaticamente. Ainda assim, voce pode tentar entrar ou repetir a conexao.'
        }
        busy={busy}
        bootstrapRequired={bootstrapRequired}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onBootstrapChange={(field, value) => setBootstrap((prev) => ({ ...prev, [field]: value }))}
        onLogin={() => void handleLogin()}
        onBootstrap={() => void handleBootstrap()}
        onRetry={() => void loadSession()}
      />
    )
  }

  if (session === null || requiresLogin) {
    return <Navigate to="/entrar" replace />
  }

  return <>{children}</>
}
