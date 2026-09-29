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

function chunkText(text: string, size = 1000, overlap = 150): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

export async function POST(req: NextRequest) {
  if (isDemoRequest(req)) return demoUnavailable()
  const supabase = getSupabaseAdmin()
  if (!supabase)
    return NextResponse.json({ error: "Faltan credenciales de Supabase." }, { status: 503 })

  let documentId = ""

  try {
    const body = await req.json()
    documentId = body.documentId
    const text: string = body.text
    const companyId: string = body.companyId

    if (!documentId || !text || !companyId)
      return NextResponse.json({ error: "Faltan parámetros." }, { status: 400 })

    const { data: doc } = await supabase
      .from("knowledge_documents")
      .select("title")
      .eq("id", documentId)
      .single()

    const docTitle = doc?.title ?? "Sin título"

    // Borrar chunks viejos
    await supabase.from("knowledge_chunks").delete().eq("document_id", documentId)

    const chunks = chunkText(text)
    let inserted = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i].trim()
      if (!chunk) continue

      // Guardar chunk SIN embedding — usamos búsqueda full-text de Postgres
      const { error: insertError } = await supabase
        .from("knowledge_chunks")
        .insert({
          document_id: documentId,
          company_id: companyId,
          content: chunk,
          chunk_index: i,
          metadata: { document_title: docTitle },
          // embedding: null — no requerido con búsqueda full-text
        })

      if (insertError) {
        console.error(`[ingest] Chunk ${i} error:`, insertError.message)
        continue
      }

      inserted++
    }

    const finalStatus = inserted > 0 ? "ready" : "error"
    await supabase
      .from("knowledge_documents")
      .update({ status: finalStatus })
      .eq("id", documentId)

    console.log(`[ingest] "${docTitle}": ${inserted}/${chunks.length} chunks guardados`)

    if (inserted === 0)
      return NextResponse.json({ ok: false, chunks: 0, error: "No se pudo guardar ningún chunk." }, { status: 500 })

    return NextResponse.json({ ok: true, chunks: inserted })

  } catch (e: unknown) {
    console.error("[ingest] Fatal:", e)
    if (documentId)
      await getSupabaseAdmin()?.from("knowledge_documents").update({ status: "error" }).eq("id", documentId)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 })
  }
}