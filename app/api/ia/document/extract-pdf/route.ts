import { NextRequest, NextResponse } from "next/server"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    if (isDemoRequest(req)) return demoUnavailable()
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file)
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 })

    if (!file.name.toLowerCase().endsWith(".pdf"))
      return NextResponse.json({ error: "El archivo debe ser un PDF." }, { status: 400 })

    const MAX_MB = 20
    if (file.size > MAX_MB * 1024 * 1024)
      return NextResponse.json({ error: `El PDF supera los ${MAX_MB} MB.` }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // unpdf: librería pura Node.js, sin dependencias del browser
    // usa pdfjs-dist/legacy internamente con las APIs correctas para servidor
    const { extractText } = await import("unpdf")

    const { text, totalPages } = await extractText(buffer, { mergePages: true })

    if (!text || text.trim().length < 10)
      return NextResponse.json({
        error:
          "No se pudo extraer texto del PDF. " +
          "Puede ser un PDF escaneado (imágenes). " +
          "Convierte el contenido a .txt e intenta de nuevo.",
      }, { status: 422 })

    return NextResponse.json({
      text: text.trim(),
      pages: totalPages,
      charCount: text.trim().length,
    })
  } catch (e: unknown) {
    console.error("extract-pdf error:", e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : "Error al procesar el PDF",
    }, { status: 500 })
  }
}