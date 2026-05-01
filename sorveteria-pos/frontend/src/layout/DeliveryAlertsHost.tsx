import React from 'react'
import type { DeliverySoundRuntimeStatus } from '../app/playNotificationSound'

type DeliveryAlert = {
  id: string
  customer_name?: string
  total?: string
}

type DeliveryAlertsHostProps = {
  alerts: DeliveryAlert[]
  runtime: DeliverySoundRuntimeStatus
  onDismiss: (id: string) => void
  onOpenDelivery: () => void
  onUnlockSound: () => void
}

export const DeliveryAlertsHost: React.FC<DeliveryAlertsHostProps> = ({
  alerts,
  runtime,
  onDismiss,
  onOpenDelivery,
  onUnlockSound,
}) => (
  <>
    {alerts.length ? (
      <div className="pointer-events-none fixed right-4 top-24 z-50 flex w-[min(92vw,23rem)] flex-col gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="pointer-events-auto rounded-2xl border border-emerald-200 bg-white p-4 shadow-lg shadow-emerald-100/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-600">Novo delivery</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">{alert.customer_name || 'Novo pedido'}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Pedido recebido agora{alert.total ? ` • R$ ${alert.total}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(alert.id)}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500"
              >
                Fechar
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenDelivery}
              className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Abrir delivery
            </button>
          </div>
        ))}
      </div>
    ) : null}

    {alerts.length > 0 && runtime.enabled && !runtime.unlocked ? (
      <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg shadow-amber-200/40">
          <div className="min-w-0">
            <p className="font-semibold">Som do delivery bloqueado neste computador</p>
            <p className="text-amber-800/90">Ative uma vez neste navegador para liberar o alarme da loja.</p>
          </div>
          <button
            type="button"
            onClick={onUnlockSound}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white transition hover:bg-amber-600"
          >
            Ativar som
          </button>
        </div>
      </div>
    ) : null}
  </>
)
