import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { type AuthSession, clearTokens, saveTokens } from '../app/auth'

type LoginGateProps = {
  children: React.ReactNode
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

export const LoginGate: React.FC<LoginGateProps> = ({ children }) => {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [email, setEmail] = useState('admin@admin.com')
  const [password, setPassword] = useState('admin123')
  const [bootstrap, setBootstrap] = useState(emptyBootstrap)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

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
        const response = await api.get<AuthSession>('/api/auth/session')
        setSession(response.data)
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
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  const requiresLogin = useMemo(
    () => Boolean(session?.require_auth && !session?.authenticated),
    [session]
  )

  const handleLogin = async () => {
    setBusy(true)
    try {
      const response = await api.post('/api/auth/login', { email, password })
      saveTokens(response.data.access, response.data.refresh)
      await loadSession()
    } catch {
      setFeedback('Login ou senha invalidos.')
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
      await loadSession()
    } catch {
      setFeedback('Falha ao criar o administrador inicial.')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = async () => {
    clearTokens()
    await loadSession()
  }

  useEffect(() => {
    const handler = () => {
      void handleLogout()
    }
    window.addEventListener('sorveteria:logout', handler)
    return () => window.removeEventListener('sorveteria:logout', handler)
  }, [])

  if (loading) {
    return <div className="panel p-6 text-sm text-slate-500">Carregando sessao...</div>
  }

  if (session === null) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-3 py-6 sm:px-4">
        <section className="panel w-full p-6 sm:p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Nao foi possivel validar a sessao</h1>
          <p className="mt-2 text-sm text-slate-500">
            O sistema nao conseguiu confirmar o acesso agora. Tente novamente ou aguarde alguns segundos se o servidor ainda estiver iniciando.
          </p>
          {feedback ? <p className="mt-4 text-sm text-rose-600">{feedback}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadSession()}
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-3 text-sm font-semibold text-white"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => {
                clearTokens()
                window.location.reload()
              }}
              className="rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700"
            >
              Limpar sessao e recarregar
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!requiresLogin) {
    return <>{children}</>
  }

  return (
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
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Login (e-mail)"
              className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Senha"
              type="password"
              className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </div>

          {feedback ? <p className="mt-4 text-sm text-rose-600">{feedback}</p> : null}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Administrador inicial</h2>
          <p className="mt-2 text-sm text-slate-500">
            Se este for o primeiro acesso, cadastre abaixo o usuario administrador que vai liberar os demais usuarios e permissoes.
          </p>
          <div className="mt-6 grid gap-3">
            <input
              value={bootstrap.name}
              onChange={(event) => setBootstrap((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Nome"
              className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
            />
            <input
              value={bootstrap.email}
              onChange={(event) => setBootstrap((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Login (e-mail)"
              className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
            />
            <input
              value={bootstrap.password}
              onChange={(event) => setBootstrap((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Senha inicial"
              type="password"
              className="w-full rounded-xl border border-brand-100 px-4 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleBootstrap()}
              disabled={busy || !session?.bootstrap_required}
              className="rounded-xl border border-brand-200 px-4 py-3 text-sm font-semibold text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {session?.bootstrap_required ? 'Criar administrador' : 'Administrador ja configurado'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
