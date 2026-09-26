import type { AppState } from './types'

const DB_NAME = 'wolf-fit-db'
const STORE = 'state'
const KEY = 'current'

export const emptyState = (): AppState => ({
  version: 1,
  definitions: [],
  programs: [],
  workouts: [],
  bodyWeights: [],
  measurements: [],
  imports: [],
  settings: { sound: false, vibration: false, keepAwake: false },
})

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadState(): Promise<AppState> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(KEY)
    req.onsuccess = () => resolve(validateState(req.result) ? req.result : emptyState())
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function saveState(state: AppState): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(state, KEY)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}

export function validateState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AppState>
  return state.version === 1
    && Array.isArray(state.definitions)
    && Array.isArray(state.programs)
    && Array.isArray(state.workouts)
    && Array.isArray(state.bodyWeights)
    && Array.isArray(state.measurements)
    && Array.isArray(state.imports)
    && !!state.settings
}

export function backupJson(state: AppState): string {
  return JSON.stringify({ kind: 'wolf-fit-backup', exportedAt: new Date().toISOString(), data: state }, null, 2)
}

export function parseBackup(text: string): AppState {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || (parsed as { kind?: string }).kind !== 'wolf-fit-backup') throw new Error('Это не резервная копия PAWER')
  const data = (parsed as { data?: unknown }).data
  if (!validateState(data)) throw new Error('Формат копии повреждён или не поддерживается')
  return data
}
