import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function adminClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) throw new Error("Faltan variables de entorno del servidor.")
  return createClient(url, key)
}

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${base}-${suffix}`
}

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const supabase = adminClient()

    const { userId, email, fullName, companyName, currency = "MXN" } = await req.json()

    if (!userId || !email || !fullName || !companyName) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: userId, email, fullName, companyName." },
        { status: 400 }
      )
    }

    // 1. Crear empresa — sin 'industry', con slug generado
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: companyName.trim(),
        slug: makeSlug(companyName),
        default_currency: currency,
        allowed_currencies: [currency],
        is_active: true,
        settings: {},
      })
      .select("id")
      .single()

    if (companyError || !company) {
      console.error("companies insert:", companyError)
      return NextResponse.json(
        { error: companyError?.message ?? "Error creando empresa." },
        { status: 500 }
      )
    }

    const companyId = company.id

    // 2. Roles por defecto
    const { data: rolesData, error: rolesError } = await supabase
      .from("roles")
      .insert([
        {
          company_id: companyId, name: "Director", level: 1, color: "#22d3ee",
          permissions: {
            can_manage_users: true, can_manage_roles: true, can_manage_integrations: true,
            can_manage_pipeline: true, can_view_all_leads: true, can_view_team: true,
            can_manage_drive: true, can_manage_knowledge: true, can_export_reports: true,
            can_reassign_leads: true, can_view_contact_data: true, can_view_call_recordings: true,
            is_transversal: false,
          },
        },
        {
          company_id: companyId, name: "Gerente", level: 2, color: "#a78bfa",
          permissions: {
            can_manage_users: false, can_manage_roles: false, can_manage_integrations: false,
            can_manage_pipeline: false, can_view_all_leads: true, can_view_team: true,
            can_manage_drive: true, can_manage_knowledge: false, can_export_reports: true,
            can_reassign_leads: true, can_view_contact_data: true, can_view_call_recordings: false,
            is_transversal: false,
          },
        },
        {
          company_id: companyId, name: "Coordinador", level: 3, color: "#34d399",
          permissions: {
            can_manage_users: false, can_manage_roles: false, can_manage_integrations: false,
            can_manage_pipeline: false, can_view_all_leads: false, can_view_team: true,
            can_manage_drive: false, can_manage_knowledge: false, can_export_reports: false,
            can_reassign_leads: false, can_view_contact_data: true, can_view_call_recordings: false,
            is_transversal: false,
          },
        },
        {
          company_id: companyId, name: "Agente", level: 4, color: "#fb923c",
          permissions: {
            can_manage_users: false, can_manage_roles: false, can_manage_integrations: false,
            can_manage_pipeline: false, can_view_all_leads: false, can_view_team: false,
            can_manage_drive: false, can_manage_knowledge: false, can_export_reports: false,
            can_reassign_leads: false, can_view_contact_data: true, can_view_call_recordings: false,
            is_transversal: false,
          },
        },
      ])
      .select("id, name, level")

    if (rolesError) {
      console.error("roles insert:", rolesError)
      return NextResponse.json({ error: rolesError.message }, { status: 500 })
    }

    const directorRole = rolesData?.find(r => r.level === 1)

    if (!directorRole) {
      return NextResponse.json({ error: "No se pudo crear el rol Director." }, { status: 500 })
    }

    // 3a. Upsert — crea el perfil si no existe, actualiza si ya lo creó un trigger de Auth
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
      company_id: companyId,
      role_id: directorRole.id,
      is_active: true,
    }, { onConflict: "id" })

    if (profileError) {
      console.error("profiles upsert:", profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // 3b. UPDATE explícito como doble seguro: garantiza role_id aunque
    //     un trigger de Supabase Auth haya pisado el perfil después del upsert
    await supabase
      .from("profiles")
      .update({
        role_id: directorRole.id,
        company_id: companyId,
        full_name: fullName.trim(),
        is_active: true,
      })
      .eq("id", userId)

    // 4. Pipeline stages (prevenir duplicados)
    const { data: existingStages } = await supabase
      .from("pipeline_stages")
      .select("name")
      .eq("company_id", companyId)
    
    const existingStageNames = new Set(existingStages?.map(s => s.name) || [])
    
    const defaultStages = [
      { company_id: companyId, name: "Nuevo Lead",    color: "#64748b", position: 1, is_closed: false, is_won: false },
      { company_id: companyId, name: "Contactado",    color: "#22d3ee", position: 2, is_closed: false, is_won: false },
      { company_id: companyId, name: "Calificado",    color: "#a78bfa", position: 3, is_closed: false, is_won: false },
      { company_id: companyId, name: "Propuesta",     color: "#fb923c", position: 4, is_closed: false, is_won: false },
      { company_id: companyId, name: "Negociación",   color: "#fbbf24", position: 5, is_closed: false, is_won: false },
      { company_id: companyId, name: "Venta Cerrada", color: "#34d399", position: 6, is_closed: true,  is_won: true  },
      { company_id: companyId, name: "Perdido",       color: "#f87171", position: 7, is_closed: true,  is_won: false },
    ]
    
    const stagesToInsert = defaultStages.filter(s => !existingStageNames.has(s.name))
    
    if (stagesToInsert.length > 0) {
      await supabase.from("pipeline_stages").insert(stagesToInsert)
    }

    // 5. Lead sources (prevenir duplicados)
    const { data: existingSources } = await supabase
      .from("lead_sources")
      .select("name")
      .eq("company_id", companyId)
    
    const existingSourceNames = new Set(existingSources?.map(s => s.name) || [])
    
    const defaultSources = [
      { company_id: companyId, name: "WhatsApp",        icon: "💬", color: "#25D366", is_active: true },
      { company_id: companyId, name: "Inmuebles24",     icon: "🏠", color: "#E84040", is_active: true },
      { company_id: companyId, name: "Propiedades.com", icon: "🔑", color: "#0066CC", is_active: true },
      { company_id: companyId, name: "Facebook Leads",  icon: "📘", color: "#1877F2", is_active: true },
      { company_id: companyId, name: "Formulario web",  icon: "🌐", color: "#6C47FF", is_active: true },
      { company_id: companyId, name: "Referido",        icon: "🤝", color: "#0F6E56", is_active: true },
      { company_id: companyId, name: "Campo / Evento",  icon: "📍", color: "#854F0B", is_active: true },
      { company_id: companyId, name: "Manual",          icon: "✏️",  color: "#888780", is_active: true },
    ]
    
    const sourcesToInsert = defaultSources.filter(s => !existingSourceNames.has(s.name))
    
    if (sourcesToInsert.length > 0) {
      await supabase.from("lead_sources").insert(sourcesToInsert)
    }

    // 6. Team membership
    await supabase.from("team_memberships").upsert({
      company_id: companyId, user_id: userId, reports_to: null,
    })

    // 7. Drive folders (prevenir duplicados)
    const { data: existingFolders } = await supabase
      .from("drive_folders")
      .select("name")
      .eq("company_id", companyId)
    
    const existingFolderNames = new Set(existingFolders?.map(f => f.name) || [])
    
    const defaultFolders = [
      { company_id: companyId, name: "Fichas técnicas",    position: 1 },
      { company_id: companyId, name: "Renders y galería",  position: 2 },
      { company_id: companyId, name: "Videos",             position: 3 },
      { company_id: companyId, name: "Plantillas mensaje", position: 4 },
      { company_id: companyId, name: "Presentaciones",     position: 5 },
    ]
    
    const foldersToInsert = defaultFolders.filter(f => !existingFolderNames.has(f.name))
    
    if (foldersToInsert.length > 0) {
      await supabase.from("drive_folders").insert(foldersToInsert)
    }

    return NextResponse.json({ ok: true, companyId })

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    console.error("onboarding/setup uncaught:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}