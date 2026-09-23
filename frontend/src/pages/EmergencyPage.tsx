import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Siren,
  PhoneCall,
  Navigation,
  MapPin,
  Ambulance,
  Building2,
  AlertTriangle,
  ShieldAlert,
  Search,
  Info,
} from 'lucide-react'
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Disclaimer,
  SearchInput,
  SectionTitle,
  TruthfulEmptyState,
} from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useCareLanguage } from '@/lib/care-language'
import { navigate } from '@/lib/route'

type Facility = {
  id: string
  name: string
  facility_type: string
  city: string | null
  state: string | null
  address_text: string | null
  verification_status: string
}

type Coords = { lat: number; lng: number; accuracy: number }

const HELP_TYPES = [
  { id: 'MEDICAL', en: 'Medical emergency', hi: 'चिकित्सा आपातकाल' },
  { id: 'AMBULANCE', en: 'Need an ambulance', hi: 'एम्बुलेंस चाहिए' },
  { id: 'ACCIDENT', en: 'Accident / trauma', hi: 'दुर्घटना / चोट' },
  { id: 'CARDIAC', en: 'Chest pain / cardiac', hi: 'सीने में दर्द / हृदय' },
  { id: 'BREATHING', en: 'Breathing difficulty', hi: 'साँस लेने में कठिनाई' },
  { id: 'MATERNITY', en: 'Maternity / childbirth', hi: 'मातृत्व / प्रसव' },
  { id: 'POISONING', en: 'Poisoning / overdose', hi: 'विषाक्तता / ओवरडोज़' },
  { id: 'OTHER', en: 'Other urgent help', hi: 'अन्य जरूरी मदद' },
] as const

// No emergency dispatch, bed, capability or transfer backend exists. These are
// documented as required contracts and rendered truthfully — never faked.
const DISPATCH_CONTRACT =
  'Ambulance coordination requires a connected emergency-dispatch service ' +
  '(e.g. public.emergency_requests + dispatch/accept RPC returning a real assignment). ' +
  'SwasthyaSetu never claims an ambulance is dispatched or guaranteed without that acceptance.'
const CAPABILITY_CONTRACT =
  'Live emergency capability, bed/ICU availability, equipment and wait times require ' +
  'connected facility status data with source + last-updated freshness. The facilities ' +
  'table holds no capability, bed, equipment or wait-time columns; distance can only be ' +
  'derived from a real facility latitude/longitude plus the user location.'
const TRANSFER_CONTRACT =
  'Transfer state requires a referral/transfer backend (source facility, target facility, ' +
  'acceptance, arrival). No transfer is shown as accepted or completed without backend confirmation.'

export function EmergencyPage() {
  const { tr, language } = useCareLanguage()
  const hi = language === 'Hindi'

  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [helpType, setHelpType] = useState<string>('MEDICAL')
  const [notes, setNotes] = useState('')

  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facLoading, setFacLoading] = useState(true)
  const [facError, setFacError] = useState('')
  const [facQuery, setFacQuery] = useState('')
  const [facType, setFacType] = useState('')

  // 026 Emergency Coordination State (e1_request, e1_candidates, e1_contact, e1_transport_request)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [activeReqId, setActiveReqId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<any[]>([])
  const [contactedFacilities, setContactedFacilities] = useState<Record<string, boolean>>({})
  const [coordBusy, setCoordBusy] = useState(false)
  const [coordMsg, setCoordMsg] = useState('')
  const [transportMsg, setTransportMsg] = useState('')

  const loadFacilities = useCallback(async () => {
    setFacLoading(true)
    setFacError('')
    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('id, name, facility_type, city, state, address_text, verification_status')
        .order('name', { ascending: true })
        .limit(200)
      if (error) throw error
      setFacilities((data ?? []) as Facility[])
    } catch (e) {
      setFacError(e instanceof Error ? e.message : String(e))
    } finally {
      setFacLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFacilities()
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from('patient_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.id) setPatientId(data.id)
          })
      }
    })
  }, [loadFacilities])

  async function initiateEmergencyCoordination() {
    if (!patientId) {
      setCoordMsg(tr('Patient profile required.', 'रोगी प्रोफ़ाइल आवश्यक है।'))
      return
    }
    if (!coords) {
      setCoordMsg(tr('Please capture location first via "Use My Location".', 'कृपया पहले "मेरी लोकेशन लें" से स्थान दर्ज करें।'))
      return
    }
    setCoordBusy(true)
    setCoordMsg('')
    try {
      const capabilities = [
        helpType === 'CARDIAC' ? 'CARDIOLOGY' :
        helpType === 'BREATHING' ? 'VENTILATOR' :
        helpType === 'MATERNITY' ? 'MATERNITY' :
        helpType === 'ACCIDENT' ? 'TRAUMA' : 'EMERGENCY'
      ]
      const reasonText = (notes.trim() || selectedHelp?.en || 'Emergency Medical Coordination').slice(0, 500)
      const reqKey = crypto.randomUUID()

      const { data: reqId, error } = await supabase.rpc('e1_request', {
        p_patient: patientId,
        p_episode: null,
        p_capabilities: capabilities,
        p_latitude: coords.lat,
        p_longitude: coords.lng,
        p_reason: reasonText,
        p_request: reqKey
      })

      if (error) throw error
      setActiveReqId(reqId)
      setCoordMsg(tr('Emergency request initiated. Querying verified nearby facilities…', 'आपातकालीन अनुरोध शुरू हुआ। सत्यापित नजदीकी सुविधाओं की खोज जारी है…'))

      const { data: candData, error: candErr } = await supabase.rpc('e1_candidates', {
        p_request: reqId,
        p_radius_km: 50,
        p_offset: 0
      })
      if (!candErr && candData) {
        setCandidates(candData)
      }
    } catch (e: unknown) {
      setCoordMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setCoordBusy(false)
    }
  }

  async function contactFacility(facilityId: string) {
    if (!activeReqId) return
    setCoordBusy(true)
    try {
      const { error } = await supabase.rpc('e1_contact', {
        p_request: activeReqId,
        p_facility: facilityId
      })
      if (error) throw error
      setContactedFacilities(cur => ({ ...cur, [facilityId]: true }))
      setCoordMsg(tr('Contact notice sent to facility triage queue.', 'सुविधा ट्राइएज कतार में संपर्क सूचना भेजी गई।'))
    } catch (e: unknown) {
      setCoordMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setCoordBusy(false)
    }
  }

  async function requestTransport() {
    if (!activeReqId) return
    setCoordBusy(true)
    setTransportMsg('')
    try {
      const { error } = await supabase.rpc('e1_transport_request', {
        p_request: activeReqId
      })
      if (error) throw error
      setTransportMsg(tr('Transport coordination requested. External transport confirmation required.', 'परिवहन समन्वय अनुरोध भेजा गया। बाहरी परिवहन पुष्टि आवश्यक है।'))
    } catch (e: unknown) {
      setTransportMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setCoordBusy(false)
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setLocError(tr('Location is not available on this device.', 'इस डिवाइस पर लोकेशन उपलब्ध नहीं है।'))
      return
    }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setLocating(false)
      },
      () => {
        setLocError(tr('Location permission denied.', 'लोकेशन की अनुमति नहीं मिली।'))
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const facilityTypes = useMemo(
    () => Array.from(new Set(facilities.map((f) => f.facility_type).filter(Boolean))).sort(),
    [facilities],
  )

  const filteredFacilities = useMemo(() => {
    const q = facQuery.trim().toLowerCase()
    return facilities.filter((f) => {
      if (facType && f.facility_type !== facType) return false
      if (!q) return true
      return [f.name, f.city, f.state, f.address_text].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [facilities, facQuery, facType])

  const selectedHelp = HELP_TYPES.find((h) => h.id === helpType)

  return (
    <div className="space-y-6">
      {/* SOS HEADER */}
      <div className="rounded-2xl border border-emergency/40 bg-emergency/10 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emergency text-white">
            <Siren className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {tr('Emergency / SOS', 'आपातकाल / SOS')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr(
                'For a life-threatening emergency, call your local emergency number first. This page helps you prepare and share context — it does not replace an emergency call.',
                'जीनलेवा आपातकाल में पहले अपने स्थानीय आपातकालीन नंबर पर कॉल करें। यह पेज संदर्भ तैयार करने में मदद करता है — यह आपातकालीन कॉल का विकल्प नहीं है।',
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a href="tel:112" className="flex items-center justify-between rounded-xl border border-emergency/40 bg-card px-4 py-3 transition hover:bg-emergency/5">
            <span className="flex items-center gap-2">
              <PhoneCall className="size-5 text-emergency" />
              <span>
                <span className="block text-sm font-bold">{tr('National Emergency', 'राष्ट्रीय आपातकाल')}</span>
                <span className="block text-xs text-muted-foreground">{tr('Police · Fire · Medical', 'पुलिस · अग्नि · चिकित्सा')}</span>
              </span>
            </span>
            <span className="text-2xl font-black font-tabular text-emergency">112</span>
          </a>
          <a href="tel:14555" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:bg-secondary/40">
            <span className="flex items-center gap-2">
              <PhoneCall className="size-5 text-primary" />
              <span>
                <span className="block text-sm font-bold">{tr('Ayushman Helpline', 'आयुष्मान हेल्पलाइन')}</span>
                <span className="block text-xs text-muted-foreground">{tr('PM-JAY scheme support', 'PM-JAY योजना सहायता')}</span>
              </span>
            </span>
            <span className="text-2xl font-black font-tabular text-primary">14555</span>
          </a>
        </div>
      </div>

      {/* CURRENT LOCATION */}
      <Card>
        <SectionTitle
          title={tr('Current location', 'वर्तमान स्थान')}
          sub={tr('Used only to describe where help is needed. Never shared without your action.', 'केवल यह बताने के लिए कि मदद कहाँ चाहिए। आपकी कार्रवाई के बिना कभी साझा नहीं होता।')}
          icon={<MapPin className="size-5" />}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" loading={locating} onClick={useMyLocation}>
            <Navigation className="size-4" />
            {tr('Use My Location', 'मेरी लोकेशन लें')}
          </Button>
          {coords ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <MapPin className="size-3.5" />
              <span className="font-tabular">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
              <span className="text-muted-foreground">±{Math.round(coords.accuracy)} m</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {tr('Location not captured yet.', 'अभी लोकेशन नहीं ली गई।')}
            </span>
          )}
        </div>
        {locError ? <p className="mt-2 text-xs text-warning-foreground">{locError}</p> : null}
      </Card>

      {/* REQUIRED HELP */}
      <Card>
        <SectionTitle
          title={tr('What help is needed?', 'किस मदद की जरूरत है?')}
          icon={<AlertTriangle className="size-5" />}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {HELP_TYPES.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHelpType(h.id)}
              className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                helpType === h.id
                  ? 'border-emergency bg-emergency/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {hi ? h.hi : h.en}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="label-xs">{tr('Brief description (optional)', 'संक्षिप्त विवरण (वैकल्पिक)')}</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('e.g. severe chest pain since 20 minutes', 'जैसे 20 मिनट से सीने में तेज दर्द')}
          />
        </label>

        <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {tr(
              'Coordinate with verified facilities based on real capabilities and GPS distance.',
              'वास्तविक क्षमताओं और GPS दूरी के आधार पर सत्यापित सुविधाओं से समन्वय करें।'
            )}
          </p>
          <Button
            variant="primary"
            loading={coordBusy}
            disabled={!coords}
            onClick={() => void initiateEmergencyCoordination()}
          >
            <Siren className="size-4 mr-1.5" />
            {tr('Coordinate With Nearby Facilities (e1_request)', 'नजदीकी अस्पतालों से समन्वय शुरू करें (e1_request)')}
          </Button>
        </div>

        {coordMsg && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-semibold text-primary">
            {coordMsg}
          </div>
        )}

        {/* CANDIDATES DISCOVERED VIA e1_candidates */}
        {candidates.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {tr('Listed Nearby Facilities with Recorded Triage Capability', 'दर्ज ट्राइएज क्षमता वाली सूचीबद्ध नजदीकी सुविधाएँ')}
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {candidates.map((c) => (
                <div key={c.facility_id} className="rounded-xl border border-border bg-card p-3.5 space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-foreground text-sm">{c.name}</p>
                      <p className="text-muted-foreground font-tabular">
                        {c.distance_km != null ? `${Number(c.distance_km).toFixed(1)} km away` : '—'}
                      </p>
                    </div>
                    <Badge tone={c.capability_state === 'RECENTLY_RECORDED_CONFIRMATION_REQUIRED' ? 'warning' : 'neutral'}>
                      {c.capability_state?.replaceAll('_', ' ')}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/50">
                    <span>
                      {tr('Recent available beds:', 'हालिया उपलब्ध बेड:')} <strong className="font-tabular text-foreground">{c.recently_recorded_available_beds ?? 0}</strong>
                    </span>
                    <span className="text-[11px] italic text-muted-foreground font-semibold">
                      (No automatic reservation)
                    </span>
                  </div>

                  <div className="pt-2 flex justify-end">
                    {contactedFacilities[c.facility_id] ? (
                      <span className="text-xs font-semibold text-success flex items-center gap-1">
                        ✓ {tr('Contacted', 'संपर्क किया')}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={coordBusy}
                        onClick={() => void contactFacility(c.facility_id)}
                      >
                        <Building2 className="size-3.5 mr-1" />
                        {tr('Send Contact Alert (e1_contact)', 'संपर्क अलर्ट भेजें (e1_contact)')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                {tr(
                  'Transport coordination requires a confirmed destination facility.',
                  'परिवहन समन्वय के लिए पुष्टि की गई गंतव्य सुविधा आवश्यक है।'
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                loading={coordBusy}
                onClick={() => void requestTransport()}
              >
                <Ambulance className="size-3.5 mr-1" />
                {tr('Request Transport Coordination (e1_transport_request)', 'परिवहन समन्वय अनुरोध (e1_transport_request)')}
              </Button>
            </div>
            {transportMsg && (
              <p className="text-xs text-warning-foreground font-medium">{transportMsg}</p>
            )}
          </div>
        )}
      </Card>

      {/* AMBULANCE COORDINATION — truthful backend-required */}
      <TruthfulEmptyState
        icon={<Ambulance className="size-6" />}
        title={tr('Ambulance coordination', 'एम्बुलेंस समन्वय')}
        description={tr(
          'SwasthyaSetu does not dispatch or guarantee an ambulance. A connected emergency-dispatch service must accept the request before any ambulance is confirmed. Until then, call 112.',
          'SwasthyaSetu एम्बुलेंस नहीं भेजता या उसकी गारंटी नहीं देता। किसी एम्बुलेंस की पुष्टि से पहले जुड़ी हुई आपातकालीन-डिस्पैच सेवा को अनुरोध स्वीकार करना होगा। तब तक 112 पर कॉल करें।',
        )}
        schemaContractNotice={DISPATCH_CONTRACT}
      />

      {/* FACILITY SEARCH */}
      <section className="space-y-3">
        <SectionTitle
          title={tr('Nearby facilities (directory)', 'निकटवर्ती सुविधाएँ (निर्देशिका)')}
          sub={tr('Listed facilities. Directory inclusion does not confirm emergency capability or bed availability.', 'सूचीबद्ध सुविधाएँ। सूची में होना आपातकालीन क्षमता या बेड उपलब्धता की पुष्टि नहीं है।')}
          icon={<Building2 className="size-5" />}
          right={
            <Button size="sm" variant="ghost" onClick={() => navigate('/facilities')}>
              {tr('Open full directory', 'पूरी निर्देशिका खोलें')}
            </Button>
          }
        />

        <AlertBanner tone="warning" title={tr('Capability and beds are not live', 'क्षमता और बेड लाइव नहीं हैं')}>
          {tr(
            'Distance, emergency capability, bed/ICU availability, equipment and wait times cannot be confirmed from connected data. Nothing here is a guarantee of admission or capacity.',
            'दूरी, आपातकालीन क्षमता, बेड/ICU उपलब्धता, उपकरण और प्रतीक्षा समय की पुष्टि कनेक्टेड डेटा से नहीं हो सकती। यहाँ कुछ भी भर्ती या क्षमता की गारंटी नहीं है।',
          )}
        </AlertBanner>

        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput className="flex-1" value={facQuery} onChange={setFacQuery} placeholder={tr('Search facility, city or state…', 'सुविधा, शहर या राज्य खोजें…')} />
          <select value={facType} onChange={(e) => setFacType(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
            <option value="">{tr('All facility types', 'सभी सुविधा प्रकार')}</option>
            {facilityTypes.map((t) => (
              <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>

        {facError ? (
          <AlertBanner tone="emergency" title={tr('Could not load facilities', 'सुविधाएँ लोड नहीं हो सकीं')} action={<Button size="sm" variant="outline" onClick={() => void loadFacilities()}>{tr('Retry', 'पुनः प्रयास')}</Button>}>
            {facError}
          </AlertBanner>
        ) : facLoading ? (
          <Card className="text-sm text-muted-foreground">{tr('Loading facilities…', 'सुविधाएँ लोड हो रही हैं…')}</Card>
        ) : filteredFacilities.length === 0 ? (
          <TruthfulEmptyState
            icon={<Search className="size-6" />}
            title={tr('No facilities match', 'कोई सुविधा मेल नहीं खाती')}
            description={tr('Adjust the search or type, or open the full directory.', 'खोज या प्रकार बदलें, या पूरी निर्देशिका खोलें।')}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFacilities.map((f) => (
              <Card key={f.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-start gap-2 text-sm font-semibold">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {f.name}
                  </p>
                  {f.verification_status === 'APPROVED' ? (
                    <Badge tone="success">{tr('Operational access approved', 'परिचालन अनुमति स्वीकृत')}</Badge>
                  ) : (
                    <Badge tone="neutral">{f.verification_status.replaceAll('_', ' ')}</Badge>
                  )}
                </div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.facility_type.replaceAll('_', ' ')}</p>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  {[f.address_text, f.city, f.state].filter(Boolean).join(', ') || tr('Address not published', 'पता प्रकाशित नहीं')}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="size-3.5 shrink-0" />
                  {tr('Emergency capability: not connected', 'आपातकालीन क्षमता: कनेक्ट नहीं')}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* PREPARED CONTEXT — not a dispatch */}
      <Card>
        <SectionTitle title={tr('Prepared emergency context', 'तैयार आपातकालीन संदर्भ')} icon={<ShieldAlert className="size-5" />} />
        <p className="text-xs text-muted-foreground">
          {tr(
            'This summary is for you to read out or share with an operator. It is NOT sent anywhere and does NOT request an ambulance.',
            'यह सारांश आपको ऑपरेटर को पढ़कर सुनाने या साझा करने के लिए है। यह कहीं नहीं भेजा जाता और एम्बुलेंस का अनुरोध नहीं करता।',
          )}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="label-xs">{tr('Help type', 'मदद का प्रकार')}</dt>
            <dd className="mt-0.5 font-medium">{selectedHelp ? (hi ? selectedHelp.hi : selectedHelp.en) : '—'}</dd>
          </div>
          <div>
            <dt className="label-xs">{tr('Location', 'स्थान')}</dt>
            <dd className="mt-0.5 font-medium font-tabular">
              {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : tr('Not captured', 'नहीं लिया गया')}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="label-xs">{tr('Description', 'विवरण')}</dt>
            <dd className="mt-0.5 font-medium">{notes.trim() || tr('Not provided', 'नहीं दिया गया')}</dd>
          </div>
        </dl>
      </Card>

      {/* TRANSFER STATE — truthful backend-required */}
      <TruthfulEmptyState
        icon={<Ambulance className="size-6" />}
        title={tr('Transfer / referral state', 'स्थानांतरण / रेफरल स्थिति')}
        description={tr(
          'Inter-facility transfer acceptance, arrival and outcome require a connected referral backend. No transfer is shown as accepted or completed without confirmation.',
          'सुविधाओं के बीच स्थानांतरण स्वीकृति, आगमन और परिणाम के लिए जुड़ा हुआ रेफरल बैकएंड चाहिए। पुष्टि के बिना कोई स्थानांतरण स्वीकृत या पूर्ण नहीं दिखाया जाता।',
        )}
        schemaContractNotice={TRANSFER_CONTRACT}
      />

      <Disclaimer>
        {tr(
          'SwasthyaSetu never claims an ambulance, bed, ICU slot or facility is guaranteed. Emergency capability and capacity come only from connected, timestamped facility status data.',
          'SwasthyaSetu कभी दावा नहीं करता कि एम्बुलेंस, बेड, ICU स्लॉट या सुविधा सुनिश्चित है। आपातकालीन क्षमता केवल जुड़े, टाइमस्टैम्प वाले सुविधा स्थिति डेटा से आती है।',
        )}
      </Disclaimer>
    </div>
  )
}
