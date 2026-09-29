import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getOAuth2Client, decryptToken } from "@/lib/google-calendar"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/server-env"
import { isDemoRequest } from "@/lib/demo/guard"

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return NextResponse.json({ ok: true })
    const supabase = createServerClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: tokenRow } = await supabase
      .from("user_google_tokens")
      .select("access_token")
      .eq("user_id", user.id)
      .single()

    if (tokenRow) {
      try {
        const accessToken = decryptToken(tokenRow.access_token as string)
        const oauth2Client = getOAuth2Client()
        oauth2Client.setCredentials({ access_token: accessToken })
        await oauth2Client.revokeCredentials().catch(() => {})
      } catch { }
    }

    const admin = createServerClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll() {},
      },
    })
    await admin.from("user_google_tokens").delete().eq("user_id", user.id)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
