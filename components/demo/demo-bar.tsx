"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  RotateCcw,
  X,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FlaskConical,
  MousePointerClick,
} from "lucide-react"
import { isDemoMode, resetDemo, stopDemo } from "@/lib/demo/client"

const TOUR_KEY = "flugzz_demo_tour_v1"

// Leads de la semilla demo
const LEAD_SOFIA = "/leads/00000000-0000-0000-0000-000000000010"
const LEAD_MIGUEL = "/leads/00000000-0000-0000-0000-000000000011"

type Step = {
  title: string
  body: string
  href: string
  cta: string
}

const STEPS: Step[] = [
  {
    title: "Pipeline en Kanban",
    body: "Aquí ves tus oportunidades en etapas (Nuevo, Contactado, Negociación, Propuesta, Cierre). Miguel Torres lleva 6 días sin actividad: el sistema lo marca con su alerta de seguimiento.",
    href: "/pipeline",
    cta: "Ver el pipeline",
  },
  {
    title: "Detalle del lead",
    body: "Abre a Sofía Ramírez: tienes el resumen inteligente con IA, el mensaje de re-engagement listo para copiar y el historial de actividades para dar seguimiento en un solo lugar.",
    href: LEAD_SOFIA,
    cta: "Abrir a Sofía",
  },
  {
    title: "Alertas y seguimiento",
    body: "La campana acumula avisos como 'Seguimiento pendiente' de Miguel Torres. Marca el aviso, entra al lead y registra una llamada: el sistema aprende tu ritmo de seguimiento.",
    href: LEAD_MIGUEL,
    cta: "Abrir a Miguel",
  },
  {
    title: "Asistente IA",
    body: "Pregunta por tu cartera: '¿Qué leads están estancados?', 'Resume a Ana López' o 'Prepárame una propuesta'. La IA responde usando tu propia base de conocimiento.",
    href: "/asistente",
    cta: "Probar el asistente",
  },
  {
    title: "Todo desde una sola vista",
    body: "Dashboard, contactos, Drive e integraciones ya están listos para explorar. Cambia etapas, anota actividades y edita datos: todo vive en tu demo, sin tocar datos reales.",
    href: "/dashboard",
    cta: "Terminar el recorrido",
  },
]

function TourOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  const advance = (delta: number) => {
    const target = step + delta
    if (target >= STEPS.length) {
      router.push("/dashboard")
      onClose()
      return
    }
    if (target < 0) return
    setStep(target)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-flugzz-accent/15">
            <MousePointerClick className="h-4 w-4 text-flugzz-accent" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-flugzz-accent">
            Recorrido guiado · {step + 1}/{STEPS.length}
          </p>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Cerrar recorrido"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="text-lg font-semibold text-zinc-100">{current.title}</h3>
        <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={() => advance(-1)}
            disabled={step === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:hover:text-zinc-300 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>

          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-flugzz-accent" : "w-1.5 bg-zinc-700"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => advance(1)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-zinc-950 bg-flugzz-accent hover:bg-cyan-300 transition-colors"
          >
            {isLast ? "Terminar" : "Siguiente"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            router.push(current.href)
            onClose()
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-950 bg-flugzz-accent shadow-[0_0_18px_rgba(34,211,238,0.35)] hover:bg-cyan-300 active:bg-cyan-500 transition-colors"
        >
          <Sparkles className="w-4 h-4" /> {current.cta}
        </button>
      </div>
    </div>
  )
}

export function DemoBar() {
  const router = useRouter()
  const [demo, setDemo] = useState(false)
  const [tour, setTour] = useState(false)

  useEffect(() => {
    const on = isDemoMode()
    setDemo(on)
    if (!on) return
    try {
      if (!window.localStorage.getItem(TOUR_KEY)) {
        setTour(true)
        window.localStorage.setItem(TOUR_KEY, "1")
      }
    } catch {
      /* noop */
    }
  }, [])

  if (!demo) return null

  const handleReset = () => {
    resetDemo()
    router.refresh()
    window.location.reload()
  }

  const handleExit = () => {
    stopDemo()
    router.push("/")
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70]">
        <div className="flex items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-900/95 backdrop-blur-xl shadow-xl shadow-black/40 pl-3 pr-2 py-1.5">
          <FlaskConical className="w-4 h-4 text-flugzz-accent shrink-0" />
          <span className="text-xs font-medium text-zinc-200 whitespace-nowrap mr-1">
            Modo demo
          </span>
          <button
            onClick={() => setTour((t) => !t)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-flugzz-accent hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" /> Recorrido guiado
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors whitespace-nowrap"
            title="Restablecer los datos de la demo"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reiniciar
          </button>
          <button
            onClick={handleExit}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 transition-colors whitespace-nowrap"
            title="Salir del modo demo"
          >
            <X className="w-3.5 h-3.5" /> Salir
          </button>
        </div>
      </div>

      {tour && <TourOverlay onClose={() => setTour(false)} />}
    </>
  )
}