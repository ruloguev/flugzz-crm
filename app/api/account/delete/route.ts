import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function adminClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) throw new Error("Faltan variables de entorno del servidor.")
  return createClient(url, key)
}

export async function DELETE(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable("En el modo demo no se elimina la cuenta.", 403)
    const cookieStore = await cookies()
    const userSupabase = createServerClient(
      getSupabaseUrl()!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )

    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Sesión no encontrada." }, { status: 401 })
    }

    const supabase = adminClient()

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, company_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "No se encontró el perfil del usuario." }, { status: 400 })
    }

    const { data: membership } = await supabase
      .from("team_memberships")
      .select("reports_to")
      .eq("user_id", user.id)
      .maybeSingle()

    const reportsTo = membership?.reports_to ?? null

    const { data: userLeadIds } = await supabase
      .from("leads")
      .select("id")
      .eq("assigned_to", user.id)

    if (userLeadIds && userLeadIds.length > 0) {
      const leadIds = userLeadIds.map(l => l.id)

      const { error: delActivities } = await supabase.from("activities").delete().in("lead_id", leadIds)
      if (delActivities) console.error("[delete-account] activities cleanup error:", delActivities)

      const { error: delNotifs } = await supabase.from("notifications").delete().in("lead_id", leadIds)
      if (delNotifs) console.error("[delete-account] notifications cleanup error:", delNotifs)

      const { error: delDocs } = await supabase.from("lead_documents").delete().in("lead_id", leadIds)
      if (delDocs) console.error("[delete-account] lead_documents cleanup error:", delDocs)

      if (reportsTo) {
        const { data: superior } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", reportsTo)
          .single()

        const { error: reassignError } = await supabase
          .from("leads")
          .update({ assigned_to: reportsTo })
          .eq("assigned_to", user.id)

        if (reassignError) {
          return NextResponse.json({ error: `Error al reasignar leads: ${reassignError.message}` }, { status: 500 })
        }

        if (superior) {
          await supabase.from("notifications").insert({
            company_id: profile.company_id,
            user_id: reportsTo,
            type: "account_deleted",
            title: "Usuario eliminado",
            body: `${profile.full_name} eliminó su cuenta. ${leadIds.length} ${leadIds.length === 1 ? "lead fue reasignado" : "leads fueron reasignados"} a ti.`,
          })
        }
      } else {
        const { error: deleteLeadsError } = await supabase
          .from("leads")
          .delete()
          .eq("assigned_to", user.id)

        if (deleteLeadsError) {
          return NextResponse.json({ error: `Error al eliminar leads: ${deleteLeadsError.message}` }, { status: 500 })
        }
      }
    }

    await supabase
      .from("team_memberships")
      .update({ reports_to: null })
      .eq("reports_to", user.id)

    await supabase
      .from("team_memberships")
      .delete()
      .eq("user_id", user.id)

    await supabase
      .from("profiles")
      .delete()
      .eq("id", user.id)

    const { error: authError } = await supabase.auth.admin.deleteUser(user.id)

    if (authError) {
      return NextResponse.json({ error: "Error al eliminar la cuenta de autenticación." }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
