import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Hospital,
  MapPin,
  Phone,
  ShieldCheck,
  Filter,
  Navigation,
  Info,
  Building2,
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
import { identityLabel } from '@/lib/identity'
import { supabase } from '@/lib/supabase'

type Facility = {
  id: string
  name: string
  facility_type: string
  registration_id: string | null
  address_text: string | null
  city: string | null
  state: string | null
  verification_status: string
  hfr_id: string | null
  identity_source: string | null
  registry_verified: boolean | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  created_at: string
}

type Coords = { lat: number; lng: number }

const RADII = [
  { km: 0, label: 'Any distance' },
  { km: 2, label: '2 km' },
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 25, label: '25 km' },
]

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function FacilitiesPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [error, setError] = useState('')

  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [radiusKm, setRadiusKm] = useState(0)
  const [userCoords, setUserCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [offset, setOffset] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  const loadFacilities = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Record<string, unknown> = {}
      if (query.trim()) filters.search = query.trim()
      if (city.trim()) filters.city = city.trim()
      if (state.trim()) filters.state = state.trim()
      if (selectedType) filters.type = selectedType
      if (userCoords && radiusKm > 0) Object.assign(filters, {latitude:userCoords.lat, longitude:userCoords.lng, radius_km:radiusKm})
      if (!query.trim() && !city.trim() && !state.trim() && !(userCoords && radiusKm > 0)) { setFacilities([]); setPageCount(0); return }
      const directory = await supabase.rpc('d1_facilities', {p_filters:filters,p_offset:offset,p_limit:25})
      if(directory.error) throw directory.error
      setPageCount(directory.data?.length ?? 0)
      const ids = (directory.data ?? []).map((f: any) => f.facility_id)
      const { data, error: fErr } = ids.length ? await supabase.from('facilities')
        .select('id,name,facility_type,registration_id,address_text,city,state,verification_status,hfr_id,identity_source,registry_verified,latitude,longitude,phone,created_at')
        .in('id', ids).order('name').limit(25) : {data:[],error:null}
      if (fErr) throw fErr
      setFacilities((data ?? []) as Facility[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load facilities.')
    } finally {
      setLoading(false)
    }
  }, [query, city, state, selectedType, userCoords, radiusKm, offset])

  useEffect(() => { setOffset(0) }, [query, city, state, selectedType, userCoords, radiusKm])
  useEffect(() => { const timer = setTimeout(() => void loadFacilities(), 350); return () => clearTimeout(timer) }, [loadFacilities])

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
        setLocError(hindi ? 'लोकेशन की अनुमति नहीं मिली।' : 'Location permission denied.')
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  const types = useMemo(
    () => ['HOSPITAL', 'CLINIC', 'PHC', 'CHC', 'HWC', 'LAB', 'COLLECTION_CENTRE', 'PHARMACY'],
    [facilities],
  )

  const enriched = useMemo(() => {
    return facilities.map((f) => ({
      facility: f,
      distanceKm:
        userCoords && f.latitude != null && f.longitude != null
          ? haversineKm(userCoords, { lat: f.latitude, lng: f.longitude })
          : null,
    }))
  }, [facilities, userCoords])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enriched
      .filter(({ facility, distanceKm }) => {
        if (q) {
          const hay = [facility.name, facility.city, facility.state, facility.address_text]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (selectedType && facility.facility_type !== selectedType) return false
        if (city && !(facility.city ?? '').toLowerCase().includes(city.trim().toLowerCase())) return false
        if (state && !(facility.state ?? '').toLowerCase().includes(state.trim().toLowerCase())) return false
        if (radiusKm > 0) {
          if (distanceKm == null) return false
          if (distanceKm > radiusKm) return false
        }
        return true
      })
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
  }, [enriched, query, selectedType, city, state, radiusKm])

  const filtersActive = Boolean(query || selectedType || city || state) || radiusKm > 0

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">
            {hindi ? 'स्वास्थ्य केंद्र और अस्पताल' : 'Healthcare Facilities'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'निर्देशिका में दर्ज अस्पताल, क्लिनिक, PHC, CHC, HWC, लैब और कलेक्शन सेंटर। हर केंद्र की पहचान स्थिति अलग दिखाई गई है।'
              : 'Listed hospitals, clinics, PHC, CHC, HWC, labs and collection centres. Identity status is shown separately for each place.'}
          </p>
        </div>
        <Badge tone="teal" className="py-1 text-xs">
          <ShieldCheck className="mr-1 size-3.5" />
          {hindi ? 'दर्ज केंद्र' : 'Listed Facilities'}
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
                ? 'दूरी केवल वास्तविक लोकेशन और कनेक्टेड सुविधा निर्देशांक से दिखती है।'
                : 'Distance is shown only from your real location and a connected facility coordinate.'}
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
      </Card>

      {/* SEARCH & FILTERS */}
      <div className="space-y-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={hindi ? 'नाम, शहर या राज्य खोजें…' : 'Search facility by name, city or state…'}
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label>
            <span className="label-xs">{hindi ? 'सुविधा प्रकार' : 'Facility type'}</span>
            <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
              <option value="">{hindi ? 'सभी प्रकार' : 'All types'}</option>
              {types.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label-xs">{hindi ? 'शहर' : 'City'}</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder={hindi ? 'शहर' : 'City'} />
          </label>
          <label>
            <span className="label-xs">{hindi ? 'राज्य' : 'State'}</span>
            <input value={state} onChange={(e) => setState(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" placeholder={hindi ? 'राज्य' : 'State'} />
          </label>
          <div className="flex items-end">
            {filtersActive ? (
              <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => { setQuery(''); setSelectedType(''); setCity(''); setState(''); setRadiusKm(0) }}>
                <Filter className="mr-1 size-3.5" />
                {hindi ? 'फ़िल्टर हटाएँ' : 'Clear filters'}
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 pb-2 text-xs text-muted-foreground">
                <Info className="size-3.5" />
                {hindi ? 'सेवा/क्षमता फ़िल्टर बैकएंड बाकी' : 'Enter a name or location to search'}
              </span>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <AlertBanner
          tone="emergency"
          title={hindi ? 'सुविधाएँ लोड नहीं हो सकीं' : 'Could not load facilities'}
          action={<Button size="sm" variant="outline" onClick={() => void loadFacilities()}>{hindi ? 'पुनः प्रयास' : 'Retry'}</Button>}
        >
          {error}
        </AlertBanner>
      ) : null}

      {/* LISTING */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <TruthfulEmptyState
          icon={<Building2 className="size-6" />}
          title={
            filtersActive
              ? hindi ? 'इन फ़िल्टर से कोई केंद्र नहीं मिला' : 'No facilities matched these filters'
              : hindi ? 'अभी कोई केंद्र दर्ज नहीं' : 'No facilities are listed yet'
          }
          description={
            filtersActive
              ? hindi ? 'फ़िल्टर बदलें या हटाएँ। दूरी केवल कनेक्टेड निर्देशांक से दिखती है।' : 'Adjust or clear filters. Distance appears only from connected coordinates — nothing is fabricated.'
              : hindi ? 'केंद्र जुड़ने पर यहाँ दिखेंगे।' : 'Facilities will appear here once listed.'}
          action={filtersActive ? <Button variant="outline" size="sm" onClick={() => { setQuery(''); setSelectedType(''); setCity(''); setState(''); setRadiusKm(0) }}>{hindi ? 'फ़िल्टर हटाएँ' : 'Clear filters'}</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ facility: fac, distanceKm }) => (
            <Card key={fac.id} className="flex flex-col border-border shadow-xs transition hover:border-primary/40">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal/15 text-teal">
                  <Hospital className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold leading-tight">{fac.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="outline" className="text-[10px]">{fac.facility_type.replace(/_/g, ' ')}</Badge>
                    {fac.verification_status === 'APPROVED' ? (
                      <Badge tone="neutral">{hindi ? 'संचालन की अनुमति' : 'Operational access approved'}</Badge>
                    ) : (
                      <Badge tone="neutral">{fac.verification_status.replace(/_/g, ' ')}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {identityLabel(fac.identity_source, fac.registry_verified, hindi)}
                    {fac.identity_source ? ` · ${fac.identity_source}` : ''}
                    {fac.registry_verified && fac.hfr_id && !fac.hfr_id.startsWith('DEMO-') ? ` · HFR: ${fac.hfr_id}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {distanceKm != null ? (
                    <p className="text-xs font-bold font-tabular">{distanceKm.toFixed(1)} km</p>
                  ) : (
                    <p className="text-[10px] leading-tight text-muted-foreground">{hindi ? 'दूरी उपलब्ध नहीं' : 'Distance unavailable'}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  <span className="line-clamp-2 leading-tight">
                    {[fac.address_text, fac.city, fac.state].filter(Boolean).join(', ') || (hindi ? 'पता प्रकाशित नहीं' : 'Address not published')}
                  </span>
                </div>
                {fac.phone ? (
                  <div className="flex items-center gap-2 font-tabular">
                    <Phone className="size-3.5 shrink-0" />
                    <a href={`tel:${fac.phone}`} className="transition hover:text-primary">{fac.phone}</a>
                  </div>
                ) : null}
                <p className="flex items-center gap-1.5 text-[11px]">
                  <Info className="size-3.5 shrink-0" />
                  {hindi ? 'सेवाएँ/क्षमता/बेड/प्रतीक्षा: कनेक्ट नहीं' : 'Services/capability/beds/wait: not connected'}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-3"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0,offset-25))}>Previous</Button><span>Page {offset / 25 + 1}</span><Button disabled={pageCount < 25} onClick={() => setOffset(offset+25)}>Next</Button></div>
      <Disclaimer>
        {hindi
          ? 'सुविधा प्रकार, पता और सत्यापन रजिस्ट्री से आते हैं। दूरी केवल वास्तविक निर्देशांक से दिखती है। कोई सेवा, विशेषज्ञता, क्षमता, बेड या प्रतीक्षा समय कनेक्टेड नहीं है और कभी बनाए नहीं जाते।'
          : 'Facility type, address and verification come from the registry. Distance is shown only from real coordinates. As of now, no service, specialty, capability, bed or wait time is connected and they are never fabricated.'}
      </Disclaimer>
    </div>
  )
}
