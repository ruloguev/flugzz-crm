import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { demoTeamMembers, isDemoRequest } from "@/lib/demo/guard"

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId")
    if (!companyId) return NextResponse.json({ error: "Falta companyId" }, { status: 400 })

    if (isDemoRequest(req)) return NextResponse.json(demoTeamMembers())

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Faltan variables de entorno del servidor." }, { status: 500 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const [{ data: rolesData, error: rolesError }, { data: profilesData, error: profilesError }] =
      await Promise.all([
        adminClient.from("roles").select("id, name, level, color").eq("company_id", companyId).order("level"),
        adminClient
          .from("profiles")
          .select("id, full_name, email, phone, avatar_url, is_active, role_id, created_at")
          .eq("company_id", companyId)
          .order("created_at"),
      ])

    if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 500 })
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

    // Load team_memberships separately
    const userIds = (profilesData ?? []).map((p: any) => p.id)
    const { data: memberships } = await adminClient
      .from("team_memberships")
      .select("user_id, reports_to")
      .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"])

    const membershipMap: Record<string, string | null> = {}
    ;(memberships ?? []).forEach((m: any) => { membershipMap[m.user_id] = m.reports_to ?? null })

    const rolesMap: Record<string, any> = {}
    ;(rolesData ?? []).forEach((r: any) => { rolesMap[r.id] = r })

    const members = (profilesData ?? []).map((p: any) => ({
      ...p,
      role: p.role_id ? (rolesMap[p.role_id] ?? null) : null,
      reports_to: membershipMap[p.id] ?? null,
    }))

    return NextResponse.json({ members, roles: rolesData ?? [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
