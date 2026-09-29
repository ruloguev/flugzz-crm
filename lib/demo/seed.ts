import {
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  DEMO_ROLE_DIRECTOR_ID,
  DEMO_REP_USER_ID,
  DEMO_REP_ROLE_ID,
  DEMO_NAME,
  DEMO_EMAIL,
} from "./constants"

export type DemoRow = Record<string, unknown>
export type DemoDB = Record<string, DemoRow[]>

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString()
}

function isoFuture(msAhead: number): string {
  return new Date(Date.now() + msAhead).toISOString()
}

// ── IDs fijos para que la demo sea estable entre recargas ──
const LEAD_A = "00000000-0000-0000-0000-000000000010"
const LEAD_B = "00000000-0000-0000-0000-000000000011"
const LEAD_C = "00000000-0000-0000-0000-000000000012"

const CONTACT_A = "00000000-0000-0000-0000-000000000020"
const CONTACT_B = "00000000-0000-0000-0000-000000000021"
const CONTACT_C = "00000000-0000-0000-0000-000000000022"

const S_NUEVO = "00000000-0000-0000-0000-000000000031"
const S_CONTACTADO = "00000000-0000-0000-0000-000000000032"
const S_PROPSUESTA = "00000000-0000-0000-0000-000000000033"
const S_NEGOCIACION = "00000000-0000-0000-0000-000000000034"
const S_GANADO = "00000000-0000-0000-0000-000000000035"

const SRC_META = "00000000-0000-0000-0000-000000000041"
const SRC_GOOGLE = "00000000-0000-0000-0000-000000000042"

export function buildSeed(now = new Date().toISOString()): DemoDB {
  const companies: DemoRow[] = [
    {
      id: DEMO_COMPANY_ID,
      name: "Flugzz Demo",
      default_currency: "MXN",
      allowed_currencies: ["MXN", "USD"],
      settings: {
        subscription: { plan: "expansion", expires_at: isoFuture(45 * DAY) },
      },
    },
  ]

  const profiles: DemoRow[] = [
    {
      id: DEMO_USER_ID,
      company_id: DEMO_COMPANY_ID,
      full_name: DEMO_NAME,
      email: DEMO_EMAIL,
      phone: "+52 55 0000 0001",
      avatar_url: null,
      is_active: true,
      role_id: DEMO_ROLE_DIRECTOR_ID,
      created_at: iso(180 * DAY),
    },
    {
      id: DEMO_REP_USER_ID,
      company_id: DEMO_COMPANY_ID,
      full_name: "Carla Méndez",
      email: "carla@flugzzdemo.mx",
      phone: "+52 55 0000 0002",
      avatar_url: null,
      is_active: true,
      role_id: DEMO_REP_ROLE_ID,
      created_at: iso(170 * DAY),
    },
  ]

  const roles: DemoRow[] = [
    {
      id: DEMO_ROLE_DIRECTOR_ID,
      company_id: DEMO_COMPANY_ID,
      name: "Director",
      level: 1,
      color: "#E879F9",
      permissions: {
        can_manage_users: true,
        can_manage_roles: true,
        can_manage_integrations: true,
        can_reassign_leads: true,
        is_transversal: true,
      },
    },
    {
      id: DEMO_REP_ROLE_ID,
      company_id: DEMO_COMPANY_ID,
      name: "Ejecutivo",
      level: 3,
      color: "#22D3EE",
      permissions: {
        can_reassign_leads: false,
      },
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      company_id: DEMO_COMPANY_ID,
      name: "Marketing",
      level: 4,
      color: "#34D399",
      permissions: {},
    },
  ]

  const teamMemberships: DemoRow[] = [
    {
      company_id: DEMO_COMPANY_ID,
      user_id: DEMO_REP_USER_ID,
      reports_to: DEMO_USER_ID,
    },
  ]

  const companySubscriptions: DemoRow[] = [
    {
      company_id: DEMO_COMPANY_ID,
      plan_id: "expansion",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      seats: 6,
      status: "trial",
      current_period_start: iso(10 * DAY),
      current_period_end: isoFuture(20 * DAY),
      setup_fee_paid: true,
      cancel_at_period_end: false,
      created_at: iso(10 * DAY),
      updated_at: iso(1 * DAY),
    },
  ]

  const pipelineStages: DemoRow[] = [
    { id: S_NUEVO, company_id: DEMO_COMPANY_ID, name: "Nuevo", color: "#22D3EE", position: 1, is_closed: false, is_won: false },
    { id: S_CONTACTADO, company_id: DEMO_COMPANY_ID, name: "Contactado", color: "#FBBF24", position: 2, is_closed: false, is_won: false },
    { id: S_PROPSUESTA, company_id: DEMO_COMPANY_ID, name: "Propuesta", color: "#E879F9", position: 3, is_closed: false, is_won: false },
    { id: S_NEGOCIACION, company_id: DEMO_COMPANY_ID, name: "Negociación", color: "#34D399", position: 4, is_closed: false, is_won: false },
    { id: S_GANADO, company_id: DEMO_COMPANY_ID, name: "Ganado", color: "#A3E635", position: 5, is_closed: true, is_won: true },
  ]

  const leadSources: DemoRow[] = [
    { id: SRC_META, company_id: DEMO_COMPANY_ID, name: "Meta Ads", icon: "facebook", color: "#316FF6" },
    { id: SRC_GOOGLE, company_id: DEMO_COMPANY_ID, name: "Google Forms", icon: "form", color: "#22C55E" },
  ]

  const contacts: DemoRow[] = [
    {
      id: CONTACT_A,
      company_id: DEMO_COMPANY_ID,
      owner_id: DEMO_USER_ID,
      full_name: "Sofía Ramírez",
      phone: "+52 55 1111 2233",
      whatsapp: "+52 55 1111 2233",
      email: "sofia.ramirez@gmail.com",
      source_id: SRC_META,
      tags: ["caliente"],
    },
    {
      id: CONTACT_B,
      company_id: DEMO_COMPANY_ID,
      owner_id: DEMO_REP_USER_ID,
      full_name: "Miguel Torres",
      phone: "+52 55 2222 3344",
      whatsapp: "+52 55 2222 3344",
      email: "miguel.torres@outlook.com",
      source_id: SRC_GOOGLE,
      tags: [],
    },
    {
      id: CONTACT_C,
      company_id: DEMO_COMPANY_ID,
      owner_id: DEMO_USER_ID,
      full_name: "Ana López",
      phone: "+52 55 3333 4455",
      whatsapp: "+52 55 3333 4455",
      email: "ana.lopez@hotmail.com",
      source_id: SRC_META,
      tags: ["fb-lead"],
    },
  ]

  const leads: DemoRow[] = [
    {
      id: LEAD_A,
      company_id: DEMO_COMPANY_ID,
      contact_id: CONTACT_A,
      owner_id: DEMO_USER_ID,
      source_id: SRC_META,
      stage_id: S_NEGOCIACION,
      title: "Depto en Polanco",
      project: "Residencial Polanco",
      priority: "high",
      budget_min: 3500000,
      budget_max: 4200000,
      currency: "MXN",
      expected_close_date: isoFuture(12 * DAY),
      lost_reason: null,
      deal_type: "sale",
      last_activity_at: iso(2 * DAY),
      created_at: iso(9 * DAY),
      metadata: {
        facebook_lead: { form_name: "Contáctame - Venta", ad_name: "Campaña Q3 Polanco" },
      },
      lead_tags: ["caliente", "facebook"],
      template_id: "00000000-0000-0000-0000-000000000111",
    },
    {
      id: LEAD_B,
      company_id: DEMO_COMPANY_ID,
      contact_id: CONTACT_B,
      owner_id: DEMO_REP_USER_ID,
      source_id: SRC_GOOGLE,
      stage_id: S_NUEVO,
      title: "Casa en Bosques de las Lomas",
      project: "Bosques Residencial",
      priority: "medium",
      budget_min: 9800000,
      budget_max: 11500000,
      currency: "MXN",
      expected_close_date: null,
      lost_reason: null,
      deal_type: "sale_rent",
      last_activity_at: iso(6 * DAY),
      created_at: iso(6 * DAY),
      metadata: {},
      lead_tags: ["formulario"],
      template_id: null,
    },
    {
      id: LEAD_C,
      company_id: DEMO_COMPANY_ID,
      contact_id: CONTACT_C,
      owner_id: DEMO_USER_ID,
      source_id: SRC_META,
      stage_id: S_PROPSUESTA,
      title: "Local en Condesa",
      project: "Plaza Condesa",
      priority: "medium",
      budget_min: 12000000,
      budget_max: 14000000,
      currency: "MXN",
      expected_close_date: isoFuture(30 * DAY),
      lost_reason: null,
      deal_type: "sale",
      last_activity_at: iso(5 * HOUR),
      created_at: iso(4 * DAY),
      metadata: {},
      lead_tags: ["fb-lead"],
      template_id: null,
    },
  ]

  const activities: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000051",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_C,
      contact_id: CONTACT_C,
      user_id: DEMO_USER_ID,
      type: "stage",
      title: "Avanzó a Propuesta",
      body: "El lead pasó de Contactado a Propuesta.",
      created_at: iso(5 * HOUR),
      from_stage_id: S_CONTACTADO,
      to_stage_id: S_PROPSUESTA,
    },
    {
      id: "00000000-0000-0000-0000-000000000052",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_A,
      contact_id: CONTACT_A,
      user_id: DEMO_USER_ID,
      type: "call",
      title: "Llamada de seguimiento",
      body: "Está lista para ver el departamento. Se programó visita el sábado.",
      call_duration_secs: 640,
      call_status: "answered",
      created_at: iso(2 * DAY),
    },
    {
      id: "00000000-0000-0000-0000-000000000053",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_A,
      contact_id: CONTACT_A,
      user_id: DEMO_USER_ID,
      type: "stage",
      title: "Avanzó a Negociación",
      body: "El lead pasó de Propuesta a Negociación.",
      created_at: iso(2 * DAY),
      from_stage_id: S_PROPSUESTA,
      to_stage_id: S_NEGOCIACION,
    },
    {
      id: "00000000-0000-0000-0000-000000000054",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_A,
      contact_id: CONTACT_A,
      user_id: DEMO_USER_ID,
      type: "email",
      title: "Envío de propuesta",
      body: "Se envió propuesta con precios y plan de pagos.",
      created_at: iso(4 * DAY),
    },
    {
      id: "00000000-0000-0000-0000-000000000055",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_B,
      contact_id: CONTACT_B,
      user_id: DEMO_REP_USER_ID,
      type: "note",
      title: "Primer contacto",
      body: "Llenó el formulario de Google. Busca casa para familia de 4, mudanza en 3 meses.",
      created_at: iso(6 * DAY),
    },
    {
      id: "00000000-0000-0000-0000-000000000056",
      company_id: DEMO_COMPANY_ID,
      lead_id: LEAD_C,
      contact_id: CONTACT_C,
      user_id: DEMO_USER_ID,
      type: "call",
      title: "Llamada de bienvenida",
      body: "Confirmó presupuesto y mostró interés en visita guiada.",
      call_duration_secs: 480,
      call_status: "answered",
      created_at: iso(3 * DAY),
    },
  ]

  const notifications: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000061",
      company_id: DEMO_COMPANY_ID,
      user_id: DEMO_USER_ID,
      lead_id: LEAD_B,
      type: "lead_stale",
      title: "Seguimiento pendiente",
      body: "Miguel Torres lleva 6 días sin actividad. Revisa el lead.",
      is_read: false,
      created_at: iso(6 * HOUR),
    },
    {
      id: "00000000-0000-0000-0000-000000000062",
      company_id: DEMO_COMPANY_ID,
      user_id: DEMO_USER_ID,
      lead_id: LEAD_C,
      type: "lead_created",
      title: "Nuevo lead asignado",
      body: "Ana López fue asignada a tu pipeline desde Meta Ads.",
      is_read: false,
      created_at: iso(4 * DAY),
    },
  ]

  const leadEvents: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000131",
      lead_id: LEAD_A,
      company_id: DEMO_COMPANY_ID,
      title: "Visita al departamento",
      start_time: isoFuture(3 * DAY),
      end_time: isoFuture(3 * DAY + 2 * HOUR),
      meeting_type: "in_person",
      location: "Residencial Polanco",
      google_event_id: null,
      meet_link: null,
    },
  ]

  const documentTemplates: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000111",
      company_id: DEMO_COMPANY_ID,
      name: "Contrato de compraventa",
      deal_type: "sale",
      is_active: true,
    },
  ]

  const documentTemplateItems: DemoRow[] = [
    { id: "00000000-0000-0000-0000-000000000112", template_id: "00000000-0000-0000-0000-000000000111", label: "Identificación oficial", is_required: true, position: 1 },
    { id: "00000000-0000-0000-0000-000000000113", template_id: "00000000-0000-0000-0000-000000000111", label: "Comprobante de ingresos", is_required: true, position: 2 },
  ]

  const facebookIntegrations: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000081",
      company_id: DEMO_COMPANY_ID,
      name: "Página Flugzz Demo",
      page_id: "100000000000001",
      page_name: "Flugzz Demo",
      access_token: null,
      verify_token: "demo-verify-token",
      is_active: true,
      scope_type: "pipeline",
      scope_owner_id: null,
      created_at: iso(30 * DAY),
      last_synced_at: iso(5 * HOUR),
    },
  ]

  const roundRobinQueues: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000091",
      company_id: DEMO_COMPANY_ID,
      source: "meta",
      name: "Round Robin - Meta",
      is_active: true,
      integration_id: "00000000-0000-0000-0000-000000000081",
      reassign_after_hours: 6,
    },
  ]

  const roundRobinMembers: DemoRow[] = [
    { id: "00000000-0000-0000-0000-000000000092", queue_id: "00000000-0000-0000-0000-000000000091", user_id: DEMO_USER_ID, is_active: true, leads_assigned: 3, last_assigned_at: iso(2 * DAY) },
    { id: "00000000-0000-0000-0000-000000000093", queue_id: "00000000-0000-0000-0000-000000000091", user_id: DEMO_REP_USER_ID, is_active: true, leads_assigned: 2, last_assigned_at: iso(1 * DAY) },
  ]

  const roundRobinState: DemoRow[] = [
    { queue_id: "00000000-0000-0000-0000-000000000091", current_position: 1 },
  ]

  const driveLinks: DemoRow[] = [
    { id: "00000000-0000-0000-0000-000000000101", company_id: DEMO_COMPANY_ID, name: "Drive de la empresa", url: `https://drive.google.com/drive/u/0/home` },
    { id: "00000000-0000-0000-0000-000000000102", company_id: DEMO_COMPANY_ID, name: "Manual de uso Flugzz", url: `https://www.youtube.com/watch?v=gTgRWKFFsuE` },
  ]

  const storageFiles: DemoRow[] = [
    {
      bucket: "company-drive",
      name: `${DEMO_COMPANY_ID}/BROCHURES/Portafolio-Demo.pdf`,
      id: "00000000-0000-0000-0000-000000000141",
      created_at: iso(8 * DAY),
      updated_at: iso(8 * DAY),
      metadata: { size: 4200000, mimetype: "application/pdf" },
    },
    {
      bucket: "company-drive",
      name: `${DEMO_COMPANY_ID}/POLITICA-COMERCIAL.pdf`,
      id: "00000000-0000-0000-0000-000000000142",
      created_at: iso(20 * DAY),
      updated_at: iso(20 * DAY),
      metadata: { size: 1200000, mimetype: "application/pdf" },
    },
  ]

  const knowledgeDocuments: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000121",
      company_id: DEMO_COMPANY_ID,
      uploaded_by: DEMO_USER_ID,
      title: "Política comercial demo",
      description: "Descuentos y condiciones de venta de la empresa demo",
      file_type: "md",
      status: "indexed",
      is_active: true,
      created_at: iso(12 * DAY),
    },
  ]

  const knowledgeChunks: DemoRow[] = [
    {
      id: "00000000-0000-0000-0000-000000000122",
      document_id: "00000000-0000-0000-0000-000000000121",
      company_id: DEMO_COMPANY_ID,
      content: "La empresa demo ofrece hasta 10% de descuento en contado en ventas mayores a $5,000,000 MXN. Los pagos diferidos a 6 meses sin intereses para planes de preventa.",
      metadata: { index: 0 },
    },
    {
      id: "00000000-0000-0000-0000-000000000123",
      document_id: "00000000-0000-0000-0000-000000000121",
      company_id: DEMO_COMPANY_ID,
      content: "El comité de crédito se junta los martes. Las propuestas deben estar firmadas por el director comercial antes de enviarse al cliente.",
      metadata: { index: 1 },
    },
  ]

  const leadDocuments: DemoRow[] = []

  return {
    companies,
    profiles,
    roles,
    team_memberships: teamMemberships,
    company_subscriptions: companySubscriptions,
    pipeline_stages: pipelineStages,
    lead_sources: leadSources,
    contacts,
    leads,
    activities,
    notifications,
    lead_events: leadEvents,
    document_templates: documentTemplates,
    document_template_items: documentTemplateItems,
    lead_documents: leadDocuments,
    facebook_integrations: facebookIntegrations,
    round_robin_queues: roundRobinQueues,
    round_robin_members: roundRobinMembers,
    round_robin_state: roundRobinState,
    drive_links: driveLinks,
    storage_files: storageFiles,
    knowledge_documents: knowledgeDocuments,
    knowledge_chunks: knowledgeChunks,
  }
}