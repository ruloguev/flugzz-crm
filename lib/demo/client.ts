import {
  DEMO_COOKIE,
  DEMO_USER_ID,
  DEMO_NAME,
  DEMO_EMAIL,
  DEMO_STORAGE_KEY,
} from "./constants"
import { getDB, table, saveTable, resetDemoDB } from "./store"
import type { DemoRow } from "./seed"

// ─────────────────────────────────────────────────────────────────────────────
// Fachada que emula la API de supabase-js que usan las páginas, respaldada por
// el store demo (localStorage). Se activa SOLO en modo demo; el camino real de
// producción (createBrowserClient) queda intacto.
// ─────────────────────────────────────────────────────────────────────────────

export function isDemoMode(): boolean {
  if (typeof document === "undefined") return false
  return document.cookie.split("; ").some((part) => part.startsWith(`${DEMO_COOKIE}=`))
}

export function setDemoMode(on: boolean): void {
  if (typeof document === "undefined") return
  const maxAge = on ? "max-age=86400" : "max-age=0"
  document.cookie = `${DEMO_COOKIE}=${on ? "1" : ""}; path=/; sameSite=lax; ${maxAge}`
}

export function startDemo(): void {
  setDemoMode(true)
}

export function stopDemo(): void {
  setDemoMode(false)
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY)
    } catch {
      // noop
    }
  }
}

export function resetDemo(): void {
  if (typeof window === "undefined") return
  resetDemoDB()
}

type Where = { col: string; op: "eq" | "neq" | "in" | "is" | "not" | "gt" | "gte" | "lt" | "lte" | "search" | "ilike" | "like"; value: unknown }
type Order = { col: string; descending: boolean; referencedTable?: string }

// tablas que referencian por reversa (colección) — perfiles → team_memberships
const REVERSE_RELATIONS: Record<string, Record<string, { table: string; fk: string }>> = {
  profiles: {
    team_memberships: { table: "team_memberships", fk: "user_id" },
  },
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sortRows(rows: DemoRow[], orders: Order[]): DemoRow[] {
  if (!orders.length) return rows
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      if (o.referencedTable) continue
      const av = a[o.col]
      const bv = b[o.col]
      if (av === bv) continue
      const aa = av == null ? "" : String(av)
      const bb = bv == null ? "" : String(bv)
      const cmp = aa < bb ? -1 : aa > bb ? 1 : 0
      return o.descending ? -cmp : cmp
    }
    return 0
  })
}

function filterRows(rows: DemoRow[], wheres: Where[]): DemoRow[] {
  return rows.filter((row) =>
    wheres.every((w) => {
      const rv = row[w.col]
      switch (w.op) {
        case "eq": {
          // igualdad tolerante a tipos (bool vs "true", date strings)
          if (rv === w.value) return true
          if (rv != null && w.value != null && String(rv) === String(w.value)) return true
          return false
        }
        case "neq": {
          if (rv === w.value) return false
          if (rv != null && w.value != null && String(rv) === String(w.value)) return false
          return true
        }
        case "in":
          return Array.isArray(w.value) && w.value.map(String).includes(String(rv))
        case "is":
          return w.value === null ? rv == null : rv != null && String(rv) === String(w.value)
        case "not":
          if (w.value === null) return rv != null
          return rv == null || String(rv) !== String(w.value)
        case "gt":
          return rv != null && String(rv) > String(w.value)
        case "gte":
          return rv != null && String(rv) >= String(w.value)
        case "lt":
          return rv != null && String(rv) < String(w.value)
        case "lte":
          return rv != null && String(rv) <= String(w.value)
        case "search": {
          const q = String(w.value ?? "").toLowerCase()
          const terms = q.split(/\s+/).filter(Boolean).slice(0, 3)
          const text = String(rv ?? "").toLowerCase()
          return terms.length === 0 ? false : terms.some((t) => text.includes(t))
        }
        case "ilike":
        case "like": {
          if (rv == null) return false
          let pattern = String(w.value ?? "")
          const ci = w.op === "ilike"
          if (ci) pattern = pattern.toLowerCase()
          const needle = pattern.replace(/^%/, "").replace(/%$/, "")
          const text = ci ? String(rv).toLowerCase() : String(rv)
          return needle === "" ? true : text.includes(needle)
        }
        default:
          return true
      }
    }),
  )
}

type ParsedField =
  | { kind: "scalar"; name: string }
  | { kind: "relation"; alias: string; table: string; fields: string }

function parseSelect(selectStr: string): ParsedField[] {
  const tokens = splitTopLevel(selectStr.replace(/\s+/g, " ").trim())
  const out: ParsedField[] = []
  for (const token of tokens) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const open = trimmed.indexOf("(")
    if (open === -1) {
      out.push({ kind: "scalar", name: trimmed })
    } else {
      const head = trimmed.slice(0, open).trim()
      const inner = trimmed.slice(open + 1, trimmed.lastIndexOf(")"))
      let alias = head
      let tableName = head
      if (head.includes(":")) {
        const parts = head.split(":")
        alias = parts[0].trim()
        tableName = parts.slice(1).join(":").trim()
      }
      // quita hints de fk (team_memberships!team_memberships_user_id_fkey(...))
      alias = alias.split("!")[0].trim()
      tableName = tableName.split("!")[0].trim()
      if (!tableName) continue
      out.push({ kind: "relation", alias, table: tableName, fields: inner })
    }
  }
  return out
}

function splitTopLevel(str: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of str) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}

function resolveRelation(parentTable: string, parent: DemoRow, field: ParsedField): unknown {
  if (field.kind !== "relation") return null
  const fkCol = `${field.alias}_id`
  const reverse = REVERSE_RELATIONS[parentTable]?.[field.alias]

  if (parent[fkCol] !== undefined && parent[fkCol] !== null) {
    const child = table(field.table).find((r) => r.id === parent[fkCol])
    return child ? project(child, field.fields, field.table) : null
  }
  if (reverse) {
    const children = table(reverse.table).filter((r) => r[reverse.fk] === parent.id)
    return children.map((c) => project(c, field.fields, field.table))
  }
  // relación por igualda de company_id (leads → sources etc.) raro:
  if (field.table === "lead_sources" && parent.source_id != null) {
    const child = table(field.table).find((r) => r.id === parent.source_id)
    return child ? project(child, field.fields, field.table) : null
  }
  return null
}

function project(row: DemoRow, selectStr: string, parentTable?: string): Record<string, unknown> {
  const fields = parseSelect(selectStr)
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.kind === "scalar") {
      if (field.name === "*") {
        Object.assign(result, row)
      } else if (field.name in row) {
        result[field.name] = row[field.name]
      }
    } else {
      result[field.alias] = resolveRelation(parentTable ?? "", row, field)
    }
  }
  return result
}

type ExecuteMode =
  | { kind: "select" }
  | { kind: "insert"; rows: DemoRow[] }
  | { kind: "update"; patch: DemoRow }
  | { kind: "delete" }

type ExeResult = { data: any; count: number | null; error: { message: string; code: string } | null }

class DemoQuery implements PromiseLike<ExeResult> {
  private tableName: string
  private selectStr = "*"
  private countMode = false
  private head = false
  private wheres: Where[] = []
  private orders: Order[] = []
  private limitN: number | null = null
  private useSingle = false
  private useMaybeSingle = false
  private mode: ExecuteMode = { kind: "select" }

  constructor(tableName: string) {
    this.tableName = tableName
  }

  select(fields: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    this.selectStr = fields
    if (opts?.count) this.countMode = true
    if (opts?.head) this.head = true
    return this
  }
  eq(col: string, value: unknown) {
    this.wheres.push({ col, op: "eq", value })
    return this
  }
  neq(col: string, value: unknown) {
    this.wheres.push({ col, op: "neq", value })
    return this
  }
  in(col: string, values: unknown[]) {
    this.wheres.push({ col, op: "in", value: values })
    return this
  }
  not(col: string, op: string, value: unknown) {
    this.wheres.push({ col, op: "not", value })
    void op
    return this
  }
  gt(col: string, value: unknown) {
    this.wheres.push({ col, op: "gt", value })
    return this
  }
  gte(col: string, value: unknown) {
    this.wheres.push({ col, op: "gte", value })
    return this
  }
  lt(col: string, value: unknown) {
    this.wheres.push({ col, op: "lt", value })
    return this
  }
  lte(col: string, value: unknown) {
    this.wheres.push({ col, op: "lte", value })
    return this
  }
  ilike(col: string, value: string | unknown) {
    this.wheres.push({ col, op: "ilike", value })
    return this
  }
  like(col: string, value: string | unknown) {
    this.wheres.push({ col, op: "like", value })
    return this
  }
  textSearch(col: string, query: string | unknown, _opts?: unknown) {
    this.wheres.push({ col, op: "search", value: query })
    return this
  }
order(col: string, opts?: { ascending?: boolean; referencedTable?: string }) {
    this.orders.push({ col, descending: opts?.ascending === false, referencedTable: opts?.referencedTable })
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  single() {
    this.useSingle = true
    return this
  }
  maybeSingle() {
    this.useMaybeSingle = true
    return this
  }
  insert(rows: DemoRow | DemoRow[]) {
    const arr = Array.isArray(rows) ? rows : [rows]
    this.mode = { kind: "insert", rows: arr }
    return this
  }
  upsert(rows: DemoRow | DemoRow[]) {
    return this.insert(rows)
  }
  update(patch: DemoRow) {
    this.mode = { kind: "update", patch }
    return this
  }
  delete() {
    this.mode = { kind: "delete" }
    return this
  }

  then<TResult1 = ExeResult, TResult2 = never>(
    onfulfilled?: ((value: ExeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private execute(): Promise<ExeResult> {
    const q = getDB()
    const rows = table(this.tableName)

    if (this.mode.kind === "insert") {
      const world = q[this.tableName]
      const inserted: DemoRow[] = []
      for (const r of this.mode.rows) {
        const row: DemoRow = { ...r }
        if (!row.id) row.id = genId()
        if (!row.created_at) row.created_at = new Date().toISOString()
        inserted.push(row)
        world.push(row)
      }
      saveTable(this.tableName, [...world])
      const data = this.hasProjection()
        ? inserted.length === 1
          ? project(inserted[0], this.selectStr)
          : inserted.map((r) => project(r, this.selectStr))
        : null
      return Promise.resolve(this.finish({ data, count: inserted.length }))
    }

    if (this.mode.kind === "update" || this.mode.kind === "delete") {
      let matched = filterRows(rows, this.wheres)
      const patched: DemoRow[] = []
      for (const r of matched) {
        const updated = this.mode.kind === "update" ? { ...r, ...this.mode.patch } : { ...r }
        if (this.mode.kind === "update") updated.updated_at = new Date().toISOString()
        patched.push(updated)
      }
      const idSet = new Set(patched.map((r) => r.id))
      const next = this.mode.kind === "update"
        ? rows.map((r) => (idSet.has(r.id) ? patched.find((p) => p.id === r.id)! : r))
        : rows.filter((r) => !idSet.has(r.id))
      saveTable(this.tableName, [...next])
      const data = this.hasProjection()
        ? patched.length === 1
          ? project(patched[0], this.selectStr)
          : patched.map((r) => project(r, this.selectStr))
        : null
      return Promise.resolve(this.finish({ data, count: patched.length }))
    }

    // select
    let working = filterRows(rows, this.wheres)
    if (this.orders.length) working = sortRows(working, this.orders)
    if (this.limitN != null) working = working.slice(0, this.limitN)

    const projected = working.map((r) => project(r, this.selectStr, this.tableName))

    if (this.countMode) {
      return Promise.resolve({ data: this.head ? [] : projected, count: working.length, error: null })
    }

    if (this.useSingle) {
      if (projected.length === 1) return Promise.resolve({ data: projected[0], count: 1, error: null })
      const msg = "JSON object requested, multiple (or no) rows returned"
      return Promise.resolve({
        data: projected[0] ?? null,
        count: projected.length,
        error: { message: `PGRST116: ${msg}`, code: "PGRST116" },
      })
    }
    if (this.useMaybeSingle) {
      return Promise.resolve({ data: projected[0] ?? null, count: projected.length, error: null })
    }
    return Promise.resolve({ data: projected, count: projected.length, error: null })
  }

  private hasProjection(): boolean {
    return this.selectStr !== "*" && this.countMode === false
  }

  private finish(r: { data: unknown; count: number }) {
    if (this.useSingle) {
      const arr = Array.isArray(r.data) ? r.data : (r.data as DemoRow[] | null)
      const only = arr as unknown[] | null
      if (only && only.length === 1) return { data: only[0], count: 1, error: null }
      return {
        data: null,
        count: r.count,
        error: { message: "PGRST116: JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
      }
    }
    if (this.useMaybeSingle) {
      const arr = (Array.isArray(r.data) ? r.data : null) as unknown[] | null
      return { data: arr && arr.length > 0 ? arr[0] : null, count: r.count, error: null }
    }
    return { data: r.data, count: r.count, error: null }
  }
}

function makeAuth() {
  return {
    getUser: async () => ({
      data: {
        user: {
          id: DEMO_USER_ID,
          email: DEMO_EMAIL,
          user_metadata: { full_name: DEMO_NAME },
        },
      },
      error: null,
    }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {
      stopDemo()
      if (typeof window !== "undefined") window.location.assign("/")
      return { error: null }
    },
    signInWithPassword: async () => ({ data: { session: null }, error: { message: "demo" } }),
    signUp: async () => ({ data: { user: null }, error: { message: "demo" } }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  }
}

function makeStorage() {
  const storage = {
    from: (bucket: string) => ({
      list: async (prefix: string | null, opts?: { limit?: number; offset?: number }) => {
        const files = table("storage_files").filter(
          (f) => f.bucket === bucket && (prefix ? String(f.name).startsWith(String(prefix)) : true),
        )
        const rows = files.slice(0, opts?.limit ?? 200).map((f) => ({
          name: f.name,
          id: f.id,
          updated_at: f.updated_at,
          created_at: f.created_at,
          metadata: f.metadata,
        }))
        return { data: rows, error: null }
      },
      upload: async (path: string, _file: unknown) => {
        const storageFiles = table("storage_files")
        storageFiles.push({
          bucket,
          name: path,
          id: genId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { size: 0, mimetype: "application/octet-stream" },
        })
        saveTable("storage_files", [...storageFiles])
        return { data: { path }, error: null }
      },
      createSignedUrl: async () => ({ data: { signedUrl: null }, error: null }),
      remove: async (paths: string[]) => {
        const keep = table("storage_files").filter((f) => !paths.includes(String(f.name)))
        saveTable("storage_files", [...keep])
        return { data: [], error: null }
      },
      move: async (from: string, to: string) => {
        const storageFiles = table("storage_files").map((f) =>
          String(f.name) === from ? { ...f, name: to } : f,
        )
        saveTable("storage_files", [...storageFiles])
        return { data: { path: to }, error: null }
      },
      download: async () => ({ data: null, error: { message: "No disponible en modo demo" } }),
    }),
  }
  return storage
}

export type DemoClient = {
  from: (t: string) => DemoQuery
  rpc: (fn: string, _args?: Record<string, unknown>) => Promise<{ data: unknown; error: null }>
  auth: ReturnType<typeof makeAuth>
  storage: ReturnType<typeof makeStorage>
  channel: (name: string) => DemoChannel
  removeChannel: (_channel: DemoChannel) => void
}

export type DemoChannel = {
  on: (event: string, opts: unknown, cb: (payload: unknown) => void) => DemoChannel
  subscribe: () => DemoChannel
  unsubscribe: () => void
}

export function createDemoClient(): DemoClient {
  return {
    from: (t: string) => new DemoQuery(t),
    rpc: async (fn: string) => {
      void fn
      return { data: true, error: null }
    },
    auth: makeAuth(),
    storage: makeStorage(),
    channel: () => {
      const channel: DemoChannel = {
        on: (_event, _opts, _cb) => channel,
        subscribe: () => channel,
        unsubscribe: () => {},
      }
      return channel
    },
    removeChannel: (_channel) => {},
  }
}