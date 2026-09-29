import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function getSupabaseAdmin() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) return null
  return createClient(url, key)
}

function arrayToCSV(data: Record<string, any>[], headers: string[]): string {
  const headerRow = headers.join(",")
  const rows = data.map(row => 
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ""
      const str = String(val)
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(",")
  )
  return [headerRow, ...rows].join("\n")
}

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const supabase = getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

    const { companyId, type, startDate, endDate } = await req.json()
    if (!companyId || !type)
      return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 })

    // Authenticate user and enforce scope
    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer "))
      return NextResponse.json({ error: "No autorizado." }, { status: 401 })
    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user)
      return NextResponse.json({ error: "Token inválido." }, { status: 401 })

    // Get user role info
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, company_id, role:roles!inner(id, name, level)")
      .eq("id", user.id)
      .single()
    if (!profile || profile.company_id !== companyId)
      return NextResponse.json({ error: "No tienes acceso a esta compañía." }, { status: 403 })
    
    const roleArr = profile.role as { id: string; name: string; level: number }[] | null
    const role = roleArr?.[0]
    if (!role)
      return NextResponse.json({ error: "Sin rol asignado." }, { status: 403 })
    const isLeader = role.level <= 3 || ["director", "gerente", "coordinador", "admin", "superadmin"].includes(role.name.toLowerCase())
    
    let scopeIds: string[] | null = null
    if (!isLeader) {
      scopeIds = [user.id]
    }

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const end = endDate || new Date().toISOString()

    let csv: string
    let filename: string

    if (type === "leads") {
      let queryBuilder = supabase
        .from("leads")
        .select(`
          id, title, priority, budget_min, budget_max, currency,
          expected_close_date, deal_type, created_at, last_activity_at,
          contact:contacts(full_name, phone, email),
          stage:pipeline_stages(name),
          source:lead_sources(name),
          owner:profiles(full_name)
        `)
        .eq("company_id", companyId)
        .gte("created_at", start)
        .lte("created_at", end)

      if (scopeIds) {
        queryBuilder = queryBuilder.in("owner_id", scopeIds)
      }

      const { data: leads } = await queryBuilder
        .order("created_at", { ascending: false })
        .limit(1000)

      const formatted = (leads ?? []).map((l: any) => ({
        id: l.id,
        contacto: l.contact?.[0]?.full_name ?? "",
        telefono: l.contact?.[0]?.phone ? `="${l.contact[0].phone}"` : "",
        email: l.contact?.[0]?.email ?? "",
        titulo: l.title ?? "",
        prioridad: l.priority ?? "",
        presupuesto_min: l.budget_min ?? "",
        presupuesto_max: l.budget_max ?? "",
        moneda: l.currency ?? "",
        etapa: l.stage?.[0]?.name ?? "",
        fuente: l.source?.[0]?.name ?? "",
        agente: l.owner?.[0]?.full_name ?? "",
        fecha_creacion: l.created_at ? new Date(l.created_at).toLocaleDateString("es-MX") : "",
        ultima_actividad: l.last_activity_at ? new Date(l.last_activity_at).toLocaleDateString("es-MX") : "",
      }))

      csv = arrayToCSV(formatted, [
        "id", "contacto", "telefono", "email", "titulo", "prioridad",
        "presupuesto_min", "presupuesto_max", "moneda", "etapa", "fuente",
        "agente", "fecha_creacion", "ultima_actividad"
      ])
      filename = `leads_${new Date().toISOString().split("T")[0]}.csv`

    } else if (type === "activities") {
      let actQuery = (supabase as any)
        .from("activities")
        .select(`
          id, type, title, body, call_status, call_duration_secs,
          created_at, lead_id,
          user:profiles(full_name),
          lead:leads(contact:contacts(full_name))
        `)
        .eq("company_id", companyId)
        .gte("created_at", start)
        .lte("created_at", end)

      if (scopeIds) {
        actQuery = actQuery.in("user_id", scopeIds)
      }

      const { data: activities } = await actQuery
        .order("created_at", { ascending: false })
        .limit(1000)

      const formatted = (activities ?? []).map((a: any) => ({
        id: a.id,
        fecha: a.created_at ? new Date(a.created_at).toLocaleString("es-MX") : "",
        tipo: a.type ?? "",
        titulo: a.title ?? "",
        descripcion: (a.body ?? "").substring(0, 200),
        estado_llamada: a.call_status ?? "",
        duracion_segundos: a.call_duration_secs ?? "",
        agente: a.user?.[0]?.full_name ?? "",
        lead: a.lead?.[0]?.contact?.[0]?.full_name ?? "",
      }))

      csv = arrayToCSV(formatted, [
        "id", "fecha", "tipo", "titulo", "descripcion",
        "estado_llamada", "duracion_segundos", "agente", "lead"
      ])
      filename = `actividades_${new Date().toISOString().split("T")[0]}.csv`

    } else if (type === "metrics") {
      // Obtener métricas de agentes (filtradas por scope)
      let profileQuery = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", companyId)
        .eq("is_active", true)

      if (scopeIds) {
        profileQuery = profileQuery.in("id", scopeIds)
      }

      const { data: profiles } = await profileQuery

      const profileIds = profiles?.map(p => p.id) ?? []

      const { data: leads } = await supabase
        .from("leads")
        .select("id, owner_id, stage_id")
        .eq("company_id", companyId)
        .gte("created_at", start)
        .lte("created_at", end)
        .in("owner_id", profileIds)

      const { data: activities } = await supabase
        .from("activities")
        .select("id, user_id, type")
        .eq("company_id", companyId)
        .eq("type", "call")
        .in("user_id", profileIds)
        .gte("created_at", start)
        .lte("created_at", end)

      const { data: wonStages } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_won", true)

      const wonStageIds = wonStages?.map(s => s.id) ?? []

      const formatted = (profiles ?? []).map(profile => {
        const pLeads = leads?.filter(l => l.owner_id === profile.id) ?? []
        const pActivities = activities?.filter(a => a.user_id === profile.id) ?? []

        return {
          agente: profile.full_name,
          total_leads: pLeads.length,
          leads_ganados: pLeads.filter(l => l.stage_id && wonStageIds.includes(l.stage_id)).length,
          total_llamadas: pActivities.length,
          llamadas_contestadas: pActivities.filter((a: any) => a.call_status === "answered").length,
        }
      })

      csv = arrayToCSV(formatted, [
        "agente", "total_leads", "leads_ganados", "total_llamadas", "llamadas_contestadas"
      ])
      filename = `metricas_${new Date().toISOString().split("T")[0]}.csv`

    } else {
      return NextResponse.json({ error: "Tipo de exportación inválido." }, { status: 400 })
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })

  } catch (e: unknown) {
    console.error("[metrics/export] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}