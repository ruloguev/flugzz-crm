"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRight,
  FlaskConical,
  KanbanSquare,
  Bot,
  Bell,
  Sparkles,
  ShieldCheck,
  RotateCcw,
} from "lucide-react"
import { startDemo } from "@/lib/demo/client"

const LEAD_SOFIA = "/leads/00000000-0000-0000-0000-000000000010"

const QUICK = [
  {
    title: "Pipeline en Kanban",
    body: "Mueve oportunidades entre etapas y ve la alerta de seguimiento de Miguel Torres (6 días sin actividad).",
    href: "/pipeline",
    icon: KanbanSquare,
  },
  {
    title: "Detalle de un lead con IA",
    body: "Sofía Ramírez: resumen inteligente, mensaje de re-engagement listo para copiar e historial de actividades.",
    href: LEAD_SOFIA,
    icon: Sparkles,
  },
  {
    title: "Asistente IA",
    body: "Pregunta '¿Qué leads están estancados?' y recibe respuestas usando tu base de conocimiento.",
    href: "/asistente",
    icon: Bot,
  },
  {
    title: "Alertas y notificaciones",
    body: "Avisos de seguimiento pendiente en la campana. Marca el aviso y registra una llamada.",
    href: "/dashboard",
    icon: Bell,
  },
]

export function DemoLauncher() {
  const router = useRouter()

  const launch = (href: string) => {
    startDemo()
    router.push(href)
  }

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center bg-black text-zinc-100 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl px-4 py-12">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-flugzz-accent/30 bg-flugzz-accent/10 px-3 py-1 text-xs font-semibold text-flugzz-accent mb-5">
            <FlaskConical className="w-3.5 h-3.5" /> Sin registro · Sin tarjeta
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-white">
            Flugzz <span className="text-[#22D3EE]">.</span>
          </h1>
          <p className="text-zinc-400 mt-3 text-lg max-w-xl mx-auto">
            Recorre la plataforma completa con datos de ejemplo que puedes editar. Todo vive en tu
            navegador: nada se guarda fuera de él.
          </p>
        </div>

        <button
          onClick={() => launch("/dashboard")}
          className="w-full sm:w-auto mx-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-cyan-400 text-zinc-950 font-bold text-lg hover:bg-cyan-300 transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]"
        >
          Probar la demo ahora
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-center text-zinc-600 text-xs mt-3 flex items-center justify-center gap-1.5">
          <RotateCcw className="w-3 h-3" /> Puedes reiniciar los datos cuando quieras desde el botón
          "Reiniciar".
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mt-10">
          {QUICK.map((q) => (
            <button
              key={q.title}
              onClick={() => launch(q.href)}
              className="text-left rounded-2xl border border-zinc-800/70 bg-zinc-900/60 hover:border-flugzz-accent/40 hover:bg-zinc-900 transition-all backdrop-blur-sm p-5 group"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-flugzz-accent/15">
                  <q.icon className="w-4.5 h-4.5 text-flugzz-accent" />
                </span>
                <h3 className="font-semibold text-zinc-100 group-hover:text-white">{q.title}</h3>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">{q.body}</p>
              <span className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-flugzz-accent">
                Entrar <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-zinc-600 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> No se envía ningún dato: es una copia de trabajo aislada en tu navegador.
          </p>
          <p className="text-sm text-zinc-600">
            <Link href="/login" className="text-flugzz-accent hover:underline">Iniciar sesión</Link>
            <span className="mx-2 text-zinc-700">·</span>
            <Link href="/signup" className="text-flugzz-accent hover:underline">Crear cuenta</Link>
          </p>
        </div>
      </div>
    </div>
  )
}