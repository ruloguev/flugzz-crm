import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/server-env"
import { demoDocumentList, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId")
    if (!companyId)
      return NextResponse.json({ error: "Falta companyId" }, { status: 400 })

    if (isDemoRequest(req)) return NextResponse.json(demoDocumentList())

    const supabase = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!)

    // Load docs
    const { data: docs, error } = await supabase
      .from("knowledge_documents")
      .select("id, title, description, file_type, status, version, created_at")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Count chunks per document
    const { data: chunkRows } = await supabase
      .from("knowledge_chunks")
      .select("document_id")
      .eq("company_id", companyId)

    const chunkCounts: Record<string, number> = {}
    for (const row of chunkRows ?? []) {
      chunkCounts[row.document_id] = (chunkCounts[row.document_id] ?? 0) + 1
    }

    return NextResponse.json({ docs: docs ?? [], chunkCounts })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    )
  }
}
