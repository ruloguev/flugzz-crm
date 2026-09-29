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

    const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const end = endDate || new Date().toISOString()

    // Obtener etapas
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name, color, position, is_closed")
      .eq("company_id", companyId)
      .order("position")

    // Obtener actividades de cambio de etapa
    const { data: stageChanges } = await supabase
      .from("activities")
      .select("id, lead_id, from_stage_id, to_stage_id, created_at")
      .eq("company_id", companyId)
      .eq("type", "stage_change")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: true })

    // Obtener leads creados en el período
    const { data: leads } = await supabase
      .from("leads")
      .select("id, stage_id, created_at")
      .eq("company_id", companyId)
      .gte("created_at", start)
      .lte("created_at", end)

    if (!stages || stages.length === 0) {
      return NextResponse.json({ velocity: [], stages: [] })
    }

    // Calcular tiempo promedio en cada etapa
    const stageTimes: Record<string, number[]> = {}

    stages.forEach(s => {
      stageTimes[s.id] = []
    })

    // Analizar cambios de etapa
    const leadStageHistory = new Map<string, { stageId: string; timestamp: string }[]>()

    stageChanges?.forEach(change => {
      const history = leadStageHistory.get(change.lead_id) || []
      if (change.to_stage_id) {
        history.push({ stageId: change.to_stage_id, timestamp: change.created_at })
      }
      leadStageHistory.set(change.lead_id, history)
    })

    // Calcular tiempo en cada etapa
    leadStageHistory.forEach((history, leadId) => {
      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i]
        const next = history[i + 1]
        const currentStage = stages.find(s => s.id === current.stageId)
        if (currentStage && !currentStage.is_closed) {
          const timeInStage = new Date(next.timestamp).getTime() - new Date(current.timestamp).getTime()
          const days = timeInStage / (1000 * 60 * 60 * 24)
          if (days > 0 && days < 365) { // Filtrar outliers
            stageTimes[current.stageId].push(days)
          }
        }
      }
    })

    // Calcular promedio por etapa
    const velocity = stages.map(stage => {
      const times = stageTimes[stage.id] || []
      const avgDays = times.length > 0 
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10
        : 0
      
      // Calcular leads actualmente en esta etapa
      const currentLeads = leads?.filter(l => l.stage_id === stage.id).length || 0

      return {
        stage_id: stage.id,
        stage_name: stage.name,
        stage_color: stage.color,
        avg_days: avgDays,
        total_leads: times.length,
        current_leads: currentLeads,
      }
    })

    // Calcular total promedio del pipeline
    const totalAvg = velocity.reduce((sum, v) => sum + v.avg_days, 0)
    const activeStages = velocity.filter(v => v.avg_days > 0).length

    return NextResponse.json({ 
      velocity,
      total_avg_days: activeStages > 0 ? Math.round(totalAvg / activeStages * 10) / 10 : 0,
      period: { start, end }
    })

  } catch (e: unknown) {
    console.error("[metrics/pipeline-velocity] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}