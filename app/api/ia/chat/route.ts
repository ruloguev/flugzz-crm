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

const BASE_SYSTEM_INSTRUCTION = `Eres el asistente de ventas interno de esta inmobiliaria. Tu fuente principal de información es la base de conocimiento. Si la respuesta está en los documentos, cita la fuente entre paréntesis. Si no encuentras nada relevante en los documentos, puedes responder usando tu conocimiento general de ventas inmobiliarias. Responde de forma directa y profesional en español.`

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY?.trim()
    if (!geminiKey)
      return NextResponse.json({ error: "Falta GEMINI_API_KEY." }, { status: 503 })

    const supabase = isDemoRequest(req) ? demoClient() : getSupabaseAdmin()
    if (!supabase)
      return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

    const { message, companyId, history = [] } = await req.json()
    if (!message || !companyId)
      return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 })

    // ── Búsqueda full-text con stemming en español ──
    let contextText = ""
    try {
      const { data: matches } = await supabase
        .from("knowledge_chunks")
        .select("id, content, metadata, document_id")
        .eq("company_id", companyId)
        .textSearch("content", message, { type: "plain", config: "spanish" })
        .limit(8)

      if (matches && matches.length > 0) {
        contextText = matches
          .map((c: any, i: number) => {
            const title = c.metadata?.document_title ?? "Documento"
            return `[Fuente ${i + 1} — ${title}]\n${c.content}`
          })
          .join("\n\n---\n\n")
      }

      if (!matches || matches.length === 0) {
        const { data: fallbackChunks } = await supabase
          .from("knowledge_chunks")
          .select("id, content, metadata")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5)

        if (fallbackChunks && fallbackChunks.length > 0) {
          contextText = fallbackChunks
            .map((c: any, i: number) => {
              const title = c.metadata?.document_title ?? "Documento"
              return `[Fuente ${i + 1} — ${title}]\n${c.content}`
            })
            .join("\n\n---\n\n")
        }
      }
    } catch (searchErr) {
      console.error("[chat] Error en búsqueda:", searchErr)
    }

    // ── System prompt + context ──────────────────
    const systemPrompt = contextText
      ? `${BASE_SYSTEM_INSTRUCTION}\n\nBASE DE CONOCIMIENTO:\n${contextText}`
      : `Eres el asistente de ventas de esta inmobiliaria. Aún no hay documentos disponibles en la base de conocimiento. Puedes ayudar con preguntas generales de ventas inmobiliarias. Responde en español.`

    // ── Llamada a Gemini con caching ─────────────
    const formattedHistory = history.slice(-6).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))

    const userMsg = contextText
      ? `Contexto:\n${contextText}\n\nPregunta del usuario:\n${message}`
      : message

    formattedHistory.push({ role: "user", parts: [{ text: userMsg }] })

    const body: Record<string, any> = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: formattedHistory,
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
      console.error("[chat] Gemini error:", errorText)
      throw new Error(`Gemini ${geminiRes.status}: ${errorText.slice(0, 200)}`)
    }

    const geminiData = await geminiRes.json()
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sin respuesta"

    return NextResponse.json({ answer })

  } catch (e: unknown) {
    console.error("[chat] Fatal:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error desconocido" },
      { status: 500 }
    )
  }
}