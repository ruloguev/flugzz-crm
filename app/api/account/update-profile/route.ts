import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll() }, setAll() {} } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { full_name, email } = await req.json()

    const updates: Record<string, any> = {}

    // Update name in profiles
    if (full_name !== undefined) {
      updates.full_name = full_name.trim()
    }

    if (Object.keys(updates).length > 0) {
      const { error: profileErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)

      if (profileErr) throw profileErr
    }

    // Update email in auth.users (requires confirmation)
    let confirmationSent = false
    if (email !== undefined && email.trim() !== user.email) {
      const { error: authErr } = await supabase.auth.updateUser({ email: email.trim() })
      if (authErr) throw authErr

      // Also update profiles.email so UI reflects the change immediately
      await supabase.from("profiles").update({ email: email.trim() }).eq("id", user.id)
      confirmationSent = true
    }

    return NextResponse.json({ ok: true, confirmationSent })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al actualizar perfil" },
      { status: 500 },
    )
  }
}
