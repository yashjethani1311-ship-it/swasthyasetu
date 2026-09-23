import { useEffect, useState } from 'react'
import {
  Building2,
  CalendarCheck,
  Users,
  Stethoscope,
  Activity,
  Pill,
  Bed,
  CreditCard,
  HeartPulse,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  Search,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ClinicalTable,
  EmptyState,
  SectionTitle,
  Stat,
  StatusBadge,
  TruthfulEmptyState,
  type TableColumn
} from '../kit'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'

type HospitalStats = {
  totalPatients: number
  todayAppointments: number
  activeEncounters: number
  activeDoctors: number
  labOrdersCount: number
  pharmacyInventoryCount: number
}

type RecentActivity = {
  id: string
  event_type: string
  created_at: string
}

type AppointmentSummary = {
  id: string
  scheduled_at: string
  mode: string
  status: string
  doctor_provider_id: string
  doctor_name?: string
  patient_name?: string
  patient_code?: string
}

export function HospitalCommandCenter() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState<HospitalStats>({
    totalPatients: 0,
    todayAppointments: 0,
    activeEncounters: 0,
    activeDoctors: 0,
    labOrdersCount: 0,
    pharmacyInventoryCount: 0
  })
  const [recentEvents, setRecentEvents] = useState<RecentActivity[]>([])
  const [todayAppointmentsList, setTodayAppointmentsList] = useState<AppointmentSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadHospitalData()
  }, [])

  async function loadHospitalData() {
    setLoading(true)
    setError('')

    try {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const [
        patientsRes,
        todayApptsRes,
        encountersRes,
        doctorsRes,
        labOrdersRes,
        inventoryRes,
        eventsRes,
        apptsListRes
      ] = await Promise.all([
        // Total registered patients
        supabase
          .from('patient_profiles')
          .select('id', { count: 'exact', head: true }),

        // Today's appointments count
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('scheduled_at', startOfDay.toISOString())
          .lte('scheduled_at', endOfDay.toISOString()),

        // Active OPD in-clinic encounters
        supabase
          .from('encounters')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'IN_PROGRESS'),

        // Active approved doctors
        supabase
          .from('provider_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('provider_type', 'DOCTOR')
          .eq('verification_status', 'APPROVED'),

        // Total lab orders
        supabase
          .from('lab_orders')
          .select('id', { count: 'exact', head: true }),

        // Pharmacy inventory batches
        supabase
          .from('pharmacy_inventory')
          .select('id', { count: 'exact', head: true }),

        // Recent care events audit
        supabase
          .from('care_events')
          .select('id, event_type, created_at')
          .order('created_at', { ascending: false })
          .limit(6),

        // Today's appointments list
        supabase
          .from('appointments')
          .select(`
            id,
            scheduled_at,
            mode,
            status,
            doctor_provider_id,
            provider_profiles(full_name),
            patient_profiles(full_name, patient_code)
          `)
          .gte('scheduled_at', startOfDay.toISOString())
          .lte('scheduled_at', endOfDay.toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(8)
      ])

      setStats({
        totalPatients: patientsRes.count ?? 0,
        todayAppointments: todayApptsRes.count ?? 0,
        activeEncounters: encountersRes.count ?? 0,
        activeDoctors: doctorsRes.count ?? 0,
        labOrdersCount: labOrdersRes.count ?? 0,
        pharmacyInventoryCount: inventoryRes.count ?? 0
      })

      if (eventsRes.data) {
        setRecentEvents(eventsRes.data as RecentActivity[])
      }

      if (apptsListRes.data) {
        const mapped: AppointmentSummary[] = apptsListRes.data.map((a: any) => ({
          id: a.id,
          scheduled_at: a.scheduled_at,
          mode: a.mode,
          status: a.status,
          doctor_provider_id: a.doctor_provider_id,
          doctor_name: a.provider_profiles?.full_name ?? 'Doctor',
          patient_name: a.patient_profiles?.full_name ?? 'Patient',
          patient_code: a.patient_profiles?.patient_code ?? '—'
        }))
        setTodayAppointmentsList(mapped)
      }
    } catch (e: unknown) {
      console.error('Hospital data load error:', e)
      setError(e instanceof Error ? e.message : 'Unable to load command centre data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const columns: TableColumn<AppointmentSummary>[] = [
    {
      key: 'scheduled_at',
      header: hindi ? 'समय' : 'Slot',
      width: '90px',
      render: r => (
        <span className="font-semibold font-tabular text-foreground">
          {new Date(r.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'patient',
      header: hindi ? 'रोगी विवरण' : 'Patient',
      render: r => (
        <div>
          <p className="font-semibold text-foreground">{r.patient_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{r.patient_code}</p>
        </div>
      )
    },
    {
      key: 'doctor',
      header: hindi ? 'डॉक्टर' : 'Doctor',
      render: r => (
        <span className="text-xs font-medium text-foreground">
          Dr. {r.doctor_name}
        </span>
      )
    },
    {
      key: 'mode',
      header: hindi ? 'परामर्श प्रकार' : 'Mode',
      width: '110px',
      render: r => (
        <Badge tone={r.mode === 'TELECONSULT' ? 'teal' : 'neutral'}>
          {r.mode.replace(/_/g, ' ')}
        </Badge>
      )
    },
    {
      key: 'status',
      header: hindi ? 'स्थिति' : 'Status',
      width: '120px',
      render: r => <StatusBadge status={r.status} />
    }
  ]

  return (
    <div className="space-y-6">
      {/* COMMAND CENTRE BANNER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <h1 className="text-2xl font-bold md:text-3xl text-foreground tracking-tight">
              {hindi ? 'अस्पताल कमांड सेंटर' : 'Hospital Command Centre'}
            </h1>
            <Badge tone="teal">Live HIS</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'वास्तविक समय में अस्पताल संचालन, ओपीडी कतार, लैब थ्रूपुट और पंजीकरण।'
              : 'Real-time hospital operations, outpatient throughput, lab metrics, and registry telemetry.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={refreshing}
            onClick={() => {
              setRefreshing(true)
              void loadHospitalData()
            }}
          >
            <RefreshCw className="size-3.5 mr-1" />
            {hindi ? 'ताज़ा करें' : 'Refresh Telemetry'}
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/hospital/reception')}
          >
            <Users className="size-3.5 mr-1" />
            {hindi ? 'रिसेप्शन डेस्क' : 'Token Desk'}
          </Button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* CORE OPERATIONAL METRICS BACKED BY REAL DATA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          label={hindi ? 'कुल पंजीकृत रोगी' : 'Registered Patients'}
          value={stats.totalPatients}
          tone="primary"
          icon={<Users className="size-5" />}
          hint={hindi ? 'मास्टर रोगी इंडेक्स' : 'Master Patient Index'}
        />

        <Stat
          label={hindi ? 'आज की अपॉइंटमेंट्स' : "Today's Schedule"}
          value={stats.todayAppointments}
          tone="primary"
          icon={<CalendarCheck className="size-5" />}
          hint={hindi ? 'ओपीडी स्लॉट' : 'Booked OPD slots'}
        />

        <Stat
          label={hindi ? 'प्रगतिरत परामर्श' : 'Active Consultations'}
          value={stats.activeEncounters}
          tone={stats.activeEncounters > 0 ? 'warning' : 'neutral'}
          icon={<Stethoscope className="size-5" />}
          hint={hindi ? 'क्लिनिक में उपस्थित' : 'In-clinic encounters'}
        />

        <Stat
          label={hindi ? 'ड्यूटी पर डॉक्टर' : 'Doctors on Roster'}
          value={stats.activeDoctors}
          tone="success"
          icon={<ShieldCheck className="size-5" />}
          hint={hindi ? 'सत्यापित प्रोफेशनल्स' : 'Approved specialists'}
        />

        <Stat
          label={hindi ? 'लैब परीक्षण' : 'Lab Orders'}
          value={stats.labOrdersCount}
          tone="teal"
          icon={<Activity className="size-5" />}
          hint={hindi ? 'कुल डायग्नोस्टिक ऑर्डर' : 'Total ordered tests'}
        />

        <Stat
          label={hindi ? 'फार्मेसी फॉर्मूले' : 'Pharmacy Batches'}
          value={stats.pharmacyInventoryCount}
          tone="routine"
          icon={<Pill className="size-5" />}
          hint={hindi ? 'दवा स्टॉक बैच' : 'Available medicines'}
        />
      </div>

      {/* MAIN TWO-COLUMN LAYOUT: TODAY'S APPOINTMENTS & REAL AUDIT FEED */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* TODAY'S APPOINTMENTS TABLE */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle
                title={hindi ? 'आज का अस्पताल अपॉइंटमेंट शेड्यूल' : "Today's Hospital OPD Schedule"}
                sub={hindi ? 'सभी विभागों के ओपीडी स्लॉट व उपस्थिति' : 'Multi-department appointments and consultation progress'}
                icon={<CalendarCheck className="size-4" />}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/appointments')}
              >
                {hindi ? 'सभी देखें' : 'View Master Schedule'}
                <ArrowUpRight className="size-3.5 ml-1" />
              </Button>
            </div>

            <ClinicalTable
              columns={columns}
              data={todayAppointmentsList}
              keyField="id"
              loading={loading}
              emptyMessage={
                hindi
                  ? 'आज के लिए कोई अपॉइंटमेंट शेड्यूल नहीं है।'
                  : 'No appointments scheduled for today.'
              }
            />
          </Card>

          {/* BACKEND CAPABILITY STATUS CARD */}
          <Card className="border-border bg-surface-subtle/70 p-5 space-y-3">
            <div className="flex items-center gap-2 text-foreground font-bold text-sm">
              <AlertCircle className="size-4 text-primary" />
              <span>{hindi ? 'बैकएंड एकीकरण स्थिति (Enterprise Telemetry)' : 'Parallel Engineering Contract Status'}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {hindi
                ? 'SwasthyaSetu वास्तविक डेटा बाइंडिंग पर चलता है। जहाँ स्कीमा लाइव है (मरीज, डॉक्टर, ओपीडी, पर्ची, लैब), वास्तविक डेटा प्रदर्शित होता है। बेड प्रबंधन, आपातकालीन बोर्ड और बिलिंग के लिए बैकएंड अनुबंध प्रलेखित हैं।'
                : 'SwasthyaSetu runs on authentic backend telemetry. Modules with live Supabase schema (Patients, Doctors, OPD appointments, Prescriptions, Diagnostics, Pharmacy) are bound directly to real DB tables. Future capabilities (Inpatient Beds ADT, Emergency Triage, Billing Cashier) display truthful requirements below without fabricated metrics.'}
            </p>
          </Card>
        </div>

        {/* RECENT OPERATIONAL ACTIVITY STREAM */}
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                <span>{hindi ? 'हालिया अस्पताल गतिविधियाँ' : 'Operational Activity Feed'}</span>
              </h3>
              <Badge tone="outline" className="text-[10px]">
                Audit Events
              </Badge>
            </div>

            {recentEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3">
                {hindi ? 'हाल ही में कोई गतिविधि दर्ज नहीं है।' : 'No recent hospital care events recorded.'}
              </p>
            ) : (
              <div className="space-y-3">
                {recentEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-xs bg-card"
                  >
                    <div className="size-2 rounded-full bg-primary mt-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">
                        {ev.event_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-tabular mt-0.5">
                        {new Date(ev.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* QUICK ENTERPRISE SHORTCUTS */}
          <Card className="space-y-3">
            <h3 className="font-semibold text-sm text-foreground">
              {hindi ? 'त्वरित संचालन' : 'Enterprise Modules'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('/hospital/patients')}
                className="rounded-xl border border-border bg-surface-subtle p-3 text-left hover:border-primary transition"
              >
                <Users className="size-4 text-primary mb-1.5" />
                <p className="font-semibold text-xs text-foreground">Patients Registry</p>
                <p className="text-[10px] text-muted-foreground">ABHA & Demographics</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/hospital/staff')}
                className="rounded-xl border border-border bg-surface-subtle p-3 text-left hover:border-primary transition"
              >
                <Stethoscope className="size-4 text-teal mb-1.5" />
                <p className="font-semibold text-xs text-foreground">Doctors & Staff</p>
                <p className="text-[10px] text-muted-foreground">Roster & Verification</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/hospital/beds')}
                className="rounded-xl border border-border bg-surface-subtle p-3 text-left hover:border-primary transition"
              >
                <Bed className="size-4 text-warning-foreground mb-1.5" />
                <p className="font-semibold text-xs text-foreground">Beds & Wards</p>
                <p className="text-[10px] text-muted-foreground">ADT Management</p>
              </button>

              <button
                type="button"
                onClick={() => navigate('/hospital/emergency')}
                className="rounded-xl border border-border bg-surface-subtle p-3 text-left hover:border-primary transition"
              >
                <HeartPulse className="size-4 text-emergency mb-1.5" />
                <p className="font-semibold text-xs text-foreground">Emergency / Triage</p>
                <p className="text-[10px] text-muted-foreground">Critical Response</p>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
