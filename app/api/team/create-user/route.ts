import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { checkSeats, seatCheckErrorMessage } from "@/lib/seats"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable("En el modo demo no se crean cuentas reales.", 403)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Faltan variables de entorno del servidor." },
        { status: 500 },
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { email, password, fullName, roleId, companyId, reportsTo } = await req.json()

    if (!email || !password || !fullName || !companyId) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 },
      )
    }

    // El plan Agente Pro es de un solo asiento: no se puede sumar equipo
    const { data: subPlan } = await adminClient
      .from("company_subscriptions")
      .select("plan_id")
      .eq("company_id", companyId)
      .maybeSingle()

    if (subPlan?.plan_id === "agente_pro") {
      return NextResponse.json(
        { error: "El plan Agente Pro es para agentes independientes y no permite agregar miembros de equipo." },
        { status: 403 },
      )
    }

    const seatCheck = await checkSeats(adminClient, companyId)
    if (!seatCheck.ok) {
      const msg = seatCheckErrorMessage(seatCheck)
      return NextResponse.json(
        {
          error: msg.body,
          code: msg.code,
          title: msg.title,
          active: seatCheck.active,
          seats: seatCheck.seats,
          status: seatCheck.status,
        },
        { status: 403 },
      )
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const userId = data.user?.id
    if (!userId) {
      return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 })
    }

    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: userId,
      company_id: companyId,
      role_id: roleId ?? null,
      full_name: fullName,
      email: String(email).trim().toLowerCase(),
      is_active: true,
    })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    const { error: membershipError } = await adminClient.from("team_memberships").upsert({
      company_id: companyId,
      user_id: userId,
      reports_to: reportsTo ?? null,
    })

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      remainingSeats: seatCheck.remaining - 1,
      seats: seatCheck.seats,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
