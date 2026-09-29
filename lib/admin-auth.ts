import crypto from "crypto"

// Credenciales del panel admin, solo desde el entorno (Vercel / .env.local).
// Sin valores de respaldo en el código. Si faltan, el panel admin simplemente
// no autentica (fallo en runtime) en vez de romper el build de la app.
const getSecret = (): string | null => process.env.ADMIN_JWT_SECRET || null
const getEmail = (): string | null => process.env.ADMIN_EMAIL || null
const getPassword = (): string | null => process.env.ADMIN_PASSWORD || null

export function createAdminToken(): string | null {
  const SECRET = getSecret()
  const ADMIN_EMAIL = getEmail()
  if (!SECRET || !ADMIN_EMAIL) return null
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
  const SECRET = getSecret()
  const ADMIN_EMAIL = getEmail()
  if (!SECRET || !ADMIN_EMAIL) return false
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
  return { email: getEmail(), password: getPassword() }
}
