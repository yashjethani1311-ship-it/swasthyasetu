// Account-scoped encrypted device queue. The non-exportable key is stored in
// IndexedDB, survives restart, and is destroyed with the queue on logout.
const DB = 'swasthya-worker-private-v1'
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('queues')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function read(owner: string): Promise<any> {
  const db = await database()
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('queues', 'readonly')
    const r = tx.objectStore('queues').get(owner)
    tx.oncomplete = () => resolve(r.result)
    tx.onerror = () => reject(tx.error)
  }) } finally { db.close() }
}
async function write(owner: string, value: unknown) {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('queues', 'readwrite')
    if (value === null) tx.objectStore('queues').delete(owner)
    else tx.objectStore('queues').put(value, owner)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }) } finally { db.close() }
}
export async function loadWorkerNotes<T>(owner: string): Promise<T[]> {
  if (!owner) return []
  const row = await read(owner)
  if (!row) return []
  const bytes = await crypto.subtle.decrypt({name: 'AES-GCM', iv: row.iv, additionalData: new TextEncoder().encode(owner)}, row.key, row.ciphertext)
  const notes = JSON.parse(new TextDecoder().decode(bytes))
  if (!Array.isArray(notes)) throw new Error('Device queue could not be read')
  return notes
}
export async function saveWorkerNotes(owner: string, notes: unknown[]) {
  if (!owner) throw new Error('Sign in before saving a note')
  const row = await read(owner)
  const key = row?.key ?? await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner)}, key, new TextEncoder().encode(JSON.stringify(notes)))
  await write(owner, {key, iv, ciphertext})
}
export async function clearWorkerNotes(owner: string) { await write(owner, null) }
export function acknowledged(receipt: unknown): boolean {
  return !!receipt && typeof receipt === 'object' && 'status' in receipt && receipt.status === 'ACCEPTED' && 'receipt_id' in receipt && typeof receipt.receipt_id === 'string' && receipt.receipt_id.length > 0
}
