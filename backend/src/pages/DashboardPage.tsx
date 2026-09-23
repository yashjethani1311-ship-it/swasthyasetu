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
  HeartPulse
} from 'lucide-react'

import { Card, EmptyState, Stat } from '@/components/kit'
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

  return <ProviderDashboard />
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
  const [loading, setLoading] = useState(true)
  const [gapError, setGapError] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [profile?.id])

  async function loadDashboard() {
    if (!profile?.id) return

    setLoading(true)

    const { data: patientData, error: patientError } =
      await supabase
        .from('patient_profiles')
        .select(
          `
          id,
          patient_code,
          abha_address,
          abha_number_masked,
          abha_link_status,
          preferred_language
          `
        )
        .eq('user_id', profile.id)
        .maybeSingle()

    if (patientError) {
      console.error('Patient profile error:', patientError)
      setLoading(false)
      return
    }

    if (!patientData) {
      setLoading(false)
      return
    }

    setPatient(patientData)

    /*
      Registration language is used only when this browser
      has not already saved a manual language choice.
    */
    const savedLanguage = localStorage.getItem(
      'swasthyasetu-language'
    )

    if (!savedLanguage) {
      if (patientData.preferred_language === 'Hindi') {
        setLanguage('Hindi')
      } else if (
        patientData.preferred_language === 'English'
      ) {
        setLanguage('English')
      }
    }

    const patientId = patientData.id

    const [
      appointmentsResult,
      recordsResult,
      prescriptionsResult,
      diagnosticsResult,
      gapsResult,
      nextGapResult
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

      supabase.rpc('c1_next_step', {p_patient: patientId})
        .maybeSingle()
    ])

    if (appointmentsResult.error) {
      console.error(
        'Appointments count error:',
        appointmentsResult.error
      )
    }

    if (recordsResult.error) {
      console.error(
        'Health records count error:',
        recordsResult.error
      )
    }

    if (prescriptionsResult.error) {
      console.error(
        'Prescriptions count error:',
        prescriptionsResult.error
      )
    }

    if (diagnosticsResult.error) {
      console.error(
        'Diagnostics count error:',
        diagnosticsResult.error
      )
    }

    if (gapsResult.error) {
      console.error(
        'Care gaps count error:',
        gapsResult.error
      )
    }

    if (nextGapResult.error) {
      console.error(
        'Next care gap error:',
        nextGapResult.error
      )
    }

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

    setLoading(false)
  }

  const hindi = language === 'Hindi'

  const patientName =
    profile?.full_name ||
    (hindi ? 'रोगी' : 'Patient')

  const identity =
    patient?.abha_address ||
    patient?.abha_number_masked ||
    '—'

  const gapDescription = nextGap?.gap_type === 'MEDICINE_COLLECTION_PENDING' ? (hindi ? 'लिखी हुई दवाइयाँ लेने के लिए पर्ची खोलें और दुकान चुनें।' : 'Open your prescription to choose a pharmacy and collect your medicines.') : nextGap?.gap_type === 'FOLLOW_UP_PENDING' ? (hindi ? 'दोबारा हाल जानना बाकी है। इलाज के सफर में इसकी जानकारी देखें।' : 'A follow-up is pending. View its progress in Care history.') : nextGap ? (nextGap.gap_type === 'LAB_REPORT_REVIEW_PENDING' ? (hindi ? 'आपकी रिपोर्ट तैयार है। डॉक्टर ने अभी इसे नहीं देखा है।' : 'Your report is ready and awaiting doctor review.') : (hindi ? 'इलाज से जुड़ा एक काम बाकी है। अपनी देखभाल टीम से बात करें।' : 'A care action is pending. Contact your care team.')) : null
  const nextStepText = gapError ? (hindi ? 'बाकी कामों की जानकारी अभी नहीं मिल रही है।' : 'Pending care information could not be loaded.') : gapDescription
    ? gapDescription
    : hindi
      ? 'अभी आपके इलाज से जुड़ा कोई जरूरी काम बाकी नहीं दिख रहा है।'
      : 'There is no pending care action for you right now.'

  function listenToPage() {
    if (hindi) {
      const message = `
        नमस्ते ${patientName}।
        यह आपका मुख्य स्वास्थ्य पेज है।

        आपके खाते में डॉक्टर से मिलने के
        ${counts.appointments} समय दर्ज हैं।

        आपकी ${counts.records} मेडिकल रिपोर्ट दर्ज हैं।

        डॉक्टर की ${counts.prescriptions} पर्चियाँ दर्ज हैं।

        आपकी ${counts.diagnostics} जाँच दर्ज हैं।

        इलाज से जुड़े ${counts.gaps} जरूरी काम अभी खुले हैं।

        ${gapDescription
          ? `अभी आपके लिए जरूरी अगला काम है। ${gapDescription}`
          : 'अभी आपके इलाज से जुड़ा कोई जरूरी अगला काम नहीं दिख रहा है।'
        }

        नीचे दिए गए विकल्पों से आप डॉक्टर से मिलने का समय ले सकते हैं,
        अपनी मेडिकल रिपोर्ट देख सकते हैं,
        जाँच देख सकते हैं
        और अपनी दवाइयों की जानकारी देख सकते हैं।
      `

      speakText(message, 'Hindi')
      return
    }

    const message = `
      Hello ${patientName}.
      This is your main health page.

      Your account has ${counts.appointments} appointments recorded.

      You have ${counts.records} health records.

      You have ${counts.prescriptions} prescriptions.

      You have ${counts.diagnostics} diagnostic tests recorded.

      You currently have ${counts.gaps} open care actions.

      ${gapDescription
        ? `Your next important care action is: ${gapDescription}`
        : 'There is no pending care action for you right now.'
      }

      You can use the options below to find a doctor,
      view your health records,
      check your tests,
      or view your medicines.
    `

    speakText(message, 'English')
  }

  function listenToNextStep() {
    if (hindi) {
      if (gapDescription) {
        speakText(
          `आपके इलाज में एक जरूरी काम बाकी है। ${gapDescription}`,
          'Hindi'
        )
      } else {
        speakText(
          'अभी आपके इलाज से जुड़ा कोई जरूरी काम बाकी नहीं दिख रहा है।',
          'Hindi'
        )
      }

      return
    }

    speakText(
      gapDescription
        ? `You have a pending care action. ${gapDescription}`
        : 'There is no pending care action for you right now.',
      'English'
    )
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {hindi
          ? 'आपकी जानकारी लोड हो रही है...'
          : 'Loading your care information...'}
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

      {/* WELCOME + PAGE VOICE */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">
            {hindi ? 'नमस्ते' : 'Welcome'}
          </p>

          <h1 className="mt-1 text-2xl font-bold md:text-3xl">
            {patientName}
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {hindi
              ? 'आपके इलाज, डॉक्टर की पर्ची, जाँच और मेडिकल रिपोर्ट की जानकारी एक जगह।'
              : 'Your appointments, prescriptions, tests and health records in one connected care journey.'}
          </p>
        </div>

        <button
          type="button"
          onClick={listenToPage}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary"
        >
          <Volume2 className="size-4" />

          {hindi
            ? 'यह पेज सुनें'
            : 'Listen to this page'}
        </button>
      </section>

      {/* PATIENT IDENTITY */}
      <Card>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
              <UserRound className="size-5 text-primary" />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {hindi ? 'मेरी पहचान' : 'My identity'}
              </p>

              <p className="mt-1 font-semibold">
                {identity}
              </p>

              {patient.patient_code && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {hindi
                    ? 'रोगी नंबर'
                    : 'Patient ID'}
                  :{' '}
                  {patient.patient_code}
                </p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs text-muted-foreground">
              {patient.abha_link_status === 'DEMO'
                ? hindi
                  ? 'डेमो पहचान — सरकारी ABHA से सत्यापित नहीं'
                  : 'Demo identity — not verified with government ABHA'
                : hindi
                  ? 'ABHA की स्थिति'
                  : 'ABHA status'}
            </p>

            <p className="mt-1 text-sm font-semibold">
              {patient.abha_link_status ?? 'NOT_LINKED'}
            </p>
          </div>
        </div>
      </Card>

      {/* QUICK COUNTS */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/appointments')}
        >
          <Stat
            label={
              hindi
                ? 'डॉक्टर से मिलने का समय'
                : 'Appointments'
            }
            value={counts.appointments}
            icon={
              <CalendarCheck className="size-4" />
            }
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/records')}
        >
          <Stat
            label={
              hindi
                ? 'मेरी मेडिकल रिपोर्ट'
                : 'Health Records'
            }
            value={counts.records}
            icon={
              <FileText className="size-4" />
            }
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() =>
            navigate('/prescriptions')
          }
        >
          <Stat
            label={
              hindi
                ? 'डॉक्टर की पर्ची'
                : 'Prescriptions'
            }
            value={counts.prescriptions}
            icon={
              <Stethoscope className="size-4" />
            }
          />
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => navigate('/lab')}
        >
          <Stat
            label={
              hindi
                ? 'जाँच / टेस्ट'
                : 'Diagnostics'
            }
            value={counts.diagnostics}
            icon={
              <Activity className="size-4" />
            }
          />
        </button>

        <Stat
          label={
            hindi
              ? 'बाकी जरूरी काम'
              : 'Open Care Gaps'
          }
          value={counts.gaps}
          icon={
            <HeartPulse className="size-4" />
          }
          tone={
            counts.gaps
              ? 'warning'
              : 'success'
          }
        />
      </div>

      {/* NEXT STEP */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {hindi
                ? 'आपके लिए सबसे जरूरी'
                : 'Your priority'}
            </p>

            <h2 className="mt-1 text-lg font-semibold">
              {hindi
                ? 'अब आपको क्या करना है'
                : 'What should I do next?'}
            </h2>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {nextStepText}
            </p>

            {nextGap?.severity && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide">
                {hindi
                  ? 'जरूरत का स्तर'
                  : 'Priority'}
                :{' '}
                {nextGap.severity}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={listenToNextStep}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary"
          >
            <Volume2 className="size-4" />

            {hindi
              ? 'सुनें'
              : 'Listen'}
          </button>
        </div>
      </Card>

      {/* QUICK ACTIONS */}
      <section>
        <h2 className="text-lg font-semibold">
          {hindi
            ? 'आप क्या करना चाहते हैं?'
            : 'What would you like to do?'}
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

          <QuickAction
            icon={
              <CalendarCheck className="size-5" />
            }
            title={
              hindi
                ? 'डॉक्टर से मिलें'
                : 'See a doctor'
            }
            description={
              hindi
                ? 'डॉक्टर खोजें और मिलने का समय लें'
                : 'Find a doctor and book an appointment'
            }
            onClick={() =>
              navigate('/appointments')
            }
          />

          <QuickAction
            icon={
              <FileText className="size-5" />
            }
            title={
              hindi
                ? 'मेडिकल रिपोर्ट देखें'
                : 'Health records'
            }
            description={
              hindi
                ? 'पुरानी रिपोर्ट देखें या नई रिपोर्ट जोड़ें'
                : 'View or upload your health records'
            }
            onClick={() =>
              navigate('/records')
            }
          />

          <QuickAction
            icon={
              <Activity className="size-5" />
            }
            title={
              hindi
                ? 'जाँच देखें'
                : 'My tests'
            }
            description={
              hindi
                ? 'डॉक्टर ने कौन सी जाँच लिखी है, देखें'
                : 'Check diagnostic tests ordered for you'
            }
            onClick={() =>
              navigate('/lab')
            }
          />

          <QuickAction
            icon={
              <Pill className="size-5" />
            }
            title={
              hindi
                ? 'मेरी दवाइयाँ'
                : 'My medicines'
            }
            description={
              hindi
                ? 'दवाइयों और पर्ची की जानकारी देखें'
                : 'View medicines and prescription information'
            }
            onClick={() =>
              navigate('/medicines')
            }
          />
        </div>
      </section>
    </div>
  )
}

function QuickAction({
  icon,
  title,
  description,
  onClick
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-4 text-left transition hover:bg-secondary/60"
    >
      <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
        {icon}
      </div>

      <p className="mt-4 font-semibold">
        {title}
      </p>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </button>
  )
}

function ProviderDashboard() {
  const { profile } = useAuth()
  const { language } = useLanguage()

  const [provider, setProvider] =
    useState<any>(null)

  const [loading, setLoading] =
    useState(true)

  const hindi = language === 'Hindi'

  useEffect(() => {
    if (!profile?.id) return

    supabase
      .from('provider_profiles')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error(
            'Provider profile error:',
            error
          )
        }

        setProvider(data)
        setLoading(false)
      })
  }, [profile?.id])

  return (
    <div>
      <h1 className="text-2xl font-bold">
        {hindi
          ? `${profile?.role} कार्यक्षेत्र`
          : `${profile?.role} workspace`}
      </h1>

      <p className="mt-1 text-sm text-muted-foreground">
        {hindi
          ? 'यहाँ केवल SwasthyaSetu में बने वास्तविक रिकॉर्ड और काम दिखाई देंगे।'
          : 'Only real records and assigned work created in SwasthyaSetu appear here.'}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">

        <Stat
          label={
            hindi
              ? 'सत्यापन'
              : 'Verification'
          }
          value={
            loading
              ? '—'
              : provider?.verification_status ??
              'PENDING'
          }
          icon={
            <ShieldCheck className="size-4" />
          }
        />

        <Stat
          label={
            hindi
              ? 'मिला हुआ काम'
              : 'Assigned work'
          }
          value="0"
          icon={
            <Activity className="size-4" />
          }
        />

        <Stat
          label={
            hindi
              ? 'मौजूदा रोगी'
              : 'Active patients'
          }
          value="0"
          icon={
            <Pill className="size-4" />
          }
        />
      </div>

      <Card className="mt-6">
        <EmptyState
          text={
            provider?.verification_status ===
              'APPROVED'
              ? hindi
                ? 'अभी आपको कोई काम नहीं दिया गया है।'
                : 'No work has been assigned yet.'
              : hindi
                ? 'सत्यापन पूरा होने तक डॉक्टर या स्वास्थ्य सेवा से जुड़े काम बंद रहेंगे।'
                : 'Clinical/provider actions remain locked until provider verification is approved.'
          }
        />
      </Card>
    </div>
  )
}