import { useCallback, useEffect, useState } from 'react'
import {
  Bed,
  AlertCircle,
  Plus,
  ArrowRightLeft,
  LogOut,
  RefreshCw
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  SectionTitle
} from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { resolveFacilityId, reqId, loadEncounters, type EncounterOption } from '@/lib/facility'

const str = (v: unknown) => (v == null ? null : String(v))

function asRows(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of keys) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[]
    }
  }
  return []
}

type BedRow = {
  id: string
  bed_code: string | null
  ward: string | null
  status: string
  patient_name: string | null
  patient_id: string | null
  admission_id: string | null
}

type AdmissionRow = {
  id: string
  patient_name: string | null
  patient_code: string | null
  bed_code: string | null
  bed_id: string | null
  ward: string | null
  admitted_at: string | null
  status: string
}

function normalizeBeds(data: unknown): BedRow[] {
  return asRows(data, ['beds', 'rows', 'items', 'hospital_beds', 'data']).map((b) => ({
    id: String(b.id ?? ''),
    bed_code: str(b.bed_code ?? b.code ?? b.label),
    ward: str(b.ward ?? b.ward_name ?? b.department),
    status: String(b.status ?? 'UNKNOWN').toUpperCase(),
    patient_name: str(b.patient_name ?? b.full_name),
    patient_id: str(b.patient_id),
    admission_id: str(b.admission_id)
  }))
}

function normalizeAdmissions(data: unknown): AdmissionRow[] {
  return asRows(data, ['admissions', 'rows', 'items', 'hospital_admissions', 'data']).map((a) => ({
    id: String(a.id ?? ''),
    patient_name: str(a.patient_name ?? a.full_name),
    patient_code: str(a.patient_code),
    bed_code: str(a.bed_code ?? a.bed),
    bed_id: str(a.bed_id),
    ward: str(a.ward ?? a.ward_name),
    admitted_at: str(a.admitted_at ?? a.created_at),
    status: String(a.status ?? 'ADMITTED').toUpperCase()
  }))
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  AVAILABLE: 'success',
  FREE: 'success',
  OCCUPIED: 'danger',
  ADMITTED: 'danger',
  MAINTENANCE: 'warning',
  CLEANING: 'warning',
  BLOCKED: 'warning'
}

export function HospitalBedsPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'
  const { profile } = useAuth()

  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [beds, setBeds] = useState<BedRow[]>([])
  const [admissions, setAdmissions] = useState<AdmissionRow[]>([])
  const [bedsError, setBedsError] = useState('')
  const [admError, setAdmError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [ward, setWard] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Per-admission reason / discharge summary text (h2_transfer p_reason and
  // h2_discharge p_summary are required).
  const [reasons, setReasons] = useState<Record<string, string>>({})

  // Admit dialog state — admission is created from an encounter (h2_admit takes
  // p_encounter), not directly from a patient.
  const [admitOpen, setAdmitOpen] = useState(false)
  const [encounters, setEncounters] = useState<EncounterOption[]>([])
  const [encLoading, setEncLoading] = useState(false)
  const [encError, setEncError] = useState('')
  const [encounterId, setEncounterId] = useState('')
  const [admitReason, setAdmitReason] = useState('')
  const [bedId, setBedId] = useState('')

  useEffect(() => {
    let active = true
    void resolveFacilityId(profile?.id).then((id) => {
      if (active) setFacilityId(id)
    })
    return () => {
      active = false
    }
  }, [profile?.id])

  const load = useCallback(async () => {
    if (!facilityId) {
      setBeds([])
      setAdmissions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const bedsRes = await supabase.rpc('h2_beds', { p_facility: facilityId, p_offset: 0 })
    const admRes = await supabase.rpc('h2_admissions', { p_facility: facilityId, p_offset: 0 })
    if (bedsRes.error) {
      setBeds([])
      setBedsError(bedsRes.error.message)
    } else {
      setBedsError('')
      setBeds(normalizeBeds(bedsRes.data))
    }
    if (admRes.error) {
      setAdmissions([])
      setAdmError(admRes.error.message)
    } else {
      setAdmError('')
      setAdmissions(normalizeAdmissions(admRes.data))
    }
    setLoading(false)
  }, [facilityId])

  useEffect(() => {
    void load()
  }, [load, version])

  // Load candidate encounters when the admit dialog opens.
  useEffect(() => {
    if (!admitOpen) return
    let active = true
    setEncLoading(true)
    setEncError('')
    void loadEncounters()
      .then((rows) => { if (active) setEncounters(rows) })
      .catch((e: unknown) => { if (active) { setEncounters([]); setEncError(e instanceof Error ? e.message : String(e)) } })
      .finally(() => { if (active) setEncLoading(false) })
    return () => { active = false }
  }, [admitOpen, version])

  const wards = ['ALL', ...Array.from(new Set(beds.map(b => b.ward).filter(Boolean))) as string[]]
  const visibleBeds = beds.filter(b =>
    (ward === 'ALL' || b.ward === ward) &&
    (status === 'ALL' || b.status === status)
  )
  const available = beds.filter(b => ['AVAILABLE', 'FREE'].includes(b.status)).length
  const occupied = beds.filter(b => ['OCCUPIED', 'ADMITTED'].includes(b.status)).length
  const maintenance = beds.filter(b => ['MAINTENANCE', 'CLEANING', 'BLOCKED'].includes(b.status)).length

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 7000)
  }

  async function admit() {
    if (!facilityId || !encounterId || !bedId || !admitReason.trim()) return
    setBusyId('admit')
    try {
      const { error } = await supabase.rpc('h2_admit', {
        p_facility: facilityId,
        p_encounter: encounterId,
        p_bed: bedId,
        p_reason: admitReason.trim(),
        p_request: reqId()
      })
      if (error) throw error
      flash(hindi ? 'भर्ती दर्ज हुई।' : 'Admission recorded.')
      setAdmitOpen(false)
      setEncounterId('')
      setBedId('')
      setAdmitReason('')
      setVersion(v => v + 1)
    } catch (e: unknown) {
      flash(
        (hindi ? 'भर्ती विफल — सर्वर ने कहा: ' : 'Admission failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function transfer(adm: AdmissionRow) {
    const reason = (reasons[adm.id] ?? '').trim()
    const target = beds.find(b => ['AVAILABLE', 'FREE'].includes(b.status))
    if (!target) {
      flash(hindi ? 'कोई रिक्त बेड उपलब्ध नहीं है।' : 'No available bed to transfer to.')
      return
    }
    if (!reason) {
      flash(hindi ? 'ट्रांसफर के लिए कारण लिखें।' : 'Enter a transfer reason (required).')
      return
    }
    setBusyId(adm.id)
    try {
      const { error } = await supabase.rpc('h2_transfer', {
        p_admission: adm.id,
        p_bed: target.id,
        p_reason: reason,
        p_request: reqId()
      })
      if (error) throw error
      flash(
        hindi
          ? `${adm.patient_name ?? ''} बेड ${target.bed_code ?? ''} में स्थानांतरित।`
          : `Transferred ${adm.patient_name ?? ''} to bed ${target.bed_code ?? ''}.`
      )
      setVersion(v => v + 1)
    } catch (e: unknown) {
      flash(
        (hindi ? 'ट्रांसफर विफल — सर्वर ने कहा: ' : 'Transfer failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function discharge(adm: AdmissionRow) {
    const summary = (reasons[adm.id] ?? '').trim()
    if (!summary) {
      flash(hindi ? 'डिस्चार्ज सारांश लिखें।' : 'Enter a discharge summary (required).')
      return
    }
    setBusyId(adm.id)
    try {
      const { error } = await supabase.rpc('h2_discharge', {
        p_admission: adm.id,
        p_summary: summary,
        p_request: reqId()
      })
      if (error) throw error
      flash(
        hindi
          ? `${adm.patient_name ?? ''} डिस्चार्ज हुए।`
          : `Discharged ${adm.patient_name ?? ''}.`
      )
      setVersion(v => v + 1)
    } catch (e: unknown) {
      flash(
        (hindi ? 'डिस्चार्ज विफल — सर्वर ने कहा: ' : 'Discharge failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  const freeBeds = beds.filter(b => ['AVAILABLE', 'FREE'].includes(b.status))

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              {hindi ? 'बेड और वार्ड प्रबंधन (ADT)' : 'Inpatient Beds & Wards (ADT)'}
            </h1>
            <Badge tone={bedsError ? 'warning' : 'success'}>
              {bedsError ? (hindi ? 'बैकएंड अनुपलब्ध' : 'Backend unavailable') : 'h2_* live'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'भर्ती, डिस्चार्ज और बेड ट्रांसफर — hospital_beds / hospital_admissions (h2_*) से वास्तविक डेटा।'
              : 'Admission, discharge and bed transfer — real data from hospital_beds / hospital_admissions (h2_*).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setVersion(v => v + 1)} disabled={loading}>
            <RefreshCw className="size-4 mr-1.5" />
            {hindi ? 'नई जानकारी' : 'Refresh'}
          </Button>
          <Button size="sm" onClick={() => setAdmitOpen(true)} disabled={!!bedsError || !facilityId}>
            <Plus className="size-4 mr-1.5" />
            {hindi ? 'मरीज भर्ती करें' : 'Admit Patient'}
          </Button>
        </div>
      </div>

      {!facilityId && (
        <Card className="border-warning/30 bg-warning/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertCircle className="size-4 shrink-0 text-warning-foreground" />
            <span>
              {hindi
                ? 'सुविधा संदर्भ (facility_id) उपलब्ध नहीं है — h2_* क्रियाएँ निष्क्रिय हैं। facility_memberships में आपकी सदस्यता की आवश्यकता है।'
                : 'Facility context (facility_id) unavailable — h2_* actions are disabled. Your membership in facility_memberships is required.'}
            </span>
          </div>
        </Card>
      )}

      {notice && (
        <Card className="border-info/30 bg-info/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertCircle className="size-4 shrink-0 text-info" />
            <span>{notice}</span>
          </div>
        </Card>
      )}

      {/* OCCUPANCY SUMMARY (derived from real beds only) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-2xl font-bold font-tabular">{beds.length}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hindi ? 'कुल बेड' : 'Total beds'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold font-tabular text-success">{available}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hindi ? 'रिक्त' : 'Available'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold font-tabular text-destructive">{occupied}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hindi ? 'भर्ती' : 'Occupied'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold font-tabular text-warning">{maintenance}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {hindi ? 'सफाई/मरम्मत' : 'Maintenance'}
          </p>
        </Card>
      </div>

      {/* FILTERS */}
      {!bedsError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap gap-1">
            {wards.map(w => (
              <button
                key={w}
                onClick={() => setWard(w)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  ward === w
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {w === 'ALL' ? (hindi ? 'सभी वार्ड' : 'All Wards') : w}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold"
          >
            <option value="ALL">{hindi ? 'सभी स्थितियाँ' : 'All Bed States'}</option>
            <option value="AVAILABLE">{hindi ? 'रिक्त' : 'Available'}</option>
            <option value="OCCUPIED">{hindi ? 'भर्ती' : 'Occupied'}</option>
            <option value="MAINTENANCE">{hindi ? 'सफाई/मरम्मत' : 'Maintenance'}</option>
          </select>
        </div>
      )}

      {/* BED GRID */}
      <Card className="space-y-4">
        <SectionTitle
          title={hindi ? 'बेड ग्रिड' : 'Bed Grid'}
          sub={
            bedsError
              ? (hindi
                  ? `hospital_beds उपलब्ध नहीं है (h2_beds)। कोई बेड काउंट कल्पित नहीं किया गया। सर्वर: ${bedsError}`
                  : `hospital_beds unavailable (h2_beds). No bed counts are invented. Server: ${bedsError}`)
              : (hindi
                  ? 'hospital_beds से वास्तविक बेड स्थिति और वार्ड।'
                  : 'Real bed status and wards from hospital_beds.')
          }
          icon={<Bed className="size-4" />}
        />
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            {hindi ? 'बेड लोड हो रहे हैं…' : 'Loading beds…'}
          </p>
        ) : bedsError ? (
          <p className="text-sm text-muted-foreground">
            {hindi
              ? 'इस परिनियोजन में बेड टेलीमेट्री उपलब्ध नहीं है।'
              : 'Bed telemetry is unavailable in this deployment.'}
          </p>
        ) : visibleBeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hindi ? 'इस फ़िल्टर में कोई बेड नहीं है।' : 'No beds match this filter.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleBeds.map(b => (
              <div
                key={b.id}
                className="rounded-xl border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold">{b.bed_code ?? b.id.slice(0, 6)}</p>
                  <Badge tone={STATUS_TONE[b.status] ?? 'neutral'}>{b.status}</Badge>
                </div>
                {b.ward && <p className="mt-1 text-xs text-muted-foreground">{b.ward}</p>}
                {b.patient_name && (
                  <p className="mt-1 text-xs font-medium text-foreground">{b.patient_name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ACTIVE ADMISSIONS */}
      <Card className="space-y-4">
        <SectionTitle
          title={hindi ? 'सक्रिय भर्ती' : 'Active Admissions'}
          sub={
            admError
              ? (hindi
                  ? `hospital_admissions उपलब्ध नहीं है (h2_admissions)। सर्वर: ${admError}`
                  : `hospital_admissions unavailable (h2_admissions). Server: ${admError}`)
              : (hindi
                  ? 'ट्रांसफर और डिस्चार्ज h2_transfer / h2_discharge द्वारा।'
                  : 'Transfer and discharge via h2_transfer / h2_discharge.')
          }
          icon={<ArrowRightLeft className="size-4" />}
        />
        {admError ? (
          <p className="text-sm text-muted-foreground">
            {hindi ? 'भर्ती सूची उपलब्ध नहीं है।' : 'Admission list unavailable.'}
          </p>
        ) : admissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {hindi ? 'कोई सक्रिय भर्ती नहीं है।' : 'No active admissions.'}
          </p>
        ) : (
          <div className="space-y-3">
            {admissions.map(a => (
              <div
                key={a.id}
                className="space-y-2 rounded-xl border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{a.patient_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[a.patient_code, a.bed_code, a.ward].filter(Boolean).join(' · ')}
                      {a.admitted_at ? ` · ${new Date(a.admitted_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>{a.status}</Badge>
                </div>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  value={reasons[a.id] ?? ''}
                  onChange={e => setReasons(r => ({ ...r, [a.id]: e.target.value }))}
                  placeholder={
                    hindi
                      ? 'ट्रांसफर कारण / डिस्चार्ज सारांश (आवश्यक)…'
                      : 'Transfer reason / discharge summary (required)…'
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.id || !(reasons[a.id] ?? '').trim()}
                    onClick={() => void transfer(a)}
                  >
                    <ArrowRightLeft className="size-3.5 mr-1" />
                    {hindi ? 'ट्रांसफर' : 'Transfer'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.id || !(reasons[a.id] ?? '').trim()}
                    onClick={() => void discharge(a)}
                  >
                    <LogOut className="size-3.5 mr-1" />
                    {hindi ? 'डिस्चार्ज' : 'Discharge'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ADMIT DIALOG */}
      {admitOpen && (
        <Card className="space-y-4 border-primary/30">
          <SectionTitle
            title={hindi ? 'मरीज भर्ती करें' : 'Admit Patient'}
            sub={
              hindi
                ? 'एनकाउंटर चुनें, कारण लिखें और रिक्त बेड चुनें। भर्ती h2_admit(p_facility,p_encounter,p_bed,p_reason,p_request) द्वारा दर्ज होती है।'
                : 'Choose an encounter, give a reason and pick an available bed. Admission is recorded via h2_admit(p_facility,p_encounter,p_bed,p_reason,p_request).'
            }
            icon={<Plus className="size-4" />}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {hindi ? 'एनकाउंटर चुनें' : 'Choose an encounter'}
            </span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={encounterId}
              onChange={e => setEncounterId(e.target.value)}
              disabled={encLoading || !!encError}
            >
              <option value="">{hindi ? 'एनकाउंटर चुनें…' : 'Select an encounter…'}</option>
              {encounters.map(enc => (
                <option key={enc.id} value={enc.id}>
                  {enc.label} · {enc.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {encLoading && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {hindi ? 'एनकाउंटर लोड हो रहे हैं…' : 'Loading encounters…'}
              </span>
            )}
            {encError && (
              <span className="mt-1 block text-xs text-warning-foreground">
                {hindi ? `एनकाउंटर उपलब्ध नहीं: ${encError}` : `Encounters unavailable: ${encError}`}
              </span>
            )}
            {!encLoading && !encError && encounters.length === 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {hindi
                  ? 'RLS के अंतर्गत कोई एनकाउंटर उपलब्ध नहीं है।'
                  : 'No encounters available under your RLS scope.'}
              </span>
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {hindi ? 'भर्ती कारण (आवश्यक)' : 'Admission reason (required)'}
            </span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={admitReason}
              onChange={e => setAdmitReason(e.target.value)}
              placeholder={hindi ? 'कारण लिखें…' : 'Reason for admission…'}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {hindi ? 'रिक्त बेड चुनें' : 'Choose an available bed'}
            </span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={bedId}
              onChange={e => setBedId(e.target.value)}
            >
              <option value="">{hindi ? 'बेड चुनें…' : 'Select a bed…'}</option>
              {freeBeds.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bed_code ?? b.id.slice(0, 6)}
                  {b.ward ? ` · ${b.ward}` : ''}
                </option>
              ))}
            </select>
            {freeBeds.length === 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {hindi ? 'कोई रिक्त बेड नहीं है।' : 'No available beds right now.'}
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <Button
              disabled={!facilityId || !encounterId || !bedId || !admitReason.trim() || busyId === 'admit'}
              onClick={() => void admit()}
            >
              {hindi ? 'भर्ती दर्ज करें' : 'Confirm admission'}
            </Button>
            <Button variant="outline" onClick={() => setAdmitOpen(false)}>
              {hindi ? 'रद्द करें' : 'Cancel'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
