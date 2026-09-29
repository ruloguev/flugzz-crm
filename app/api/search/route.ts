import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { computeScope } from "@/lib/role-scope"
import { demoSearch, isDemoRequest } from "@/lib/demo/guard"
import type {
  SearchHits,
  SearchItemLead,
  SearchItemContact,
  SearchItemFile,
  SearchItemMember,
} from "@/lib/search/types"

export const runtime = "nodejs"

function adminClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) throw new Error("Faltan variables de entorno del servidor.")
  return createClient(url, key)
}

const PER_CATEGORY_LIMIT = 5

/**
 * GET /api/search?q=juan
 *
 * Devuelve resultados categorizados (leads, contacts, files, members).
 * Las acciones se computan en cliente (lib/search/actions.ts) según permisos.
 *
 * Scope:
 *  - Director/gerente/coordinador: ve todos los leads/contacts de su empresa
 *    (filtrados por company_id) + todos los miembros activos.
 *  - Agente (sin can_view_team): solo ve leads/contacts donde owner_id = self.
 *
 * Performance: 4 queries en paralelo, cada una con LIMIT 5.
 */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
    if (q.length < 2) {
      return NextResponse.json(emptyResults())
    }

    if (isDemoRequest(req)) {
      return NextResponse.json(demoSearch(q))
    }

    const cookieStore = await cookies()
    const userSupabase = createServerClient(
      getSupabaseUrl()!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )

    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Sesión no encontrada." }, { status: 401 })
    }

    const supabase = adminClient()

    // Obtener company_id del actor (1 query rápida antes de las 4 paralelas)
    const { data: actorRow } = await supabase
      .from("profiles")
      .select("id, company_id, role:roles(id, name, level, permissions)")
      .eq("id", user.id)
      .single()

    if (!actorRow?.company_id) {
      return NextResponse.json({ error: "Empresa no encontrada." }, { status: 400 })
    }

    // Cargar miembros del equipo en paralelo con los 4 queries de búsqueda
    const safeQ = escapeIlike(q)
    const orFilter = `full_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`

    const [
      teamProfilesRes,
      leadsRes,
      contactsRes,
      filesRes,
      membersRes,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role:roles(level)")
        .eq("company_id", actorRow.company_id)
        .eq("is_active", true),
      supabase
        .from("leads")
        .select("id, full_name, phone, email, owner_id, stage_id, source_id, title, created_at, company_id, stage:stages!left(name, color)")
        .eq("company_id", actorRow.company_id)
        .or(orFilter)
        .order("created_at", { ascending: false })
        .limit(PER_CATEGORY_LIMIT * 3),
      supabase
        .from("contacts")
        .select("id, full_name, email, phone, owner_id, company_id")
        .eq("company_id", actorRow.company_id)
        .or(orFilter)
        .limit(PER_CATEGORY_LIMIT * 3),
      supabase.storage
        .from("company-drive")
        .list(`${actorRow.company_id}/`, {
          limit: PER_CATEGORY_LIMIT * 3,
          search: q,
          sortBy: { column: "name", order: "asc" },
        }),
      supabase
        .from("profiles")
        .select("id, full_name, email, role:roles!inner(name, color)")
        .eq("company_id", actorRow.company_id)
        .eq("is_active", true)
        .or(`full_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
        .limit(PER_CATEGORY_LIMIT * 3),
    ])

    // Calcular scope jerárquico
    const role = Array.isArray(actorRow.role) ? actorRow.role[0] : actorRow.role
    const teamMembers = (teamProfilesRes.data ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      role: Array.isArray(p.role) ? p.role[0] : p.role,
    }))
    const scope = computeScope(actorRow.id, role, teamMembers)

    // Aplicar scope a leads y contacts
    const leads = (leadsRes.data ?? [])
      .filter((l: any) => scope.canViewTeam || scope.isTransversal || l.owner_id === actorRow.id)
      .slice(0, PER_CATEGORY_LIMIT)
    const contacts = (contactsRes.data ?? [])
      .filter((c: any) => scope.canViewTeam || scope.isTransversal || c.owner_id === actorRow.id)
      .slice(0, PER_CATEGORY_LIMIT)

    // Formatear resultados
    const leadItems: SearchItemLead[] = leads.map((l: any) => {
      const stage = Array.isArray(l.stage) ? l.stage[0] : l.stage
      const subtitle = [l.phone, l.email].filter(Boolean).join(" · ") || stage?.name || "Sin contacto"
      return {
        category: "leads",
        id: l.id,
        title: l.full_name || l.title || "Sin nombre",
        subtitle,
        href: `/leads/${l.id}`,
      }
    })

    const contactItems: SearchItemContact[] = contacts.map((c: any) => {
      const subtitle = [c.email, c.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"
      return {
        category: "contacts",
        id: c.id,
        title: c.full_name || "Sin nombre",
        subtitle,
        href: `/contactos?contact=${c.id}`,
      }
    })

    const fileItems: SearchItemFile[] = ((filesRes.data ?? []) as any[])
      .filter((f) => f.name && f.name !== ".emptyFolderPlaceholder")
      .slice(0, PER_CATEGORY_LIMIT)
      .map((f: any) => {
        return {
          category: "files",
          id: f.id ?? f.name,
          title: f.name.split("/").pop() || f.name,
          subtitle: "/" + f.name.split("/").slice(0, -1).join("/"),
          href: `/drive?q=${encodeURIComponent(q)}`,
        }
      })

    const memberItems: SearchItemMember[] = ((membersRes.data ?? []) as any[]).map((p: any) => {
      const r = Array.isArray(p.role) ? p.role[0] : p.role
      return {
        category: "members",
        id: p.id,
        title: p.full_name || "Sin nombre",
        subtitle: r?.name ? `${r.name}${p.email ? " · " + p.email : ""}` : (p.email ?? ""),
        href: `/ajustes/equipo?member=${p.id}`,
      }
    })

    return NextResponse.json({
      leads: leadItems,
      contacts: contactItems,
      files: fileItems,
      members: memberItems,
    } satisfies SearchHits)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    console.error("[search]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function emptyResults(): SearchHits {
  return { leads: [], contacts: [], files: [], members: [] }
}

function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => "\\" + m)
}
