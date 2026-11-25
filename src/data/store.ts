import { del, get, set } from 'idb-keyval'
import { produce } from 'immer'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { buildSeed } from '../seed/build'
import { DB_SCHEMA_VERSION, type Db, type DbAccess } from './db'

const KEY = 'ediq-pipelines-db'

interface StoreState {
  db: Db | null
  status: 'loading' | 'ready' | 'error'
  error?: string
}

export const useStore = create<StoreState>(() => ({ db: null, status: 'loading' }))

/** Service access backed by the store. All writes go through here. */
export const access: DbAccess = {
  get: () => {
    const db = useStore.getState().db
    if (!db) throw new Error('Database not loaded')
    return db
  },
  mutate: (fn) => {
    useStore.setState((s) =>
      s.db
        ? {
            db: produce(s.db, (draft) => {
              fn(draft) // ignore any return value so expression-bodied recipes are safe
            }),
          }
        : s,
    )
  },
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastSaved: Db | null = null
useStore.subscribe((s) => {
  if (!s.db || s.db === lastSaved) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const db = useStore.getState().db
    if (!db) return
    lastSaved = db
    set(KEY, db).catch(() => {
      /* storage unavailable: the prototype still works for this session */
    })
  }, 400)
})

export async function loadDb(): Promise<Db> {
  try {
    const saved = (await get(KEY)) as Db | undefined
    if (saved && saved.schemaVersion === DB_SCHEMA_VERSION) {
      lastSaved = saved
      useStore.setState({ db: saved, status: 'ready' })
      return saved
    }
  } catch {
    /* fall through to a fresh seed */
  }
  const fresh = await buildSeed()
  useStore.setState({ db: fresh, status: 'ready' })
  return fresh
}

export async function resetDb(): Promise<void> {
  useStore.setState({ status: 'loading' })
  try {
    await del(KEY)
  } catch {
    /* ignore */
  }
  const fresh = await buildSeed()
  lastSaved = null
  useStore.setState({ db: fresh, status: 'ready' })
}

/** Select from the database. Results are compared shallowly, so filtered arrays are stable. */
export function useDb<T>(selector: (db: Db) => T): T {
  return useStore(useShallow((s: StoreState) => selector(s.db as Db)))
}
