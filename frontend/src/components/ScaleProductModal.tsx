import React, { useEffect, useMemo, useState } from 'react'

type Product = {
  id: number
  name: string
}

type ScaleStatusResponse = {
  connected?: boolean
  port?: string
  last_error?: string | null
}

type ScaleProductModalProps = {
  product: Product | null
  agentUrl: string
  onCancel: () => void
  onConfirm: (weightGrams: number) => void
  onError: (message: string) => void
}

const parseScaleWeightInput = (value: string) => {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

const ScaleProductModalComponent: React.FC<ScaleProductModalProps> = ({
  product,
  agentUrl,
  onCancel,
  onConfirm,
  onError,
}) => {
  const [weightInput, setWeightInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (product) {
      setWeightInput('')
    }
  }, [product])

  const parsedWeight = useMemo(() => parseScaleWeightInput(weightInput), [weightInput])
  const normalizedWeight =
    parsedWeight !== null && Number.isFinite(parsedWeight) && parsedWeight > 0
      ? Math.round(parsedWeight)
      : null

  const handleFetchScaleWeight = async () => {
    if (!agentUrl) {
      onError('URL do Agent nao configurada.')
      return
    }
    setLoading(true)
    try {
      const normalizedAgentUrl = agentUrl.trim().replace(/\/$/, '')
      const response = await fetch(`${normalizedAgentUrl}/scale/weight`)
      if (!response.ok) throw new Error()
      const data = await response.json()
      const grams = Number(data.grams ?? 0)
      const nextWeight = Number.isFinite(grams) && grams > 0 ? Math.round(grams) : 0
      if (nextWeight <= 0) {
        try {
          const statusResponse = await fetch(`${normalizedAgentUrl}/scale/status`)
          if (statusResponse.ok) {
            const status = (await statusResponse.json()) as ScaleStatusResponse
            if (status.connected === false) {
              const detail = status.last_error ? ` (${status.last_error})` : ''
              onError(`Balanca sem comunicacao na porta ${status.port || 'configurada'}${detail}.`)
              return
            }
          }
        } catch {
          // Keep the fallback message below when the status endpoint is unavailable.
        }
        onError('Nenhum peso foi lido da balanca. Confira cabo, porta COM e driver.')
        return
      }
      setWeightInput(nextWeight > 0 ? String(nextWeight) : '')
    } catch {
      onError('Falha ao ler balanca. Confira se o Agent esta rodando.')
    } finally {
      setLoading(false)
    }
  }

  if (!product) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
      <div className="mobile-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold">Produto por Peso</h3>
        <p className="mt-1 text-sm text-slate-500">{product.name}</p>

        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-6">
          <div className="text-center">
            <span className="text-4xl font-bold text-brand-700">{normalizedWeight ?? 0}g</span>
            <p className="mt-1 text-sm font-medium text-slate-500">{((normalizedWeight ?? 0) / 1000).toFixed(3)} kg</p>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase text-slate-500">Digite o peso manualmente (gramas)</label>
          <input
            type="text"
            inputMode="decimal"
            value={weightInput}
            onChange={(event) => setWeightInput(event.target.value)}
            placeholder="Ex: 500"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          {weightInput.trim() && parsedWeight === null ? (
            <p className="mt-1 text-xs font-medium text-rose-600">Digite um peso valido em gramas.</p>
          ) : null}
        </div>

        <button
          onClick={() => void handleFetchScaleWeight()}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
        >
          {loading ? 'Lendo...' : 'Ler da balanca automaticamente'}
        </button>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => normalizedWeight !== null && onConfirm(normalizedWeight)}
            disabled={normalizedWeight === null}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirmar e Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}

export const ScaleProductModal = React.memo(ScaleProductModalComponent)
