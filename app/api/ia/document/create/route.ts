import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/server-env"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

// POST: create new document record
export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const { companyId, title, description, fileType } = await req.json()
    if (!companyId || !title)
      return NextResponse.json({ error: "Faltan companyId y title" }, { status: 400 })

    // Get current user from session
    const cookieStore = await cookies()
    const userSupabase = createServerClient(
      getSupabaseUrl()!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await userSupabase.auth.getUser()

    const adminSupabase = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!)

    const { data, error } = await adminSupabase
      .from("knowledge_documents")
      .insert({
        company_id: companyId,
        uploaded_by: user?.id ?? null,
        title: title.trim(),
        description: description?.trim() ?? null,
        file_type: fileType ?? "txt",
        status: "processing",
        is_active: true,
      })
      .select("id")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ documentId: data.id })

  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    )
  }
}

// PATCH: update document status
export async function PATCH(req: NextRequest) {
  try {
    const { documentId, status } = await req.json()
    if (!documentId) return NextResponse.json({ error: "Falta documentId" }, { status: 400 })

    const adminSupabase = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!)
    await adminSupabase
      .from("knowledge_documents")
      .update({ status: status ?? "processing" })
      .eq("id", documentId)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    )
  }
}
