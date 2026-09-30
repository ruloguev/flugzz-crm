import { DEMO_STORAGE_KEY } from "./constants"
import { buildSeed, type DemoDB, type DemoRow } from "./seed"

// Store client-side (localStorage) que respalda la fachada demo.
// Nunca se importa desde server components ni route handlers.

let cache: DemoDB | null = null

// Tablas que el showcase de la demo necesita siempre presentes. Si alguna falta
// o quedó vacía, el localStorage guardado está corrupto o desactualizado y se
// regenera la semilla (auto-reparación) en vez de dejar páginas en blanco.
const REQUIRED_TABLES = [
  "companies",
  "company_subscriptions",
  "profiles",
  "pipeline_stages",
  "leads",
  "contacts",
  "activities",
]

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage
}

function isDemoDBUsable(db: unknown): db is DemoDB {
  if (!db || typeof db !== "object") return false
  const d = db as Record<string, unknown>
  return REQUIRED_TABLES.every((t) => Array.isArray(d[t]) && (d[t] as unknown[]).length > 0)
}

export function getDB(): DemoDB {
  if (cache) return cache
  if (canUseStorage()) {
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDB
        if (isDemoDBUsable(parsed)) {
          cache = parsed
          return cache
        }
        // guardado corrupto/incompleto → regeneramos abajo
      }
    } catch {
      // almacen corrupto → regenerar
    }
  }
  // Semilla nueva: la persistimos de inmediato para que las cargas siguientes
  // sean consistentes y no se reconstruya en cada navegación.
  cache = buildSeed()
  persist()
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