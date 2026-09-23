import { DirectoryPicker } from '@/components/DirectoryPicker'
import { TestCatalogPicker } from '@/components/TestCatalogPicker'
import { useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardPlus,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  UserCheck,
  UserRound,
  Video,
  GitFork,
  Volume2
} from 'lucide-react'
import { PrintablePrescription } from '@/components/clinical/PrintablePrescription'
import { MedicineMasterPicker, type MasterMedicine } from '@/components/clinical/MedicineMasterPicker'
import { DiagnosticMasterPicker, type MasterDiagnosticTest } from '@/components/clinical/DiagnosticMasterPicker'
import { VoiceInputButton } from '@/components/voice/VoiceInputButton'

import {
  Badge,
  Button,
  Card,
  ClinicalTable,
  EmptyState,
  PriorityBadge,
  SectionTitle,
  SegmentedTabs,
  StatusBadge
} from '@/components/kit'
import { SwasthyaCopilot } from '@/components/SwasthyaCopilot'
import { TeleconsultRoom } from '@/components/TeleconsultRoom'

import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { navigate } from '@/lib/route'
import { speakText } from '@/lib/voice'
import { supabase } from '@/lib/supabase'
import { errorText, rpc, observationsOf } from '@/lib/diagnostics/service'
import {
  validateAndNormalizeEncounterVitals,
  normalizeSpO2,
  normalizePulse,
  normalizeSystolicBP,
  normalizeDiastolicBP,
  normalizeTemperature,
  normalizeWeight,
  normalizeFollowUpDays,
  formatDatabaseError
} from '@/lib/vitals'

type Appointment = {
  id: string
  patient_id: string
  doctor_provider_id: string
  scheduled_at: string
  mode: string
  status: string
  reason: string | null
  patient_note: string | null

  patient_profiles?: {
    patient_code?: string | null
    full_name?: string | null
    abha_number_masked?: string | null
    abha_link_status?: string | null
    sex?: string | null
    date_of_birth?: string | null
  } | null

  provider_practices?: {
    practice_name?: string | null
  } | null
}

type Encounter = {
  id: string
  appointment_id: string
  patient_id: string
  doctor_provider_id: string
  status: string

  chief_complaint: string | null
  symptoms: string | null

  temperature_c: number | null
  pulse_bpm: number | null
  systolic_bp: number | null
  diastolic_bp: number | null
  spo2_percent: number | null
  weight_kg: number | null

  diagnosis: string | null
  clinical_notes: string | null
  follow_up_in_days: number | null

  started_at: string
  completed_at: string | null
}

type MedicineDraft = {
  quantity_prescribed: string
  medicine_name: string
  strength: string
  dose: string
  route: string
  frequency: string
  duration: string
  instructions: string
}

const emptyMedicine: MedicineDraft = {
  quantity_prescribed: '',
  medicine_name: '',
  strength: '',
  dose: '',
  route: 'ORAL',
  frequency: '',
  duration: '',
  instructions: ''
}

export function EncounterPage() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('clinical')

  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Clinical form state
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [temperature, setTemperature] = useState('')
  const [pulse, setPulse] = useState('')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [spo2, setSpo2] = useState('')
  const [weight, setWeight] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [followUpDays, setFollowUpDays] = useState('')
  const [vitalErrors, setVitalErrors] = useState<Record<string, string>>({})

  const [medicines, setMedicines] = useState<MedicineDraft[]>([{ ...emptyMedicine }])
  const [labTests, setLabTests] = useState<string[]>([''])
  const [diagnosticMode, setDiagnosticMode] = useState<'PATHOLOGY' | 'IMAGING' | 'PROCEDURE'>('PATHOLOGY')
  const [showMedicineMaster, setShowMedicineMaster] = useState(false)
  const [showDiagnosticMaster, setShowDiagnosticMaster] = useState(false)

  // Closed-loop referral state (migration 024 r4_create)
  const [referralFacility, setReferralFacility] = useState('')
  const [referralDoctor, setReferralDoctor] = useState('')
  const [referralReason, setReferralReason] = useState('')
  const [referralUrgency, setReferralUrgency] = useState<'ROUTINE' | 'HIGH' | 'CRITICAL'>('ROUTINE')
  const [referralBusy, setReferralBusy] = useState(false)
  const [referralSuccess, setReferralSuccess] = useState('')

  // Longitudinal patient history state (loaded via c1_care_context)
  const [careContext, setCareContext] = useState<any>(null)
  const [careLoading, setCareLoading] = useState(false)
  const [showPrintRx, setShowPrintRx] = useState(false)
  const [doctorProfile, setDoctorProfile] = useState<{
    full_name?: string | null
    specialization?: string | null
    registration_id?: string | null
    hpr_id?: string | null
  } | null>(null)

  useEffect(() => {
    void loadEncounter()
  }, [profile?.id])

  async function loadEncounter() {
    if (!profile?.id) return
    setLoading(true)
    setErrorMessage('')

    const appointmentId = sessionStorage.getItem('swasthyasetu-active-appointment')

    if (!appointmentId) {
      setErrorMessage(
        hindi
          ? 'कोई मरीज का समय नहीं चुना गया है। कृपया अपॉइंटमेंट सूची से मरीज चुनें।'
          : 'No appointment was selected. Please select a patient from your appointment queue.'
      )
      setLoading(false)
      return
    }

    const { data: provider, error: providerError } = await supabase
      .from('provider_profiles')
      .select('id, provider_type, verification_status, full_name, specialization, registration_id, hpr_id')
      .eq('user_id', profile.id)
      .maybeSingle()

    if (providerError || !provider || provider.provider_type !== 'DOCTOR') {
      setErrorMessage(hindi ? 'डॉक्टर की प्रोफ़ाइल नहीं मिली।' : 'Doctor profile could not be found.')
      setLoading(false)
      return
    }

    if (provider.verification_status !== 'APPROVED') {
      setErrorMessage(hindi ? 'डॉक्टर का खाता अभी स्वीकृत नहीं है।' : 'Doctor account is not approved.')
      setLoading(false)
      return
    }

    setProviderId(provider.id)
    setDoctorProfile({
      full_name: provider.full_name,
      specialization: provider.specialization,
      registration_id: provider.registration_id,
      hpr_id: provider.hpr_id
    })

    const { data: appointmentData, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        doctor_provider_id,
        scheduled_at,
        mode,
        status,
        reason,
        patient_note,
        patient_profiles(
          patient_code,
          full_name,
          abha_number_masked,
          abha_link_status,
          sex,
          date_of_birth
        ),
        provider_practices(
          practice_name
        )
      `)
      .eq('id', appointmentId)
      .eq('doctor_provider_id', provider.id)
      .maybeSingle()

    if (appointmentError || !appointmentData) {
      setErrorMessage(
        appointmentError?.message ??
          (hindi ? 'मरीज का समय नहीं मिला।' : 'Appointment could not be found.')
      )
      setLoading(false)
      return
    }

    const appointmentRow = appointmentData as unknown as Appointment

    if (!['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(appointmentRow.status)) {
      setErrorMessage(
        hindi
          ? 'इस मरीज का समय consultation के लिए तैयार नहीं है।'
          : 'This appointment is not ready for consultation.'
      )
      setLoading(false)
      return
    }

    setAppointment(appointmentRow)

    // Load existing encounter or start new one
    const { data: existingEncounter, error: encounterError } = await supabase
      .from('encounters')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (encounterError) {
      setErrorMessage(encounterError.message)
      setLoading(false)
      return
    }

    if (existingEncounter) {
      const row = existingEncounter as Encounter
      setEncounter(row)
      populateEncounter(row)
      setLoading(false)
      void loadLongitudinalHistory(appointmentRow.patient_id)
      return
    }

    if (appointmentRow.status === 'COMPLETED') {
      setErrorMessage(
        hindi ? 'यह consultation पहले ही पूरा हो चुका है।' : 'This consultation has already been completed.'
      )
      setLoading(false)
      return
    }

    // Start encounter atomically via a2_start_encounter
    const { data: newEncounter, error: createError } = await supabase.rpc('a2_start_encounter', {
      p_appointment: appointmentId
    })

    if (createError || !newEncounter) {
      setErrorMessage(createError?.message ?? 'Could not start consultation.')
      setLoading(false)
      return
    }

    const row = newEncounter as Encounter
    setEncounter(row)
    populateEncounter(row)
    setAppointment({ ...appointmentRow, status: 'IN_PROGRESS' })
    setLoading(false)
    void loadLongitudinalHistory(appointmentRow.patient_id)
  }

  async function loadLongitudinalHistory(patientId: string) {
    setCareLoading(true)
    try {
      const res = await rpc<any>('c1_care_context', {
        p_patient: patientId,
        p_offset: 0
      })
      setCareContext(res)
    } catch (e: unknown) {
      console.warn('Longitudinal history load note:', e)
    } finally {
      setCareLoading(false)
    }
  }

  function populateEncounter(row: Encounter) {
    setChiefComplaint(row.chief_complaint ?? '')
    setSymptoms(row.symptoms ?? '')
    setTemperature(row.temperature_c?.toString() ?? '')
    setPulse(row.pulse_bpm?.toString() ?? '')
    setSystolic(row.systolic_bp?.toString() ?? '')
    setDiastolic(row.diastolic_bp?.toString() ?? '')
    setSpo2(row.spo2_percent?.toString() ?? '')
    setWeight(row.weight_kg?.toString() ?? '')
    setDiagnosis(row.diagnosis ?? '')
    setClinicalNotes(row.clinical_notes ?? '')
    setFollowUpDays(row.follow_up_in_days?.toString() ?? '')
  }

  async function handleCreateReferral() {
    if (!referralFacility || !referralDoctor || referralReason.trim().length < 10) {
      setErrorMessage(
        hindi
          ? 'कृपया अस्पताल, डॉक्टर और कम से कम 10 अक्षरों का कारण लिखें।'
          : 'Destination facility, doctor and at least 10 characters reason are required.'
      )
      return
    }
    setReferralBusy(true)
    setReferralSuccess('')
    setErrorMessage('')
    try {
      let epId = careContext?.episodes?.[0]?.id
      if (!epId && encounter?.id) {
        const { data: ep } = await supabase
          .from('care_episodes')
          .select('id')
          .eq('encounter_id', encounter.id)
          .maybeSingle()
        epId = ep?.id
      }
      if (!epId) {
        throw new Error(
          hindi
            ? 'केयर एपिसोड शुरू नहीं हुआ है। पहले परामर्श ड्राफ्ट सहेजें।'
            : 'Care episode not yet linked. Please save consultation draft first.'
        )
      }

      const reqKey = crypto.randomUUID()
      const { error } = await supabase.rpc('r4_create', {
        p_episode: epId,
        p_facility: referralFacility,
        p_department: null,
        p_doctor: referralDoctor,
        p_reason: referralReason.trim(),
        p_urgency: referralUrgency,
        p_request: reqKey
      })

      if (error) throw error

      setReferralSuccess(
        hindi
          ? 'रेफरल सफलतापूर्वक दर्ज किया गया।'
          : 'Closed-loop referral initiated and tracked in CareGraph.'
      )
      setReferralReason('')
      setReferralFacility('')
      setReferralDoctor('')
    } catch (e: any) {
      setErrorMessage(e?.message || String(e))
    } finally {
      setReferralBusy(false)
    }
  }

  function nullableNumber(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  async function saveEncounter(showMessage = true) {
    if (!encounter) return false

    setErrorMessage('')
    setSuccessMessage('')

    // Defensively validate and normalize all optional vitals before submission
    const vitalsResult = validateAndNormalizeEncounterVitals(
      {
        temperature,
        pulse,
        systolic,
        diastolic,
        spo2,
        weight,
        followUpDays
      },
      hindi
    )

    setVitalErrors(vitalsResult.errors)

    if (!vitalsResult.isValid) {
      const firstError = Object.values(vitalsResult.errors)[0]
      setErrorMessage(
        firstError ||
          (hindi
            ? 'कृपया अमान्य शारीरिक माप ठीक करें।'
            : 'Please correct the invalid vital signs before saving.')
      )
      return false
    }

    setSaving(true)

    const { error } = await supabase
      .from('encounters')
      .update({
        chief_complaint: chiefComplaint.trim() || null,
        symptoms: symptoms.trim() || null,
        temperature_c: vitalsResult.values.temperature_c,
        pulse_bpm: vitalsResult.values.pulse_bpm,
        systolic_bp: vitalsResult.values.systolic_bp,
        diastolic_bp: vitalsResult.values.diastolic_bp,
        spo2_percent: vitalsResult.values.spo2_percent,
        weight_kg: vitalsResult.values.weight_kg,
        diagnosis: diagnosis.trim() || null,
        clinical_notes: clinicalNotes.trim() || null,
        follow_up_in_days: vitalsResult.values.follow_up_in_days,
        updated_at: new Date().toISOString()
      })
      .eq('id', encounter.id)
      .select('id')
      .single()

    if (error) {
      console.error('Encounter save error:', error)
      setErrorMessage(formatDatabaseError(error, hindi))
      setSaving(false)
      return false
    }

    if (showMessage) {
      setSuccessMessage(
        hindi ? 'Consultation का मसौदा सुरक्षित हो गया।' : 'Consultation draft saved successfully.'
      )
    }

    setSaving(false)
    return true
  }

  function addMedicine() {
    setMedicines(cur => [...cur, { ...emptyMedicine }])
  }

  function updateMedicine(index: number, field: keyof MedicineDraft, value: string) {
    setMedicines(cur =>
      cur.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    )
  }

  function removeMedicine(index: number) {
    setMedicines(cur => (cur.length === 1 ? [{ ...emptyMedicine }] : cur.filter((_, i) => i !== index)))
  }

  function addLabTest() {
    setLabTests(cur => [...cur, ''])
  }

  function updateLabTest(index: number, value: string) {
    setLabTests(cur => cur.map((t, i) => (i === index ? value : t)))
  }

  function removeLabTest(index: number) {
    setLabTests(cur => (cur.length === 1 ? [''] : cur.filter((_, i) => i !== index)))
  }

  function handleSelectMasterMedicine(m: MasterMedicine) {
    setMedicines(prev => {
      const last = prev[prev.length - 1]
      const isLastEmpty = last && !last.medicine_name.trim() && !last.strength.trim()
      const newItem: MedicineDraft = {
        medicine_name: m.medicine_name,
        strength: m.strength || '',
        dose: '1 tab/dose',
        route: m.route || 'ORAL',
        frequency: m.common_frequencies?.[0] || 'Twice daily',
        duration: '5 days',
        quantity_prescribed: '10',
        instructions: m.brand_name ? `Brand reference: ${m.brand_name}` : 'As directed'
      }
      if (isLastEmpty) {
        return [...prev.slice(0, -1), newItem]
      }
      return [...prev, newItem]
    })
    setShowMedicineMaster(false)
  }

  function handleSelectMasterDiagnostic(t: MasterDiagnosticTest) {
    setDiagnosticMode(t.category)
    setLabTests(prev => {
      const clean = prev.filter(Boolean)
      if (!clean.includes(t.test_name)) {
        return [...clean, t.test_name]
      }
      return prev
    })
    setShowDiagnosticMaster(false)
  }

  async function completeConsultation() {
    if (!encounter || !appointment || saving) return

    if (!chiefComplaint.trim() || (!diagnosis.trim() && !clinicalNotes.trim())) {
      setErrorMessage(
        hindi
          ? 'मुख्य परेशानी और निदान (Diagnosis) या क्लिनिकल टिप्पणी अवश्य लिखें।'
          : 'Enter the chief complaint and diagnosis or clinical notes.'
      )
      return
    }

    if (
      medicines.some(
        m =>
          !m.medicine_name.trim() &&
          [m.strength, m.dose, m.frequency, m.duration, m.instructions, m.quantity_prescribed].some(v => v.trim())
      )
    ) {
      setErrorMessage(
        hindi
          ? 'अधूरी दवा का नाम लिखें या उसे हटाएँ।'
          : 'Enter the missing medicine name or remove that unfinished row.'
      )
      return
    }

    const selected = medicines.filter(m => m.medicine_name.trim())
    if (
      selected.some(
        m => !Number.isSafeInteger(Number(m.quantity_prescribed)) || Number(m.quantity_prescribed) <= 0
      )
    ) {
      setErrorMessage(
        hindi
          ? 'हर दवा की कुल मात्रा (पूर्णांक संख्या) अवश्य लिखें।'
          : 'Enter an explicit positive whole-number total quantity for every prescribed medicine.'
      )
      return
    }

    setSaving(true)
    setErrorMessage('')

    try {
      if (!(await saveEncounter(false))) return
      setSaving(true)

      const { error } = await supabase.rpc('c1_finish_encounter', {
        p_encounter: encounter.id,
        p_medicines: selected.map(m => ({
          ...m,
          quantity_prescribed: Number(m.quantity_prescribed)
        })),
        p_tests: [...new Set(labTests.filter(Boolean))]
      })

      if (error) throw error

      const { data, error: readError } = await supabase
        .from('encounters')
        .select('completed_at')
        .eq('id', encounter.id)
        .single()

      if (readError) throw readError

      setEncounter(cur => (cur ? { ...cur, status: 'COMPLETED', completed_at: data.completed_at } : cur))
      setAppointment(cur => (cur ? { ...cur, status: 'COMPLETED' } : cur))
      setSuccessMessage(
        hindi
          ? 'परामर्श सफलतापूर्वक पूर्ण हुआ। डॉक्टर की पर्ची और जाँच ऑर्डर सुरक्षित हो गए हैं।'
          : 'Consultation completed. Prescription and test orders were saved.'
      )
    } catch (e: unknown) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : (e as { message?: string }).message ?? 'Unable to complete consultation'
      )
    } finally {
      setSaving(false)
    }
  }

  function listenEncounterSummary() {
    if (!appointment) return
    const text = hindi
      ? `रोगी ${appointment.patient_profiles?.full_name || 'रोगी'}। मुख्य परेशानी: ${chiefComplaint || appointment.reason || 'सामान्य परामर्श'}। निदान: ${diagnosis || 'निरीक्षण में'}।`
      : `Patient ${appointment.patient_profiles?.full_name || 'Patient'}. Chief complaint: ${chiefComplaint || appointment.reason || 'General consultation'}. Diagnosis: ${diagnosis || 'Under evaluation'}.`
    speakText(text, language)
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        {hindi ? 'क्लिनिकल कार्यक्षेत्र लोड हो रहा है...' : 'Opening clinical workstation…'}
      </div>
    )
  }

  if (errorMessage && !appointment) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto py-8">
        <Button variant="outline" onClick={() => navigate('/appointments')}>
          <ArrowLeft className="mr-2 size-4" />
          {hindi ? 'अपॉइंटमेंट्स पर वापस जाएँ' : 'Back to OPD Queue'}
        </Button>
        <Card>
          <EmptyState text={errorMessage} />
        </Card>
      </div>
    )
  }

  if (!appointment || !encounter) return null

  const completed = encounter.status === 'COMPLETED'
  const patientProfile = appointment.patient_profiles

  // Calculate BMI if height/weight
  const weightNum = nullableNumber(weight)
  const systolicNum = nullableNumber(systolic)
  const diastolicNum = nullableNumber(diastolic)

  // BP Range guidance
  let bpWarning = ''
  if (systolicNum && diastolicNum) {
    if (systolicNum >= 140 || diastolicNum >= 90) bpWarning = 'Stage 2 HTN'
    else if (systolicNum >= 130 || diastolicNum >= 80) bpWarning = 'Stage 1 HTN'
    else if (systolicNum >= 120 && diastolicNum < 80) bpWarning = 'Elevated BP'
  }

  const workstationTabs = [
    ...(appointment.mode === 'TELECONSULT'
      ? [{ id: 'teleconsult', label: hindi ? 'वीडियो परामर्श' : 'Teleconsult Room', icon: <Video className="size-3.5" /> }]
      : []),
    { id: 'clinical', label: hindi ? 'परामर्श व परीक्षण' : 'Clinical Assessment', icon: <Stethoscope className="size-3.5" /> },
    { id: 'orders', label: hindi ? 'पर्ची, जाँच व रेफरल' : 'Rx, Orders & Referrals', icon: <Pill className="size-3.5" /> },
    { id: 'history', label: hindi ? 'पिछला मेडिकल इतिहास' : 'Patient History', icon: <FileText className="size-3.5" /> },
    { id: 'timeline', label: hindi ? 'केयर टाइमलाइन' : 'Timeline & Care Gaps', icon: <History className="size-3.5" /> },
    { id: 'copilot', label: hindi ? 'एआई सहायक' : 'Clinical Copilot', icon: <Sparkles className="size-3.5" /> }
  ]

  return (
    <div className="space-y-5">
      {/* 1. PATIENT CONTEXT HEADER (STRONG WORKSTATION BAR) */}
      <Card className="border-border bg-card shadow-sm p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* PATIENT DEMOGRAPHICS & CODE */}
          <div className="flex items-start gap-3.5">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary shrink-0 shadow-2xs">
              <UserRound className="size-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/appointments')}
                  className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground mr-1"
                >
                  <ArrowLeft className="size-3 mr-0.5" />
                  Queue
                </button>

                <h2 className="text-xl font-bold text-foreground tracking-tight">
                  {patientProfile?.full_name || (hindi ? 'रोगी' : 'Patient')}
                </h2>

                <Badge tone={completed ? 'success' : 'warning'}>
                  {completed ? 'COMPLETED' : 'IN PROGRESS'}
                </Badge>

                <Badge tone="outline" className="font-mono">
                  {patientProfile?.patient_code || '—'}
                </Badge>

                {patientProfile?.sex && (
                  <span className="text-xs text-muted-foreground font-semibold">
                    {patientProfile.sex}
                  </span>
                )}
              </div>

              {/* ABHA & SLOT DETAILS */}
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <ShieldCheck className="size-3.5 text-teal" />
                  ABHA: {patientProfile?.abha_number_masked || patientProfile?.abha_link_status || 'NOT_LINKED'}
                </span>

                <span>·</span>

                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {new Date(appointment.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({appointment.mode})
                </span>

                {appointment.reason && (
                  <>
                    <span>·</span>
                    <span className="text-foreground font-medium truncate max-w-xs">
                      {hindi ? 'कारण:' : 'Reason:'} {appointment.reason}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* DOCKED ACTIONS: SAVE / COMPLETE / AUDIO */}
          <div className="flex flex-wrap items-center gap-2 lg:self-center">
            <button
              type="button"
              onClick={listenEncounterSummary}
              title={hindi ? 'परामर्श विवरण सुनें' : 'Listen to consultation'}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
            >
              <Volume2 className="size-3.5" />
              <span className="hidden sm:inline">{hindi ? 'सुनें' : 'Listen'}</span>
            </button>

            {!completed && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  loading={saving}
                  onClick={() => void saveEncounter(true)}
                >
                  <Save className="size-3.5 mr-1" />
                  {hindi ? 'ड्राफ्ट सुरक्षित करें' : 'Save Draft'}
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={() => void completeConsultation()}
                >
                  <Stethoscope className="size-3.5 mr-1" />
                  {hindi ? 'परामर्श पूर्ण व हस्ताक्षर' : 'Sign & Complete'}
                </Button>
              </>
            )}

            {completed && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrintRx(true)}
                  className="inline-flex items-center gap-1.5"
                >
                  <Printer className="size-3.5 mr-1" />
                  {hindi ? 'A4 पर्ची प्रिंट करें' : 'Print Rx (A4)'}
                </Button>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 px-3 py-1.5 rounded-lg border border-success/20">
                  <CheckCircle2 className="size-4" />
                  Signed & Locked
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ALLERGY STATUS BANNER */}
        <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          <span>
            {hindi
              ? 'एलर्जी स्थिति: सरकारी रजिस्ट्री में दर्ज नहीं है। कृपया मरीज से सीधे पुष्टि करें।'
              : 'Allergy history: Not documented in registry — verify drug allergies directly with patient before prescribing.'}
          </span>
        </div>
      </Card>

      {/* MESSAGES */}
      {errorMessage && (
        <Card className="border-destructive/30 bg-destructive/10 p-3.5">
          <p className="text-xs font-semibold text-destructive">{errorMessage}</p>
        </Card>
      )}

      {successMessage && (
        <Card className="border-success/30 bg-success/10 p-3.5">
          <p className="text-xs font-semibold text-success">{successMessage}</p>
        </Card>
      )}

      {/* 2. WORKSTATION TABS */}
      <SegmentedTabs
        tabs={workstationTabs}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 0: TELECONSULT ROOM */}
      {activeTab === 'teleconsult' && appointment.mode === 'TELECONSULT' && (
        <div className="space-y-6">
          <TeleconsultRoom
            appointmentId={appointment.id}
            role="DOCTOR"
            recipientName={patientProfile?.full_name || 'Patient'}
            onEndCall={() => setActiveTab('clinical')}
          />
        </div>
      )}

      {/* TAB 1: ACTIVE CONSULTATION & CLINICAL NOTES */}
      {activeTab === 'clinical' && (
        <div className="space-y-6">
          {/* VITALS PANEL */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionTitle
                icon={<HeartPulse className="size-4" />}
                title={hindi ? 'शारीरिक माप (Vitals)' : 'Patient Vitals & Clinical Metrics'}
                sub={hindi ? 'तापमान, नाड़ी, रक्तचाप और ऑक्सीजन संतृप्ति' : 'Key physiological indicators'}
              />
              {bpWarning && (
                <Badge tone="warning" className="text-xs">
                  {bpWarning}
                </Badge>
              )}
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
              <label className="block">
                <span className="label-xs">Temp (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="50"
                  value={temperature}
                  onChange={e => {
                    setTemperature(e.target.value)
                    if (vitalErrors.temperature) {
                      const res = normalizeTemperature(e.target.value, hindi)
                      setVitalErrors(cur => ({ ...cur, temperature: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizeTemperature(temperature, hindi)
                    setVitalErrors(cur => ({ ...cur, temperature: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="37.0"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.temperature ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.temperature && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.temperature}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="label-xs">Pulse (bpm)</span>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={pulse}
                  onChange={e => {
                    setPulse(e.target.value)
                    if (vitalErrors.pulse) {
                      const res = normalizePulse(e.target.value, hindi)
                      setVitalErrors(cur => ({ ...cur, pulse: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizePulse(pulse, hindi)
                    setVitalErrors(cur => ({ ...cur, pulse: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="72"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.pulse ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.pulse && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.pulse}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="label-xs">BP Systolic</span>
                <input
                  type="number"
                  min="0"
                  max="350"
                  value={systolic}
                  onChange={e => {
                    setSystolic(e.target.value)
                    if (vitalErrors.systolic) {
                      const res = normalizeSystolicBP(e.target.value, hindi)
                      setVitalErrors(cur => ({ ...cur, systolic: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizeSystolicBP(systolic, hindi)
                    setVitalErrors(cur => ({ ...cur, systolic: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="120"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.systolic ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.systolic && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.systolic}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="label-xs">BP Diastolic</span>
                <input
                  type="number"
                  min="0"
                  max="250"
                  value={diastolic}
                  onChange={e => {
                    setDiastolic(e.target.value)
                    if (vitalErrors.diastolic) {
                      const res = normalizeDiastolicBP(e.target.value, normalizeSystolicBP(systolic, hindi).value, hindi)
                      setVitalErrors(cur => ({ ...cur, diastolic: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizeDiastolicBP(diastolic, normalizeSystolicBP(systolic, hindi).value, hindi)
                    setVitalErrors(cur => ({ ...cur, diastolic: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="80"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.diastolic ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.diastolic && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.diastolic}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="label-xs">SpO₂ (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={spo2}
                  onChange={e => {
                    setSpo2(e.target.value)
                    if (vitalErrors.spo2) {
                      const res = normalizeSpO2(e.target.value, hindi)
                      setVitalErrors(cur => ({ ...cur, spo2: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizeSpO2(spo2, hindi)
                    setVitalErrors(cur => ({ ...cur, spo2: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="98"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.spo2 ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.spo2 && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.spo2}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="label-xs">Weight (kg)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  max="500"
                  value={weight}
                  onChange={e => {
                    setWeight(e.target.value)
                    if (vitalErrors.weight) {
                      const res = normalizeWeight(e.target.value, hindi)
                      setVitalErrors(cur => ({ ...cur, weight: res.error ?? '' }))
                    }
                  }}
                  onBlur={() => {
                    const res = normalizeWeight(weight, hindi)
                    setVitalErrors(cur => ({ ...cur, weight: res.error ?? '' }))
                  }}
                  disabled={completed}
                  placeholder="65"
                  className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                    vitalErrors.weight ? 'border-destructive focus:border-destructive' : 'border-border'
                  }`}
                />
                {vitalErrors.weight && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {vitalErrors.weight}
                  </p>
                )}
              </label>
            </div>
          </Card>

          {/* COMPLAINT & SYMPTOMS */}
          <Card className="space-y-4">
            <SectionTitle
              icon={<ClipboardPlus className="size-4" />}
              title={hindi ? 'परेशानी और लक्षण' : 'Chief Complaint & Presenting Symptoms'}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="label-xs">
                    {hindi ? 'मुख्य परेशानी (Chief Complaint) *' : 'Chief Complaint *'}
                  </span>
                  <VoiceInputButton
                    currentValue={chiefComplaint}
                    onTranscript={setChiefComplaint}
                    language={language}
                    size="sm"
                    disabled={completed}
                  />
                </div>
                <textarea
                  rows={3}
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  disabled={completed}
                  placeholder={hindi ? 'मरीज की प्राथमिक शिकायत लिखें…' : 'Enter primary reason for visit…'}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-hidden disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="label-xs">{hindi ? 'लक्षण (Symptoms)' : 'Symptoms & History'}</span>
                <textarea
                  rows={3}
                  value={symptoms}
                  onChange={e => setSymptoms(e.target.value)}
                  disabled={completed}
                  placeholder={hindi ? 'लक्षणों का विवरण और अवधि…' : 'Describe symptoms and chronology…'}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-hidden disabled:opacity-60"
                />
              </label>
            </div>
          </Card>

          {/* DIAGNOSIS & CLINICAL ASSESSMENT */}
          <Card className="space-y-4">
            <SectionTitle
              icon={<Activity className="size-4" />}
              title={hindi ? 'डॉक्टर का नैदानिक निष्कर्ष' : 'Clinical Assessment & Diagnosis'}
            />

            <div className="grid gap-4">
              <label className="block">
                <span className="label-xs">
                  {hindi ? 'निदान / डायग्नोसिस (Diagnosis) *' : 'Provisional / Final Diagnosis *'}
                </span>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                  disabled={completed}
                  placeholder={hindi ? 'निदान लिखें (उदा. Type 2 Diabetes, Acute Pharyngitis)…' : 'Enter diagnosis (e.g. Acute Bronchitis)…'}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-hidden disabled:opacity-60 font-medium"
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="label-xs">
                    {hindi ? 'क्लिनिकल नोट्स व सलाह' : 'Clinical Examination Notes & Advice'}
                  </span>
                  <VoiceInputButton
                    currentValue={clinicalNotes}
                    onTranscript={setClinicalNotes}
                    language={language}
                    size="sm"
                    disabled={completed}
                  />
                </div>
                <textarea
                  rows={4}
                  value={clinicalNotes}
                  onChange={e => setClinicalNotes(e.target.value)}
                  disabled={completed}
                  placeholder={hindi ? 'शारीरिक परीक्षण निष्कर्ष, सलाह व चेतावनी…' : 'Clinical findings, progress notes, and patient advice…'}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-sm focus:border-primary focus:outline-hidden disabled:opacity-60"
                />
              </label>

              <div className="max-w-xs">
                <label className="block">
                  <span className="label-xs">{hindi ? 'फॉलो-अप (दिन बाद)' : 'Follow-up in (Days)'}</span>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={followUpDays}
                    onChange={e => {
                      setFollowUpDays(e.target.value)
                      if (vitalErrors.followUpDays) {
                        const res = normalizeFollowUpDays(e.target.value, hindi)
                        setVitalErrors(cur => ({ ...cur, followUpDays: res.error ?? '' }))
                      }
                    }}
                    onBlur={() => {
                      const res = normalizeFollowUpDays(followUpDays, hindi)
                      setVitalErrors(cur => ({ ...cur, followUpDays: res.error ?? '' }))
                    }}
                    disabled={completed}
                    placeholder="7"
                    className={`mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm font-tabular focus:border-primary focus:outline-hidden disabled:opacity-60 ${
                      vitalErrors.followUpDays ? 'border-destructive focus:border-destructive' : 'border-border'
                    }`}
                  />
                  {vitalErrors.followUpDays && (
                    <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                      {vitalErrors.followUpDays}
                    </p>
                  )}
                </label>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: PRESCRIPTION & DIAGNOSTIC ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* PRESCRIPTION BUILDER */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionTitle
                icon={<Pill className="size-4" />}
                title={hindi ? 'दवाइयों की पर्ची (e-Prescription)' : 'Prescription Formulation Builder'}
                sub={hindi ? 'प्रत्येक दवा की कुल मात्रा लिखना अनिवार्य है' : 'Explicit integer total quantities required'}
              />

              {completed ? (
                <Button size="sm" variant="outline" onClick={() => setShowPrintRx(true)}>
                  <Printer className="size-3.5 mr-1" />
                  {hindi ? 'A4 पर्ची देखें / प्रिंट करें' : 'Print Rx (A4)'}
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowMedicineMaster(v => !v)}
                  >
                    <Sparkles className="size-3.5 mr-1 text-primary" />
                    {showMedicineMaster ? (hindi ? 'कैटलॉग बंद करें' : 'Close Master') : (hindi ? 'मास्टर कैटलॉग' : 'Medicine Master')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={addMedicine}>
                    <Plus className="size-3.5 mr-1" />
                    {hindi ? 'दवा जोड़ें' : 'Add Medicine'}
                  </Button>
                </div>
              )}
            </div>

            {showMedicineMaster && !completed && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <Pill className="size-3.5" />
                    Standard Medicine Master (NLEM / IP Formulations)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowMedicineMaster(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ Close
                  </button>
                </div>
                <MedicineMasterPicker onSelect={handleSelectMasterMedicine} />
              </div>
            )}

            <div className="space-y-4">
              {medicines.map((m, idx) => (
                <div key={idx} className="rounded-xl border border-border p-4 bg-surface-subtle/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="label-xs font-bold text-foreground">
                      {hindi ? `दवा #${idx + 1}` : `Medicine #${idx + 1}`}
                    </span>

                    {!completed && (
                      <button
                        type="button"
                        onClick={() => removeMedicine(idx)}
                        className="text-muted-foreground hover:text-destructive text-xs inline-flex items-center gap-1"
                      >
                        <Trash2 className="size-3.5" />
                        <span>{hindi ? 'हटाएँ' : 'Remove'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block">
                      <span className="label-xs">{hindi ? 'दवा का नाम *' : 'Medicine Name *'}</span>
                      <input
                        type="text"
                        value={m.medicine_name}
                        onChange={e => updateMedicine(idx, 'medicine_name', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. Paracetamol"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'क्षमता (Strength)' : 'Strength'}</span>
                      <input
                        type="text"
                        value={m.strength}
                        onChange={e => updateMedicine(idx, 'strength', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. 500 mg"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'खुराक (Dose)' : 'Dose'}</span>
                      <input
                        type="text"
                        value={m.dose}
                        onChange={e => updateMedicine(idx, 'dose', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. 1 tab"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'कुल मात्रा (Units) *' : 'Total Units *'}</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={m.quantity_prescribed}
                        onChange={e => updateMedicine(idx, 'quantity_prescribed', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. 10"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-tabular font-bold focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'रूट (Route)' : 'Route'}</span>
                      <select
                        value={m.route}
                        onChange={e => updateMedicine(idx, 'route', e.target.value)}
                        disabled={completed}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold focus:border-primary focus:outline-hidden disabled:opacity-60"
                      >
                        <option value="ORAL">ORAL</option>
                        <option value="TOPICAL">TOPICAL</option>
                        <option value="INHALATION">INHALATION</option>
                        <option value="INTRAVENOUS">INTRAVENOUS</option>
                        <option value="INTRAMUSCULAR">INTRAMUSCULAR</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'आवृत्ति (Frequency)' : 'Frequency'}</span>
                      <input
                        type="text"
                        value={m.frequency}
                        onChange={e => updateMedicine(idx, 'frequency', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. Twice daily"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'अवधि (Duration)' : 'Duration'}</span>
                      <input
                        type="text"
                        value={m.duration}
                        onChange={e => updateMedicine(idx, 'duration', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. 5 days"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>

                    <label className="block">
                      <span className="label-xs">{hindi ? 'निर्देश' : 'Special Instructions'}</span>
                      <input
                        type="text"
                        value={m.instructions}
                        onChange={e => updateMedicine(idx, 'instructions', e.target.value)}
                        disabled={completed}
                        placeholder="e.g. After food"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* DIAGNOSTIC LAB ORDERS */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionTitle
                icon={<FlaskConical className="size-4" />}
                title={hindi ? 'पैथोलॉजी व डायग्नोस्टिक ऑर्डर' : 'Diagnostic Laboratory Orders'}
                sub={hindi ? 'सत्यापित परीक्षण सूची से जाँच चुनें' : 'Orders bound to national catalog'}
              />

              {!completed && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDiagnosticMaster(v => !v)}
                  >
                    <Sparkles className="size-3.5 mr-1 text-primary" />
                    {showDiagnosticMaster ? (hindi ? 'कैटलॉग बंद करें' : 'Close Master') : (hindi ? 'जाँच कैटलॉग' : 'Diagnostic Master')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={addLabTest}>
                    <Plus className="size-3.5 mr-1" />
                    {hindi ? 'जाँच जोड़ें' : 'Add Test'}
                  </Button>
                </div>
              )}
            </div>

            {showDiagnosticMaster && !completed && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <FlaskConical className="size-3.5" />
                    Master Diagnostic Investigations Catalog (Pathology / Imaging / Procedures)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowDiagnosticMaster(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ Close
                  </button>
                </div>
                <DiagnosticMasterPicker
                  selectedCategory={diagnosticMode}
                  onSelect={handleSelectMasterDiagnostic}
                />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Diagnostic workflow">
              {([
                ['PATHOLOGY', hindi ? 'पैथोलॉजी / नमूना' : 'Pathology / specimen'],
                ['IMAGING', hindi ? 'इमेजिंग / रेडियोलॉजी' : 'Imaging / radiology'],
                ['PROCEDURE', hindi ? 'प्रक्रिया / कार्डियक' : 'Procedure / cardiac']
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  disabled={completed}
                  onClick={() => setDiagnosticMode(mode)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold ${diagnosticMode === mode ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-info/25 bg-info/5 p-3 text-xs text-muted-foreground">
              {diagnosticMode === 'PATHOLOGY'
                ? (hindi ? 'पैथोलॉजी ऑर्डर में नमूना संग्रह, specimen पहचान और custody workflow होगा।' : 'Pathology orders follow specimen collection, identity, custody, processing and verification.')
                : diagnosticMode === 'IMAGING'
                  ? (hindi ? 'इमेजिंग: X-ray, CT, MRI, Ultrasound या Mammography। इसमें sample collection नहीं है।' : 'Imaging: X-ray, CT, MRI, Ultrasound or Mammography. No sample collection state.')
                  : (hindi ? 'प्रक्रिया: ECG, Echo या Holter। इसमें sample collection नहीं है।' : 'Procedure: ECG, Echo or Holter. No sample collection state.')}
            </div>

            <div className="space-y-3">
              {labTests.map((test, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <TestCatalogPicker
                      value={test}
                      disabled={completed || saving}
                      onChange={val => updateLabTest(idx, val)}
                    />
                  </div>
                  {!completed && (
                    <button
                      type="button"
                      onClick={() => removeLabTest(idx)}
                      className="p-2 text-muted-foreground hover:text-destructive rounded-lg border border-border"
                      aria-label="Remove test"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* CLOSED-LOOP CLINICAL REFERRAL (024 r4_create) */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionTitle
                icon={<GitFork className="size-4" />}
                title={hindi ? 'बंद-लूप रेफरल ऑर्डर (Closed-Loop Referral)' : 'Closed-Loop Clinical Referral'}
                sub={hindi ? 'सहमति-सत्यापित अस्पताल व विशेषज्ञ डॉक्टर को रेफर करें' : 'Target facility & specialist referral governed by patient consent'}
              />
              <Badge tone="teal">024 / r4_create</Badge>
            </div>

            {referralSuccess && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs font-semibold text-success">
                {referralSuccess}
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <DirectoryPicker kind="facility" label="Destination Facility" value={referralFacility} onChange={id=>{setReferralFacility(id);setReferralDoctor('')}} disabled={completed||referralBusy} />
              <DirectoryPicker key={referralFacility} kind="doctor" label="Destination Specialist" facilityId={referralFacility} value={referralDoctor} onChange={setReferralDoctor} disabled={completed||referralBusy||!referralFacility} />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-4">
              <label className="block sm:col-span-1">
                <span className="label-xs">{hindi ? 'प्राथमिकता (Urgency)' : 'Referral Urgency'}</span>
                <select
                  value={referralUrgency}
                  onChange={e => setReferralUrgency(e.target.value as any)}
                  disabled={completed || referralBusy}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:outline-hidden disabled:opacity-60"
                >
                  <option value="ROUTINE">ROUTINE</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>

              <label className="block sm:col-span-3">
                <span className="label-xs">{hindi ? 'रेफरल का कारण व नैदानिक सारांश (Reason - min 10 chars)' : 'Clinical Referral Reason & Suspected Conditions (min 10 chars)'}</span>
                <input
                  type="text"
                  value={referralReason}
                  onChange={e => setReferralReason(e.target.value)}
                  disabled={completed || referralBusy}
                  placeholder={hindi ? 'जैसे: कार्डियोलॉजी मूल्यांकन और इकोकार्डियोग्राम परामर्श आवश्यक' : 'e.g. Requires specialist cardiology evaluation and echo review'}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                {hindi
                  ? 'रेफरल दर्ज होने के बाद मरीज की स्पष्ट सहमति आवश्यक होगी। गंतव्य डॉक्टर केवल सहमति के बाद ही देख सकेंगे।'
                  : 'Referral stays source-scoped until patient grants consent. Destination clinician receives record only upon consent.'}
              </p>
              {!completed && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={referralBusy}
                  onClick={() => void handleCreateReferral()}
                >
                  <GitFork className="size-3.5 mr-1" />
                  {hindi ? 'रेफरल ऑर्डर भेजें' : 'Issue Referral'}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: LONGITUDINAL PATIENT HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <SectionTitle
                icon={<FileText className="size-4" />}
                title={hindi ? 'मरीज का संपूर्ण मेडिकल इतिहास' : 'Longitudinal Medical Records'}
                sub={hindi ? 'सहमति आधारित पिछले परामर्श, दवाइयाँ और जाँच रिपोर्ट' : 'Consent-governed prior consultations, diagnostics, and uploads'}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadLongitudinalHistory(appointment.patient_id)}
              >
                <RefreshCw className="size-3.5 mr-1" />
                {hindi ? 'ताज़ा करें' : 'Refresh'}
              </Button>
            </div>

            {careLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {hindi ? 'इतिहास लोड हो रहा है…' : 'Retrieving longitudinal health history…'}
              </div>
            ) : !careContext ? (
              <EmptyState
                text={
                  hindi
                    ? 'मरीज का पिछला मेडिकल इतिहास उपलब्ध नहीं है या सहमति लंबित है।'
                    : 'No longitudinal records retrieved or patient consent is pending.'
                }
              />
            ) : (
              <div className="space-y-6">
                {/* PREVIOUS ENCOUNTERS */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {hindi ? 'पिछली मुलाकातें (Past Consultations)' : 'Past Consultations'}
                  </h4>
                  {careContext.encounters?.length ? (
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {careContext.encounters.map((e: any) => (
                        <div key={e.id} className="p-3 text-xs space-y-1 hover:bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {new Date(e.started_at).toLocaleDateString()}
                            </span>
                            <Badge tone="outline">{e.status}</Badge>
                          </div>
                          {e.diagnosis && (
                            <p className="text-foreground">
                              <strong>Diagnosis:</strong> {e.diagnosis}
                            </p>
                          )}
                          {e.clinical_notes && (
                            <p className="text-muted-foreground line-clamp-2">
                              {e.clinical_notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No prior consultations.</p>
                  )}
                </div>

                {/* PREVIOUS PRESCRIPTIONS */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {hindi ? 'पिछली दवाइयाँ (Prior Prescriptions)' : 'Prior Prescriptions'}
                  </h4>
                  {careContext.prescriptions?.length ? (
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {careContext.prescriptions.map((p: any) => (
                        <div key={p.id} className="p-3 text-xs space-y-1 hover:bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              Issued: {new Date(p.issued_at).toLocaleDateString()}
                            </span>
                            <Badge tone={p.status === 'ACTIVE' ? 'teal' : 'neutral'}>
                              {p.status}
                            </Badge>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {(p.items || []).map((it: any) => (
                              <p key={it.id} className="text-foreground font-mono">
                                • {it.medicine_name} {it.strength || ''} — {it.dose || ''} ({it.frequency || ''})
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No prior prescriptions.</p>
                  )}
                </div>

                {/* DIAGNOSTIC RESULTS */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    {hindi ? 'लैब जाँच नतीजे (Diagnostic Results)' : 'Diagnostic Results'}
                  </h4>
                  {careContext.diagnostics?.length ? (
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {careContext.diagnostics.map((d: any) => (
                        <div key={d.id} className="p-3 text-xs space-y-1 hover:bg-secondary/30">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">{d.test_name}</span>
                            <StatusBadge status={d.status} />
                          </div>
                          {d.result && (
                            <div className="space-y-0.5 pt-1">
                              {observationsOf(d.result).map((obs: any, i: number) => (
                                <p key={i} className="text-foreground">
                                  {obs.parameter_name}: <strong className="font-tabular">{obs.raw_value}</strong> {obs.unit} {obs.flag ? `[${obs.flag}]` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No prior diagnostic tests.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: CARE TIMELINE & GAPS */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <SectionTitle
              icon={<History className="size-4" />}
              title={hindi ? 'लंबे समय का इलाज सफर' : 'Longitudinal Care Timeline & Care Gaps'}
              sub={hindi ? 'रोगी के सभी स्वास्थ्य आयोजन और लंबित कार्य' : 'Patient care events and action gaps'}
            />

            {careContext?.care_gaps?.length > 0 && (
              <div className="space-y-2 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {hindi ? 'लंबित कार्य (Open Care Gaps)' : 'Open Care Gaps'}
                </h4>
                {careContext.care_gaps.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{g.gap_type.replace(/_/g, ' ')}</p>
                      {g.due_at && <p className="text-muted-foreground">Due: {new Date(g.due_at).toLocaleDateString()}</p>}
                    </div>
                    <PriorityBadge priority={g.severity} />
                  </div>
                ))}
              </div>
            )}

            {careContext?.events?.length > 0 ? (
              <ol className="relative border-l border-primary/40 ml-2 space-y-4 pl-4 pt-2">
                {careContext.events.map((ev: any) => (
                  <li key={ev.id} className="text-xs space-y-0.5">
                    <span className="absolute -left-1.5 mt-1 size-3 rounded-full border-2 border-background bg-primary" />
                    <p className="font-semibold text-foreground">{ev.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-muted-foreground font-tabular">
                      {new Date(ev.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState text={hindi ? 'कोई टाइमलाइन इवेंट दर्ज नहीं है।' : 'No timeline events recorded.'} />
            )}
          </Card>
        </div>
      )}

      {/* TAB 5: AI CLINICAL COPILOT */}
      {activeTab === 'copilot' && (
        <div className="space-y-6">
          <SwasthyaCopilot
            patientId={appointment.patient_id}
            workflow="CONSULTATION"
            title={hindi ? 'कंसल्टेशन एआई सहायक' : 'Consultation Copilot'}
            subtitle={hindi ? 'इस मरीज के अधिकृत इतिहास से उद्धरण प्राप्त करें' : 'Ground questions in this patient’s longitudinal record'}
            suggestions={
              hindi
                ? [
                    'पिछली पर्चियों में दी गई दवाइयाँ और खुराक क्या थीं?',
                    'हाल के लैब परीक्षणों में क्या असामान्यता थी?',
                    'क्या मरीज का कोई फॉलो-अप या टेस्ट बाकी है?'
                  ]
                : [
                    'Review active medicines and dosages from prior encounters',
                    'Check abnormal diagnostic observations from recent tests',
                    'Identify overdue follow-up tasks or open care gaps'
                  ]
            }
          />
        </div>
      )}

      {showPrintRx && encounter && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex justify-center items-start">
          <div className="relative w-full max-w-4xl my-8">
            <PrintablePrescription
              prescription={{
                id: encounter.id,
                issued_at: encounter.completed_at || encounter.started_at,
                status: 'DRAFT — encounter preview; use Prescriptions for the issued record',
                chief_complaints: chiefComplaint || appointment?.reason || null,
                diagnosis: diagnosis || null,
                clinical_notes: clinicalNotes || null,
                vitals: {
                  bp: systolic && diastolic ? `${systolic}/${diastolic}` : undefined,
                  pulse: pulse || undefined,
                  temp: temperature || undefined,
                  spo2: spo2 || undefined,
                  weight: weight || undefined
                },
                follow_up_date: followUpDays ? `${followUpDays} days` : null,
                doctor: {
                  full_name: doctorProfile?.full_name || profile?.full_name,
                  specialization: doctorProfile?.specialization,
                  registration_id: doctorProfile?.registration_id,
                  hpr_id: doctorProfile?.hpr_id
                },
                items: medicines.filter(m => m.medicine_name.trim()).map((m, idx) => ({
                  id: `item-${idx}`,
                  medicine_name: m.medicine_name,
                  strength: m.strength || null,
                  dose: m.dose || null,
                  route: m.route || null,
                  frequency: m.frequency || null,
                  duration: m.duration || null,
                  instructions: m.instructions || null,
                  quantity: m.quantity_prescribed ? Number(m.quantity_prescribed) : null
                }))
              }}
              patient={{
                id: appointment?.patient_id || '',
                full_name: appointment?.patient_profiles?.full_name || 'Patient',
                patient_code: appointment?.patient_profiles?.patient_code || null,
                abha_number_masked: appointment?.patient_profiles?.abha_number_masked || null,
                gender: appointment?.patient_profiles?.sex || null,
                dob: appointment?.patient_profiles?.date_of_birth || null
              }}
              onClose={() => setShowPrintRx(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

