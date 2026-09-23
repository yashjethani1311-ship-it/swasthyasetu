import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Stethoscope,
  CalendarCheck,
  MapPin,
  ShieldCheck,
  Building2,
  Filter,
  Navigation,
  Video,
  DoorOpen,
  Clock,
  Info,
  IndianRupee,
} from 'lucide-react'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Disclaimer,
  SearchInput,
  SkeletonCard,
  TruthfulEmptyState,
} from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'
import { identityLabel } from '@/lib/identity'

/* ───────────────────────── types ───────────────────────── */

type Practice = {
  id: string
  provider_id: string
  facility_id: string | null
  practice_name: string
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  consultation_mode: 'PHYSICAL' | 'TELECONSULT' | 'BOTH'
  consultation_fee: number | null
  timezone: string | null
  facility_name: string | null
  facility_type: string | null
}

type Doctor = {
  id: string
  full_name: string
  specialization: string | null
  registration_id: string | null
  organization_name: string | null
  verification_status: string
  identity_source: string | null
  registry_verified: boolean | null
  practices: Practice[]
}

type ScheduleRow = {
  practice_id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

type OverrideRow = {
  provider_id: string
  practice_id: string | null
  starts_at: string
  ends_at: string
  availability_status: string
}

type Coords = { lat: number; lng: number }

const RADII = [
  { km: 0, label: 'Any distance' },
  { km: 2, label: '2 km' },
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 25, label: '25 km' },
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ─────────────────────── helpers ───────────────────────── */

// Distance is only ever computed from a real practice coordinate and a real
// user coordinate. It is never estimated or faked.
function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

// Next known session is derived from the connected practice schedule, excluding
// windows marked UNAVAILABLE by an override. It is a schedule indication, not a
// bookable-slot guarantee — real slots come from a2_available_slots at booking.
function nextKnownSession(
  practiceId: string,
  providerId: string,
  schedules: ScheduleRow[],
  overrides: OverrideRow[],
): { label: string; dow: number } | null {
  const now = new Date()
  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    const dow = day.getDay()
    const daySchedules = schedules
      .filter((s) => s.practice_id === practiceId && s.active && s.day_of_week === dow)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
    for (const s of daySchedules) {
      const start = new Date(day)
      const [h, m] = s.start_time.split(':').map(Number)
      start.setHours(h || 0, m || 0, 0, 0)
      const blocked = overrides.some((o) => {
        if (o.availability_status !== 'UNAVAILABLE') return false
        if (o.provider_id !== providerId) return false
        if (o.practice_id !== null && o.practice_id !== practiceId) return false
        return start >= new Date(o.starts_at) && start < new Date(o.ends_at)
      })
      if (!blocked) {
        const when = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : DAY_NAMES[dow]
        return { label: `${when} · ${hhmm(s.start_time)}–${hhmm(s.end_time)}`, dow }
      }
    }
  }
  return null
}

function sessionsOnDay(
  practiceId: string,
  providerId: string,
  schedules: ScheduleRow[],
  overrides: OverrideRow[],
  target: Date,
): boolean {
  const dow = target.getDay()
  const daySchedules = schedules.filter(
    (s) => s.practice_id === practiceId && s.active && s.day_of_week === dow,
  )
  return daySchedules.some((s) => {
    const start = new Date(target)
    const [h, m] = s.start_time.split(':').map(Number)
    start.setHours(h || 0, m || 0, 0, 0)
    const blocked = overrides.some(
      (o) =>
        o.availability_status === 'UNAVAILABLE' &&
        o.provider_id === providerId &&
        (o.practice_id === null || o.practice_id === practiceId) &&
        start >= new Date(o.starts_at) &&
        start < new Date(o.ends_at),
    )
    return !blocked
  })
}

/* ─────────────────────── component ─────────────────────── */

export function DoctorsPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])

  // discovery inputs
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [pin, setPin] = useState('')
  const [maxFee, setMaxFee] = useState('')
  const [mode, setMode] = useState<'ANY' | 'PHYSICAL' | 'TELECONSULT'>('ANY')
  const [dayFilter, setDayFilter] = useState<'ANY' | 'TODAY' | 'TOMORROW'>('ANY')
  const [radiusKm, setRadiusKm] = useState(0)
  const [userCoords, setUserCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(0)
  const searchRevision = useRef(0)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const revision = ++searchRevision.current
      const filters: Record<string, unknown> = {}
      if (query.trim()) filters.search = query.trim()
      if (specialty.trim()) filters.specialization = specialty.trim()
      if (city.trim()) filters.city = city.trim()
      if (state.trim()) filters.state = state.trim()
      if (pin.trim()) filters.postal_code = pin.trim()
      if (mode !== 'ANY') filters.mode = mode
      if (maxFee) filters.max_fee = Number(maxFee)
      if (userCoords && radiusKm > 0) Object.assign(filters, { latitude: userCoords.lat, longitude: userCoords.lng, radius_km: radiusKm })
      if (!query.trim() && !specialty.trim() && !city.trim() && !state.trim() && !pin.trim() && !(userCoords && radiusKm > 0)) {
        setDoctors([]); setPageSize(0); setSchedules([]); setOverrides([]); return
      }
      const directory = await supabase.rpc('d1_practices', { p_filters: filters, p_offset: offset, p_limit: 25 })
      if (directory.error) throw directory.error
      if (revision !== searchRevision.current) return
      const practiceRows = directory.data ?? []
      setPageSize(practiceRows.length)
      const providerIds = [...new Set(practiceRows.map((r: any) => r.doctor_id))]
      const { data: provList, error: provErr } = providerIds.length ? await supabase
        .from('provider_profiles')
        .select('id, full_name, specialization, registration_id, organization_name, verification_status, identity_source, registry_verified')
        .in('id', providerIds).limit(25) : { data: [], error: null }
      if (provErr) throw provErr
      if (!provList || provList.length === 0) {
        setDoctors([])
        setSchedules([])
        setOverrides([])
        setLoading(false)
        return
      }

      const ids = provList.map((p) => p.id)

      const [practicesRes, facilitiesRes, schedulesRes, overridesRes] = await Promise.all([
        supabase
          .from('provider_practices')
          .select(
            'id, provider_id, facility_id, practice_name, address_line, city, state, postal_code, latitude, longitude, consultation_mode, consultation_fee, timezone',
          )
          .in('id', practiceRows.map((r: any) => r.practice_id))
          .eq('active', true),
        supabase.from('facilities').select('id, name, facility_type').in('id', practiceRows.map((r: any) => r.facility_id).filter(Boolean)).limit(25),
        supabase
          .from('provider_schedules')
          .select('practice_id, day_of_week, start_time, end_time, active')
          .in('provider_id', ids),
        supabase
          .from('provider_availability_overrides')
          .select('provider_id, practice_id, starts_at, ends_at, availability_status')
          .in('provider_id', ids),
      ])

      if (practicesRes.error) throw practicesRes.error

      const facilityMap = new Map<string, { name: string; facility_type: string }>()
      for (const f of facilitiesRes.data ?? []) {
        facilityMap.set(f.id, { name: f.name, facility_type: f.facility_type })
      }

      const byProvider = new Map<string, Practice[]>()
      for (const pr of (practicesRes.data ?? []) as Omit<Practice, 'facility_name' | 'facility_type'>[]) {
        const fac = pr.facility_id ? facilityMap.get(pr.facility_id) : null
        const practice: Practice = {
          ...pr,
          consultation_fee: pr.consultation_fee == null ? null : Number(pr.consultation_fee),
          facility_name: fac?.name ?? null,
          facility_type: fac?.facility_type ?? null,
        }
        const arr = byProvider.get(pr.provider_id) ?? []
        arr.push(practice)
        byProvider.set(pr.provider_id, arr)
      }

      const combined: Doctor[] = provList.map((p) => ({
        ...(p as Omit<Doctor, 'practices'>),
        practices: byProvider.get(p.id) ?? [],
      }))

      setDoctors(combined)
      setSchedules((schedulesRes.data ?? []) as ScheduleRow[])
      setOverrides((overridesRes.data ?? []) as OverrideRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the doctor directory.')
    } finally {
      setLoading(false)
    }
  }, [query, specialty, city, state, pin, mode, maxFee, userCoords, radiusKm, offset])

  useEffect(() => { setOffset(0) }, [query, specialty, city, state, pin, mode, maxFee, userCoords, radiusKm])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 350)
    return () => { clearTimeout(timer); searchRevision.current++ }
  }, [load])

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocError(hindi ? 'इस डिवाइस पर लोकेशन उपलब्ध नहीं है।' : 'Location is not available on this device.')
      return
    }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setLocError(
          hindi
            ? 'लोकेशन की अनुमति नहीं मिली। दूरी के बिना खोज जारी है।'
            : 'Location permission denied. Continuing without distance.',
        )
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const specialties = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.specialization).filter(Boolean) as string[])).sort(),
    [doctors],
  )

  const today = useMemo(() => new Date(), [])
  const tomorrow = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d
  }, [])

  // Flatten to doctor×practice rows so filters apply at the PLACE level while
  // the card still groups by PERSON.
  type Row = { doctor: Doctor; practice: Practice; distanceKm: number | null; session: { label: string; dow: number } | null }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    for (const doctor of doctors) {
      for (const practice of doctor.practices) {
        const distanceKm =
          userCoords && practice.latitude != null && practice.longitude != null
            ? haversineKm(userCoords, { lat: practice.latitude, lng: practice.longitude })
            : null
        const session = nextKnownSession(practice.id, doctor.id, schedules, overrides)
        out.push({ doctor, practice, distanceKm, session })
      }
    }
    return out
  }, [doctors, userCoords, schedules, overrides])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const feeCap = maxFee ? Number(maxFee) : null
    return rows.filter(({ doctor, practice, distanceKm, session }) => {
      if (q) {
        const hay = [
          doctor.full_name,
          doctor.specialization,
          doctor.organization_name,
          practice.practice_name,
          practice.facility_name,
          practice.city,
          practice.state,
          practice.postal_code,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (specialty && doctor.specialization !== specialty) return false
      if (city && !(practice.city ?? '').toLowerCase().includes(city.trim().toLowerCase())) return false
      if (state && !(practice.state ?? '').toLowerCase().includes(state.trim().toLowerCase())) return false
      if (pin && !(practice.postal_code ?? '').includes(pin.trim())) return false
      if (feeCap != null && !Number.isNaN(feeCap)) {
        // Practices without a connected fee cannot be confirmed within a fee cap.
        if (practice.consultation_fee == null) return false
        if (practice.consultation_fee > feeCap) return false
      }
      if (mode !== 'ANY') {
        if (practice.consultation_mode !== 'BOTH' && practice.consultation_mode !== mode) return false
      }
      if (radiusKm > 0) {
        // Without a real coordinate pair the distance cannot be confirmed.
        if (distanceKm == null) return false
        if (distanceKm > radiusKm) return false
      }
      if (dayFilter === 'TODAY' && !sessionsOnDay(practice.id, doctor.id, schedules, overrides, today)) return false
      if (dayFilter === 'TOMORROW' && !sessionsOnDay(practice.id, doctor.id, schedules, overrides, tomorrow)) return false
      return true
    })
  }, [rows, query, specialty, city, state, pin, maxFee, mode, radiusKm, dayFilter, schedules, overrides, today, tomorrow])

  // Group filtered practice rows back under each doctor (PERSON).
  const grouped = useMemo(() => {
    const map = new Map<string, { doctor: Doctor; entries: Row[] }>()
    for (const row of filteredRows) {
      const g = map.get(row.doctor.id) ?? { doctor: row.doctor, entries: [] }
      g.entries.push(row)
      map.set(row.doctor.id, g)
    }
    return Array.from(map.values()).sort((a, b) => {
      const ad = Math.min(...a.entries.map((e) => e.distanceKm ?? Infinity))
      const bd = Math.min(...b.entries.map((e) => e.distanceKm ?? Infinity))
      return ad - bd
    })
  }, [filteredRows])

  function book(doctor: Doctor, practice: Practice) {
    sessionStorage.setItem('swasthyasetu-selected-doctor-id', doctor.id)
    sessionStorage.setItem('swasthyasetu-selected-doctor-name', doctor.full_name)
    sessionStorage.setItem('swasthyasetu-selected-practice-id', practice.id)
    const m = practice.consultation_mode === 'TELECONSULT' ? 'TELECONSULT' : 'PHYSICAL'
    sessionStorage.setItem('swasthyasetu-selected-mode', m)
    navigate('/appointments')
  }

  const filtersActive =
    Boolean(query || specialty || city || state || pin || maxFee) ||
    mode !== 'ANY' ||
    dayFilter !== 'ANY' ||
    radiusKm > 0

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Enter a doctor name, specialty or location to search. Results are limited to 25 practices per page. Schedules describe recorded sessions; booking requires a confirmed slot.</p>
      <div className="flex gap-2"><Button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button><Button disabled={loading || pageSize < 25 || offset >= 9975} onClick={() => setOffset(offset + 25)}>Next</Button><span>Page {offset / 25 + 1}</span></div>
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">
            {hindi ? 'डॉक्टर खोजें' : 'Find Doctors'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'डॉक्टर (व्यक्ति) · क्लिनिक/अस्पताल (स्थान) · उपलब्धता (समय) — तीनों अलग हैं। डॉक्टर की लाइव GPS कभी उपयोग नहीं होती।'
              : 'Doctor (person) · Practice (place) · Availability (time) are separate. Doctor live GPS is never used.'}
          </p>
        </div>
        <Badge tone="success" className="py-1 text-xs">
          <ShieldCheck className="mr-1 size-3.5" />
          {hindi ? 'डॉक्टर निर्देशिका' : 'Doctor Directory'}
        </Badge>
      </div>

      {/* LOCATION + RADIUS */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" loading={locating} onClick={useMyLocation}>
            <Navigation className="size-4" />
            {hindi ? 'मेरी लोकेशन लें' : 'Use My Location'}
          </Button>
          {userCoords ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <MapPin className="size-3.5" />
              {hindi ? 'लोकेशन मिल गई' : 'Location acquired'}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {hindi
                ? 'दूरी केवल वास्तविक लोकेशन और कनेक्टेड प्रैक्टिस पते से ही दिखती है।'
                : 'Distance is shown only from your real location and a connected practice coordinate.'}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {RADII.map((r) => (
              <button
                key={r.km}
                type="button"
                onClick={() => setRadiusKm(r.km)}
                disabled={r.km > 0 && !userCoords}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  radiusKm === r.km
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {hindi && r.km === 0 ? 'कोई भी दूरी' : r.label}
              </button>
            ))}
          </div>
        </div>
        {locError ? <p className="text-xs text-warning-foreground">{locError}</p> : null}
        {radiusKm > 0 && !userCoords ? (
          <p className="text-xs text-muted-foreground">
            {hindi ? 'दूरी फ़िल्टर के लिए पहले लोकेशन लें।' : 'Acquire your location to filter by distance.'}
          </p>
        ) : null}
      </Card>

      {/* SEARCH + FILTERS */}
      <div className="space-y-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={
            hindi
              ? 'डॉक्टर, विशेषज्ञता, क्लिनिक, शहर या पिन खोजें…'
              : 'Search doctor name; use the location and specialty filters below…'
          }
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <label className="col-span-2 md:col-span-1">
            <span className="label-xs">{hindi ? 'विशेषज्ञता' : 'Specialization'}</span>
            <input value={specialty} onChange={e => setSpecialty(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder="Specialty" />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'शहर' : 'City'}</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder={hindi ? 'शहर' : 'City'} />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'राज्य' : 'State'}</span>
            <input value={state} onChange={(e) => setState(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder={hindi ? 'राज्य' : 'State'} />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'पिन कोड' : 'PIN'}</span>
            <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder="PIN" />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'अधिकतम शुल्क' : 'Max fee'}</span>
            <input value={maxFee} onChange={(e) => setMaxFee(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder="₹" />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'माध्यम' : 'Mode'}</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
              <option value="ANY">{hindi ? 'कोई भी' : 'Any'}</option>
              <option value="PHYSICAL">{hindi ? 'आमने-सामने' : 'In-person'}</option>
              <option value="TELECONSULT">{hindi ? 'टेलीकंसल्ट' : 'Teleconsult'}</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="size-3.5" /> {hindi ? 'उपलब्धता' : 'Availability'}
          </span>
          {(['ANY', 'TODAY', 'TOMORROW'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDayFilter(d)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                dayFilter === d ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {d === 'ANY' ? (hindi ? 'कोई भी दिन' : 'Any day') : d === 'TODAY' ? (hindi ? 'आज' : 'Today') : hindi ? 'कल' : 'Tomorrow'}
            </button>
          ))}
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery(''); setSpecialty(''); setCity(''); setState(''); setPin(''); setMaxFee(''); setMode('ANY'); setDayFilter('ANY'); setRadiusKm(0)
              }}
            >
              {hindi ? 'फ़िल्टर हटाएँ' : 'Clear filters'}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <AlertBanner
          tone="emergency"
          title={hindi ? 'डॉक्टर लोड नहीं हो सके' : 'Could not load doctors'}
          action={<Button size="sm" variant="outline" onClick={() => void load()}>{hindi ? 'पुनः प्रयास' : 'Retry'}</Button>}
        >
          {error}
        </AlertBanner>
      ) : null}

      {/* LISTING */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : grouped.length === 0 ? (
        <TruthfulEmptyState
          icon={<Stethoscope className="size-6" />}
          title={
            filtersActive
              ? hindi
                ? 'इन फ़िल्टर से कोई डॉक्टर नहीं मिला'
                : 'No doctors matched these filters'
              : hindi
                ? 'अभी कोई डॉक्टर निर्देशिका में दर्ज नहीं'
                : 'No doctors are currently in the directory'
          }
          description={
            filtersActive
              ? hindi
                ? 'फ़िल्टर बदलें या हटाएँ। दूरी और शुल्क केवल कनेक्टेड प्रैक्टिस डेटा से ही दिखते हैं।'
                : 'Adjust or clear filters. Distance and fee appear only from connected practice data — nothing is fabricated.'
              : hindi
                ? 'डॉक्टर और उनकी प्रैक्टिस जुड़ने पर यहाँ दिखेंगे।'
                : 'Doctors and their connected practices will appear here once listed.'
          }
          action={filtersActive ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setSpecialty(''); setCity(''); setState(''); setPin(''); setMaxFee(''); setMode('ANY'); setDayFilter('ANY'); setRadiusKm(0) }}>{hindi ? 'फ़िल्टर हटाएँ' : 'Clear filters'}</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {grouped.map(({ doctor, entries }) => (
            <Card key={doctor.id} className="flex flex-col border-border shadow-xs transition hover:border-primary/40">
              {/* PERSON */}
              <div className="flex items-start gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Stethoscope className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-base font-bold">Dr. {doctor.full_name}</h3>
                    <span className="shrink-0 text-muted-foreground" title={identityLabel(doctor.identity_source, doctor.registry_verified, hindi)}>
                      <ShieldCheck className="size-4" />
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-primary">
                    {doctor.specialization ?? (hindi ? 'विशेषज्ञता दर्ज नहीं' : 'Specialty not recorded')}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {doctor.registration_id ? `${hindi ? 'पंजीयन' : 'Reg'}: ${doctor.registration_id}` : hindi ? 'पंजीयन संख्या उपलब्ध नहीं' : 'Registration not published'}
                    {doctor.identity_source ? ` · ${doctor.identity_source}` : ''}
                    {` · ${identityLabel(doctor.identity_source, doctor.registry_verified, hindi)}`}
                  </p>
                </div>
              </div>

              {/* PLACES + AVAILABILITY */}
              <div className="mt-4 space-y-3 border-t border-border pt-3">
                <p className="label-xs">{hindi ? 'प्रैक्टिस स्थान और उपलब्धता' : 'Practice locations & availability'}</p>
                {entries.map(({ practice, distanceKm, session }) => (
                  <div key={practice.id} className="rounded-xl border border-border bg-surface-subtle/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                          {practice.facility_name ?? practice.practice_name}
                        </p>
                        {practice.facility_type ? (
                          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{practice.facility_type.replaceAll('_', ' ')}</p>
                        ) : null}
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          <span className="leading-tight">
                            {[practice.address_line, practice.city, practice.state, practice.postal_code].filter(Boolean).join(', ') || (hindi ? 'पता उपलब्ध नहीं' : 'Address not published')}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {distanceKm != null ? (
                          <p className="text-xs font-bold font-tabular text-foreground">{distanceKm.toFixed(1)} km</p>
                        ) : (
                          <p className="text-[10px] leading-tight text-muted-foreground">{hindi ? 'दूरी उपलब्ध नहीं' : 'Distance unavailable'}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {practice.consultation_mode === 'TELECONSULT' ? (
                        <Badge tone="info"><Video className="mr-1 size-3" />{hindi ? 'टेलीकंसल्ट' : 'Teleconsult'}</Badge>
                      ) : practice.consultation_mode === 'BOTH' ? (
                        <Badge tone="info"><DoorOpen className="mr-1 size-3" />{hindi ? 'दोनों' : 'In-person & Tele'}</Badge>
                      ) : (
                        <Badge tone="neutral"><DoorOpen className="mr-1 size-3" />{hindi ? 'आमने-सामने' : 'In-person'}</Badge>
                      )}
                      {practice.consultation_fee != null ? (
                        <span className="inline-flex items-center gap-0.5 font-semibold text-primary font-tabular">
                          <IndianRupee className="size-3" />{practice.consultation_fee}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{hindi ? 'शुल्क पुष्टि बाकी' : 'Fee: confirm with practice'}</span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {session ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="size-3.5" />
                          {hindi ? 'अगला ज्ञात सत्र' : 'Next known session'}: <strong className="text-foreground">{session.label}</strong>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Info className="size-3.5" />
                          {hindi ? 'कोई जुड़ा समय-सारणी नहीं' : 'No connected schedule'}
                        </span>
                      )}
                      <Button size="sm" onClick={() => book(doctor, practice)}>
                        <CalendarCheck className="mr-1 size-4" />
                        {hindi ? 'बुक करें' : 'Book'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Disclaimer>
        {hindi
          ? '“अगला ज्ञात सत्र” जुड़ी हुई समय-सारणी से आता है, बुकिंग गारंटी नहीं है। वास्तविक बुकेबल स्लॉट बुकिंग पेज पर a2_available_slots से आते हैं। दूरी, शुल्क और उपलब्धता कभी बनाई नहीं जाती।'
          : '“Next known session” comes from the connected schedule and is not a booking guarantee. Real bookable slots come from a2_available_slots on the booking page. Distance, fee and availability are never fabricated.'}
      </Disclaimer>
    </div>
  )
}
