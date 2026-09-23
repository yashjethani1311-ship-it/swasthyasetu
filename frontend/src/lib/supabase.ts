import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  rawUrl.trim().length > 0 &&
  rawKey.trim().length > 0 &&
  !rawUrl.includes('your-project.supabase.co') &&
  !rawUrl.includes('placeholder')
)

export function getMissingSupabaseConfig(): string[] {
  const missing: string[] = []
  if (!rawUrl || rawUrl.trim().length === 0 || rawUrl.includes('your-project.supabase.co')) {
    missing.push('VITE_SUPABASE_URL')
  }
  if (!rawKey || rawKey.trim().length === 0 || rawKey.includes('placeholder')) {
    missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  }
  return missing
}

const safeUrl = isSupabaseConfigured ? rawUrl! : 'https://unconfigured.supabase.co'
const safeKey = isSupabaseConfigured ? rawKey! : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.unconfigured'

export const supabase: SupabaseClient = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: isSupabaseConfigured,
    autoRefreshToken: isSupabaseConfigured,
    detectSessionInUrl: isSupabaseConfigured,
  },
})
