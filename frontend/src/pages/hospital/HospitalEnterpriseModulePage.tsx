import { HospitalOperationsPage } from './HospitalOperationsPage'
import { HospitalBedsPage } from './HospitalBedsPage'
import { useEffect, useState, useCallback } from 'react'
import {
  CreditCard,
  HeartPulse,
  Truck,
  FileText,
  FileBarChart,
  Link2,
  Layers,
  Clock,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Plus,
  Activity,
  AlertTriangle,
  Calendar,
  Package,
  Siren
} from 'lucide-react'
import { Badge, Button, Card, SectionTitle, StatusBadge, TruthfulEmptyState } from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveFacilityId, reqId } from '@/lib/facility'
import { HospitalBillingPage } from './HospitalBillingPage'

type ModuleConfig = {
  title: string
  titleHi: string
  description: string
  descriptionHi: string
  icon: typeof CreditCard
  schemaRequirement: string
}

const moduleConfigs: Record<string, ModuleConfig> = {
  emergency: {
    title: 'Emergency & Triage Department',
    titleHi: 'आपातकालीन वार्ड और ट्राइएज',
    description: 'Real-time casualty intake, red/yellow/green triage category classification, and resuscitation tracking.',
    descriptionHi: 'आपातकालीन मरीज आगमन, ट्राइएज वर्गीकरण और क्रिटिकल केयर ट्रैकिंग।',
    icon: HeartPulse,
    schemaRequirement: `TABLE: public.emergency_admissions (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES public.patient_profiles(id),
  triage_level TEXT NOT NULL, -- RED (IMMEDIATE), YELLOW (URGENT), GREEN (ROUTINE)
  arrival_mode TEXT NOT NULL, -- AMBULANCE, WALK_IN, TRANSFER
  chief_complaint TEXT,
  vitals_json JSONB,
  admitted_at TIMESTAMPTZ DEFAULT now()
)
RPC: emergency_register_intake(p_patient, p_triage, p_arrival, p_notes)`
  },
  billing: {
    title: 'Hospital Billing & Cashier Counter',
    titleHi: 'अस्पताल बिलिंग व कैशियर काउंटर',
    description: 'Outpatient consultation fees, laboratory diagnostics billing, and pharmacy invoice collection.',
    descriptionHi: 'परामर्श शुल्क रसीद, लैब बिलिंग और दवा इनवॉइस काउंटर।',
    icon: CreditCard,
    schemaRequirement: `TABLE: public.billing_invoices (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES public.patient_profiles(id),
  invoice_number TEXT UNIQUE NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  paid_amount NUMERIC(10,2) DEFAULT 0,
  payment_status TEXT NOT NULL, -- PENDING, PAID, PARTIAL, WAIVED
  created_at TIMESTAMPTZ DEFAULT now()
)
TABLE: public.billing_line_items (
  id UUID PRIMARY KEY,
  invoice_id UUID REFERENCES public.billing_invoices(id),
  item_type TEXT, -- CONSULTATION, LAB_TEST, PHARMACY
  amount NUMERIC(10,2) NOT NULL
)
RPC: billing_generate_invoice(p_patient, p_items)
RPC: billing_record_payment(p_invoice, p_amount, p_mode)`
  },
  inventory: {
    title: 'Medical Supplies & Equipment Inventory',
    titleHi: 'चिकित्सा आपूर्ति व उपकरण भंडार',
    description: 'Non-pharmaceutical surgical supplies, PPE, diagnostic reagents, and asset maintenance tracking.',
    descriptionHi: 'सर्जिकल सामग्री, डायग्नोस्टिक अभिकर्मक और उपकरण रखरखाव।',
    icon: Truck,
    schemaRequirement: `TABLE: public.hospital_assets (
  id UUID PRIMARY KEY,
  facility_id UUID REFERENCES public.facilities(id),
  asset_name TEXT NOT NULL,
  category TEXT NOT NULL, -- SURGICAL, PPE, REAGENT, HARDWARE
  current_quantity INT NOT NULL,
  minimum_threshold INT NOT NULL,
  last_inspected_at DATE
)
RPC: inventory_record_consumption(p_asset, p_quantity)`
  },
  referrals: {
    title: 'Inter-Facility Referrals & Transfers',
    titleHi: 'अस्पताल रेफरल व ट्रांसफर नेटवर्क',
    description: 'Coordinated patient transfer requests between Primary Health Centres, District Hospitals, and Tertiary Institutes.',
    descriptionHi: 'प्राथमिक स्वास्थ्य केंद्र और जिला अस्पताल के बीच सुरक्षित रेफरल।',
    icon: FileText,
    schemaRequirement: `TABLE: public.facility_referrals (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES public.patient_profiles(id),
  source_facility_id UUID REFERENCES public.facilities(id),
  target_facility_id UUID REFERENCES public.facilities(id),
  reason TEXT NOT NULL,
  clinical_summary TEXT,
  status TEXT NOT NULL, -- INITIATED, ACCEPTED, TRANSFERRED, COMPLETED
  created_at TIMESTAMPTZ DEFAULT now()
)
RPC: referral_create(p_patient, p_target_facility, p_reason)`
  },
  reports: {
    title: 'Hospital MIS & Operational Analytics',
    titleHi: 'अस्पताल प्रबंधन सूचना प्रणाली (MIS)',
    description: 'National Health Mission footfall reports, disease surveillance aggregates, and clinical census.',
    descriptionHi: 'दैनिक रोगी फुटफॉल, संक्रामक रोग निगरानी और क्लिनिकल जनगणना।',
    icon: FileBarChart,
    schemaRequirement: `TABLE: public.daily_census_aggregates (
  id UUID PRIMARY KEY,
  facility_id UUID REFERENCES public.facilities(id),
  report_date DATE NOT NULL,
  opd_count INT DEFAULT 0,
  ipd_count INT DEFAULT 0,
  emergency_count INT DEFAULT 0,
  lab_tests_count INT DEFAULT 0
)
RPC: mis_generate_daily_census(p_date)`
  },
  integrations: {
    title: 'ABDM Milestones & National Health Highway (M1/M2/M3)',
    titleHi: 'आयुष्मान भारत डिजिटल मिशन (ABDM) एकीकरण',
    description: 'Ayushman Bharat Digital Mission compliance gateway: M1 (ABHA creation), M2 (HIP records push), and M3 (HIU teleconsultation).',
    descriptionHi: 'ABDM M1 (ABHA सृजन), M2 (रिकॉर्ड्स शेयरिंग) और M3 (टेली-कंसल्टेशन) मानक।',
    icon: Link2,
    schemaRequirement: `ABDM INTEGRATION CONTRACT:
- Milestone M1: Active in SwasthyaSetu (ABHA Number & Address linking supported)
- Milestone M2 (HIP): FHIR bundles push via bridge gateway (pending backend encryption server)
- Milestone M3 (HIU): Consent-driven artifact pull (bound via patient_consents schema)
Environment Contract: ABDM_GATEWAY_URL, ABDM_CLIENT_ID, ABDM_CLIENT_SECRET`
  },
  departments: {
    title: 'Clinical Departments & Specialty Services',
    titleHi: 'क्लिनिकल विभाग व विशिष्ट सेवाएँ',
    description: 'Hospital service units including General Medicine, Pediatrics, Obstetrics, Orthopedics, and Radiology.',
    descriptionHi: 'सामान्य चिकित्सा, शिशु रोग, हड्डी रोग और प्रसूति विभाग।',
    icon: Layers,
    schemaRequirement: `TABLE: public.hospital_departments (
  id UUID PRIMARY KEY,
  facility_id UUID REFERENCES public.facilities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  head_of_department UUID REFERENCES public.provider_profiles(id),
  is_active BOOLEAN DEFAULT true
)`
  },
  schedules: {
    title: 'Physician Duty Rosters & Shift Schedules',
    titleHi: 'डॉक्टर ड्यूटी रोस्टर व शिफ्ट समय',
    description: 'Weekly clinical shift allocations, on-call emergency rotations, and OPD consulting room slots.',
    descriptionHi: 'साप्ताहिक शिफ्ट आवंटन, ऑन-कॉल ड्यूटी और ओपीडी परामर्श कक्ष।',
    icon: Clock,
    schemaRequirement: `TABLE: public.staff_duty_shifts (
  id UUID PRIMARY KEY,
  provider_id UUID REFERENCES public.provider_profiles(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_number TEXT,
  status TEXT DEFAULT 'SCHEDULED'
)`
  },
  ipd: {
    title: 'Inpatient Department (IPD) Registry',
    titleHi: 'भर्ती मरीज विभाग (IPD)',
    description: 'Continuous monitoring of admitted inpatient rounds, daily clinical progress notes, and discharge planning.',
    descriptionHi: 'भर्ती मरीजों की दैनिक डॉक्टर राउंड्स, क्लिनिकल नोट्स और डिस्चार्ज सारांश।',
    icon: Building2,
    schemaRequirement: `TABLE: public.inpatient_encounters (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES public.patient_profiles(id),
  admitted_at TIMESTAMPTZ NOT NULL,
  discharged_at TIMESTAMPTZ,
  attending_doctor_id UUID REFERENCES public.provider_profiles(id),
  primary_diagnosis TEXT,
  status TEXT NOT NULL -- ADMITTED, DISCHARGED, TRANSFERRED
)`
  }
}

export function HospitalEnterpriseModulePage({ moduleKey }: { moduleKey: string }) {
  if (moduleKey === 'billing') return <HospitalBillingPage />
  if (moduleKey === 'ipd') return <HospitalBedsPage />
  if (['departments','schedules','inventory'].includes(moduleKey)) return <HospitalOperationsPage key={moduleKey} moduleKey={moduleKey} />
  return <RemainingHospitalModule key={moduleKey} moduleKey={moduleKey} />
}
function RemainingHospitalModule({ moduleKey }: { moduleKey: string }) {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'
  const { profile } = useAuth()

  // Billing is fully backed by the 015 contracts (h3_*); render the live module.
  if (moduleKey === 'billing') return <HospitalBillingPage />

  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [operationalData, setOperationalData] = useState<any>(null)
  const [referralsList, setReferralsList] = useState<any[]>([])
  const [emergencyList, setEmergencyList] = useState<any[]>([])
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => {
    void resolveFacilityId(profile?.id).then(id => {
      if (id) setFacilityId(id)
    })
  }, [profile?.id])

  const loadModuleData = useCallback(async () => {
    if (!facilityId) return
    setDataLoading(true)
    try {
      if (moduleKey === 'referrals') {
        const { data } = await supabase.rpc('r4_referrals', { p_offset: 0 })
        if (data && Array.isArray(data)) setReferralsList(data)
      } else if (['schedules', 'inventory', 'departments'].includes(moduleKey)) {
        const from = new Date(Date.now() - 7 * 86400000).toISOString()
        const until = new Date(Date.now() + 14 * 86400000).toISOString()
        const { data } = await supabase.rpc('h4_operations', {
          p_facility: facilityId,
          p_from: from,
          p_until: until
        })
        if (data) setOperationalData(data)
      } else if (moduleKey === 'emergency') {
        const { data } = await supabase
          .from('emergency_requests')
          .select('id, reason, state, transport_state, required_capabilities, created_at')
          .order('created_at', { ascending: false })
          .limit(20)
        if (data) setEmergencyList(data)
      }
    } catch (e) { setActionMsg(e instanceof Error ? e.message : "Unable to load operations")
    } finally {
      setDataLoading(false)
    }
  }, [facilityId, moduleKey])

  useEffect(() => {
    void loadModuleData()
  }, [loadModuleData])

  const config = moduleConfigs[moduleKey] || {
    title: 'Enterprise Hospital Module',
    titleHi: 'अस्पताल प्रबंधन मॉड्यूल',
    description: 'Enterprise healthcare operations module.',
    descriptionHi: 'स्वास्थ्य सेवा संचालन मॉड्यूल।',
    icon: Building2,
    schemaRequirement: `TABLE: public.hospital_${moduleKey} (id UUID PRIMARY KEY)`
  }

  const Icon = config.icon

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl text-foreground">
              {hindi ? config.titleHi : config.title}
            </h1>
            <Badge tone="teal">Connected Operations</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi ? config.descriptionHi : config.description}
          </p>
        </div>

        <Badge tone="outline" className="text-xs py-1">
          <ShieldCheck className="size-3.5 mr-1" />
          Enterprise HMIS
        </Badge>
      </div>

      {actionMsg && (
        <Card className="border-primary/30 bg-primary/5 p-3 text-xs font-semibold text-primary">
          {actionMsg}
        </Card>
      )}

      {/* 1. OPERATIONAL PANEL: REFERRALS (024 / r4_referrals) */}
      {moduleKey === 'referrals' && (
        <Card className="space-y-4">
          <SectionTitle
            title={hindi ? 'सक्रिय रेफरल वर्कलिस्ट' : 'Live Facility Referrals Worklist'}
            sub={hindi ? 'सहमति-सत्यापित रेफरल कार्यप्रवाह (024 / r4_referrals)' : 'Closed-loop transfers governed by patient consent'}
            icon={<FileText className="size-4 text-primary" />}
          />
          {referralsList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-3">
              {hindi ? 'इस सुविधा के लिए कोई सक्रिय रेफरल लंबित नहीं है।' : 'No active inter-facility referrals registered for this facility.'}
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {referralsList.map(r => (
                <div key={r.id} className="p-3 text-xs space-y-1 bg-card hover:bg-surface-subtle transition">
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono">{r.id.slice(0, 8)}…</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={r.urgency === 'CRITICAL' ? 'emergency' : 'outline'}>{r.urgency}</Badge>
                      <StatusBadge status={r.state} />
                    </div>
                  </div>
                  {r.reason && <p className="text-foreground"><strong>Reason:</strong> {r.reason}</p>}
                  {r.outcome_summary && <p className="text-muted-foreground italic"><strong>Outcome:</strong> {r.outcome_summary}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 2. OPERATIONAL PANEL: STAFF DUTIES / SHIFTS (033 / h4_operations) */}
      {moduleKey === 'schedules' && (
        <Card className="space-y-4">
          <SectionTitle
            title={hindi ? 'क्लिनिकल ड्यूटी रोस्टर' : 'Hospital Staff Duty Roster'}
            sub={hindi ? 'दैनिक शिफ्ट समय व ऑन-कॉल ड्यूटी (033 / h4_operations)' : 'Shift assignments governed by 24-hour bounded windows'}
            icon={<Clock className="size-4 text-primary" />}
          />
          {operationalData?.duties?.length ? (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {operationalData.duties.map((d: any) => (
                <div key={d.id} className="p-3 text-xs flex items-center justify-between bg-card">
                  <div>
                    <span className="font-semibold text-foreground font-mono">Staff: {d.user_id?.slice(0, 8)}…</span>
                    <p className="text-muted-foreground font-tabular text-[11px]">
                      {new Date(d.starts_at).toLocaleString()} — {new Date(d.ends_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <Badge tone={d.membership_current ? 'success' : 'neutral'}>
                    {d.membership_current ? 'Active Member' : 'Past Assignment'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-3">
              {hindi ? 'इस समयावधि के लिए कोई ड्यूटी शिफ्ट दर्ज नहीं है।' : 'No duty shifts recorded for the current window.'}
            </p>
          )}
        </Card>
      )}

      {/* 3. OPERATIONAL PANEL: NON-MEDICINE STORES (033 / h4_operations) */}
      {moduleKey === 'inventory' && (
        <Card className="space-y-4">
          <SectionTitle
            title={hindi ? 'अस्पताल भंडार व आपूर्ति (Non-Medicine Stores)' : 'Hospital Supplies & Stores'}
            sub={hindi ? 'सर्जिकल सामग्री व उपकरण भंडार (033 / h4_operations)' : 'Non-pharmaceutical supplies governed by strict movement audit'}
            icon={<Truck className="size-4 text-primary" />}
          />
          {operationalData?.store_items?.length ? (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {operationalData.store_items.map((it: any) => (
                <div key={it.id} className="p-3 text-xs flex items-center justify-between bg-card">
                  <div>
                    <span className="font-bold text-foreground">{it.name}</span>
                    <p className="text-muted-foreground font-mono text-[11px]">Code: {it.item_code} · Unit: {it.unit}</p>
                  </div>
                  <span className="font-tabular font-bold text-sm text-primary">
                    {it.quantity} {it.unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-3">
              {hindi ? 'कोई गैर-दवा स्टोर आइटम दर्ज नहीं है।' : 'No non-medicine store items recorded for this facility.'}
            </p>
          )}
        </Card>
      )}

      {/* 4. OPERATIONAL PANEL: EMERGENCY TRIAGE (026) */}
      {moduleKey === 'emergency' && (
        <Card className="space-y-4">
          <SectionTitle
            title={hindi ? 'आपातकालीन ट्राइएज समन्वय' : 'Emergency Intake & Triage Coordination'}
            sub={hindi ? 'आपातकालीन अनुरोध व क्षमता प्रबंधन (026 / e1_*)' : 'Triage coordination without unverified capacity guarantees'}
            icon={<HeartPulse className="size-4 text-emergency" />}
          />
          {emergencyList.length ? (
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {emergencyList.map(em => (
                <div key={em.id} className="p-3 text-xs space-y-1 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{em.reason}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={em.state === 'OPEN' ? 'emergency' : 'success'}>{em.state}</Badge>
                      <StatusBadge status={em.transport_state} />
                    </div>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Required: {(em.required_capabilities || []).join(', ')} · {new Date(em.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-3">
              {hindi ? 'वर्तमान में कोई खुला आपातकालीन समन्वय अनुरोध नहीं है।' : 'No open emergency coordination requests for this facility.'}
            </p>
          )}
        </Card>
      )}

      {!['referrals','emergency'].includes(moduleKey) && <Card><TruthfulEmptyState title={['insurance','integrations','ambulance'].includes(moduleKey) ? 'External integration not configured' : 'Not available yet'} description="No confirmed information is available for this module." /></Card>}

    </div>
  )
}
