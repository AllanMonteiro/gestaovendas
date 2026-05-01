import { db, OutboxItem } from './db'

const ORDER_OUTBOX_URL_PATTERN = /^\/api\/orders(?:\/|$)/i

const dispatchOutboxChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sorveteria:outbox-changed'))
  }
}

export const isOutboxUrlSupported = (url?: string | null) =>
  typeof url === 'string' && ORDER_OUTBOX_URL_PATTERN.test(url)

export async function enqueueOutbox(item: Omit<OutboxItem, 'id' | 'created_at' | 'attempts'>) {
  await db.outbox.add({
    ...item,
    created_at: new Date().toISOString(),
    attempts: 0
  })
  dispatchOutboxChanged()
}

export async function listOutbox() {
  return db.outbox.orderBy('created_at').toArray()
}

export async function markOutboxError(id: number, error: string) {
  const item = await db.outbox.get(id)
  await db.outbox.update(id, { attempts: (item?.attempts ?? 0) + 1, last_error: error })
  dispatchOutboxChanged()
}

export async function removeOutbox(id: number) {
  await db.outbox.delete(id)
  dispatchOutboxChanged()
}

export async function removeOutboxEntries(predicate: (item: OutboxItem) => boolean) {
  const items = await db.outbox.toArray()
  const idsToRemove = items.filter(predicate).map((item) => item.id).filter((id): id is number => typeof id === 'number')
  if (idsToRemove.length === 0) {
    return 0
  }
  await db.transaction('rw', db.outbox, async () => {
    await db.outbox.bulkDelete(idsToRemove)
  })
  dispatchOutboxChanged()
  return idsToRemove.length
}

export async function getOutboxCount() {
  return db.outbox.count()
}
