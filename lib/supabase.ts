import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient, isDemoMode } from './demo/client'

export function createClient() {
  if (isDemoMode()) {
    // Tipo comparte la superficie de Supabase; en runtime es la fachada demo.
    return createDemoClient() as unknown as SupabaseClient
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}