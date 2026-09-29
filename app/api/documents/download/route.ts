import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import JSZip from "jszip"
import { demoUnavailable, isDemoRequest } from "@/lib/demo/guard"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    if (isDemoRequest(request)) return demoUnavailable()
    const { leadId } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: "leadId requerido" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("company_id, title")
      .eq("id", leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const { data: documents, error: docsError } = await supabase
      .from("lead_documents")
      .select("id, label, file_name, file_path")
      .eq("lead_id", leadId)

    if (docsError || !documents || documents.length === 0) {
      return NextResponse.json({ error: "No hay documentos para descargar" }, { status: 404 })
    }

    const zip = new JSZip()
    const folder = zip.folder(lead.title || "expediente")
    if (!folder) {
      return NextResponse.json({ error: "Error al crear ZIP" }, { status: 500 })
    }

    for (const doc of documents) {
      try {
        const { data: fileData } = await supabase.storage
          .from("lead-documents")
          .download(doc.file_path)

        if (fileData) {
          folder.file(doc.file_name || doc.label || `documento_${doc.id}`, fileData)
        }
      } catch (err) {
        console.error(`Error downloading file ${doc.file_path}:`, err)
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" })

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="expediente_${lead.title || leadId}.zip"`,
      },
    })
  } catch (error) {
    console.error("Error generating ZIP:", error)
    return NextResponse.json({ error: "Error al generar ZIP" }, { status: 500 })
  }
}