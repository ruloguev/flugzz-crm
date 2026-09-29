"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import {
  LayoutDashboard, Users, KanbanSquare, HardDrive, Bot, UserCog,
  Menu, Bell, Search, LogOut, X, Plug, Settings, Loader2, Megaphone,
  CheckCheck, AlertCircle, TrendingUp, Phone, MessageCircle, Mail,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { PrivacyNoticeModal } from "@/components/ui/privacy-notice-modal"
import { CommandPalette } from "@/components/search/command-palette"
import SupportWidget from "@/components/support-widget"
import { CommandPaletteTrigger } from "@/components/search/command-palette-trigger"
import { DemoBar } from "@/components/demo/demo-bar"

type NotificationRecord = {
  id: string
  user_id: string
  lead_id: string | null
  type: string
  title: string
  body: string | null
  is_read: boolean
  created_at: string
}

const ALL_NAV = [
  { name: "Dashboard",     href: "/dashboard",          icon: LayoutDashboard, permission: null },
  { name: "Marketing",     href: "/dashboard/marketing", icon: Megaphone,      permission: null, marketingOnly: true },
  { name: "Pipeline",      href: "/pipeline",           icon: KanbanSquare,    permission: null },
  { name: "Contactos",     href: "/contactos",          icon: Users,           permission: null },
  { name: "Drive",         href: "/drive",              icon: HardDrive,       permission: null },
  { name: "Asistente IA",  href: "/asistente",          icon: Bot,             permission: null, badge: "BETA" as const },
  { name: "Integraciones", href: "/integraciones",      icon: Plug,            permission: null },
  { name: "Ajustes",       href: "/ajustes",            icon: Settings,        permission: "can_manage_users" as const },
  { name: "Cuenta",        href: "/ajustes/cuenta",     icon: UserCog,        permission: null },
]

const FlugzzIsotipo = ({ className = "w-8 h-8" }) => (
  <img src="/Flugzz.svg" alt="Flugzz" className={className} style={{ filter: "invert(1)" }} />
)

function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installed, setInstalled] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(display-mode: standalone)").matches) { setInstalled(true); return }
    if (!!(window.navigator as any).standalone) { setInstalled(true); return }
    if (!("serviceWorker" in navigator)) return

    setShow(true)

    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e) }
    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", () => { setInstalled(true); setDeferredPrompt(null) })
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === "accepted") setInstalled(true)
      setDeferredPrompt(null)
    } else {
      setShowModal(true)
    }
  }

  if (installed || !show) return null

  return (
    <>
      <button onClick={handleClick}
        className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900/40 transition-colors w-full"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        Instalar app
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-zinc-100 font-semibold text-base mb-4">Instalar Flugzz</h3>
            <p className="text-zinc-400 text-sm mb-4">Abre el menú de Chrome y selecciona:</p>
            <ol className="text-sm text-zinc-300 space-y-2 mb-6">
              <li className="flex gap-2"><span className="text-flugzz-accent shrink-0">1.</span> Haz clic en <strong className="text-zinc-200">⋮</strong> (menú)</li>
              <li className="flex gap-2"><span className="text-flugzz-accent shrink-0">2.</span> <strong className="text-zinc-200">"Cast, save and share"</strong></li>
              <li className="flex gap-2"><span className="text-flugzz-accent shrink-0">3.</span> <strong className="text-zinc-200">"Install page as app..."</strong></li>
            </ol>
            <button onClick={() => setShowModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-medium hover:bg-zinc-700 transition-colors">
              Listo, ya instalé
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function NavSkeleton() {
  return (
    <div className="space-y-1 px-3 py-5">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="h-9 rounded-xl bg-zinc-900 animate-pulse" />
      ))}
    </div>
  )
}

function timeAgo(dateString: string) {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (diff < 60) return "ahora"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function notifIcon(type: string) {
  if (type === "lead_assigned") return <TrendingUp className="w-4 h-4 text-emerald-400" />
  if (type === "stage_change") return <TrendingUp className="w-4 h-4 text-blue-400" />
  if (type === "call") return <Phone className="w-4 h-4 text-cyan-400" />
  if (type === "whatsapp") return <MessageCircle className="w-4 h-4 text-green-400" />
  if (type === "email") return <Mail className="w-4 h-4 text-violet-400" />
  if (type === "system") return <AlertCircle className="w-4 h-4 text-amber-400" />
  return <Bell className="w-4 h-4 text-zinc-400" />
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, company, role, loading, can } = useAuth()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)
  const privacyAcceptedSession = useRef(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [companySettings, setCompanySettings] = useState<Record<string, any> | null>(null)
  const [subStatus, setSubStatus] = useState<string | null | undefined>(undefined)
  const [planId, setPlanId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const normalizedRoleName = role?.name?.toLowerCase() ?? ""
  const canManageSettings =
    can("can_manage_users") ||
    normalizedRoleName.includes("director") ||
    normalizedRoleName.includes("gerente") ||
    normalizedRoleName.includes("admin") ||
    (role?.level ?? 99) <= 2

  useEffect(() => {
    if (!loading && profile && !profile.company_id) {
      router.push("/onboarding")
    }
  }, [loading, profile])

  useEffect(() => {
    if (!loading && profile?.company_id && !profile.privacy_notice_accepted_at && pathname !== "/onboarding" && !privacyAcceptedSession.current) {
      setShowPrivacyNotice(true)
    }
  }, [loading, profile, pathname])

  useEffect(() => {
    if (loading || !profile?.company_id) { setCompanySettings(null); setSubStatus(undefined); setPlanId(null); return }
    // Re-fetch en cada cambio de ruta para reflejar sub recién activada
    setSubStatus(undefined)
    Promise.all([
      supabase.from("companies").select("settings").eq("id", profile.company_id).single(),
      supabase.from("company_subscriptions").select("status, cancel_at_period_end, plan_id").eq("company_id", profile.company_id).maybeSingle(),
    ]).then(([compRes, subRes]) => {
      if (compRes.data) setCompanySettings(compRes.data.settings)
      // null = no row found (no sub), undefined = aún no ha cargado
      setSubStatus(subRes.data ? (subRes.data.status as string) : null)
      setPlanId(typeof subRes.data?.plan_id === "string" ? (subRes.data.plan_id as string) : null)
    })
  }, [loading, profile?.company_id, pathname])

  useEffect(() => {
    if (loading || !profile?.company_id || !companySettings) return
    const sub = companySettings?.subscription as { status?: string; expires_at?: string | null } | undefined
    if (!sub?.expires_at || sub.status === "active") return
    if (new Date() <= new Date(sub.expires_at)) return

    supabase
      .from("companies")
      .update({ settings: { ...companySettings, subscription: { ...sub, status: "expired" } } })
      .eq("id", profile.company_id)
      .then(() => { router.push("/suscripcion/vencida") })
  }, [loading, profile?.company_id, companySettings, router])

  // Bloqueo duro: si NO hay sub válida (company_subscriptions.status no está en
  // trial/active/past_due), redirigir a /suscripcion. Excepción: rutas permitidas.
  useEffect(() => {
    if (loading || !profile?.company_id) return
    // subStatus === undefined = aún no ha cargado, esperar
    if (subStatus === undefined) return
    const validStatuses = ["trial", "active", "past_due"]
    const allowedRoutes = [
      "/suscripcion",
      "/suscripcion/vencida",
      "/suscripcion/resultado",
      "/ajustes/cuenta",
      "/ajustes/cuenta/",
    ]
    const isAllowed = allowedRoutes.some(r => pathname === r || pathname.startsWith(r + "/"))
    if (!validStatuses.includes(subStatus ?? "") && !isAllowed) {
      router.push("/suscripcion")
    }
  }, [loading, profile?.company_id, subStatus, pathname, router])

  const trialDaysLeft = useMemo(() => {
    const sub = companySettings?.subscription as { status?: string; expires_at?: string | null } | undefined
    if (!sub?.expires_at || sub.status !== "trial") return null
    const diff = new Date(sub.expires_at).getTime() - Date.now()
    if (diff <= 0) return null
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }, [companySettings])

  // Load notifications
  async function loadNotifications() {
    if (!profile?.id) return
    setLoadingNotifs(true)
    try {
      const { data, count } = await supabase
        .from("notifications")
        .select("*", { count: "exact" })
        .eq("user_id", profile.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(20)
      setNotifications((data as NotificationRecord[] | null) ?? [])
      setNotifCount(count ?? 0)
    } catch (e) {
      console.error("[notifications] load failed", e)
    } finally {
      setLoadingNotifs(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [profile?.id])

  // Real-time subscription
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` },
        () => { loadNotifications() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [notifOpen])

  // Atajo global: Cmd/Ctrl + K abre el command palette
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])

  async function markAsRead(id: string, leadId?: string | null) {
    try {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id)
    } catch (e) {
      console.error("[notifications] markAsRead failed", e)
    }
    setNotifications(prev => prev.filter(n => n.id !== id))
    setNotifCount(c => Math.max(0, c - 1))
    if (leadId) {
      setNotifOpen(false)
      router.push(`/leads/${leadId}`)
    }
  }

  async function markAllAsRead() {
    if (!profile?.id) return
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    try {
      await supabase.from("notifications").update({ is_read: true }).in("id", ids)
    } catch (e) {
      console.error("[notifications] markAllAsRead failed", e)
    }
    setNotifications([])
    setNotifCount(0)
  }

  const showMarketingNav =
    normalizedRoleName.includes("marketing") || normalizedRoleName.includes("mkt")

  const navItems = ALL_NAV.filter((item) => {
    if ("marketingOnly" in item && item.marketingOnly && !showMarketingNav) return false
    if (item.href === "/ajustes") {
      // Agente Pro es una sola cuenta: sin gestion de equipo/roles/admin
      if (planId === "agente_pro") return false
      return canManageSettings
    }
    if (!item.permission) return true
    return can(item.permission)
  })

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
    : "??"

  const Sidebar = () => (
    <aside className="flex flex-col h-full w-60 bg-zinc-950/86 border-r border-zinc-800/60 backdrop-blur-xl">
      <div className="h-16 flex items-center px-5 border-b border-zinc-800/60 shrink-0">
        <FlugzzIsotipo className="w-7 h-7 mr-3" />
        <span className="font-semibold text-xl tracking-tighter text-zinc-100 flex items-baseline">
          Flugzz<span style={{ color: "#22D3EE" }} className="ml-0.5">.</span>
        </span>
        {company && (
          <span className="ml-auto text-[10px] text-zinc-600 truncate max-w-[80px]">{company.name}</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {loading ? <NavSkeleton /> : navItems.map(item => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href + "/")) ||
            (item.href === "/dashboard" && pathname === "/dashboard")
          return (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
              }`}>
              <item.icon className={`w-4 h-4 mr-3 transition-colors ${
                active ? "text-zinc-100" : "text-zinc-500 group-hover:text-zinc-300"
              }`} />
              {item.name}
              {"badge" in item && item.badge && (
                <span className="ml-2 rounded-md bg-flugzz-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-flugzz-accent">{item.badge}</span>
              )}
              {item.href === "/ajustes" && role && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700">
                  {role.name}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-zinc-800/60 shrink-0">
        <InstallPwaButton />
        <div className="p-4">
          {loading ? (
            <div className="flex items-center gap-2.5 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-zinc-900" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-zinc-900 rounded w-3/4" />
                <div className="h-2 bg-zinc-900 rounded w-1/2" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-700/50 flex items-center justify-center text-xs font-bold text-zinc-300 shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{profile?.full_name}</p>
                <p className="text-xs text-zinc-600 truncate">{role?.name ?? "Sin rol"}</p>
              </div>
              <button onClick={handleLogout}
                className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                title="Cerrar sesión">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div className="h-screen text-zinc-100 flugzz-background flex font-sans overflow-hidden">

      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex">
            <Sidebar />
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-zinc-800 text-zinc-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md shrink-0 z-10">
          <button className="md:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100"
            onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center flex-1 max-w-sm ml-4 md:ml-0">
            <CommandPaletteTrigger onOpen={() => setPaletteOpen(true)} />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Search button (mobile) */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="sm:hidden relative p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-800"
              aria-label="Buscar"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) loadNotifications() }}
                className="relative p-2 text-zinc-500 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-800"
              >
                <Bell className="w-5 h-5" />
                {notifCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 rounded-2xl border border-zinc-800/60 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
                    <h3 className="text-sm font-medium text-zinc-100">Notificaciones</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {loadingNotifs ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 text-flugzz-accent animate-spin" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Bell className="w-8 h-8 text-zinc-700 mb-2" />
                        <p className="text-sm text-zinc-500">Sin notificaciones</p>
                        <p className="text-xs text-zinc-600 mt-1">Estarás al tanto de todo aquí</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <button
                          key={n.id}
                          onClick={() => markAsRead(n.id, n.lead_id)}
                          className="w-full flex items-start gap-3 px-4 py-3 border-b border-zinc-800/40 hover:bg-zinc-800/50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-800/80 flex items-center justify-center shrink-0 mt-0.5">
                            {notifIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-200 font-medium truncate">{n.title}</p>
                            {n.body && (
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.body}</p>
                            )}
                            <p className="text-[10px] text-zinc-600 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>


                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {subStatus === "past_due" && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3">
              <span>
                Tu último pago fue rechazado. Actualiza tu método de pago para evitar la cancelación.
              </span>
              <Link href="/ajustes/cuenta" className="rounded-lg bg-red-500/20 hover:bg-red-500/30 px-3 py-1.5 text-xs font-medium text-red-200 whitespace-nowrap">
                Actualizar
              </Link>
            </div>
          )}
          {trialDaysLeft !== null && trialDaysLeft <= 7 && trialDaysLeft > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3">
              <span>
                Tu prueba termina en {trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}. Activa tu suscripción para no perder acceso.
              </span>
              <Link href="/suscripcion" className="rounded-lg bg-amber-500/20 hover:bg-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-200 whitespace-nowrap">
                Activar
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>

      {showPrivacyNotice && profile && (
        <PrivacyNoticeModal
          profileId={profile.id}
          onAccepted={() => { privacyAcceptedSession.current = true; setShowPrivacyNotice(false) }}
        />
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SupportWidget />
      <DemoBar />
    </div>
  )
}
