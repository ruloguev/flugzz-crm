import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { isDemoRequest } from "@/lib/demo/guard"

/**
 * POST /api/notifications
 *
 * Crea una notificacion en la base de datos.
 * Diseñado para ser llamado desde el cliente (ej. @menciones en notas).
 * Usa service_role key para insertar en nombre de otro usuario.
 */
export async function POST(req: NextRequest) {
  try {
    // En modo demo la notificación ya vive en el store local del navegador.
    if (isDemoRequest(req)) return NextResponse.json({ ok: true })
    const body = await req.json()
    const { company_id, user_id, lead_id, type, title, body: messageBody } = body

    if (!company_id || !user_id || !type || !title) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: company_id, user_id, type, title" },
        { status: 400 },
      )
    }

    const supabase = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!)

    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        company_id,
        user_id,
        lead_id: lead_id ?? null,
        type,
        title,
        body: messageBody ?? "",
      })
      .select("id")
      .single()

    if (error || !notification) {
      return NextResponse.json({ error: "No se pudo crear la notificacion" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: notification.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    console.error("[POST /api/notifications]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
