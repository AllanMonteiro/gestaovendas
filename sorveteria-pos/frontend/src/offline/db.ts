import Dexie, { Table } from 'dexie'

export interface OutboxItem {
  id?: number
  method: string
  url: string
  body: any
  headers: Record<string, string>
  created_at: string
  attempts: number
  last_error?: string
  client_request_id?: string
}

export interface LocalOrder {
  id: string
  status: string
  payload: any
}

class PosDB extends Dexie {
  outbox!: Table<OutboxItem, number>
  local_orders!: Table<LocalOrder, string>

  constructor() {
    super('sorveteria-pos')
    this.version(2).stores({
      outbox: '++id, created_at, attempts, client_request_id',
      local_orders: 'id, status',
      products: 'id, name, category, active',
      categories: 'id, name',
      config: 'key'
    })
  }
}

export const db = new PosDB()