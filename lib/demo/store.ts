import { DEMO_STORAGE_KEY } from "./constants"
import { buildSeed, type DemoDB, type DemoRow } from "./seed"

// Store client-side (localStorage) que respalda la fachada demo.
// Nunca se importa desde server components ni route handlers.

let cache: DemoDB | null = null

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage
}

export function getDB(): DemoDB {
  if (cache) return cache
  if (canUseStorage()) {
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDB
        if (parsed && typeof parsed === "object") {
          cache = parsed
          return cache
        }
      }
    } catch {
      // almacen corrupto → regenerar
    }
  }
  cache = buildSeed()
  return cache
}

export function persist(): void {
  if (!canUseStorage() || !cache) return
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // quota excedida: seguimos en memoria
  }
}

export function table(name: string): DemoRow[] {
  const db = getDB()
  if (!db[name]) db[name] = []
  return db[name]
}

export function saveTable(name: string, rows: DemoRow[]): void {
  getDB()[name] = rows
  persist()
}

export function resetDemoDB(): DemoDB {
  const fresh = buildSeed()
  cache = fresh
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY)
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fresh))
    } catch {
      // de todas formas queda en memoria
    }
  }
  return fresh
}

export function clearDemoDB(): void {
  cache = null
  if (canUseStorage()) {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY)
    } catch {
      // noop
    }
  }
}