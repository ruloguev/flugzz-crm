import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { DEMO_COOKIE } from "@/lib/demo/constants"

export async function middleware(request: NextRequest) {
  // Admin routes bypass Supabase middleware entirely (use own cookie-based auth)
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin") || request.nextUrl.pathname.startsWith("/api/admin")
  // Facebook/Meta webhook must be publicly accessible
  const isFacebookWebhook = request.nextUrl.pathname === "/api/facebook"
  // Google OAuth callback is public (handles sign-in of its own)
  const isGoogleAuthCallback = request.nextUrl.pathname === "/api/google/auth/callback"
  // Public routes — no auth required
  const publicRoutes = ["/", "/login", "/signup", "/auth/callback", "/demo", "/aviso-de-privacidad", "/terminos-y-condiciones", "/solicitar-demo", "/api/demo/generate-code"]
  const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname === route)

  // Skip Supabase auth check for non-app routes
  if (isAdminRoute || isPublicRoute || isFacebookWebhook || isGoogleAuthCallback) {
    return NextResponse.next({ request })
  }

  // Modo demo: cookie propia → se trata como sesión válida (sin tocar Supabase).
  // En login/signup un usuario demo se manda directo al dashboard.
  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === "1"
  if (isDemo) {
    if (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup") {
      const url = request.nextUrl.clone()
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  // Bots crawling protected pages → 404 instead of redirect (prevents Search Console "Página con redirección")
  const ua = request.headers.get("user-agent") ?? ""
  const isBot = /bot|crawl|spider|googlebot|bingbot|slurp|duckduckbot|baiduspider/i.test(ua)
  if (isBot) {
    return new NextResponse(null, { status: 404 })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated users trying to access protected routes → redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Authenticated users on login/signup → redirect to dashboard
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - static assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
