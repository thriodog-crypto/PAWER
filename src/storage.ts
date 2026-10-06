import type { AppState } from './types'
import { normalizeCoachData } from './coachData'

const DB_NAME = 'wolf-fit-db'
const STORE = 'state'
const KEY = 'current'
const SNAPSHOT_PREFIX = 'snapshot:'
const MAX_SNAPSHOTS = 5

export interface LocalSnapshot {
  key: string
  createdAt: string
  data: AppState
}

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
    req.onsuccess = () => resolve(validateState(req.result) ? normalizeCoachData(req.result) : emptyState())
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

let saveQueue: Promise<void> = Promise.resolve()
export function saveState(state: AppState): Promise<void> {
  const copy = structuredClone(state)
  const saving = saveQueue.catch(() => undefined).then(() => writeState(copy))
  saveQueue = saving
  return saving
}

async function writeState(state: AppState): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(state, KEY)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}

export async function createLocalSnapshot(state: AppState, createdAt = new Date().toISOString()): Promise<LocalSnapshot> {
  const db = await openDb()
  const snapshot = { key: `${SNAPSHOT_PREFIX}${createdAt}`, createdAt, data: structuredClone(state) }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put(snapshot, snapshot.key)
    const keysRequest = store.getAllKeys()
    keysRequest.onsuccess = () => {
      const keys = keysRequest.result.filter((key): key is string => typeof key === 'string' && key.startsWith(SNAPSHOT_PREFIX)).sort().reverse()
      keys.slice(MAX_SNAPSHOTS).forEach(key => store.delete(key))
    }
    tx.oncomplete = () => { db.close(); resolve(snapshot) }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}

export async function listLocalSnapshots(): Promise<LocalSnapshot[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result.filter((item): item is LocalSnapshot => !!item && typeof item === 'object' && typeof item.key === 'string' && item.key.startsWith(SNAPSHOT_PREFIX) && validateState(item.data)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function createAutoSnapshotIfNeeded(state: AppState, now = new Date()): Promise<boolean> {
  const snapshots = await listLocalSnapshots()
  const latest = snapshots[0] ? Date.parse(snapshots[0].createdAt) : 0
  if (latest && now.getTime() - latest < 24 * 60 * 60 * 1000) return false
  await createLocalSnapshot(state, now.toISOString())
  return true
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
  return normalizeCoachData(data)
}
