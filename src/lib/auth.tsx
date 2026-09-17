import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

const AuthContext = createContext<{
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
} | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId?: string) => {
    const id = userId ?? session?.user.id
    if (!id) { setProfile(null); return }
    const { data, error } = await supabase.from('profiles').select('id, role, full_name').eq('id', id).maybeSingle()
    if (error) throw error
    setProfile((data as Profile | null) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session?.user) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next?.user) await loadProfile(next.user.id)
      else setProfile(null)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    const validateServerSession = async () => {
      const {
        data: { session: currentSession }
      } = await supabase.auth.getSession()

      if (!currentSession) {
        return
      }

      const { data, error } =
        await supabase.auth.getUser()

      if (error || !data.user) {
        console.warn(
          'Server account no longer exists or is invalid.'
        )

        await supabase.auth.signOut({
          scope: 'local'
        })

        setSession(null)
        setProfile(null)
      }
    }

    const onFocus = () => {
      void validateServerSession()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void validateServerSession()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener(
      'visibilitychange',
      onVisibility
    )

    const interval = window.setInterval(() => {
      void validateServerSession()
    }, 15000)

    return () => {
      window.removeEventListener('focus', onFocus)

      document.removeEventListener(
        'visibilitychange',
        onVisibility
      )

      window.clearInterval(interval)
    }
  }, [])
  const value = useMemo(() => ({
    session,
    profile,
    loading,
    refreshProfile: async () => loadProfile(),
    signOut: async () => { await supabase.auth.signOut() },
  }), [session, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
