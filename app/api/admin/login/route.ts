import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminToken, getAdminCredentials } from "@/lib/admin-auth"

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()
  const creds = getAdminCredentials()

  if (!creds.email || !creds.password) {
    return NextResponse.json({ error: "Admin no configurado (faltan ADMIN_EMAIL / ADMIN_PASSWORD)" }, { status: 500 })
  }

  if (email !== creds.email || password !== creds.password) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 })
  }

  const token = createAdminToken()
  if (!token) {
    return NextResponse.json({ error: "Admin no configurado (falta ADMIN_JWT_SECRET)" }, { status: 500 })
  }

  const cookieStore = await cookies()
  cookieStore.set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  })

  return NextResponse.json({ ok: true })
}
