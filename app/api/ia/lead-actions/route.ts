import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { getCachedContent } from "@/lib/gemini-cache"
import { demoClient, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function getSupabaseAdmin() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) return null
  return createClient(url, key)
}

interface LeadAction {
  lead_id: string
  contact_name: string
  priority: "high" | "medium" | "low"
  action_type: "call" | "whatsapp" | "email" | "follow_up" | "close" | "waiting"
  reason: string
  days_inactive: number
}

const SYSTEM_PROMPT = `Eres un asistente de análisis de leads para una inmobiliaria. Tu trabajo es analizar los leads y sugerir qué acciones tomar hoy.

REGLAS:
1. Solo sugiere acción para leads que lleven más de 2 días sin actividad
2. Prioriza leads con prioridad "high" o leads que lleven más de 5 días sin actividad
3. Si un lead tiene teléfono, sugiere "call" o "whatsapp"
4. Si no tiene teléfono pero tiene email, sugiere "email"
5. Si está en etapa de cierre (últimas 2 etapas) y lleva mucho tiempo sin activity, sugiere "close" para revisar
6. Si acaba de llegar (menos de 2 días), sugiere "waiting"
7. Da una razón breve (máx 10 palabras) de por qué sugieres esa acción

Devuelve SOLO un JSON array con esta estructura exacta:
[{"lead_id": "uuid", "action_type": "call|whatsapp|email|follow_up|close|waiting", "reason": "texto breve", "priority_score": 1-10}]

No devuelvas nada más que el JSON.`

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY?.trim()
    if (!geminiKey)
      return NextResponse.json({ error: "Falta GEMINI_API_KEY." }, { status: 503 })

    const supabase = isDemoRequest(req) ? demoClient() : getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

    const { companyId, userId, limit = 10 } = await req.json()
    if (!companyId || !userId)
      return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role_id")
      .eq("id", userId)
      .single()

    const { data: roleData } = await supabase
      .from("roles")
      .select("level")
      .eq("id", profile?.role_id ?? "")
      .single()

    const userLevel = roleData?.level ?? 99
    const isLeader = userLevel <= 3

    let teamIds: string[] = [userId]
    if (isLeader) {
      const { data: memberships } = await supabase
        .from("team_memberships")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("reports_to", userId)
      
      teamIds = [userId, ...(memberships?.map((m: any) => m.user_id) ?? [])]
    }

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id, title, priority, stage_id, last_activity_at, owner_id,
        contact:contacts(id, full_name, phone, whatsapp, email),
        stage:pipeline_stages(id, name, color, position, is_closed)
      `)
      .eq("company_id", companyId)
      .in("owner_id", teamIds)
      .not("stage_id", "is", null)
      .order("last_activity_at", { ascending: true })
      .limit(50)

    if (leadsError || !leads) {
      return NextResponse.json({ error: "Error al obtener leads." }, { status: 500 })
    }

    const activeLeads = (leads as any[]).filter(lead => 
      lead.stage && !lead.stage.is_closed
    )

    const now = new Date()
    const leadsWithInactiveDays = activeLeads.map(lead => {
      const lastActivity = new Date(lead.last_activity_at)
      const daysInactive = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      return { ...lead, days_inactive: daysInactive }
    })

    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, name, position")
      .eq("company_id", companyId)
      .order("position")

    const leadsContext = leadsWithInactiveDays
      .filter(l => l.days_inactive >= 2)
      .slice(0, 15)
      .map(l => ({
      id: l.id,
      contacto: l.contact?.full_name ?? "Sin nombre",
      prioridad: l.priority,
      etapa: l.stage?.name ?? "Sin etapa",
      dias_sin_actividad: l.days_inactive,
      telefono: l.contact?.phone ?? null,
      whatsapp: l.contact?.whatsapp ?? null,
      email: l.contact?.email ?? null,
    }))

    const userPrompt = `Analiza estos leads y dime qué acciones tomar hoy:\n\n${JSON.stringify(leadsContext)}`

    const body: Record<string, any> = {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    }

    // Usar cachedContent para el system prompt estático
    const cachedName = await getCachedContent(geminiKey, "lead-actions", SYSTEM_PROMPT)
    if (cachedName) {
      body.cachedContent = cachedName
    } else {
      body.systemInstruction = { parts: [{ text: SYSTEM_PROMPT }] }
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    )

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text()
      console.error("[lead-actions] Gemini error:", errorText)
      return NextResponse.json({ error: "Error de IA." }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const rawResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]"

    let parsedActions: any[] = []
    try {
      const cleanJson = rawResponse.replace(/```json|```/g, "").trim()
      parsedActions = JSON.parse(cleanJson)
    } catch (e) {
      console.error("[lead-actions] Parse error:", rawResponse)
      parsedActions = []
    }

    const actionLeadMap = new Map(parsedActions.map((a: any) => [a.lead_id, a]))
    
    const result: LeadAction[] = leadsWithInactiveDays
      .filter(l => l.days_inactive >= 2)
      .map(lead => {
        const action = actionLeadMap.get(lead.id)
        return {
          lead_id: lead.id,
          contact_name: lead.contact?.full_name ?? "Sin nombre",
          priority: lead.priority,
          action_type: action?.action_type ?? (lead.days_inactive > 5 ? "follow_up" : "waiting"),
          reason: action?.reason ?? `Sin actividad hace ${lead.days_inactive} días`,
          days_inactive: lead.days_inactive,
        }
      })
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
        if (b.days_inactive !== a.days_inactive) return b.days_inactive - a.days_inactive
        return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
      })
      .slice(0, limit)

    return NextResponse.json({ actions: result })

  } catch (e: unknown) {
    console.error("[lead-actions] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
