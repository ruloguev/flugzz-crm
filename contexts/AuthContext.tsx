"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase"
import { isDemoMode } from "@/lib/demo/client"
import {
  DEMO_USER_ID,
  DEMO_COMPANY_ID,
  DEMO_ROLE_DIRECTOR_ID,
  DEMO_NAME,
} from "@/lib/demo/constants"

type Profile = {
  id: string
  full_name: string
  company_id: string | null
  role_id: string | null
  privacy_notice_accepted_at: string | null
}

type Company = {
  id: string
  name: string
}

type Role = {
  id: string
  name: string
  level: number
  permissions: Record<string, boolean>
}

type AuthContextValue = {
  loading: boolean
  profile: Profile | null
  company: Company | null
  role: Role | null
  can: (permission: string) => boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const supabase = createClient()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  const loadFromSession = useCallback(async (session: Session | null) => {
    if (isDemoMode()) return
    if (!session?.user) {
      setProfile(null)
      setCompany(null)
      setRole(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, company_id, role_id, privacy_notice_accepted_at")
      .eq("id", session.user.id)
      .single()

    const nextProfile = (profileData as Profile | null) ?? null
    setProfile(nextProfile)

    if (!nextProfile?.company_id) {
      setCompany(null)
      setRole(null)
      setLoading(false)
      return
    }

    const [companyResult, roleResult] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name")
        .eq("id", nextProfile.company_id)
        .single(),
      nextProfile.role_id
        ? supabase
            .from("roles")
            .select("id, name, level, permissions")
            .eq("id", nextProfile.role_id)
            .single()
        : Promise.resolve({ data: null }),
    ])

    setCompany((companyResult.data as Company | null) ?? null)
    setRole((roleResult.data as Role | null) ?? null)
    setLoading(false)
  }, [])

  // Refresca los datos de profile/role/company con la sesión actual (sin signOut)
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await loadFromSession(data.session)
  }, [loadFromSession])

  useEffect(() => {
    if (isDemoMode()) {
      setProfile({
        id: DEMO_USER_ID,
        full_name: DEMO_NAME,
        company_id: DEMO_COMPANY_ID,
        role_id: DEMO_ROLE_DIRECTOR_ID,
        privacy_notice_accepted_at: new Date().toISOString(),
      })
      setCompany({ id: DEMO_COMPANY_ID, name: "Flugzz Demo" })
      setRole({
        id: DEMO_ROLE_DIRECTOR_ID,
        name: "Director",
        level: 1,
        permissions: {
          can_manage_users: true,
          can_manage_roles: true,
          can_manage_integrations: true,
          can_reassign_leads: true,
          is_transversal: true,
        },
      })
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      void loadFromSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadFromSession(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadFromSession])

  const can = useCallback((permission: string) => {
    if (!permission) return true
    return Boolean(role?.permissions?.[permission])
  }, [role])

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    profile,
    company,
    role,
    can,
    refresh,
  }), [can, company, loading, profile, role, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
