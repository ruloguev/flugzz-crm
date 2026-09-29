import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/server-env"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

export async function DELETE(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const { documentId } = await req.json()
    if (!documentId)
      return NextResponse.json({ error: "Falta documentId" }, { status: 400 })

    const supabase = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!)

    // Delete chunks first (FK constraint)
    await supabase.from("knowledge_chunks").delete().eq("document_id", documentId)

    // Soft delete the document
    await supabase
      .from("knowledge_documents")
      .update({ is_active: false, status: "archived" })
      .eq("id", documentId)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    )
  }
}
