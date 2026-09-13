"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import {
  ArrowLeft, Phone, MessageCircle, Mail, MapPin, Clock,
  Plus, ChevronDown, Edit2, Check, X, Loader2, FileText,
  PhoneCall, PhoneMissed, PhoneOff, Voicemail, User,
  AlertCircle, Trash2, ExternalLink, Pencil,
  Navigation, StickyNote, Calendar, Sparkles, Download, Copy, Video, CheckCircle2
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getLeadScore, getOutreachRecommendation } from "@/lib/lead-intelligence"

// ── tipos ─────────────────────────────────────────────────────
type Stage = { id: string; name: string; color: string; position: number; is_closed: boolean }
type Source = { id: string; name: string; icon: string | null; color: string | null }
type Contact = { id: string; full_name: string; phone: string | null; whatsapp: string | null; email: string | null }
type Activity = {
  id: string; type: string; title: string | null; body: string | null
  call_duration_secs: number | null; call_status: string | null
  visit_address: string | null; file_url: string | null; file_name: string | null
  from_stage: { name: string; color: string } | null
  to_stage: { name: string; color: string } | null
  user: { full_name: string } | null
  created_at: string
}
type DealType = "sale" | "rent" | "sale_rent"
type DocumentTemplateItem = {
  id: string
  template_id: string
  label: string
  is_required: boolean
  position: number
}
type LeadDocument = {
  id: string
  template_item_id: string | null
  label: string
  file_name: string
  file_path: string
  uploaded_at: string
  uploaded_by: { full_name: string } | null
  signed_url?: string | null
}
type Lead = {
  id: string; title: string | null; project: string | null
  priority: "low" | "medium" | "high"; budget_min: number | null; budget_max: number | null
  currency: string; expected_close_date: string | null; lost_reason: string | null
  deal_type: DealType; last_activity_at: string; created_at: string; metadata: any
  lead_tags: string[] | null; source_id: string | null
  contact: Contact; stage: Stage | null; source: Source | null
  owner_id: string | null
  owner: { full_name: string; email: string } | null
}
type CompanySettings = {
  default_currency: string | null
  allowed_currencies: string[] | null
}

// ── helpers ───────────────────────────────────────────────────
function fmt(d: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d))
}
function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`
}
function fmtMoney(n: number, cur = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n)
}
function relTime(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return "ahora"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return fmt(d)
}

const PRIORITY_MAP = {
  high: { label: "Alta", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  medium: { label: "Media", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  low: { label: "Baja", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
}
const DEAL_TYPE_LABELS: Record<DealType, string> = {
  sale: "Venta",
  rent: "Renta",
  sale_rent: "Venta y renta",
}

// ── Activity icon ─────────────────────────────────────────────
function ActivityIcon({ type, callStatus }: { type: string; callStatus?: string | null }) {
  const base = "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border"
  if (type === "call") {
    if (callStatus === "answered") return <div className={`${base} bg-emerald-500/10 border-emerald-500/20`}><PhoneCall className="w-3.5 h-3.5 text-emerald-400" /></div>
    if (callStatus === "no_answer") return <div className={`${base} bg-red-500/10 border-red-500/20`}><PhoneMissed className="w-3.5 h-3.5 text-red-400" /></div>
    if (callStatus === "voicemail") return <div className={`${base} bg-purple-500/10 border-purple-500/20`}><Voicemail className="w-3.5 h-3.5 text-purple-400" /></div>
    if (callStatus === "busy") return <div className={`${base} bg-zinc-500/10 border-zinc-500/20`}><PhoneOff className="w-3.5 h-3.5 text-zinc-400" /></div>
    return <div className={`${base} bg-blue-500/10 border-blue-500/20`}><Phone className="w-3.5 h-3.5 text-blue-400" /></div>
  }
  if (type === "whatsapp") return <div className={`${base} bg-emerald-500/10 border-emerald-500/20`}><MessageCircle className="w-3.5 h-3.5 text-emerald-400" /></div>
  if (type === "email") return <div className={`${base} bg-blue-500/10 border-blue-500/20`}><Mail className="w-3.5 h-3.5 text-blue-400" /></div>
  if (type === "visit") return <div className={`${base} bg-amber-500/10 border-amber-500/20`}><Navigation className="w-3.5 h-3.5 text-amber-400" /></div>
  if (type === "note") return <div className={`${base} bg-zinc-700/50 border-zinc-700`}><StickyNote className="w-3.5 h-3.5 text-zinc-400" /></div>
  if (type === "stage_change") return <div className={`${base} bg-flugzz-accent/10 border-flugzz-accent/20`}><Check className="w-3.5 h-3.5 text-flugzz-accent" /></div>
  if (type === "file_upload") return <div className={`${base} bg-zinc-700/50 border-zinc-700`}><FileText className="w-3.5 h-3.5 text-zinc-400" /></div>
  if (type === "meeting") return <div className={`${base} bg-red-500/10 border-red-500/20`}><Calendar className="w-3.5 h-3.5 text-red-400" /></div>
  return <div className={`${base} bg-zinc-700/50 border-zinc-700`}><User className="w-3.5 h-3.5 text-zinc-400" /></div>
}

// ── Activity item ─────────────────────────────────────────────
function ActivityItem({ act }: { act: Activity }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <ActivityIcon type={act.type} callStatus={act.call_status} />
        <div className="w-px flex-1 bg-zinc-800/60 my-1" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {act.type === "stage_change" ? (
              <p className="text-sm text-zinc-300">
                Movido de{" "}
                {act.from_stage
                  ? <><span className="text-zinc-500">De </span><span className="font-medium" style={{ color: act.from_stage.color }}>{act.from_stage.name}</span>{" → "}</>
                  : <span className="text-zinc-500">Entró en </span>
                }
                {act.to_stage && <span className="font-medium" style={{ color: act.to_stage.color }}>{act.to_stage.name}</span>}
              </p>
            ) : (
              <p className="text-sm font-medium text-zinc-200">{act.title || act.type}</p>
            )}
            {act.call_duration_secs != null && (
              <p className="text-xs text-zinc-500 mt-0.5">Duración: {fmtDuration(act.call_duration_secs)}</p>
            )}
            {act.body && (
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-wrap">{act.body}</p>
            )}
            {act.visit_address && (
              <a href={`https://maps.google.com/?q=${encodeURIComponent(act.visit_address)}`} target="_blank"
                className="flex items-center gap-1.5 text-xs text-amber-400 mt-1.5 hover:text-amber-300">
                <MapPin className="w-3 h-3" />{act.visit_address}
              </a>
            )}
            {act.file_url && (
              <a href={act.file_url} target="_blank"
                className="flex items-center gap-1.5 text-xs text-blue-400 mt-1.5 hover:text-blue-300">
                <FileText className="w-3 h-3" />{act.file_name || "Archivo"}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-zinc-600">{relTime(act.created_at)}</p>
            {act.user && <p className="text-[10px] text-zinc-700 mt-0.5">{act.user.full_name.split(" ")[0]}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Log Activity Sheet ────────────────────────────────────────
type LogType = "call" | "whatsapp" | "email" | "visit" | "note"

function LogActivitySheet({
  leadId, contactId, companyId, currentStageId, stages, onClose, onSaved
}: { leadId: string; contactId: string; companyId: string; currentStageId: string | null; stages: Stage[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<LogType>("call")
  const [note, setNote] = useState("")
  const [callStatus, setCallStatus] = useState<string>("answered")
  const [duration, setDuration] = useState("")
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const TYPES: { id: LogType; label: string; icon: React.ReactNode }[] = [
    { id: "call", label: "Llamada", icon: <Phone className="w-4 h-4" /> },
    { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
    { id: "email", label: "Email", icon: <Mail className="w-4 h-4" /> },
    { id: "visit", label: "Visita", icon: <Navigation className="w-4 h-4" /> },
    { id: "note", label: "Nota", icon: <StickyNote className="w-4 h-4" /> },
  ]

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const durSecs = duration ? parseInt(duration) * 60 : null

    const payload: any = {
      company_id: companyId, lead_id: leadId, contact_id: contactId,
      user_id: user!.id, type,
      title: type === "call" ? `Llamada ${callStatus === "answered" ? "contestada" : callStatus === "no_answer" ? "sin respuesta" : callStatus === "voicemail" ? "buzón" : "ocupado"}`
        : type === "whatsapp" ? "Mensaje de WhatsApp"
        : type === "email" ? "Email enviado"
        : type === "visit" ? "Visita registrada"
        : "Nota",
      body: note || null,
      completed_at: new Date().toISOString(),
    }

    if (type === "call") {
      payload.call_status = callStatus
      payload.call_duration_secs = durSecs
    }

    await (supabase as any).from("activities").insert(payload)

    // Detectar menciones @ y crear notificaciones
    if ((type === "note" || type === "call") && note) {
      const mentionRegex = /@(\w+(?:\s+\w+)*)/g
      const mentions = [...note.matchAll(mentionRegex)].map(m => m[1].trim())
      
      if (mentions.length > 0 && companyId) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("company_id", companyId)
          .ilike("full_name", `%${mentions[0]}%`)
        
        for (const profile of profiles ?? []) {
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              company_id: companyId,
              user_id: profile.id,
              lead_id: leadId,
              type: "mention",
              title: "Te mencionaron",
              body: `${user?.email?.split("@")[0] ?? "Alguien"} te mencionó en una nota: "${note.slice(0, 80)}..."`,
            }),
          }).catch(() => {})
        }
      }
    }

    // Solo avanzar si el lead está en la primera columna (sacarlo del estado inicial)
    let nextStageId: string | null = null
    if (type === "call" && stages.length > 0 && currentStageId) {
      const sorted = [...stages].sort((a, b) => a.position - b.position)
      if (sorted[0]?.id === currentStageId && sorted.length > 1) {
        nextStageId = sorted[1].id
      }
    }

    const leadPatch: Record<string, string> = { last_activity_at: new Date().toISOString() }
    if (nextStageId) leadPatch.stage_id = nextStageId

    await (supabase as any).from("leads").update(leadPatch).eq("id", leadId)

    setSaving(false)
    onSaved()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto md:max-w-lg md:left-1/2 md:-translate-x-1/2 md:rounded-2xl md:bottom-8 md:border">

        <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-zinc-100 font-medium">Registrar actividad</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        {/* Type selector */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border whitespace-nowrap transition-all ${
                type === t.id ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700"
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Call-specific */}
        {type === "call" && (
          <div className="space-y-3 mb-4">
            <div>
              <p className="text-xs text-zinc-500 mb-2">Estado de la llamada</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "answered", label: "Contestó", icon: <PhoneCall className="w-3.5 h-3.5" />, cls: "text-emerald-400 border-emerald-500/30" },
                  { id: "no_answer", label: "No contestó", icon: <PhoneMissed className="w-3.5 h-3.5" />, cls: "text-red-400 border-red-500/30" },
                  { id: "voicemail", label: "Buzón de voz", icon: <Voicemail className="w-3.5 h-3.5" />, cls: "text-purple-400 border-purple-500/30" },
                  { id: "busy", label: "Ocupado", icon: <PhoneOff className="w-3.5 h-3.5" />, cls: "text-zinc-400 border-zinc-700" },
                ].map(s => (
                  <button key={s.id} onClick={() => setCallStatus(s.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all ${
                      callStatus === s.id ? `bg-zinc-800 ${s.cls}` : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700"
                    }`}>
                    {s.icon}{s.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number" placeholder="Duración (minutos)" value={duration}
              onChange={e => setDuration(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm placeholder:text-zinc-600 outline-none focus:border-zinc-700"
            />
          </div>
        )}

        {/* Note / body */}
        <textarea
          placeholder={type === "note" ? "Escribe tu nota..." : "Notas adicionales (opcional)"}
          value={note} onChange={e => setNote(e.target.value)} rows={3}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm placeholder:text-zinc-600 outline-none focus:border-zinc-700 resize-none mb-4"
        />

        <button onClick={save} disabled={saving}
          className="w-full bg-zinc-100 text-zinc-900 rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition-opacity">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Guardar actividad"}
        </button>
      </div>
    </>
  )
}

// ── Stage Selector ────────────────────────────────────────────
function StageSelector({ current, stages, leadId, companyId, contactId, onChanged }: {
  current: Stage | null; stages: Stage[]; leadId: string
  companyId: string; contactId: string; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function changeStage(newStage: Stage) {
    if (newStage.id === current?.id) { setOpen(false); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    await Promise.all([
      (supabase as any).from("leads")
        .update({ stage_id: newStage.id, last_activity_at: new Date().toISOString() })
        .eq("id", leadId),
      (supabase as any).from("activities").insert({
        company_id: companyId, lead_id: leadId, contact_id: contactId,
        user_id: user!.id, type: "stage_change",
        title: `Etapa cambiada`,
        from_stage_id: current?.id ?? null,
        to_stage_id: newStage.id,
        completed_at: new Date().toISOString(),
      })
    ])

    setLoading(false)
    setOpen(false)
    onChanged()
  }

  const active = stages.filter(s => !s.is_closed)
  const closed = stages.filter(s => s.is_closed)

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" /> : (
          <>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: current?.color ?? "#666" }} />
            <span className="text-sm font-medium text-zinc-200">{current?.name ?? "Sin etapa"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-40 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[200px]">
            {active.length > 0 && (
              <div className="p-1">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 py-1.5">Activas</p>
                {active.map(s => (
                  <button key={s.id} onClick={() => changeStage(s)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      s.id === current?.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-900"
                    }`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                    {s.id === current?.id && <Check className="w-3.5 h-3.5 ml-auto text-zinc-500" />}
                  </button>
                ))}
              </div>
            )}
            {closed.length > 0 && (
              <div className="p-1 border-t border-zinc-800/60">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 py-1.5">Cerradas</p>
                {closed.map(s => (
                  <button key={s.id} onClick={() => changeStage(s)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      s.id === current?.id ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
                    }`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}{s.is_closed && " (Cerrado)"}
                    
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DealTypeSelector({
  value,
  onChange,
}: {
  value: DealType
  onChange: (next: DealType) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["sale", "rent", "sale_rent"] as DealType[]).map((type) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
            value === type
              ? "border-flugzz-accent/40 bg-flugzz-accent/10 text-flugzz-accent"
              : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          }`}
        >
          {DEAL_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  )
}

function EditLeadSheet({
  lead,
  stages,
  sources,
  allowedCurrencies,
  onClose,
  onSaved,
}: {
  lead: Lead
  stages: Stage[]
  sources: Source[]
  allowedCurrencies: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: lead.contact.full_name,
    email: lead.contact.email ?? "",
    phone: lead.contact.phone ?? "",
    whatsapp: lead.contact.whatsapp ?? "",
    title: lead.title ?? "",
    project: lead.project ?? "",
    priority: lead.priority,
    budget_min: lead.budget_min?.toString() ?? "",
    budget_max: lead.budget_max?.toString() ?? "",
    currency: lead.currency ?? allowedCurrencies[0] ?? "MXN",
    deal_type: lead.deal_type,
    source_id: lead.source?.id ?? "",
    stage_id: lead.stage?.id ?? "",
    expected_close_date: lead.expected_close_date ? lead.expected_close_date.slice(0, 10) : "",
    lost_reason: lead.lost_reason ?? "",
  })

  async function save() {
    setSaving(true)
    setError(null)

    const [{ error: contactError }, { error: leadError }] = await Promise.all([
      supabase.from("contacts").update({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || form.phone.trim() || null,
      }).eq("id", lead.contact.id),
      supabase.from("leads").update({
        title: form.title.trim() || `${form.full_name.trim()} — Lead`,
        project: form.project.trim() || null,
        priority: form.priority,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        currency: form.currency || "MXN",
        deal_type: form.deal_type,
        source_id: form.source_id || null,
        stage_id: form.stage_id || null,
        expected_close_date: form.expected_close_date || null,
        lost_reason: form.lost_reason.trim() || null,
        last_activity_at: new Date().toISOString(),
      }).eq("id", lead.id),
    ])

    if (contactError || leadError) {
      setError(contactError?.message || leadError?.message || "No se pudo guardar el lead.")
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 max-h-[88vh] overflow-y-auto md:max-w-3xl md:left-1/2 md:-translate-x-1/2 md:bottom-8 md:rounded-2xl md:border">
        <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-5 md:hidden" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-zinc-100 font-medium text-lg">Editar lead</h3>
            <p className="text-sm text-zinc-500 mt-1">Actualiza datos de contacto, oportunidad y seguimiento.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Nombre completo"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Título del lead"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Teléfono"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="WhatsApp"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })}
            placeholder="Proyecto"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />

          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Lead["priority"] })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700">
            <option value="low">Prioridad baja</option>
            <option value="medium">Prioridad media</option>
            <option value="high">Prioridad alta</option>
          </select>

          <select value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value as DealType })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700">
            <option value="sale">Venta</option>
            <option value="rent">Renta</option>
            <option value="sale_rent">Venta y renta</option>
          </select>

          <select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700">
            <option value="">Sin origen</option>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>

          <select value={form.stage_id} onChange={(e) => setForm({ ...form, stage_id: e.target.value })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700">
            <option value="">Sin etapa</option>
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>

          <input type="number" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
            placeholder="Presupuesto mínimo"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
          <input type="number" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
            placeholder="Presupuesto máximo"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />

          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700">
            {allowedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>

          <input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />
        </div>

        <textarea value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })}
          rows={3}
          placeholder="Motivo de pérdida o nota interna"
          className="w-full mt-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700" />

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-700">
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </>
  )
}

function ExpedientePanel({
  companyId,
  leadId,
  leadType,
  templateItems,
  documents,
  availableTemplates,
  selectedTemplateId,
  onTemplateChange,
  onUploaded,
}: {
  companyId: string
  leadId: string
  leadType: DealType
  templateItems: DocumentTemplateItem[]
  documents: LeadDocument[]
  availableTemplates: { id: string; name: string; deal_type: string }[]
  selectedTemplateId: string | null
  onTemplateChange: (templateId: string | null) => void
  onUploaded: () => void
}) {
  const supabase = createClient()
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [manualLabel, setManualLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  async function downloadZip() {
    if (documents.length === 0) return
    setDownloading(true)
    try {
      const response = await fetch("/api/documents/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })
      if (!response.ok) throw new Error("Error al descargar")
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `expediente_${leadId}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError("Error al descargar expediente")
    } finally {
      setDownloading(false)
    }
  }

  async function uploadDocument(file: File, item?: DocumentTemplateItem, customLabel?: string) {
    setError(null)
    setUploadingId(item?.id ?? "manual")

    const { data: userData } = await supabase.auth.getUser()
    const safeFileName = file.name.replace(/[^\w.\-]+/g, "-")
    const filePath = `${companyId}/${leadId}/${file.lastModified}-${safeFileName}`

    const { error: uploadError } = await supabase.storage
      .from("lead-documents")
      .upload(filePath, file, { upsert: false })

    if (uploadError) {
      setError(uploadError.message)
      setUploadingId(null)
      return
    }

    const insertPayload = {
      company_id: companyId,
      lead_id: leadId,
      template_item_id: item?.id ?? null,
      label: customLabel?.trim() || item?.label || file.name,
      file_name: file.name,
      file_path: filePath,
      uploaded_by: userData.user?.id ?? null,
    }

    const { error: insertError } = await supabase.from("lead_documents").insert(insertPayload)
    if (insertError) {
      setError(insertError.message)
      setUploadingId(null)
      return
    }

    setManualLabel("")
    setUploadingId(null)
    onUploaded()
  }

  const requiredCount = templateItems.filter((item) => item.is_required).length
  const completedCount = templateItems.filter((item) =>
    documents.some((document) => document.template_item_id === item.id)
  ).length
  const manualDocuments = documents.filter((document) => !document.template_item_id)

  return (
    <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/40 p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Expediente</p>
          <h3 className="text-lg font-medium text-zinc-100 mt-1">
            {leadType === "sale" ? "Checklist de venta" : leadType === "rent" ? "Checklist de renta" : "Documentación del lead"}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            {requiredCount > 0 ? `${completedCount} / ${requiredCount} obligatorios completos` : `${documents.length} documento(s) cargado(s)`}
          </span>
          {documents.length > 0 && (
              <button
                onClick={downloadZip}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 hover:border-zinc-500 disabled:opacity-50"
              >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Descargar ZIP
            </button>
          )}
        </div>
      </div>

      {availableTemplates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-zinc-500">Plantilla:</label>
          <select
            value={selectedTemplateId ?? ""}
            onChange={(e) => onTemplateChange(e.target.value || null)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-700"
          >
            <option value="">Sin plantilla</option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.deal_type === "sale" ? "Venta" : t.deal_type === "rent" ? "Renta" : "Otro"})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {templateItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-5 text-sm text-zinc-500">
          Esta inmobiliaria todavía no configuró una plantilla para este tipo de operación. Puedes seguir cargando documentos manuales.
        </div>
      ) : (
        <div className="space-y-3">
          {templateItems.map((item) => {
            const uploadedDocument = documents.find((document) => document.template_item_id === item.id)
            return (
              <div key={item.id} className="grid gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-950/70 p-4 md:grid-cols-[1.5fr_auto] md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-100">{item.label}</p>
                    {item.is_required && (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                        Obligatorio
                      </span>
                    )}
                    {uploadedDocument && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
                        Completo
                      </span>
                    )}
                  </div>

                  {uploadedDocument ? (
                    <div className="mt-2 text-sm text-zinc-400">
                      <a
                        href={uploadedDocument.signed_url ?? "#"}
                        target="_blank"
                        className="text-zinc-200 hover:text-flugzz-accent transition-colors"
                      >
                        {uploadedDocument.file_name}
                      </a>
                      <p className="text-xs text-zinc-600 mt-1">
                        Subido {relTime(uploadedDocument.uploaded_at)}
                        {uploadedDocument.uploaded_by ? ` por ${uploadedDocument.uploaded_by.full_name}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-500">Sin archivo cargado todavía.</p>
                  )}
                </div>

                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 hover:bg-zinc-700 hover:border-zinc-500">
                  {uploadingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {uploadedDocument ? "Reemplazar archivo" : "Subir archivo"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void uploadDocument(file, item)
                      }
                      event.currentTarget.value = ""
                    }}
                  />
                </label>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/70 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">Documentos adicionales</p>
          <p className="text-sm text-zinc-500 mt-1">Para archivos que no estén en la plantilla.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr_auto]">
          <input
            value={manualLabel}
            onChange={(event) => setManualLabel(event.target.value)}
            placeholder="Ej. Contrato firmado"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-700"
          />
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
            {uploadingId === "manual" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Subir documento
            <input
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void uploadDocument(file, undefined, manualLabel || file.name)
                }
                event.currentTarget.value = ""
              }}
            />
          </label>
        </div>

        {manualDocuments.length > 0 && (
          <div className="space-y-2">
            {manualDocuments.map((document) => (
              <div key={document.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div>
                  <p className="text-sm text-zinc-100">{document.label}</p>
                  <p className="text-xs text-zinc-600 mt-1">{document.file_name}</p>
                </div>
                <a href={document.signed_url ?? "#"} target="_blank" className="text-sm text-flugzz-accent hover:underline">
                  Ver archivo
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── PÁGINA PRINCIPAL ──────────────────────────────────────────
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [lead, setLead] = useState<Lead | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [templateItems, setTemplateItems] = useState<DocumentTemplateItem[]>([])
  const [documents, setDocuments] = useState<LeadDocument[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<{ id: string; name: string; deal_type: string }[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [showEditLead, setShowEditLead] = useState(false)
  const [showDeleteLead, setShowDeleteLead] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string }[]>([])
  const [canReassign, setCanReassign] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [activeTab, setActiveTab] = useState<"timeline" | "info" | "expediente" | "ia">("timeline")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleRef = useRef<HTMLInputElement>(null)
  const [allCompanyTags, setAllCompanyTags] = useState<string[]>([])
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTag, setNewTag] = useState("")
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loadingAiSummary, setLoadingAiSummary] = useState(false)
  const [reengageCopied, setReengageCopied] = useState(false)
  const [aiSummaryCopied, setAiSummaryCopied] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleTitle, setScheduleTitle] = useState("")
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10))
  const [scheduleTime, setScheduleTime] = useState("10:00")
  const [scheduleDuration, setScheduleDuration] = useState(60)
  const [scheduleMeetType, setScheduleMeetType] = useState<"meet" | "call" | "in_person">("meet")
  const [scheduleLocation, setScheduleLocation] = useState("")
  const [scheduling, setScheduling] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<{ htmlLink?: string; meetLink?: string; meeting_type?: string } | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([])
  const [editingEvent, setEditingEvent] = useState<any | null>(null)

  useEffect(() => { loadData() }, [id])
  useEffect(() => { if (editingTitle && titleRef.current) titleRef.current.focus() }, [editingTitle])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from("profiles").select("company_id, role_id").eq("id", user!.id).single()
    setCompanyId(profile?.company_id ?? null)
    setUserId(user!.id)

    // Load team members for reassignment
    if (profile?.company_id) {
      const { data: members } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("full_name")
      setTeamMembers(members ?? [])

      // Check if current user can reassign (role level <= 2 or has permission)
      const { data: roleData } = await supabase
        .from("roles")
        .select("level, permissions")
        .eq("id", profile.role_id ?? "")
        .single()
      
      const perms = roleData?.permissions as Record<string, unknown> ?? {}
      const canRe = String(perms["can_reassign_leads"]) === "true" || (roleData?.level ?? 99) <= 2
      setCanReassign(canRe)
    }

    const [{ data: leadData }, { data: stagesData }, { data: activitiesData }, { data: sourcesData }, { data: companyData }] = await Promise.all([
      supabase.from("leads").select(`
        id, title, project, priority, budget_min, budget_max, currency,
        expected_close_date, lost_reason, deal_type, last_activity_at, created_at, metadata, lead_tags,
        contact:contacts(id, full_name, phone, whatsapp, email),
        stage:pipeline_stages(*),
        source:lead_sources(id, name, icon, color),
        owner_id, owner:profiles(full_name, email)
      `).eq("id", id).single(),

      supabase.from("pipeline_stages").select("*").eq("company_id", profile?.company_id).order("position"),

      (supabase as any).from("activities").select(`
        id, type, title, body, call_duration_secs, call_status,
        visit_address, file_url, file_name, created_at,
        from_stage_id, to_stage_id,
        user:profiles(full_name)
      `).eq("lead_id", id).order("created_at", { ascending: false }).limit(50),

      supabase.from("lead_sources").select("id, name, icon, color").eq("company_id", profile?.company_id).order("name"),

      supabase.from("companies").select("default_currency, allowed_currencies").eq("id", profile?.company_id).maybeSingle(),
    ])

    setLead(leadData as any)
    const stagesArr = stagesData ?? []
    setStages(stagesArr)
    const stageMap = Object.fromEntries(stagesArr.map((s: any) => [s.id, s]))
    const hydratedActivities = (activitiesData ?? []).map((act: any) => ({
      ...act,
      from_stage: act.from_stage_id ? (stageMap[act.from_stage_id] ?? null) : null,
      to_stage:   act.to_stage_id   ? (stageMap[act.to_stage_id]   ?? null) : null,
    }))
    setActivities(hydratedActivities)
    setSources((sourcesData as Source[] | null) ?? [])
    setCompanySettings((companyData as CompanySettings | null) ?? null)
    setTitleDraft(leadData?.title ?? "")

    const { data: events } = await supabase
      .from("lead_events")
      .select("*")
      .eq("lead_id", id)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
    setUpcomingEvents(events ?? [])

    // Collect all tags from company's leads for autocomplete
    if (profile?.company_id) {
      const { data: allLeadsWithTags } = await supabase
        .from("leads")
        .select("lead_tags")
        .eq("company_id", profile.company_id)
        .not("lead_tags", "is", null)
      
      const tagsSet = new Set<string>()
      allLeadsWithTags?.forEach((l: any) => {
        if (l.lead_tags) {
          l.lead_tags.forEach((tag: string) => tagsSet.add(tag))
        }
      })
      setAllCompanyTags(Array.from(tagsSet).sort())
    }

    if (profile?.company_id) {
      const [{ data: allTemplatesData }, { data: documentsData }, { data: leadExtraData }] = await Promise.all([
        supabase
          .from("document_templates")
          .select("id, name, deal_type")
          .eq("company_id", profile.company_id)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("lead_documents")
          .select(`
            id, template_item_id, label, file_name, file_path, uploaded_at,
            uploaded_by:profiles(full_name)
          `)
          .eq("lead_id", id)
          .order("uploaded_at", { ascending: false }),
        supabase
          .from("leads")
          .select("template_id")
          .eq("id", id)
          .single(),
      ])

      setAvailableTemplates((allTemplatesData as any[]) ?? [])
      const leadTemplateId = (leadExtraData as any)?.template_id ?? null
      setSelectedTemplateId(leadTemplateId)

      if (leadTemplateId) {
        const { data: templateItemsData } = await supabase
          .from("document_template_items")
          .select("id, template_id, label, is_required, position")
          .eq("template_id", leadTemplateId)
          .order("position")

        setTemplateItems((templateItemsData as DocumentTemplateItem[] | null) ?? [])
      } else {
        setTemplateItems([])
      }

      const nextDocuments = await Promise.all(
        (((documentsData as LeadDocument[] | null) ?? [])).map(async (document) => {
          const signed = await supabase.storage.from("lead-documents").createSignedUrl(document.file_path, 60 * 60)
          return {
            ...document,
            signed_url: signed.data?.signedUrl ?? null,
          }
        })
      )
      setDocuments(nextDocuments)
    } else {
      setTemplateItems([])
      setDocuments([])
      setAvailableTemplates([])
      setSelectedTemplateId(null)
    }

    setLoading(false)
  }

  async function saveTitle() {
    if (!lead) return
    setEditingTitle(false)
    if (titleDraft === lead.title) return
    await supabase.from("leads").update({ title: titleDraft }).eq("id", id)
    setLead(l => l ? { ...l, title: titleDraft } : l)
  }

  function startEditEvent(ev: any) {
    setEditingEvent(ev)
    setScheduleTitle(ev.title ?? "")
    const start = new Date(ev.start_time)
    setScheduleDate(start.toISOString().slice(0, 10))
    setScheduleTime(start.toTimeString().slice(0, 5))
    const mins = Math.round((new Date(ev.end_time).getTime() - start.getTime()) / 60000)
    setScheduleDuration(mins > 0 ? mins : 60)
    setScheduleMeetType(ev.meeting_type === "call" || ev.meeting_type === "in_person" ? ev.meeting_type : "meet")
    setScheduleLocation(ev.location ?? "")
    setScheduleResult(null)
    setShowSchedule(true)
  }

  async function handleDeleteEvent(ev: any) {
    if (!window.confirm(`¿Eliminar la reunión "${ev.title}"?`)) return
    try {
      const res = await fetch(`/api/google/calendar/events?id=${ev.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 404) {
          setUpcomingEvents(prev => prev.filter(e => e.id !== ev.id))
          loadData()
          return
        }
        alert(data.detail ? `${data.error}: ${data.detail}` : (data.error || "Error al eliminar la reunión"))
        return
      }
      setUpcomingEvents(prev => prev.filter(e => e.id !== ev.id))
      loadData()
    } catch (e: any) {
      alert(e.message || "Error al eliminar la reunión")
    }
  }

  async function updateDealType(nextType: DealType) {
    await supabase.from("leads").update({ deal_type: nextType }).eq("id", id)
    setLead((current) => (current ? { ...current, deal_type: nextType } : current))
    if (activeTab === "expediente") {
      setActiveTab("info")
    }
    await loadData()
  }

  async function updateLeadTemplate(templateId: string | null) {
    await supabase.from("leads").update({ template_id: templateId }).eq("id", id)
    setSelectedTemplateId(templateId)
    if (activeTab === "expediente") {
      await loadData()
    }
  }

  async function deleteLead() {
    await supabase.from("leads").delete().eq("id", id)
    router.push("/pipeline")
  }

  async function reassignLead(newOwnerId: string) {
    if (!lead || !companyId || !userId) return
    setReassigning(true)
    const newOwner = teamMembers.find(m => m.id === newOwnerId)
    const now = new Date().toISOString()
    await Promise.all([
      (supabase as any).from("leads")
        .update({ owner_id: newOwnerId, last_activity_at: now })
        .eq("id", id),
      (supabase as any).from("activities").insert({
        company_id: companyId, lead_id: id,
        contact_id: lead.contact.id, user_id: userId,
        type: "system",
        title: "Lead reasignado",
        body: `Asignado a ${newOwner?.full_name ?? "nuevo agente"}`,
        created_at: now,
      }),
    ])
    setReassigning(false)
    loadData()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-flugzz-accent animate-spin" />
    </div>
  )

  if (!lead) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <AlertCircle className="w-10 h-10 text-zinc-600" />
      <p className="text-zinc-400">Lead no encontrado</p>
      <button onClick={() => router.push("/pipeline")} className="text-sm text-flugzz-accent hover:underline">Volver al pipeline</button>
    </div>
  )

  const contact = lead.contact
  const priority = PRIORITY_MAP[lead.priority]
  const leadScore = getLeadScore({
    priority: lead.priority,
    lastActivityAt: lead.last_activity_at,
    createdAt: lead.created_at,
    stageName: lead.stage?.name,
    isClosed: lead.stage?.is_closed,
    budgetMax: lead.budget_max,
    activityCount: activities.length,
  })
  const outreach = getOutreachRecommendation({
    contactName: contact.full_name,
    priority: lead.priority,
    lastActivityAt: lead.last_activity_at,
    stageName: lead.stage?.name,
    hasPhone: Boolean(contact.phone || contact.whatsapp),
    hasEmail: Boolean(contact.email),
  })

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">

      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => router.push("/pipeline")}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Pipeline
        </button>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-400 text-sm truncate">{contact.full_name}</span>
      </div>

      {/* ── HEADER CARD ── */}
      <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/60 p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            {/* Contact name */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                {contact.full_name.substring(0, 2).toUpperCase()}
              </div>
              <h1 className="text-xl font-semibold text-zinc-100">{contact.full_name}</h1>
            </div>

            {/* Editable title */}
            <div className="flex items-center gap-1.5 ml-10">
              {editingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input ref={titleRef} value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false) }}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-100 outline-none"
                    placeholder="Título del lead"
                  />
          <button onClick={saveTitle} className="p-1.5 rounded-lg hover:bg-zinc-700"><Check className="w-3.5 h-3.5 text-emerald-400" /></button>
          <button onClick={() => setEditingTitle(false)} className="p-1.5 rounded-lg hover:bg-zinc-700"><X className="w-3.5 h-3.5 text-zinc-500" /></button>
                </div>
              ) : (
                <button onClick={() => setEditingTitle(true)}
                  className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-sm group transition-colors">
                  <span className="truncate">{lead.title || "Agregar título"}</span>
                  <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>

            {/* Etiquetas */}
            <div className="flex items-center gap-2 ml-10 mt-2 flex-wrap">
              {lead.lead_tags && lead.lead_tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-flugzz-accent/10 border border-flugzz-accent/20 text-xs text-flugzz-accent">
                  {tag}
                  {canReassign && (
                    <button onClick={async () => {
                      const newTags = (lead.lead_tags || []).filter(t => t !== tag)
                      await supabase.from("leads").update({ lead_tags: newTags }).eq("id", id)
                      loadData()
                    }} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {canReassign && (
                showTagInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === "Enter" && newTag.trim()) {
                          const currentTags = lead.lead_tags || []
                          if (!currentTags.includes(newTag.trim())) {
                            await supabase.from("leads").update({ lead_tags: [...currentTags, newTag.trim()] }).eq("id", id)
                            loadData()
                          }
                          setNewTag("")
                          setShowTagInput(false)
                        }
                        if (e.key === "Escape") setShowTagInput(false)
                      }}
                      placeholder="Etiqueta..."
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-100 outline-none"
                      autoFocus
                    />
                    <select
                      value=""
                      onChange={async e => {
                        if (e.target.value && !lead.lead_tags?.includes(e.target.value)) {
                          await supabase.from("leads").update({ lead_tags: [...(lead.lead_tags || []), e.target.value] }).eq("id", id)
                          loadData()
                        }
                        setShowTagInput(false)
                      }}
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-400 outline-none"
                    >
                      <option value="">Seleccionar...</option>
                      {allCompanyTags.filter(t => !lead.lead_tags?.includes(t)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button onClick={() => setShowTagInput(false)} className="text-zinc-500 hover:text-zinc-300">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowTagInput(true)} className="text-xs text-zinc-500 hover:text-flugzz-accent transition-colors">
                    + Etiqueta
                  </button>
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-1 rounded-lg border font-medium ${priority.cls}`}>{priority.label}</span>
            {lead.source && (
              <span className="text-xs px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400"
                style={{ borderColor: lead.source.color ? `${lead.source.color}30` : undefined }}>
                {lead.source.icon} {lead.source.name}
              </span>
            )}
          </div>
        </div>

        {/* Stage selector */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <StageSelector
            current={lead.stage} stages={stages} leadId={id}
            companyId={companyId ?? ""} contactId={contact.id}
            onChanged={loadData}
          />
          <div className="flex items-center text-xs text-zinc-600 gap-1">
            <Clock className="w-3 h-3" />
            {relTime(lead.last_activity_at)}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          {contact.phone && (
            <button
              onClick={async () => {
                const now = new Date().toISOString()
                const { data: { user } } = await supabase.auth.getUser()
                const sb = supabase as any
                await sb.from("activities").insert({
                  company_id: companyId, user_id: user?.id,
                  lead_id: id, contact_id: contact.id,
                  type: "call", title: "Llamada saliente",
                  body: `Llamada iniciada a ${contact.phone}`,
                  call_status: "answered", created_at: now,
                })
                await sb.from("leads").update({ last_activity_at: now }).eq("id", id)
                loadData()
                window.open(`tel:${contact.phone}`, "_self")
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 text-sm transition-all">
              <Phone className="w-3.5 h-3.5" /> Llamar
            </button>
          )}
          {(contact.whatsapp || contact.phone) && (
            <button
              onClick={async () => {
                const phone = (contact.whatsapp || contact.phone)?.replace(/\D/g, "")
                const now = new Date().toISOString()
                const { data: { user } } = await supabase.auth.getUser()
                const sb = supabase as any
                await sb.from("activities").insert({
                  company_id: companyId, user_id: user?.id,
                  lead_id: id, contact_id: contact.id,
                  type: "whatsapp", title: "Mensaje de WhatsApp",
                  body: `Conversación iniciada con ${contact.full_name}`,
                  created_at: now,
                })
                await sb.from("leads").update({ last_activity_at: now }).eq("id", id)
                loadData()
                window.open(`https://wa.me/${phone}`, "_blank")
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-400 text-sm transition-all">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
          )}
          <button
            onClick={() => {
              setEditingEvent(null)
              setScheduleTitle(lead?.title || contact.full_name)
              setScheduleLocation("")
              setScheduleMeetType("meet")
              setScheduleResult(null)
              setShowSchedule(true)
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-red-500/40 text-zinc-300 hover:text-red-400 text-sm transition-all">
            <Calendar className="w-3.5 h-3.5" />
            Agendar
            {upcomingEvents.length > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 text-[10px] font-semibold text-red-400">
                {upcomingEvents.length}
              </span>
            )}
          </button>
          {contact.email && (
            <button
              onClick={async () => {
                const now = new Date().toISOString()
                const { data: { user } } = await supabase.auth.getUser()
                const sb = supabase as any
                await sb.from("activities").insert({
                  company_id: companyId, user_id: user?.id,
                  lead_id: id, contact_id: contact.id,
                  type: "email", title: "Email enviado",
                  body: `Email a ${contact.email}`, created_at: now,
                })
                await sb.from("leads").update({ last_activity_at: now }).eq("id", id)
                loadData()
                window.open(`mailto:${contact.email}`, "_self")
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-blue-500/40 text-zinc-300 hover:text-blue-400 text-sm transition-all">
              <Mail className="w-3.5 h-3.5" /> Email
            </button>
          )}
          <button onClick={() => setShowLog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-100 text-zinc-900 hover:bg-zinc-200 text-sm font-medium transition-all ml-auto">
            <Plus className="w-3.5 h-3.5" /> Registrar
          </button>
          <button onClick={() => setShowEditLead(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 text-sm transition-all">
            <Edit2 className="w-3.5 h-3.5" /> Editar
          </button>
          <button onClick={() => setShowDeleteLead(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:border-red-500/40 text-red-300 text-sm transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 p-5 mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-flugzz-accent" />
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Copiloto comercial <span className="ml-1 rounded-md bg-flugzz-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-flugzz-accent">BETA</span></p>
            </div>
            <h2 className="mt-2 text-lg font-semibold text-zinc-100">{outreach.headline}</h2>
            <p className="mt-1 text-sm text-zinc-400">{outreach.nextAction}</p>
          </div>

          <div className={`shrink-0 rounded-2xl border px-4 py-3 ${leadScore.className}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${leadScore.dotClassName}`} />
              <span className="text-sm font-semibold">{leadScore.label}</span>
              <span className="text-sm font-bold">{leadScore.value}</span>
            </div>
            <p className="mt-1 text-[11px] opacity-80">{leadScore.helper}</p>
          </div>
        </div>

        {outreach.reengagementMessage && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-200">Mensaje sugerido de re-engagement</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">{outreach.reengagementMessage}</p>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(outreach.reengagementMessage ?? "")
                    setReengageCopied(true)
                    setTimeout(() => setReengageCopied(false), 2000)
                  }}
                  className={`shrink-0 rounded-xl border p-2 transition-all ${
                    reengageCopied
                      ? "border-amber-300/50 bg-amber-500/25 text-amber-100"
                      : "border-amber-500/20 bg-black/20 text-amber-200 hover:bg-amber-500/10"
                  }`}
                  title="Copiar mensaje"
                  aria-label="Copiar mensaje"
                >
                  {reengageCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                {reengageCopied && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 animate-in fade-in slide-in-from-top-1"
                  >
                    Mensaje copiado
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {outreach.steps.map((step) => (
            <div key={`${step.day}-${step.channel}`} className="rounded-2xl border border-zinc-800/60 bg-zinc-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{step.day}</span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{step.channel}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-200">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-zinc-900/40 border border-zinc-800/40 rounded-xl overflow-x-auto mb-4">
        {(lead.deal_type === "sale"
          ? (["timeline", "info", "expediente", "ia"] as const)
          : (["timeline", "info", "ia"] as const)
        ).map(t => (
          <button key={t} onClick={() => {
            if (t === "ia" && !aiSummary && !loadingAiSummary) {
              setLoadingAiSummary(true)
              fetch("/api/ia/lead-summary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadId: id })
              })
                .then(r => r.json())
                .then(d => { if (d.summary) setAiSummary(d.summary) })
                .finally(() => setLoadingAiSummary(false))
            }
            setActiveTab(t)
          }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {t === "timeline" ? "Actividad" : t === "info" ? "Información" : t === "expediente" ? "Expediente" : <><Sparkles className="w-3.5 h-3.5" /> IA <span className="ml-0.5 rounded-md bg-flugzz-accent/15 px-1 py-0.5 text-[8px] font-semibold text-flugzz-accent">BETA</span></>}
          </button>
        ))}
      </div>

      {/* ── TIMELINE ── */}
      {activeTab === "timeline" && (
        <>

          {/* Upcoming events */}
          {upcomingEvents.length > 0 && (
            <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/40 p-4 mb-4">
              <h4 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                Próximas reuniones ({upcomingEvents.length})
              </h4>
              <div className="space-y-2">
                {upcomingEvents.map((ev) => {
                  const typeLabel = ev.meeting_type === "call" ? "Llamada" : ev.meeting_type === "in_person" ? "Presencial" : "Meet"
                  return (
                    <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/30">
                      <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                        ev.meeting_type === "call" ? "bg-blue-500" :
                        ev.meeting_type === "in_person" ? "bg-amber-500" :
                        "bg-emerald-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{ev.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {new Date(ev.start_time).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                          {" "}
                          {new Date(ev.start_time).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {typeLabel}
                        </p>
                        {ev.meeting_type === "in_person" && ev.location && (
                          <p className="text-xs text-zinc-600 mt-0.5">{ev.location}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {ev.user_id === userId && (
                          <>
                            <button onClick={() => startEditEvent(ev)}
                              className="p-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200 transition-colors"
                              title="Editar reunión">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteEvent(ev)}
                              className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                              title="Eliminar reunión">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {ev.meet_link && (
                          <a href={ev.meet_link} target="_blank"
                            className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                            title="Unirse a Meet">
                            <Video className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/40 p-5">
          {activities.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">
              <StickyNote className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Sin actividad registrada</p>
              <button onClick={() => setShowLog(true)} className="text-flugzz-accent text-sm hover:underline mt-2">
                Registrar primera actividad
              </button>
            </div>
          ) : (
            <div>
              {activities.map((act, i) => (
                <div key={act.id} style={i === activities.length - 1 ? { "--last": "1" } as any : {}}>
                  {i === activities.length - 1 ? (
                    <div className="flex gap-3">
                      <ActivityIcon type={act.type} callStatus={act.call_status} />
                      <div className="pb-2 flex-1 min-w-0">
                        {/* same content without the line */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {act.type === "stage_change" ? (
                              <p className="text-sm text-zinc-300">
                                {act.from_stage
                                  ? <><span className="text-zinc-500">De </span><span className="font-medium" style={{ color: act.from_stage.color }}>{act.from_stage.name}</span>{" → "}</>
                                  : <span className="text-zinc-500">Entró en </span>
                                }
                                {act.to_stage && <span className="font-medium" style={{ color: act.to_stage.color }}>{act.to_stage.name}</span>}
                              </p>
                            ) : <p className="text-sm font-medium text-zinc-200">{act.title || act.type}</p>}
                            {act.call_duration_secs != null && <p className="text-xs text-zinc-500 mt-0.5">Duración: {fmtDuration(act.call_duration_secs)}</p>}
                            {act.body && <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed whitespace-pre-wrap">{act.body}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-zinc-600">{relTime(act.created_at)}</p>
                            {act.user && <p className="text-[10px] text-zinc-700 mt-0.5">{act.user.full_name.split(" ")[0]}</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ActivityItem act={act} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </>
      )}

      {/* ── INFO ── */}
      {activeTab === "info" && (
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/40 p-5 space-y-5">
          {/* Contact info */}
          <div>
            {/* Agent assignment */}
            <div className="mb-5 pb-5 border-b border-zinc-800/50">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Agente asignado</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                  {lead.owner?.full_name?.substring(0,2).toUpperCase() ?? "??"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{lead.owner?.full_name ?? "Sin asignar"}</p>
                  <p className="text-xs text-zinc-600">{lead.owner?.email ?? ""}</p>
                </div>
                {canReassign && teamMembers.length > 0 && (lead.source_id || lead.metadata?.facebook_lead_id) && !lead.source?.name?.toLowerCase().includes("referido") && (
                  <select
                    disabled={reassigning}
                    defaultValue=""
                    onChange={e => e.target.value && reassignLead(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none focus:border-zinc-700 cursor-pointer disabled:opacity-40"
                  >
                    <option value="">Reasignar...</option>
                    {teamMembers
                      .filter(m => m.id !== (lead.owner_id ?? ""))
                      .map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Datos de contacto</p>
            <div className="space-y-2">
              {[
                { label: "Nombre", value: contact.full_name },
                { label: "Teléfono", value: contact.phone, href: `tel:${contact.phone}` },
                { label: "WhatsApp", value: contact.whatsapp, href: `https://wa.me/${contact.whatsapp?.replace(/\D/g, "")}` },
                { label: "Email", value: contact.email, href: `mailto:${contact.email}` },
              ].map(({ label, value, href }) => value ? (
                <div key={label} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                  <span className="text-sm text-zinc-500">{label}</span>
                  {href ? (
                    <a href={href} className="text-sm text-zinc-200 hover:text-flugzz-accent transition-colors">{value}</a>
                  ) : (
                    <span className="text-sm text-zinc-200">{value}</span>
                  )}
                </div>
              ) : null)}
            </div>
          </div>

          {/* Deal info */}
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Oportunidad</p>
            <div className="space-y-2">
              {[
                { label: "Proyecto", value: lead.project },
                { label: "Presupuesto", value: (lead.budget_min || lead.budget_max) ? `${lead.budget_min ? fmtMoney(lead.budget_min, lead.currency) : ""}${lead.budget_min && lead.budget_max ? " – " : ""}${lead.budget_max ? fmtMoney(lead.budget_max, lead.currency) : ""}` : null },
                { label: "Cierre esperado", value: lead.expected_close_date ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date(lead.expected_close_date)) : null },
                { label: "Fuente", value: lead.source ? `${lead.source.icon ?? ""} ${lead.source.name}`.trim() : null },
                { label: "Creado", value: fmt(lead.created_at) },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                  <span className="text-sm text-zinc-500">{label}</span>
                  <span className="text-sm text-zinc-200">{value}</span>
                </div>
              ) : null)}
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Tipo de operación</p>
            <DealTypeSelector value={lead.deal_type} onChange={updateDealType} />
          </div>

          {/* Historial de etapas */}
          {(() => {
            const stageChanges = activities.filter(a => a.type === "stage_change").slice(0, 10)
            if (stageChanges.length === 0) return null
            return (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Historial de etapas</p>
                <div className="space-y-2">
                  {stageChanges.map(act => (
                    <div key={act.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-900/50 border border-zinc-800/40">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: act.to_stage?.color ?? "#666" }} />
                        <div>
                          <p className="text-sm text-zinc-200">
                            {act.from_stage ? (
                              <><span className="text-zinc-500">{act.from_stage.name}</span> → <span style={{ color: act.to_stage?.color }}>{act.to_stage?.name}</span></>
                            ) : (
                              <span style={{ color: act.to_stage?.color }}>{act.to_stage?.name}</span>
                            )}
                          </p>
                          <p className="text-xs text-zinc-600">{act.user?.full_name ?? "Sistema"}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">{fmt(act.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Facebook metadata */}
          {lead.metadata?.facebook_lead_id && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Facebook Lead Ads</p>
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-1.5">
                {lead.metadata.facebook_form_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Form ID</span>
                    <span className="text-zinc-300 font-mono text-xs">{lead.metadata.facebook_form_id}</span>
                  </div>
                )}
                {lead.metadata.form_fields && Object.entries(lead.metadata.form_fields).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-zinc-500">{k}</span>
                    <span className="text-zinc-300 text-xs">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "expediente" && companyId && (
        <ExpedientePanel
          companyId={companyId}
          leadId={id}
          leadType={lead.deal_type}
          templateItems={templateItems}
          documents={documents}
          availableTemplates={availableTemplates}
          selectedTemplateId={selectedTemplateId}
          onTemplateChange={updateLeadTemplate}
          onUploaded={loadData}
        />
      )}

      {activeTab === "ia" && (
        <div className="rounded-2xl bg-zinc-900/30 border border-zinc-800/40 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl border border-flugzz-accent/20 bg-flugzz-accent/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-flugzz-accent" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-zinc-100">Resumen inteligente</h3>
              <p className="text-sm text-zinc-500">Análisis de IA de este lead</p>
            </div>
          </div>

          {loadingAiSummary ? (
            <div className="flex items-center gap-3 py-8 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Analizando lead...</span>
            </div>
          ) : aiSummary ? (
            <div className="relative">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(aiSummary || "")
                  setAiSummaryCopied(true)
                  setTimeout(() => setAiSummaryCopied(false), 2000)
                }}
                className={`absolute top-0 right-0 p-2 rounded-lg transition-all ${
                  aiSummaryCopied
                    ? "text-emerald-300 bg-emerald-500/15"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
                title="Copiar resumen"
                aria-label="Copiar resumen"
              >
                {aiSummaryCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
              {aiSummaryCopied && (
                <span
                  role="status"
                  aria-live="polite"
                  className="absolute top-9 right-0 whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 animate-in fade-in slide-in-from-top-1"
                >
                  Copiado
                </span>
              )}
              <div className="text-zinc-300 leading-relaxed space-y-2 markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {aiSummary}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500">
              <p>No se pudo generar el resumen.</p>
              <button 
                onClick={() => {
                  setLoadingAiSummary(true)
                  fetch("/api/ia/lead-summary", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ leadId: id })
                  })
                    .then(r => r.json())
                    .then(d => { if (d.summary) setAiSummary(d.summary) })
                    .finally(() => setLoadingAiSummary(false))
                }}
                className="mt-3 text-flugzz-accent hover:text-cyan-300 text-sm"
              >
                Intentar de nuevo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Log Activity Sheet */}
      {showLog && companyId && (
        <LogActivitySheet
          leadId={id} contactId={contact.id} companyId={companyId}
          currentStageId={lead.stage?.id ?? null}
          stages={stages}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); loadData() }}
        />
      )}

      {showEditLead && (
        <EditLeadSheet
          lead={lead}
          stages={stages}
          sources={sources}
          allowedCurrencies={companySettings?.allowed_currencies?.length ? companySettings.allowed_currencies : [companySettings?.default_currency || "MXN"]}
          onClose={() => setShowEditLead(false)}
          onSaved={() => { setShowEditLead(false); loadData() }}
        />
      )}

      {showDeleteLead && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={() => setShowDeleteLead(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-5 md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-8 md:rounded-2xl md:border">
            <h3 className="text-zinc-100 font-medium text-lg">Eliminar lead</h3>
            <p className="text-sm text-zinc-500 mt-2">
              Esta acción quitará el lead del pipeline. El contacto podrá quedar en base para futura referencia.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDeleteLead(false)} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-700">
                Cancelar
              </button>
              <button onClick={deleteLead} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-400">
                Eliminar
              </button>
            </div>
          </div>
        </>
      )}

      {showSchedule && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm" onClick={() => { if (!scheduling) { setShowSchedule(false); setEditingEvent(null) } }} />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-2xl p-5 pb-8 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto md:max-w-lg md:left-1/2 md:-translate-x-1/2 md:rounded-2xl md:bottom-8 md:border">
            <div className="w-10 h-1 bg-zinc-800 rounded-full mx-auto mb-5 md:hidden" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-zinc-100 font-medium">{editingEvent ? "Editar reunión" : "Agendar"}</h3>
              <button onClick={() => { setShowSchedule(false); setEditingEvent(null) }} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {scheduleResult ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-300">
                      {scheduleResult.meeting_type === "call" ? "Llamada agendada" :
                       scheduleResult.meeting_type === "in_person" ? "Cita agendada" :
                       "Reunión creada"}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    {scheduleResult.meeting_type === "call" ? "La llamada se registró en tu calendario." :
                     scheduleResult.meeting_type === "in_person" ? "La cita se registró en tu calendario." :
                     "El evento se agregó a tu Google Calendar."}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {scheduleResult.htmlLink && (
                    <a
                      href={scheduleResult.htmlLink}
                      target="_blank"
                      className="flex items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver en Google Calendar
                    </a>
                  )}
                  {scheduleResult.meetLink && (
                    <a
                      href={scheduleResult.meetLink}
                      target="_blank"
                      className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      Unirse a Google Meet
                    </a>
                  )}
                </div>

                <button
                  onClick={() => setShowSchedule(false)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-300 hover:border-zinc-700"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  value={scheduleTitle}
                  onChange={e => setScheduleTitle(e.target.value)}
                  placeholder="Título"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm placeholder:text-zinc-600 outline-none focus:border-zinc-700"
                />

                {/* Meeting type selector */}
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">Tipo</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "call" as const, label: "Llamada", icon: Phone },
                      { value: "meet" as const, label: "Google Meet", icon: Video },
                      { value: "in_person" as const, label: "Presencial", icon: MapPin },
                    ].map((opt) => {
                      const Icon = opt.icon
                      const active = scheduleMeetType === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setScheduleMeetType(opt.value)}
                          className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${
                            active
                              ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-300"
                              : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Fecha</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Hora</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Duración (minutos)</label>
                  <select
                    value={scheduleDuration}
                    onChange={e => setScheduleDuration(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm outline-none focus:border-zinc-700"
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hora</option>
                    <option value={90}>1.5 horas</option>
                    <option value={120}>2 horas</option>
                  </select>
                </div>

                {/* Location field — only for in_person */}
                {scheduleMeetType === "in_person" && (
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Lugar / Dirección</label>
                    <input
                      value={scheduleLocation}
                      onChange={e => setScheduleLocation(e.target.value)}
                      placeholder="Ej. Av. Reforma 222, oficina 3"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 text-sm placeholder:text-zinc-600 outline-none focus:border-zinc-700"
                    />
                  </div>
                )}

                <button
                  onClick={async () => {
                    setScheduling(true)
                    try {
                      const startTime = new Date(`${scheduleDate}T${scheduleTime}:00`)
                      const endTime = new Date(startTime.getTime() + scheduleDuration * 60000)
                      const res = await fetch("/api/google/calendar/events", {
                        method: editingEvent ? "PATCH" : "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          ...(editingEvent ? { event_id: editingEvent.id } : { lead_id: id }),
                          title: scheduleTitle,
                          description: `Reunión con ${contact.full_name}${lead.title ? ` — ${lead.title}` : ""}`,
                          start_time: startTime.toISOString(),
                          end_time: endTime.toISOString(),
                          meeting_type: scheduleMeetType,
                          location: scheduleLocation || undefined,
                        }),
                      })
                      const data = await res.json()
                      if (!res.ok) {
                        if (res.status === 404) {
                          setEditingEvent(null)
                          setShowSchedule(false)
                          loadData()
                          return
                        }
                        alert(data.detail ? `${data.error}: ${data.detail}` : (data.error || "Error al agendar"))
                        setScheduling(false)
                        return
                      }
                      if (editingEvent) {
                        setEditingEvent(null)
                        setShowSchedule(false)
                        loadData()
                      } else {
                        setScheduleResult(data)
                        loadData()
                      }
                    } catch (e: any) {
                      alert(e.message || "Error al agendar")
                    }
                    setScheduling(false)
                  }}
                  disabled={scheduling || !scheduleTitle.trim() || (scheduleMeetType === "in_person" && !scheduleLocation.trim())}
                  className="w-full bg-zinc-100 text-zinc-900 rounded-xl py-3 text-sm font-medium disabled:opacity-40 transition-opacity"
                >
                  {scheduling ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    editingEvent ? "Guardar cambios" :
                    scheduleMeetType === "call" ? "Agendar llamada" :
                    scheduleMeetType === "in_person" ? "Agendar cita" :
                    "Crear reunión"
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
