import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Profile } from './types'

const AuthContext = createContext<{
  session: Session | null
  profile: Profile | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
} | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = async (userId?: string) => {
    const id = userId ?? session?.user.id
    if (!id) { setProfile(null); return }
    const { data, error } = await supabase.from('profiles').select('id, role, full_name').eq('id', id).maybeSingle()
    if (error) throw error
    setProfile((data as Profile | null) ?? null)
  }

  useEffect(() => {
    let alive = true
    let revision = 0
    let pending: ReturnType<typeof setTimeout> | undefined
    const applySession = async (next: Session | null) => {
      const current = ++revision
      setSession(next)
      setProfile(null)
      setLoading(true)
      setError(null)
      try {
        if (next?.user) {
          const { data, error: queryError } = await supabase.from('profiles').select('id, role, full_name').eq('id', next.user.id).maybeSingle()
          if (queryError) throw queryError
          if (alive && current === revision) setProfile(data as Profile | null)
        }
      } catch (caught) {
        if (alive && current === revision) setError(caught && typeof caught === 'object' && 'message' in caught ? String(caught.message) : 'Unable to load account.')
      } finally {
        if (alive && current === revision) setLoading(false)
      }
    }
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive || revision) return
      if (sessionError) { setError(sessionError.message); setLoading(false); return }
      void applySession(data.session)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      // Avoid querying Supabase while its auth notification lock is held.
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => { if (alive) void applySession(next) }, 0)
    })
    return () => { alive = false; revision++; clearTimeout(pending); listener.subscription.unsubscribe() }
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
    error,
    refreshProfile: async () => loadProfile(),
    signOut: async () => { await supabase.auth.signOut() },
  }), [session, profile, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
