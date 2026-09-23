import { supabase } from './supabase'

// Idempotency key for RPCs that take a p_request uuid. Generated per attempt so a
// retry of the same logical action is deduplicated server-side, while a genuinely
// new action gets a fresh key.
export function reqId(): string {
  return crypto.randomUUID()
}

// Frozen migration 021 supplies authorized owner/staff context without exposing
// facility_memberships. Revoked or non-operational access must fail closed.
export async function resolveFacilityId(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null

  try {
    const { data, error } = await supabase.rpc('h1_my_facilities', { p_offset: 0, p_limit: 50 })
    if (error || !Array.isArray(data)) return null
    return selectOperationalFacility(data)
  } catch {
    return null
  }
}

export function selectOperationalFacility(rows: Record<string, unknown>[]): string | null {
  const row = rows.find(r => r.operational_access === true && typeof r.facility_id === 'string')
  return row ? String(row.facility_id) : null
}

export type EncounterOption = {
  id: string
  label: string
  patient_id: string | null
  status: string
}

// Active encounters usable as an admission (h2_admit) or billing (h3_issue)
// source. RLS-scoped; the patient embed is attempted but degrades to a plain
// select when the relation is not exposed.
export async function loadEncounters(): Promise<EncounterOption[]> {
  const base = 'id, status, patient_id, started_at'
  const embedded = await supabase
    .from('encounters')
    .select(`${base}, patient_profiles(full_name, patient_code)`)
    .order('started_at', { ascending: false })
    .limit(50)

  if (!embedded.error) {
    return ((embedded.data ?? []) as Record<string, unknown>[]).map((e) => {
      const p = e.patient_profiles as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined
      const one = Array.isArray(p) ? p[0] : p
      const name = one?.full_name == null ? null : String(one.full_name)
      const code = one?.patient_code == null ? null : String(one.patient_code)
      return {
        id: String(e.id),
        label:
          [name, code].filter(Boolean).join(' · ') || String(e.id).slice(0, 8),
        patient_id: e.patient_id == null ? null : String(e.patient_id),
        status: String(e.status ?? ''),
      }
    })
  }

  const plain = await supabase
    .from('encounters')
    .select(base)
    .order('started_at', { ascending: false })
    .limit(50)
  if (plain.error) throw plain.error
  return ((plain.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: String(e.id),
    label: String(e.id).slice(0, 8),
    patient_id: e.patient_id == null ? null : String(e.patient_id),
    status: String(e.status ?? ''),
  }))
}
