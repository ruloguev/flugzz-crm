import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { demoClient, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function getSupabaseAdmin() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = isDemoRequest(req) ? demoClient() : getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

    const { companyId, startDate, endDate } = await req.json()
    if (!companyId)
      return NextResponse.json({ error: "Falta companyId." }, { status: 400 })

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const end = endDate || new Date().toISOString()

    // Obtener etapas cerradas (ganadas)
    const { data: wonStages } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_won", true)

    const wonStageIds = wonStages?.map(s => s.id) ?? []

    // Obtener perfiles de la empresa
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, role_id")
      .eq("company_id", companyId)
      .eq("is_active", true)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ ranking: [] })
    }

    // Obtener roles de la empresa para identificar líderes
    const { data: roleRows } = await supabase
      .from("roles")
      .select("id, name")
      .eq("company_id", companyId)

    const roleNameById = new Map<string, string>(
      (roleRows ?? []).map(r => [r.id, r.name]),
    )

    const isLeaderRole = (profile: { role_id: string | null }) => {
      if (!profile.role_id) return false
      const name = (roleNameById.get(profile.role_id) ?? "").toLowerCase()
      return name.includes("director") || name.includes("coordinador")
    }

    const rankingProfiles = profiles.filter(p => !isLeaderRole(p))

    if (rankingProfiles.length === 0) {
      return NextResponse.json({ ranking: [] })
    }

    const profileIds = rankingProfiles.map(p => p.id)

    // Obtener leads del período
    const { data: leads } = await supabase
      .from("leads")
      .select("id, owner_id, stage_id, created_at")
      .eq("company_id", companyId)
      .in("owner_id", profileIds)
      .gte("created_at", start)
      .lte("created_at", end)

    // Obtener actividades del período (llamadas)
    const { data: activities } = await supabase
      .from("activities")
      .select("id, user_id, type, call_status")
      .eq("company_id", companyId)
      .in("user_id", profileIds)
      .eq("type", "call")
      .gte("created_at", start)
      .lte("created_at", end)

    // Calcular métricas por agente
    const ranking = rankingProfiles.map(profile => {
      const profileLeads = leads?.filter(l => l.owner_id === profile.id) ?? []
      const profileActivities = activities?.filter(a => a.user_id === profile.id) ?? []

      const totalLeads = profileLeads.length
      const wonLeads = profileLeads.filter(l => l.stage_id && wonStageIds.includes(l.stage_id)).length
      const totalCalls = profileActivities.length
      const answeredCalls = profileActivities.filter(a => a.call_status === "answered").length
      const contactRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0
      const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0

      return {
        agent_id: profile.id,
        agent_name: profile.full_name,
        total_leads: totalLeads,
        won_leads: wonLeads,
        total_calls: totalCalls,
        answered_calls: answeredCalls,
        contact_rate: contactRate,
        conversion_rate: conversionRate,
      }
    })

    // Ordenar por leads ganados
    ranking.sort((a, b) => b.won_leads - a.won_leads)

    return NextResponse.json({ ranking, period: { start, end } })

  } catch (e: unknown) {
    console.error("[metrics/ranking] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}