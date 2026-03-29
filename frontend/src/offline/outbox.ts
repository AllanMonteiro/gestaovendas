import { db, OutboxItem } from './db'

const dispatchOutboxChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sorveteria:outbox-changed'))
  }
}

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
}

export async function removeOutbox(id: number) {
  await db.outbox.delete(id)
  dispatchOutboxChanged()
}

export async function getOutboxCount() {
  return db.outbox.count()
}
