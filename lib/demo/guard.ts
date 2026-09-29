import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { DEMO_COOKIE } from "./constants"
import { createDemoClient } from "./client"
import { buildSeed, type DemoDB, type DemoRow } from "./seed"

// Helpers server-side para el modo demo. Nunca tocan la base de datos real:
// responden desde la semilla (cache) o devuelven 400/403 informativo.

export function isDemoRequest(req: NextRequest): boolean {
  return req.cookies.get(DEMO_COOKIE)?.value === "1"
}

export function demoClient() {
  // Tipo comparte la superficie de Supabase para no romper el tipado de las
  // rutas (evita unions raros); en runtime es la fachada demo en memoria.
  return createDemoClient() as unknown as SupabaseClient
}

export function demoUnavailable(
  message = "Esta función no está disponible en el modo demo.",
  status = 400,
) {
  return NextResponse.json({ error: message }, { status })
}

function seed(): DemoDB {
  return buildSeed()
}

export function demoSearch(q: string) {
  const db = seed()
  const needle = q.toLowerCase()

  const leads: any[] = []
  const contacts: any[] = []
  const files: any[] = []
  const members: any[] = []

  const profiles = db.profiles ?? []
  const roles = db.roles ?? []
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? "Sin rol"

  for (const l of db.leads ?? []) {
    const contact = (db.contacts ?? []).find((c) => c.id === l.contact_id)
    const name = String(contact?.full_name ?? l.title ?? "")
    if (name.toLowerCase().includes(needle) || String(l.title ?? "").toLowerCase().includes(needle)) {
      leads.push({
        category: "leads",
        id: l.id,
        title: name || String(l.title ?? "Sin nombre"),
        subtitle: String(contact?.phone ?? "") || String(l.title ?? "Sin contacto"),
        href: `/leads/${l.id}`,
      })
    }
    if (leads.length >= 5) break
  }

  for (const c of db.contacts ?? []) {
    const hay = [String(c.full_name ?? ""), String(c.email ?? ""), String(c.phone ?? "")].join(" ").toLowerCase()
    if (hay.includes(needle)) {
      contacts.push({
        category: "contacts",
        id: c.id,
        title: String(c.full_name ?? "Sin nombre"),
        subtitle: [c.email, c.phone].filter(Boolean).join(" · "),
        href: `/contactos?contact=${c.id}`,
      })
    }
    if (contacts.length >= 5) break
  }

  for (const f of db.storage_files ?? []) {
    const name = String(f.name ?? "")
    if (name.toLowerCase().includes(needle)) {
      files.push({
        category: "files",
        id: String(f.id ?? name),
        title: name.split("/").pop() || name,
        subtitle: "/" + name.split("/").slice(0, -1).join("/"),
        href: `/drive?q=${encodeURIComponent(q)}`,
      })
    }
    if (files.length >= 5) break
  }

  for (const p of profiles) {
    const hay = [String(p.full_name ?? ""), String(p.email ?? "")].join(" ").toLowerCase()
    if (hay.includes(needle)) {
      members.push({
        category: "members",
        id: p.id,
        title: String(p.full_name ?? "Sin nombre"),
        subtitle: roleName((p.role_id as string) ?? null),
        href: `/ajustes/equipo?member=${p.id}`,
      })
    }
    if (members.length >= 5) break
  }

  return { leads, contacts, files, members }
}

export function demoTeamMembers() {
  const db = seed()
  const roles = (db.roles ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    level: r.level,
    color: r.color,
  }))
  const roleById = new Map<string, DemoRow>(roles.map((r: DemoRow) => [String(r.id), r]))
  const memberships = db.team_memberships ?? []

  const members = (db.profiles ?? []).map((p) => {
    const m = memberships.find((tm) => tm.user_id === p.id)
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone ?? null,
      avatar_url: p.avatar_url ?? null,
      is_active: p.is_active,
      role_id: p.role_id ?? null,
      created_at: p.created_at,
      role: p.role_id ? (roleById.get(String(p.role_id)) ?? null) : null,
      reports_to: m?.reports_to ?? null,
    }
  })

  return { members, roles }
}

export function demoDocumentList() {
  const db = seed()
  const docs = (db.knowledge_documents ?? [])
    .filter((d) => d.is_active === true)
    .map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description ?? null,
      file_type: d.file_type ?? "md",
      status: d.status ?? "indexed",
      version: d.version ?? 1,
      created_at: d.created_at,
    }))
  const chunkCounts: Record<string, number> = {}
  for (const c of db.knowledge_chunks ?? []) {
    const docId = String(c.document_id)
    chunkCounts[docId] = (chunkCounts[docId] ?? 0) + 1
  }
  return { docs, chunkCounts }
}

export function demoCastRoster() {
  // Solo para rutas de escritura de equipo: bloquea con mensaje claro.
  return demoUnavailable("En el modo demo no se pueden crear o eliminar cuentas reales.", 403)
}

export function demoLeadEvents(leadId: string) {
  const db = seed()
  return (db.lead_events ?? [])
    .filter((e) => String(e.lead_id) === leadId)
    .sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))
}

export type { DemoRow }