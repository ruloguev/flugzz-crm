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

const SYSTEM_INSTRUCTION = `Eres un agente de soporte de Flugzz CRM, un sistema CRM para inmobiliarias.
Tu función es guiar al usuario en el uso de la plataforma: leads, pipeline, round robin, roles, Google Calendar, suscripciones, Facebook Lead Ads, etc.
RESPONDE ÚNICAMENTE basándote en la documentación incluida abajo en "Documentación:". NO uses tu conocimiento previo. Si la documentación no cubre la pregunta, responde exactamente: "No tengo información sobre eso. Escríbenos a legal@flugzz.xyz para ayudarte."
IMPORTANTE: En Flugzz NO existe un menú llamado "Leads". La navegación correcta es:
  - "Pipeline" para ver y mover leads entre etapas
  - "Contactos" para crear leads manualmente
  - "Dashboard" para ver estadísticas
Responde de forma clara, directa y en español.
Si es relevante, incluye pasos concretos (ej. "Ve a Integraciones > Google Calendar y haz clic en Conectar").`

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.SUPPORT_GEMINI_API_KEY?.trim()
    if (!geminiKey) {
      return NextResponse.json({ error: "Servicio de soporte no disponible." }, { status: 503 })
    }

    const supabase = isDemoRequest(req) ? demoClient() : getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: "Error interno." }, { status: 503 })
    }

    const { message, history = [] } = await req.json()
    if (!message) {
      return NextResponse.json({ error: "Mensaje requerido." }, { status: 400 })
    }

    let contextText = ""
    try {
      const { data: matches } = await supabase
        .from("support_chunks")
        .select("content, category")
        .textSearch("content", message, { type: "plain", config: "spanish" })
        .limit(5)

      if (matches && matches.length > 0) {
        contextText = matches
          .map((c: any, i: number) => `[${i + 1} — ${c.category}]\n${c.content}`)
          .join("\n\n---\n\n")
      }
    } catch (searchErr) {
      console.error("[support-chat] Error en búsqueda:", searchErr)
    }

    const formattedHistory = history.slice(-6).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))

    const userMsg = contextText
      ? `Documentación:\n${contextText}\n\nPregunta:\n${message}`
      : message

    formattedHistory.push({ role: "user", parts: [{ text: userMsg }] })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: formattedHistory,
        }),
      },
    )

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text()
      console.error("[support-chat] Gemini error:", errorText)
      throw new Error(`Gemini ${geminiRes.status}: ${errorText.slice(0, 200)}`)
    }

    const geminiData = await geminiRes.json()
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta"

    return NextResponse.json({ answer })
  } catch (e: unknown) {
    console.error("[support-chat] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 },
    )
  }
}
