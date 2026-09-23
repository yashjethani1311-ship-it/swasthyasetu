import { useEffect, useState } from 'react'
import {
  Activity,
  CalendarCheck,
  FileText,
  Pill,
  ShieldCheck,
  Stethoscope,
  Volume2,
  UserRound,
  HeartPulse,
  Clock,
  Building2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Sparkles
} from 'lucide-react'

import { Badge, Button, Card, EmptyState, PriorityBadge, SectionTitle, Stat, StatusBadge } from '@/components/kit'
import { SwasthyaCopilot } from '@/components/SwasthyaCopilot'
import { DoctorClinicalDashboard } from '@/components/doctor/DoctorClinicalDashboard'
import { HospitalCommandCenter } from '@/components/hospital/HospitalCommandCenter'
import { CareJourneyVisualizer } from '@/components/patient/CareJourneyVisualizer'

import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'
import { navigate } from '@/lib/route'

export function DashboardPage() {
  const { profile } = useAuth()

  if (!profile) return null

  if (profile.role === 'PATIENT') {
    return <PatientDashboard />
  }

  if (profile.role === 'DOCTOR') {
    return <DoctorClinicalDashboard />
  }

  if (profile.role === 'FACILITY' || profile.role === 'ADMIN') {
    return <HospitalCommandCenter />
  }

  return <AncillaryProviderDashboard />
}

type PatientData = {
  id: string
  patient_code: string | null
  abha_address: string | null
  abha_number_masked: string | null
  abha_link_status: string | null
  preferred_language: string | null
}

type Counts = {
  appointments: number
  records: number
  prescriptions: number
  diagnostics: number
  gaps: number
}

type CareGap = {
  id: string
  gap_type: string | null
  description?: string | null
  status: string | null
  severity: string | null
}

type UpcomingAppointment = {
  id: string
  scheduled_at: string
  mode: string
  status: string
  reason: string | null
  doctor_name: string
  specialization: string | null
}

type PendingDiagnostic = {
  id: string
  test_name: string
  ordered_at: string
  status: string
  doctor_reviewed_at: string | null
}

function PatientDashboard() {
  const { profile } = useAuth()
  const { language, setLanguage } = useLanguage()

  const [patient, setPatient] = useState<PatientData | null>(null)
  const [counts, setCounts] = useState<Counts>({
    appointments: 0,
    records: 0,
    prescriptions: 0,
    diagnostics: 0,
    gaps: 0
  })

  const [nextGap, setNextGap] = useState<CareGap | null>(null)
  const [upcomingAppt, setUpcomingAppt] = useState<UpcomingAppointment | null>(null)
  const [pendingDiag, setPendingDiag] = useState<PendingDiagnostic | null>(null)
  const [activeMedsCount, setActiveMedsCount] = useState(0)

  const [loading, setLoading] = useState(true)
  const [gapError, setGapError] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [profile?.id])

  async function loadDashboard() {
    if (!profile?.id) return
    setLoading(true)

    const { data: patientData, error: patientError } = await supabase
      .from('patient_profiles')
      .select(`
        id,
        patient_code,
        abha_address,
        abha_number_masked,
        abha_link_status,
        preferred_language
      `)
      .eq('user_id', profile.id)
      .maybeSingle()

    if (patientError || !patientData) {
      console.error('Patient profile error:', patientError)
      setLoading(false)
      return
    }

    setPatient(patientData)

    const savedLanguage = localStorage.getItem('swasthyasetu-language')
    if (!savedLanguage) {
      if (patientData.preferred_language === 'Hindi') {
        setLanguage('Hindi')
      } else if (patientData.preferred_language === 'English') {
        setLanguage('English')
      }
    }

    const patientId = patientData.id
    const nowIso = new Date().toISOString()

    const [
      appointmentsResult,
      recordsResult,
      prescriptionsResult,
      diagnosticsResult,
      gapsResult,
      nextGapResult,
      upcomingApptResult,
      pendingDiagResult,
      activeMedsResult
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId),

      supabase
        .from('health_records')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId),

      supabase
        .from('prescriptions')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId),

      supabase
        .from('lab_orders')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId),

      supabase
        .from('care_gaps')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .eq('status', 'OPEN'),

      supabase.rpc('c1_next_step', { p_patient: patientId }).maybeSingle(),

      // Upcoming appointment
      supabase
        .from('appointments')
        .select(`
          id,
          scheduled_at,
          mode,
          status,
          reason,
          provider_profiles(full_name, specialization)
        `)
        .eq('patient_id', patientId)
        .gte('scheduled_at', nowIso)
        .not('status', 'in', '("CANCELLED","COMPLETED")')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle(),

      // Pending diagnostics
      supabase
        .from('lab_orders')
        .select(`
          id,
          test_name,
          ordered_at,
          status,
          lab_results(doctor_reviewed_at)
        `)
        .eq('patient_id', patientId)
        .order('ordered_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Active prescriptions items count
      supabase
        .from('prescriptions')
        .select('id, prescription_items(id)')
        .eq('patient_id', patientId)
        .in('status', ['ACTIVE', 'PARTIALLY DISPENSED'])
    ])

    setCounts({
      appointments: appointmentsResult.count ?? 0,
      records: recordsResult.count ?? 0,
      prescriptions: prescriptionsResult.count ?? 0,
      diagnostics: diagnosticsResult.count ?? 0,
      gaps: gapsResult.count ?? 0
    })

    if (!nextGapResult.error) {
      setGapError(false)
      setNextGap(nextGapResult.data as CareGap | null)
    } else {
      setGapError(true)
      setNextGap(null)
    }

    if (upcomingApptResult.data) {
      const u: any = upcomingApptResult.data
      setUpcomingAppt({
        id: u.id,
        scheduled_at: u.scheduled_at,
        mode: u.mode,
        status: u.status,
        reason: u.reason,
        doctor_name: u.provider_profiles?.full_name ?? 'Doctor',
        specialization: u.provider_profiles?.specialization ?? 'General'
      })
    }

    if (pendingDiagResult.data) {
      const d: any = pendingDiagResult.data
      const lr = Array.isArray(d.lab_results) ? d.lab_results[0] : d.lab_results
      setPendingDiag({
        id: d.id,
        test_name: d.test_name,
        ordered_at: d.ordered_at,
        status: d.status,
        doctor_reviewed_at: lr?.doctor_reviewed_at ?? null
      })
    }

    if (activeMedsResult.data) {
      const totalItems = activeMedsResult.data.reduce((acc, rx: any) => {
        const count = Array.isArray(rx.prescription_items) ? rx.prescription_items.length : 0
        return acc + count
      }, 0)
      setActiveMedsCount(totalItems)
    }

    setLoading(false)
  }

  const hindi = language === 'Hindi'
  const patientName = profile?.full_name || (hindi ? 'रोगी' : 'Patient')

  const gapDescription =
    nextGap?.gap_type === 'MEDICINE_COLLECTION_PENDING'
      ? hindi
        ? 'लिखी हुई दवाइयाँ लेने के लिए पर्ची खोलें और दुकान चुनें।'
        : 'Open your prescription to choose a pharmacy and collect your medicines.'
      : nextGap?.gap_type === 'FOLLOW_UP_PENDING'
        ? hindi
          ? 'दोबारा हाल जानना बाकी है। इलाज के सफर में इसकी जानकारी देखें।'
          : 'A follow-up is pending. View its progress in Care history.'
        : nextGap
          ? nextGap.gap_type === 'LAB_REPORT_REVIEW_PENDING'
            ? hindi
              ? 'आपकी रिपोर्ट तैयार है। डॉक्टर ने अभी इसे नहीं देखा है।'
              : 'Your report is ready and awaiting doctor review.'
            : hindi
              ? 'इलाज से जुड़ा एक काम बाकी है। अपनी देखभाल टीम से बात करें।'
              : 'A care action is pending. Contact your care team.'
          : null

  const nextStepText = gapError
    ? hindi
      ? 'बाकी कामों की जानकारी अभी नहीं मिल रही है।'
      : 'Pending care information could not be loaded.'
    : gapDescription ||
      (hindi
        ? 'अभी आपके इलाज से जुड़ा कोई जरूरी काम बाकी नहीं दिख रहा है।'
        : 'There is no pending care action for you right now.')

  function listenToPage() {
    const message = hindi
      ? `नमस्ते ${patientName}। आपके खाते में डॉक्टर से मिलने के ${counts.appointments} समय दर्ज हैं। ${counts.records} मेडिकल रिपोर्ट, ${counts.prescriptions} पर्चियाँ और ${counts.diagnostics} जाँच दर्ज हैं। ${gapDescription ? `अगला जरूरी काम: ${gapDescription}` : ''}`
      : `Hello ${patientName}. You have ${counts.appointments} appointments, ${counts.records} health records, ${counts.prescriptions} prescriptions, and ${counts.diagnostics} diagnostic orders. ${gapDescription ? `Next priority action: ${gapDescription}` : ''}`
    speakText(message, language)
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {hindi ? 'आपकी जानकारी लोड हो रही है...' : 'Loading your healthcare journey…'}
      </div>
    )
  }

  if (!patient) {
    return (
      <Card>
        <EmptyState
          text={
            hindi
              ? 'आपकी रोगी प्रोफ़ाइल नहीं मिली। कृपया दोबारा लॉगिन करें।'
              : 'Your patient profile could not be found. Please sign in again.'
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. WELCOME + PATIENT IDENTITY BAR */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">
            {hindi ? 'नमस्ते' : 'Welcome back,'}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold md:text-3xl text-foreground tracking-tight">
            {patientName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'आपके इलाज, दवाइयों, जाँच और मेडिकल रिपोर्ट की संपूर्ण जानकारी।'
              : 'Your connected healthcare journey, active prescriptions, and records.'}
          </p>
        </div>

        <button
          type="button"
          onClick={listenToPage}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <Volume2 className="size-4 text-primary" />
          <span>{hindi ? 'पेज सुनें' : 'Listen to page'}</span>
        </button>
      </section>

      {/* 2. NEXT STEP (PROMINENT CLINICAL PRIORITY) */}
      <Card tinted className="border-primary/30 bg-primary/5 p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="label-xs font-bold text-primary">
                {hindi ? 'आपके लिए सबसे जरूरी' : 'Priority Action'}
              </span>
              {nextGap?.severity && <PriorityBadge priority={nextGap.severity} />}
            </div>

            <h2 className="text-lg font-bold text-foreground">
              {hindi ? 'अब आपको क्या करना है?' : 'What Should I Do Next?'}
            </h2>

            <p className="text-sm leading-relaxed text-muted-foreground pt-1">
              {nextStepText}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {nextGap?.gap_type === 'MEDICINE_COLLECTION_PENDING' ? (
              <Button size="sm" onClick={() => navigate('/prescriptions')}>
                <Pill className="size-3.5 mr-1" />
                {hindi ? 'दवाइयाँ लें' : 'Collect Medicines'}
              </Button>
            ) : nextGap?.gap_type === 'FOLLOW_UP_PENDING' ? (
              <Button size="sm" onClick={() => navigate('/care')}>
                <Clock className="size-3.5 mr-1" />
                {hindi ? 'फॉलो-अप देखें' : 'View Follow-up'}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate('/care')}>
                {hindi ? 'केयर टाइमलाइन' : 'Care History'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 3. QUICK STATS (CLICKABLE TO RESPECTIVE SECTIONS) */}
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/appointments')}
        >
          <Stat
            label={hindi ? 'अपॉइंटमेंट्स' : 'Appointments'}
            value={counts.appointments}
            icon={<CalendarCheck className="size-4" />}
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/medicines')}
        >
          <Stat
            label={hindi ? 'सक्रिय दवाइयाँ' : 'Active Medicines'}
            value={activeMedsCount}
            tone="teal"
            icon={<Pill className="size-4" />}
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/lab')}
        >
          <Stat
            label={hindi ? 'जाँच / टेस्ट' : 'Diagnostics'}
            value={counts.diagnostics}
            icon={<Activity className="size-4" />}
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/records')}
        >
          <Stat
            label={hindi ? 'मेडिकल रिपोर्ट' : 'Health Records'}
            value={counts.records}
            icon={<FileText className="size-4" />}
          />
        </button>

        <Stat
          label={hindi ? 'बाकी जरूरी काम' : 'Open Care Gaps'}
          value={counts.gaps}
          tone={counts.gaps ? 'warning' : 'success'}
          icon={<HeartPulse className="size-4" />}
        />
      </div>

      {/* 4. UPCOMING APPOINTMENT & DIAGNOSTICS DUAL STATUS CARDS */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* UPCOMING APPOINTMENT */}
        <Card className="space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <CalendarCheck className="size-4 text-primary" />
                <span>{hindi ? 'आगामी अपॉइंटमेंट' : 'Upcoming Appointment'}</span>
              </h3>
              {upcomingAppt && <StatusBadge status={upcomingAppt.status} />}
            </div>

            {upcomingAppt ? (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-base font-bold text-foreground">
                  Dr. {upcomingAppt.doctor_name}
                </p>
                <p className="text-primary font-medium">
                  {upcomingAppt.specialization} · {upcomingAppt.mode}
                </p>
                <p className="text-muted-foreground font-tabular flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {new Date(upcomingAppt.scheduled_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })}
                </p>
                {upcomingAppt.reason && (
                  <p className="text-muted-foreground">
                    Reason: {upcomingAppt.reason}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground italic">
                {hindi
                  ? 'वर्तमान में कोई आगामी अपॉइंटमेंट तय नहीं है।'
                  : 'No upcoming appointments scheduled.'}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-border flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/appointments')}
            >
              {upcomingAppt
                ? (hindi ? 'अपॉइंटमेंट विवरण' : 'View Appointment')
                : (hindi ? 'नया समय लें' : 'Book Appointment')}
              <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </Card>

        {/* RECENT DIAGNOSTIC ORDER & REVIEW STATUS */}
        <Card className="space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Activity className="size-4 text-teal" />
                <span>{hindi ? 'हालिया जाँच व रिपोर्ट स्थिति' : 'Latest Diagnostic Order'}</span>
              </h3>
              {pendingDiag && <StatusBadge status={pendingDiag.status} />}
            </div>

            {pendingDiag ? (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-base font-bold text-foreground">
                  {pendingDiag.test_name}
                </p>
                <p className="text-muted-foreground">
                  Ordered: {new Date(pendingDiag.ordered_at).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-semibold text-foreground">
                    {hindi ? 'डॉक्टर समीक्षा:' : 'Physician Review:'}
                  </span>
                  {pendingDiag.doctor_reviewed_at ? (
                    <Badge tone="success">{hindi ? 'समीक्षित' : 'Reviewed'}</Badge>
                  ) : (
                    <Badge tone="warning">{hindi ? 'समीक्षा लंबित' : 'Review Pending'}</Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground italic">
                {hindi
                  ? 'कोई जाँच ऑर्डर दर्ज नहीं है।'
                  : 'No diagnostic tests ordered recently.'}
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-border flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/lab')}
            >
              {hindi ? 'सभी जाँच देखें' : 'View Diagnostics'}
              <ChevronRight className="size-3.5 ml-1" />
            </Button>
          </div>
        </Card>
      </div>

      {/* 5. CONNECTED CARE JOURNEY VISUALIZER */}
      <CareJourneyVisualizer patientId={patient.id} />

      {/* 6. SWASTHYA COPILOT GROUNDED AI SURFACE */}
      <SwasthyaCopilot
        patientId={patient.id}
        workflow="PATIENT_HOME"
        title={hindi ? 'स्वास्थ सेतु एआई सहायक' : 'SwasthyaCopilot Health Assistant'}
        subtitle={hindi ? 'अपने सत्यापित रिकॉर्ड से स्वास्थ्य संबंधी सवाल पूछें' : 'Ask questions grounded in your verified clinical history'}
        suggestions={
          hindi
            ? [
                'मेरी चालू दवाइयाँ और उनकी खुराक क्या है?',
                'मेरी पिछली जाँच के मुख्य नतीजे क्या थे?',
                'क्या कोई फॉलो-अप या टेस्ट बाकी है?'
              ]
            : [
                'What active medicines am I taking and when?',
                'Summary of recent lab test observations',
                'Are there any pending doctor reviews or follow-ups?'
              ]
        }
      />

      {/* 7. PRIMARY WORKFLOW SHORTCUTS */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {hindi ? 'आप क्या करना चाहते हैं?' : 'Healthcare Actions'}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => navigate('/doctors')}
            className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-secondary/40 shadow-2xs"
          >
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope className="size-5" />
            </div>
            <p className="mt-3.5 font-bold text-sm text-foreground">
              {hindi ? 'डॉक्टर खोजें' : 'Find a Doctor'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hindi ? 'डॉक्टर खोजें और समय बुक करें' : 'Find listed doctors & book slots'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/facilities')}
            className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-secondary/40 shadow-2xs"
          >
            <div className="grid size-10 place-items-center rounded-xl bg-teal/15 text-teal">
              <Building2 className="size-5" />
            </div>
            <p className="mt-3.5 font-bold text-sm text-foreground">
              {hindi ? 'स्वास्थ्य केंद्र' : 'Hospitals & Clinics'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hindi ? 'नजदीकी PHC, CHC व अस्पताल' : 'Find listed health centres & labs'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/medicines')}
            className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-secondary/40 shadow-2xs"
          >
            <div className="grid size-10 place-items-center rounded-xl bg-success/15 text-success">
              <Pill className="size-5" />
            </div>
            <p className="mt-3.5 font-bold text-sm text-foreground">
              {hindi ? 'मेरी दवाइयाँ' : 'My Medicines'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hindi ? 'दैनिक खुराक, समय व निर्देश' : 'Track daily doses, timings & instructions'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate('/records')}
            className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-secondary/40 shadow-2xs"
          >
            <div className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <FileText className="size-5" />
            </div>
            <p className="mt-3.5 font-bold text-sm text-foreground">
              {hindi ? 'मेडिकल रिपोर्ट' : 'Health Records'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hindi ? 'डिजिटल पर्चियाँ व रिपोर्ट अपलोड' : 'Access records & upload documents'}
            </p>
          </button>
        </div>
      </section>
    </div>
  )
}

function AncillaryProviderDashboard() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl text-foreground">
          {profile?.role} Workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hindi
            ? 'यहाँ केवल SwasthyaSetu में बने वास्तविक रिकॉर्ड और काम दिखाई देंगे।'
            : 'Operational queue and assigned workflow tasks.'}
        </p>
      </div>

      <Card className="p-6">
        <EmptyState
          text={
            hindi
              ? 'कार्यक्षेत्र तैयार है। नेविगेशन मेनू से संबंधित मॉड्यूल चुनें।'
              : 'Select your assigned workflow from the navigation sidebar.'
          }
        />
      </Card>
    </div>
  )
}
