import { db } from './db'

type LocalOrderLike = {
  id: string
  status?: string
  client_request_id?: string | null
  local_only?: boolean
  items?: unknown[]
  [key: string]: unknown
}

const mergeOrderPayload = (current: LocalOrderLike | null, incoming: LocalOrderLike) => {
  const hasIncomingItems = Array.isArray(incoming.items)
  const merged: LocalOrderLike = {
    ...(current ?? {}),
    ...incoming,
  }
  if (!hasIncomingItems && Array.isArray(current?.items)) {
    merged.items = current.items
  }
  return merged
}

export async function listLocalOrders<T = LocalOrderLike>() {
  const rows = await db.local_orders.toArray()
  return rows.map((row) => row.payload as T)
}

export async function getLocalOrder<T = LocalOrderLike>(id: string) {
  const row = await db.local_orders.get(id)
  return (row?.payload as T | undefined) ?? null
}

export async function saveLocalOrder(order: LocalOrderLike) {
  const current = await getLocalOrder(order.id)
  const payload = mergeOrderPayload(current, order)
  await db.local_orders.put({
    id: order.id,
    status: String(order.status ?? current?.status ?? 'OPEN'),
    payload,
  })
}

export async function syncLocalOpenOrders(orders: LocalOrderLike[]) {
  const existing = await db.local_orders.toArray()
  const existingById = new Map(existing.map((row) => [row.id, row.payload as LocalOrderLike]))
  const serverClientRequestIds = new Set(
    orders
      .map((order) => order.client_request_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  )

  await db.transaction('rw', db.local_orders, async () => {
    for (const order of orders) {
      const current = existingById.get(order.id) ?? null
      const payload = mergeOrderPayload(current, order)
      await db.local_orders.put({
        id: order.id,
        status: String(order.status ?? current?.status ?? 'OPEN'),
        payload,
      })
    }

    for (const row of existing) {
      if (orders.some((order) => order.id === row.id)) {
        continue
      }
      const payload = row.payload as LocalOrderLike
      if (payload.local_only) {
        if (payload.client_request_id && serverClientRequestIds.has(payload.client_request_id)) {
          await db.local_orders.delete(row.id)
        }
        continue
      }
      await db.local_orders.delete(row.id)
    }
  })
}

export async function removeLocalOrder(id: string) {
  await db.local_orders.delete(id)
}
