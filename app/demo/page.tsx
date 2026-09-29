import type { Metadata } from "next"
import { DemoLauncher } from "./DemoLauncher"

export const metadata: Metadata = {
  title: "Demo - Flugzz CRM",
  description: "Recorre Flugzz CRM con una demo guiada sin registro: pipeline, seguimiento de leads, IA y alertas con datos de ejemplo.",
  robots: { index: true, follow: true },
  openGraph: { title: "Demo - Flugzz CRM", description: "Recorrido guiado de Flugzz CRM sin registro ni tarjeta." },
}

export default function DemoPage() {
  return <DemoLauncher />
}