import crypto from "crypto"

// Credenciales rotadas: ya no hay valores de respaldo en el código.
// Admin login fallará si ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_JWT_SECRET
// no están definidas en el entorno (Vercel / .env.local).
const rawSecret = process.env.ADMIN_JWT_SECRET
const rawEmail = process.env.ADMIN_EMAIL
const rawPassword = process.env.ADMIN_PASSWORD

if (!rawSecret || !rawEmail || !rawPassword) {
  throw new Error("Faltan ADMIN_JWT_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD en el entorno.")
}

const SECRET: string = rawSecret
const ADMIN_EMAIL: string = rawEmail
const ADMIN_PASSWORD: string = rawPassword

export function createAdminToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      email: ADMIN_EMAIL,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  ).toString("base64url")
  const signature = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url")
  return `${header}.${payload}.${signature}`
}

export function verifyAdminToken(token: string): boolean {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return false
    const [header, payload, signature] = parts
    const expectedSig = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url")
    if (signature !== expectedSig) return false
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (data.exp < Math.floor(Date.now() / 1000)) return false
    if (data.email !== ADMIN_EMAIL) return false
    return true
  } catch {
    return false
  }
}

export function getAdminCredentials() {
  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
}
