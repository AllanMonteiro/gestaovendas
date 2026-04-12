import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { type AuthSession, clearTokens } from '../app/auth'
import { useAuth } from '../hooks/useAuth'

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

const PublicEntryScreen: React.FC<{ allowSystemAccess?: boolean }> = ({ allowSystemAccess = true }) => (
  <div className="mx-auto flex min-h-[80vh] max-w-5xl items-center px-3 py-6 sm:px-4">
    <section className="panel w-full overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6 sm:p-8 lg:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-600">Pedido Online</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">
            Abra o cardapio e faca seu pedido sem depender do painel interno.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Esta entrada publica foi pensada para links compartilhados em Instagram, WhatsApp e navegadores internos.
            Se voce veio pelo perfil da loja, toque no botao abaixo para acessar o cardapio.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/cardapio"
              className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm"
            >
              Abrir cardapio
            </a>
            {allowSystemAccess ? (
              <a
                href="/pdv"
                className="rounded-2xl border border-brand-200 bg-white px-5 py-3 text-sm font-semibold text-brand-700"
              >
                Entrar no sistema
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-4 border-t border-brand-100 bg-white/90 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-600">Link recomendado</p>
            <p className="mt-2 break-all text-sm font-medium text-slate-700">/cardapio</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Se abriu pelo Instagram</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Caso o navegador interno esteja instavel, toque em "Abrir cardapio" e, se necessario, abra o link no navegador do celular.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Acesso interno</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              O painel administrativo continua protegido. A area publica e apenas para o cliente montar e enviar o pedido.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
)

export const LoginGate: React.FC<LoginGateProps> = ({ children }) => {
  const { login, logout, refreshSession } = useAuth()
  const location = useLocation()
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
        const response = await refreshSession()
        setSession(response)
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
  }, [loadSession])

  const requiresLogin = useMemo(
    () => Boolean(session?.require_auth && !session?.authenticated),
    [session]
  )

  const handleLogin = async () => {
    setBusy(true)
    try {
      const nextSession = await login(email, password)
      setSession(nextSession)
      setFeedback('')
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

  if (session === null) {
    if (location.pathname === '/') {
      return <PublicEntryScreen allowSystemAccess={false} />
    }

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

  if (location.pathname === '/') {
    return <PublicEntryScreen />
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
