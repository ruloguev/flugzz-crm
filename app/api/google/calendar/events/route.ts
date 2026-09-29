import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/server-env"
import {
  decryptToken,
  refreshAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  encryptToken,
} from "@/lib/google-calendar"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

const MEETING_LABELS: Record<string, string> = {
  call: "Llamada",
  meet: "Google Meet",
  in_person: "Presencial",
}

function getSupabase(req: NextRequest) {
  return createServerClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    cookies: {
      getAll() { return req.cookies.getAll() },
      setAll() {},
    },
  })
}

async function requireUser(supabase: ReturnType<typeof createServerClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

async function resolveAccessToken(supabase: ReturnType<typeof createServerClient>, userId: string): Promise<string> {
  const { data: tokenRow } = await supabase
    .from("user_google_tokens")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (!tokenRow) {
    throw new Error("Conecta Google Calendar primero en Integraciones")
  }

  let accessToken: string
  try {
    accessToken = decryptToken(tokenRow.access_token as string)
  } catch {
    throw new Error("Error al descifrar token")
  }

  const expiresAt = new Date(tokenRow.token_expires_at as string)
  if (expiresAt.getTime() <= Date.now()) {
    try {
      const refreshToken = decryptToken(tokenRow.refresh_token as string)
      const refreshed = await refreshAccessToken(refreshToken)
      accessToken = refreshed.access_token
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in)
      const encryptedAccess = encryptToken(accessToken)
      await supabase
        .from("user_google_tokens")
        .update({ access_token: encryptedAccess, token_expires_at: newExpiresAt.toISOString() })
        .eq("id", tokenRow.id as string)
    } catch {
      throw new Error("Sesión de Google expirada. Reconecta en Integraciones.")
    }
  }

  return accessToken
}

function tokenErrorResponse(e: unknown) {
  const msg = (e as Error).message
  if (msg.includes("expirada")) return NextResponse.json({ error: msg }, { status: 401 })
  if (msg.includes("Conecta")) return NextResponse.json({ error: msg }, { status: 400 })
  return NextResponse.json({ error: msg }, { status: 500 })
}

async function requireOwnEvent(supabase: ReturnType<typeof createServerClient>, userId: string, eventId: string, action: string) {
  const { data: ev } = await supabase
    .from("lead_events")
    .select("*")
    .eq("id", eventId)
    .single()

  if (!ev) throw new Error("Evento no encontrado")
  if ((ev as any).user_id !== userId) throw new Error(`Solo el creador puede ${action} esta reunión`)
  return ev as any
}

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable("En el modo demo no se sincroniza con Google Calendar.", 400)
    const supabase = getSupabase(req)
    const user = await requireUser(supabase)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { lead_id, title, description, start_time, end_time, meeting_type, location } = await req.json()
    if (!lead_id || !title || !start_time || !end_time) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const mtype = meeting_type === "call" || meeting_type === "in_person" ? meeting_type : "meet"

    let googleEventId: string | null = null
    let htmlLink: string | null = null
    let meetLink: string | null = null

    if (mtype === "meet") {
      let accessToken: string
      try {
        accessToken = await resolveAccessToken(supabase, user.id)
      } catch (e) {
        return tokenErrorResponse(e)
      }

      const event = await createCalendarEvent({
        accessToken,
        summary: title,
        description,
        startTime: new Date(start_time),
        endTime: new Date(end_time),
        addMeet: true,
      })

      googleEventId = event.googleEventId
      htmlLink = event.htmlLink
      meetLink = event.meetLink
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single()

    await supabase.from("lead_events").insert({
      lead_id,
      user_id: user.id,
      company_id: (profile as any)?.company_id || "",
      google_event_id: googleEventId,
      meet_link: meetLink,
      title,
      description: description || null,
      start_time: new Date(start_time).toISOString(),
      end_time: new Date(end_time).toISOString(),
      meeting_type: mtype,
      location: location || null,
    })

    await supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", lead_id)

    const { data: contact } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("id", lead_id)
      .single()

    const parts: string[] = [
      `Tipo: ${MEETING_LABELS[mtype]}`,
      `${new Date(start_time).toLocaleString("es-MX")} - ${new Date(end_time).toLocaleString("es-MX")}`,
    ]
    if (mtype === "in_person" && location) parts.push(`Lugar: ${location}`)
    if (meetLink) parts.push(`Meet: ${meetLink}`)

    if ((contact as any)?.contact_id) {
      const { error: actErr } = await (supabase as any).from("activities").insert({
        lead_id,
        contact_id: (contact as any)?.contact_id,
        user_id: user.id,
        company_id: (profile as any)?.company_id || "",
        type: "meeting",
        title: `${MEETING_LABELS[mtype]} agendada`,
        body: parts.join("\n"),
        created_at: new Date().toISOString(),
      })
      if (actErr) console.error("[calendar events] activity insert failed:", actErr)
    }

    return NextResponse.json({
      ok: true,
      googleEventId,
      htmlLink,
      meetLink,
      meeting_type: mtype,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase(req)
    const user = await requireUser(supabase)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { event_id, title, description, start_time, end_time, meeting_type, location } = await req.json()
    if (!event_id || !title || !start_time || !end_time) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    let current
    try {
      current = await requireOwnEvent(supabase, user.id, event_id, "editar")
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 })
    }

    const mtype = meeting_type === "call" || meeting_type === "in_person" ? meeting_type : "meet"
    const startDate = new Date(start_time)
    const endDate = new Date(end_time)

    const reminderChanged = new Date(current.start_time).getTime() !== startDate.getTime()
    const syncNeeded = mtype === "meet" || !!current.google_event_id

    const { error: updateErr } = await supabase
      .from("lead_events")
      .update({
        title,
        description: description || null,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        meeting_type: mtype,
        location: location || null,
        ...(reminderChanged ? { reminder_sent: false } : {}),
      })
      .eq("id", event_id)
    if (updateErr) {
      console.error("[calendar events] lead_events update failed:", updateErr)
      return NextResponse.json(
        { error: "No se pudo actualizar el evento", detail: updateErr.message },
        { status: 500 }
      )
    }

    let syncError: string | null = null
    if (syncNeeded) {
      try {
        const accessToken = await resolveAccessToken(supabase, user.id)
        let googleEventId: string | null = current.google_event_id
        let meetLink: string | null = null

        if (current.google_event_id && mtype === "meet") {
          const updated = await updateCalendarEvent({
            accessToken,
            googleEventId: current.google_event_id,
            summary: title,
            description,
            startTime: startDate,
            endTime: endDate,
            addMeet: true,
          })
          meetLink = updated.meetLink
        } else if (current.google_event_id) {
          try {
            await deleteCalendarEvent({ accessToken, googleEventId: current.google_event_id })
          } catch (e: any) {
            if (e?.code !== 404 && e?.status !== 404) throw e
          }
          googleEventId = null
        } else {
          const created = await createCalendarEvent({
            accessToken,
            summary: title,
            description,
            startTime: startDate,
            endTime: endDate,
            addMeet: true,
          })
          googleEventId = created.googleEventId
          meetLink = created.meetLink
        }

        const { error: syncErr } = await supabase
          .from("lead_events")
          .update({ google_event_id: googleEventId, meet_link: meetLink })
          .eq("id", event_id)
        if (syncErr) {
          console.error("[calendar events] google sync write failed:", syncErr)
          syncError = "El calendario se actualizó, pero no se pudo guardar el enlace del evento"
        }
      } catch (e) {
        console.error("[calendar events] google sync failed:", e)
        syncError = "La reunión quedó actualizada, pero Google Calendar no se sincronizó"
      }
    }

    await supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", current.lead_id)

    return NextResponse.json({ ok: true, meeting_type: mtype, syncError })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable("En el modo demo no se sincroniza con Google Calendar.", 400)
    const supabase = getSupabase(req)
    const user = await requireUser(supabase)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const eventId = req.nextUrl.searchParams.get("id")
    if (!eventId) return NextResponse.json({ error: "Falta id del evento" }, { status: 400 })

    let current
    try {
      current = await requireOwnEvent(supabase, user.id, eventId, "eliminar")
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 404 })
    }

    const { error: delErr } = await supabase
      .from("lead_events")
      .delete()
      .eq("id", eventId)
    if (delErr) {
      console.error("[calendar events] lead_events delete failed:", delErr)
      return NextResponse.json(
        { error: "No se pudo eliminar el evento de la base de datos", detail: delErr.message },
        { status: 500 }
      )
    }

    if (current.google_event_id) {
      try {
        const accessToken = await resolveAccessToken(supabase, user.id)
        await deleteCalendarEvent({ accessToken, googleEventId: current.google_event_id })
      } catch (e: any) {
        if (e?.code === 404 || e?.status === 404) {
          console.error("[calendar events] google event already gone:", current.google_event_id)
        } else {
          console.error("[calendar events] google delete failed, orphan kept:", e)
        }
      }
    }

    await supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", current.lead_id)

    const { data: contact } = await supabase
      .from("leads")
      .select("contact_id")
      .eq("id", current.lead_id)
      .single()

    if ((contact as any)?.contact_id) {
      const parts: string[] = [
        `Tipo: ${MEETING_LABELS[current.meeting_type] ?? current.meeting_type}`,
        `${new Date(current.start_time).toLocaleString("es-MX")} - ${new Date(current.end_time).toLocaleString("es-MX")}`,
      ]

      const { error: actErr } = await (supabase as any).from("activities").insert({
        lead_id: current.lead_id,
        contact_id: (contact as any)?.contact_id,
        user_id: user.id,
        company_id: current.company_id,
        type: "meeting",
        title: `${MEETING_LABELS[current.meeting_type] ?? "Reunión"} cancelada`,
        body: parts.join("\n"),
        created_at: new Date().toISOString(),
      })
      if (actErr) console.error("[calendar events] activity insert failed:", actErr)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}