import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

function adminClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseServiceRoleKey()
  if (!url || !key) throw new Error("Faltan variables de entorno del servidor.")
  return createClient(url, key)
}

type RoleRecord = { level: number; name: string } | null

// Supabase returns many-to-many / inner joins as arrays. Helper to extract the
// first row from a foreign-key relationship in a `select("..., role:roles(...)")`.
function asRole(rel: unknown): RoleRecord {
  if (!rel) return null
  const first = Array.isArray(rel) ? rel[0] : rel
  if (!first || typeof first !== "object") return null
  return first as RoleRecord
}

/**
 * DELETE /api/team/member
 *
 * Elimina a un miembro del equipo. Solo directores / gerentes / coordinadores
 * (role.level <= 3 o nombre contiene "director"/"gerente"/"coordinador"/"admin")
 * pueden hacerlo. La compañía del actor y del objetivo deben coincidir.
 *
 * Limpieza (paralela al flujo de self-deletion en /api/account/delete):
 *   1. Leads asignados al objetivo → se reasignan a su reports_to (o se eliminan si no tiene).
 *   2. Actividades / notificaciones / lead_documents de esos leads se eliminan.
 *   3. team_memberships de subordinados se actualizan (reports_to → null).
 *   4. team_memberships del objetivo se elimina.
 *   5. profile y auth.users se eliminan.
 *
 * Body: { userId: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable("En el modo demo no se eliminan miembros reales.", 403)
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

    const { userId: targetUserId } = await req.json()
    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json({ error: "Falta userId." }, { status: 400 })
    }

    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "No puedes eliminarte desde aquí. Usa Mi cuenta → Eliminar cuenta." },
        { status: 400 },
      )
    }

    const supabase = adminClient()

    const { data: actorProfile, error: actorError } = await supabase
      .from("profiles")
      .select("id, full_name, company_id, role:roles(level, name)")
      .eq("id", user.id)
      .single()

    if (actorError || !actorProfile) {
      return NextResponse.json({ error: "No se encontró el perfil del actor." }, { status: 400 })
    }

    const actorRole = asRole(actorProfile.role)
    const actorRoleName = (actorRole?.name ?? "").toLowerCase()
    const actorCanManage =
      (actorRole?.level ?? 99) <= 3 ||
      actorRoleName.includes("director") ||
      actorRoleName.includes("gerente") ||
      actorRoleName.includes("coordinador") ||
      actorRoleName.includes("admin")

    if (!actorCanManage) {
      return NextResponse.json(
        { error: "No tienes permiso para eliminar usuarios del equipo." },
        { status: 403 },
      )
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("id, full_name, company_id")
      .eq("id", targetUserId)
      .single()

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "Usuario objetivo no encontrado." }, { status: 404 })
    }

    if (targetProfile.company_id !== actorProfile.company_id) {
      return NextResponse.json(
        { error: "No puedes eliminar usuarios de otra empresa." },
        { status: 403 },
      )
    }

    const { data: targetMembership } = await supabase
      .from("team_memberships")
      .select("reports_to")
      .eq("user_id", targetUserId)
      .maybeSingle()

    const targetReportsTo = targetMembership?.reports_to ?? null

    const { data: targetLeadIds } = await supabase
      .from("leads")
      .select("id")
      .eq("assigned_to", targetUserId)

    let reassignedLeadCount = 0
    if (targetLeadIds && targetLeadIds.length > 0) {
      const leadIds = targetLeadIds.map(l => l.id)

      const { error: delActivities } = await supabase
        .from("activities")
        .delete()
        .in("lead_id", leadIds)
      if (delActivities) console.error("[delete-team-member] activities cleanup error:", delActivities)

      const { error: delNotifs } = await supabase
        .from("notifications")
        .delete()
        .in("lead_id", leadIds)
      if (delNotifs) console.error("[delete-team-member] notifications cleanup error:", delNotifs)

      const { error: delDocs } = await supabase
        .from("lead_documents")
        .delete()
        .in("lead_id", leadIds)
      if (delDocs) console.error("[delete-team-member] lead_documents cleanup error:", delDocs)

      if (targetReportsTo) {
        const { data: superior } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", targetReportsTo)
          .single()

        const { error: reassignError } = await supabase
          .from("leads")
          .update({ assigned_to: targetReportsTo })
          .eq("assigned_to", targetUserId)

        if (reassignError) {
          return NextResponse.json(
            { error: `Error al reasignar leads: ${reassignError.message}` },
            { status: 500 },
          )
        }

        reassignedLeadCount = leadIds.length

        if (superior) {
          await supabase.from("notifications").insert({
            company_id: actorProfile.company_id,
            user_id: targetReportsTo,
            type: "team_member_deleted",
            title: "Miembro del equipo eliminado",
            body: `${actorProfile.full_name} eliminó a ${targetProfile.full_name}. ${reassignedLeadCount} ${reassignedLeadCount === 1 ? "lead fue reasignado" : "leads fueron reasignados"} a ti.`,
          })
        }
      } else {
        const { error: deleteLeadsError } = await supabase
          .from("leads")
          .delete()
          .eq("assigned_to", targetUserId)

        if (deleteLeadsError) {
          return NextResponse.json(
            { error: `Error al eliminar leads: ${deleteLeadsError.message}` },
            { status: 500 },
          )
        }
      }
    }

    await supabase
      .from("team_memberships")
      .update({ reports_to: null })
      .eq("reports_to", targetUserId)

    await supabase
      .from("team_memberships")
      .delete()
      .eq("user_id", targetUserId)

    await supabase
      .from("profiles")
      .delete()
      .eq("id", targetUserId)

    const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId)

    if (authError) {
      console.error("[delete-team-member] auth.admin.deleteUser error:", authError)
      return NextResponse.json(
        { error: "El perfil y los datos se eliminaron, pero la cuenta de autenticación sigue activa. Contacta a soporte." },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, reassignedLeads: reassignedLeadCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado"
    console.error("[delete-team-member]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
