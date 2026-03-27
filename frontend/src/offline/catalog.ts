import { db } from './db'

export async function saveCategories(categories: any[]) {
  await db.table('categories').clear()
  await db.table('categories').bulkAdd(categories)
}

export async function getCategories() {
  return db.table('categories').toArray()
}

export async function saveProducts(products: any[]) {
  await db.table('products').clear()
  await db.table('products').bulkAdd(products)
}

export async function getProducts() {
  return db.table('products').toArray()
}

export async function saveConfig(config: any) {
  await db.table('config').put({ key: 'current', ...config })
}

export async function getConfig() {
  const row = await db.table('config').get('current')
  if (!row) return null
  const { key, ...rest } = row
  return rest
}
