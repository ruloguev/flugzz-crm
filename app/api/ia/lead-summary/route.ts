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

const SYSTEM_PROMPT = `Eres un asistente de análisis de leads para una inmobiliaria. Tu trabajo es crear un resumen ejecutivo de un lead para que un agente pueda entender rápidamente el contexto.

REGLAS:
1. El resumen debe ser conciso (máx 300 palabras)
2. Incluye: información del contacto, oportunidad, historial de actividades, estado actual
3. Da sugerencias de siguiente paso al final
4. Usa un formato legible con secciones claras
5. Responde en español`

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY?.trim()
    if (!geminiKey)
      return NextResponse.json({ error: "Falta GEMINI_API_KEY." }, { status: 503 })

    const supabase = isDemoRequest(req) ? demoClient() : getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

    const { leadId } = await req.json()
    if (!leadId)
      return NextResponse.json({ error: "Falta leadId." }, { status: 400 })

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(`
        id, title, project, priority, budget_min, budget_max, currency,
        expected_close_date, deal_type, last_activity_at, created_at, metadata,
        contact:contacts(id, full_name, phone, whatsapp, email),
        stage:pipeline_stages(id, name, color),
        source:lead_sources(id, name),
        owner:profiles(id, full_name)
      `)
      .eq("id", leadId)
      .single()

    if (leadError || !lead)
      return NextResponse.json({ error: "Lead no encontrado." }, { status: 404 })

    const { data: activities } = await supabase
      .from("activities")
      .select(`
        id, type, title, body, call_status, call_duration_secs,
        created_at, user:profiles(full_name)
      `)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(20)

    const { data: stageChanges } = await supabase
      .from("activities")
      .select(`
        id, created_at,
        from_stage:pipeline_stages_from(name),
        to_stage:pipeline_stages_to(name),
        user:profiles(full_name)
      `)
      .eq("lead_id", leadId)
      .eq("type", "stage_change")
      .order("created_at", { ascending: false })
      .limit(10)

    const activitiesSummary = (activities ?? []).slice(0, 10).map((a: any) => ({
      tipo: a.type,
      titulo: a.title,
      detalle: a.body?.slice(0, 100),
      fecha: new Date(a.created_at).toLocaleDateString("es-MX"),
      usuario: (a.user as any)?.full_name ?? "Sistema",
    }))

    const stageHistory = (stageChanges ?? []).map((s: any) => ({
      de: (s.from_stage as any)?.name ?? "Inicio",
      a: (s.to_stage as any)?.name,
      fecha: new Date(s.created_at).toLocaleDateString("es-MX"),
      usuario: (s.user as any)?.full_name ?? "Sistema",
    }))

    const contact = (lead.contact as any) ?? null
    const stage = (lead.stage as any) ?? null
    const source = (lead.source as any) ?? null
    const owner = (lead.owner as any) ?? null

    const userPrompt = `
LEAD:
- Contacto: ${contact?.full_name ?? "Sin nombre"}
- Teléfono: ${contact?.phone ?? "No disponible"}
- WhatsApp: ${contact?.whatsapp ?? "No disponible"}
- Email: ${contact?.email ?? "No disponible"}
- Título: ${lead.title ?? "Sin título"}
- Proyecto: ${lead.project ?? "No especificado"}
- Prioridad: ${lead.priority}
- Presupuesto: ${lead.budget_min ? `$${lead.budget_min}` : ""} - ${lead.budget_max ? `$${lead.budget_max}` : ""} ${lead.currency}
- Etapa actual: ${stage?.name ?? "Sin etapa"}
- Fuente: ${source?.name ?? "Desconocida"}
- Agente: ${owner?.full_name ?? "Sin asignar"}
- Creado: ${new Date(lead.created_at).toLocaleDateString("es-MX")}
- Última actividad: ${lead.last_activity_at ? new Date(lead.last_activity_at).toLocaleString("es-MX") : "Sin actividad"}
- Tipo de operación: ${lead.deal_type === "sale" ? "Venta" : lead.deal_type === "rent" ? "Renta" : "Otro"}

ÚLTIMAS ACTIVIDADES:
${activitiesSummary.map((a: any) => `- [${a.fecha}] ${a.tipo.toUpperCase()}: ${a.titulo ?? "Sin título"} ${a.detalle ? `- ${a.detalle}` : ""} (${a.usuario ?? "Sistema"})`).join("\n")}

HISTORIAL DE ETAPAS:
${stageHistory.map((s: any) => `- ${s.fecha}: ${s.de} → ${s.a} (${s.usuario})`).join("\n") || "Sin cambios de etapa"}

Genera un resumen ejecutivo útil para el agente.`

    const body: Record<string, any> = {
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      }
    }

    // Usar cachedContent para el system prompt estático
    const cachedName = await getCachedContent(geminiKey, "lead-summary", SYSTEM_PROMPT)
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
      console.error("[lead-summary] Gemini error:", errorText)
      return NextResponse.json({ error: "Error de IA." }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "No se pudo generar el resumen."

    return NextResponse.json({ summary })

  } catch (e: unknown) {
    console.error("[lead-summary] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}
