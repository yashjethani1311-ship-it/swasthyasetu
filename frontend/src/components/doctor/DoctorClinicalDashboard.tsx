import { useEffect, useState } from 'react'
import {
  Stethoscope,
  CalendarCheck,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Users,
  FileText,
  ArrowRight,
  UserCheck,
  ChevronRight,
  ShieldCheck,
  RefreshCw
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
  type TableColumn
} from '../kit'
import { SwasthyaCopilot } from '../SwasthyaCopilot'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'

type DoctorProfile = {
  id: string
  full_name: string
  specialization: string | null
  registration_id: string | null
  verification_status: string
  organization_name: string | null
}

type AppointmentQueueItem = {
  id: string
  patient_id: string
  scheduled_at: string
  mode: string
  status: string
  reason: string | null
  patient_profiles?: {
    patient_code: string | null
    full_name: string | null
  } | null
}

type PendingReportItem = {
  id: string
  test_name: string
  ordered_at: string
  patient_id: string
  status: string
  lab_results?: {
    id: string
    published_at: string | null
    doctor_reviewed_at: string | null
  } | null
  patient_profiles?: {
    full_name: string | null
    patient_code: string | null
  } | null
}

type FollowUpItem = {
  id: string
  care_gap_id: string
  status: string
  outcome: string | null
}

export function DoctorClinicalDashboard() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)

  const [todayAppointments, setTodayAppointments] = useState<AppointmentQueueItem[]>([])
  const [opdQueue, setOpdQueue] = useState<AppointmentQueueItem[]>([])
  const [pendingReports, setPendingReports] = useState<PendingReportItem[]>([])
  const [pendingFollowUps, setPendingFollowUps] = useState<FollowUpItem[]>([])
  const [openCareGapsCount, setOpenCareGapsCount] = useState(0)
  const [referrals, setReferrals] = useState<any[]>([])
  const [referralBusy, setReferralBusy] = useState(false)
  const [referralMsg, setReferralMsg] = useState('')
  const [error, setError] = useState('')

  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [selectedPatientName, setSelectedPatientName] = useState<string>('')
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [patientSearchNotice, setPatientSearchNotice] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [profile?.id])

  async function loadDashboardData() {
    if (!profile?.id) return
    setLoading(true)
    setError('')

    try {
      // 1. Fetch doctor profile
      const { data: docData, error: docErr } = await supabase
        .from('provider_profiles')
        .select('id, full_name, specialization, registration_id, verification_status, organization_name')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (docErr) throw docErr
      if (!docData) {
        setLoading(false)
        return
      }

      setDoctor(docData as DoctorProfile)
      const docId = docData.id

      // 2. Fetch appointments for doctor
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      const [
        todayApptsResult,
        queueResult,
        reportsResult,
        followUpsResult,
        careGapsResult,
        referralsResult
      ] = await Promise.all([
        // Today's appointments
        supabase
          .from('appointments')
          .select(`
            id,
            patient_id,
            scheduled_at,
            mode,
            status,
            reason,
            patient_profiles(patient_code, full_name)
          `)
          .eq('doctor_provider_id', docId)
          .gte('scheduled_at', startOfDay.toISOString())
          .lte('scheduled_at', endOfDay.toISOString())
          .order('scheduled_at', { ascending: true }),

        // OPD Queue: Confirmed or In Progress
        supabase
          .from('appointments')
          .select(`
            id,
            patient_id,
            scheduled_at,
            mode,
            status,
            reason,
            patient_profiles(patient_code, full_name)
          `)
          .eq('doctor_provider_id', docId)
          .in('status', ['CONFIRMED', 'IN_PROGRESS'])
          .order('scheduled_at', { ascending: true })
          .limit(10),

        // Reports pending review
        supabase
          .from('lab_orders')
          .select(`
            id,
            test_name,
            ordered_at,
            patient_id,
            status,
            lab_results(id, published_at, doctor_reviewed_at),
            patient_profiles(full_name, patient_code)
          `)
          .eq('doctor_provider_id', docId)
          .eq('status', 'COMPLETED')
          .limit(10),

        // Follow-ups awaiting verification
        supabase
          .from('follow_up_tasks')
          .select('id, care_gap_id, status, outcome')
          .eq('status', 'AWAITING_VERIFICATION')
          .limit(10),

        // Open care gaps count
        supabase
          .from('care_gaps')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'OPEN'),

        // Incoming referrals (024 r4_referrals)
        supabase.rpc('r4_referrals', { p_offset: 0 })
      ])

      if (todayApptsResult.data) {
        setTodayAppointments(todayApptsResult.data as unknown as AppointmentQueueItem[])
      }

      if (queueResult.data) {
        setOpdQueue(queueResult.data as unknown as AppointmentQueueItem[])
      }

      if (reportsResult.data) {
        const unreviewed = (reportsResult.data as unknown as PendingReportItem[]).filter(r => {
          const res = r.lab_results
          return res && res.published_at && !res.doctor_reviewed_at
        })
        setPendingReports(unreviewed)
      }

      if (followUpsResult.data) {
        setPendingFollowUps(followUpsResult.data as FollowUpItem[])
      }

      if (referralsResult.data && Array.isArray(referralsResult.data)) {
        setReferrals(referralsResult.data)
      }

      setOpenCareGapsCount(careGapsResult.count ?? 0)

      if (!selectedPatientId) {
        const queueList = (queueResult.data as unknown as AppointmentQueueItem[]) ?? []
        const todayList = (todayApptsResult.data as unknown as AppointmentQueueItem[]) ?? []
        const first = queueList[0] || todayList[0] || null
        if (first) {
          setSelectedPatientId(first.patient_id)
          setSelectedPatientName(first.patient_profiles?.full_name || first.patient_profiles?.patient_code || 'Patient')
        }
      }
    } catch (e: unknown) {
      console.error('Doctor dashboard load failed:', e)
      setError(e instanceof Error ? e.message : 'Unable to load clinical dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function searchPatients(query: string) {
    setPatientSearchQuery(query)
    setPatientSearchNotice('')
    if (query.trim().length < 2) {
      setPatientSearchResults([])
      return
    }
    setPatientSearchLoading(true)
    try {
      const { data, error: rpcErr } = await supabase.rpc('c1_patient_directory', {
        p_search: query.trim(),
        p_offset: 0
      })
      if (rpcErr) {
        if (rpcErr.message?.includes('PATIENT_ACCESS_REQUIRED')) {
          setPatientSearchNotice(
            hindi
              ? 'मरीज पंजीकृत है लेकिन आपके क्लिनिक से सक्रिय संबंध या सहमति नहीं है।'
              : 'Patient is registered in the network, but has no active clinical relationship, referral, or consent with your practice.'
          )
        } else {
          setPatientSearchNotice(rpcErr.message)
        }
        setPatientSearchResults([])
      } else {
        setPatientSearchResults(data ?? [])
        if ((data ?? []).length === 0) {
          setPatientSearchNotice(
            hindi ? 'सक्रिय मरीजों में कोई परिणाम नहीं मिला।' : 'No patients found in your active care.'
          )
        }
      }
    } catch (e: unknown) {
      setPatientSearchNotice(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setPatientSearchLoading(false)
    }
  }

  async function handleReferralAction(refId: string, toState: string, note: string) {
    setReferralBusy(true)
    setReferralMsg('')
    try {
      const reqKey = crypto.randomUUID()
      const payload = toState === 'OUTCOME_RETURNED' ? { outcome: note } : { reason: note }
      const { error: trErr } = await supabase.rpc('r4_transition', {
        p_referral: refId,
        p_state: toState,
        p_payload: payload,
        p_request: reqKey
      })
      if (trErr) throw trErr
      setReferralMsg(`Referral marked as ${toState}.`)
      await loadDashboardData()
    } catch (e: unknown) {
      setReferralMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setReferralBusy(false)
    }
  }

  function startConsultation(appt: AppointmentQueueItem) {
    sessionStorage.setItem('swasthyasetu-active-appointment', appt.id)
    navigate('/encounter')
  }

  const queueColumns: TableColumn<AppointmentQueueItem>[] = [
    {
      key: 'scheduled_at',
      header: hindi ? 'समय' : 'Time',
      width: '100px',
      render: r => (
        <span className="font-semibold font-tabular text-foreground">
          {new Date(r.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      key: 'patient',
      header: hindi ? 'रोगी' : 'Patient',
      render: r => (
        <div>
          <p className="font-semibold text-foreground">
            {r.patient_profiles?.full_name || (hindi ? 'रोगी' : 'Patient')}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {r.patient_profiles?.patient_code || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'reason',
      header: hindi ? 'कारण' : 'Reason / Symptoms',
      render: r => (
        <span className="text-xs text-muted-foreground line-clamp-1">
          {r.reason || (hindi ? 'सामान्य परामर्श' : 'General consultation')}
        </span>
      )
    },
    {
      key: 'mode',
      header: hindi ? 'प्रकार' : 'Mode',
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
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      width: '110px',
      render: r => (
        <Button
          size="sm"
          variant={r.status === 'IN_PROGRESS' ? 'primary' : 'outline'}
          onClick={() => startConsultation(r)}
        >
          <Stethoscope className="size-3.5 mr-1" />
          {r.status === 'IN_PROGRESS' ? (hindi ? 'जारी रखें' : 'Resume') : (hindi ? 'शुरू करें' : 'Attend')}
        </Button>
      )
    }
  ]

  return (
    <div className="space-y-6">
      {/* WORKSTATION BANNER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold md:text-3xl text-foreground tracking-tight">
              {doctor ? `Dr. ${doctor.full_name}` : (hindi ? 'डॉक्टर कार्यक्षेत्र' : 'Clinical Workstation')}
            </h1>
            {doctor?.verification_status === 'APPROVED' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                <ShieldCheck className="size-3.5" />
                {hindi ? "परिचालन अनुमति स्वीकृत" : "Operational access approved"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {doctor?.specialization ? `${doctor.specialization} · ` : ''}
            {doctor?.organization_name || (hindi ? 'संबद्ध क्लिनिक दर्ज नहीं' : 'Practice affiliation not recorded')}
            {doctor?.registration_id ? ` · Reg: ${doctor.registration_id}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={refreshing}
            onClick={() => {
              setRefreshing(true)
              void loadDashboardData()
            }}
          >
            <RefreshCw className="size-3.5 mr-1" />
            {hindi ? 'ताज़ा करें' : 'Refresh Data'}
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/appointments')}
          >
            <CalendarCheck className="size-3.5 mr-1" />
            {hindi ? 'सभी अपॉइंटमेंट्स' : 'All Appointments'}
          </Button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* OPERATIONAL METRICS STATS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={hindi ? 'आज के अपॉइंटमेंट्स' : "Today's Appointments"}
          value={todayAppointments.length}
          tone="primary"
          icon={<CalendarCheck className="size-5" />}
          hint={hindi ? 'आज का शेड्यूल' : 'Scheduled for today'}
        />

        <Stat
          label={hindi ? 'ओपीडी कतार (प्रतीक्षारत)' : 'Active OPD Queue'}
          value={opdQueue.length}
          tone={opdQueue.length > 0 ? 'warning' : 'neutral'}
          icon={<Users className="size-5" />}
          hint={hindi ? 'परामर्श हेतु उपस्थित' : 'Ready for consultation'}
        />

        <Stat
          label={hindi ? 'समीक्षा हेतु लंबित रिपोर्ट' : 'Reports Pending Review'}
          value={pendingReports.length}
          tone={pendingReports.length > 0 ? 'emergency' : 'success'}
          icon={<Activity className="size-5" />}
          hint={hindi ? 'लैब रिपोर्ट आई हुई हैं' : 'Completed lab orders'}
        />

        <Stat
          label={hindi ? 'फॉलो-अप सत्यापन' : 'Follow-up Verification'}
          value={pendingFollowUps.length}
          tone={pendingFollowUps.length > 0 ? 'teal' : 'neutral'}
          icon={<UserCheck className="size-5" />}
          hint={hindi ? 'कार्यकर्ता परिणाम जाँचें' : 'CHW field visits reported'}
        />
      </div>

      {/* MAIN CLINICAL SPLIT: OPD QUEUE + RIGHT WORKSTATION PANEL */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT 2 COLS: OPD QUEUE */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle
                title={hindi ? 'ओपीडी कतार (प्रतीक्षारत मरीज)' : 'OPD Waiting Room Queue'}
                sub={hindi ? 'परामर्श शुरू करने के लिए मरीज चुनें' : 'Select a patient to launch active consultation workspace'}
                icon={<Stethoscope className="size-4" />}
              />
              <span className="label-xs font-tabular text-muted-foreground">
                {opdQueue.length} {hindi ? 'मरीज कतार में' : 'patients in queue'}
              </span>
            </div>

            <ClinicalTable
              columns={queueColumns}
              data={opdQueue}
              keyField="id"
              loading={loading}
              emptyMessage={
                hindi
                  ? 'वर्तमान में कोई मरीज ओपीडी कतार में प्रतीक्षारत नहीं हैं।'
                  : 'No patients currently waiting in the OPD queue.'
              }
            />
          </Card>

          {/* REPORTS PENDING REVIEW TABLE */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle
                title={hindi ? 'लैब रिपोर्ट्स - डॉक्टर समीक्षा आवश्यक' : 'Diagnostic Reports Pending Clinical Review'}
                sub={hindi ? 'लैब द्वारा प्रकाशित रिपोर्ट जिन्हें डॉक्टर द्वारा जाँचना बाकी है' : 'Published results awaiting physician sign-off'}
                icon={<Activity className="size-4" />}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/lab')}
              >
                {hindi ? 'लैब वर्कस्पेस' : 'Diagnostics Lab'}
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>

            {pendingReports.length === 0 ? (
              <EmptyState
                text={
                  hindi
                    ? 'समीक्षा के लिए कोई नई लैब रिपोर्ट लंबित नहीं है।'
                    : 'All published laboratory reports have been reviewed. No open review gaps.'
                }
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {pendingReports.map(rep => (
                  <div
                    key={rep.id}
                    className="flex items-center justify-between p-3.5 hover:bg-secondary/40 transition text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {rep.test_name}
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        {hindi ? 'रोगी:' : 'Patient:'}{' '}
                        <strong className="text-foreground">
                          {rep.patient_profiles?.full_name || 'Patient'}
                        </strong>{' '}
                        · {new Date(rep.ordered_at).toLocaleDateString()}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/lab')}
                    >
                      {hindi ? 'रिपोर्ट देखें' : 'Review'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* INCOMING CLOSED-LOOP REFERRALS (024 / r4_referrals) */}
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle
                title={hindi ? 'आवक रेफरल व विशेषज्ञ परामर्श' : 'Incoming Clinical Referrals'}
                sub={hindi ? 'सहमति-सत्यापित रेफरल कार्यप्रवाह (024 / r4_referrals)' : 'Consent-governed closed-loop referral lifecycle'}
                icon={<Activity className="size-4 text-primary" />}
              />
              <Badge tone="teal">{referrals.length} active</Badge>
            </div>

            {referralMsg && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary font-medium">
                {referralMsg}
              </div>
            )}

            {referrals.length === 0 ? (
              <EmptyState
                text={
                  hindi
                    ? 'वर्तमान में कोई आवक रेफरल लंबित नहीं है।'
                    : 'No pending incoming clinical referrals.'
                }
              />
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {referrals.map(ref => (
                  <div key={ref.id} className="p-3.5 space-y-2 bg-card hover:bg-surface-subtle transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge tone={ref.urgency === 'CRITICAL' ? 'emergency' : ref.urgency === 'HIGH' ? 'warning' : 'outline'}>
                          {ref.urgency}
                        </Badge>
                        <StatusBadge status={ref.state} />
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {new Date(ref.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {ref.reason && (
                      <p className="text-xs text-foreground font-medium">
                        <strong>Reason:</strong> {ref.reason}
                      </p>
                    )}

                    {ref.outcome_summary && (
                      <p className="text-xs text-muted-foreground italic">
                        <strong>Outcome:</strong> {ref.outcome_summary}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        Consent: <strong className={ref.consent_status === 'GRANTED' ? 'text-success' : 'text-warning-foreground'}>{ref.consent_status}</strong>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {ref.state === 'RECEIVED' && (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={referralBusy}
                              onClick={() => void handleReferralAction(ref.id, 'ACCEPTED', 'Accepted by specialist')}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={referralBusy}
                              onClick={() => void handleReferralAction(ref.id, 'CLARIFICATION', 'Prior investigation needed')}
                            >
                              Clarify
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={referralBusy}
                              onClick={() => void handleReferralAction(ref.id, 'REJECTED', 'Capacity exceeded')}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {ref.state === 'ENCOUNTER_COMPLETED' && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={referralBusy}
                            onClick={() => {
                              const outcome = prompt('Enter specialist outcome summary:')
                              if (outcome && outcome.length >= 10) {
                                void handleReferralAction(ref.id, 'OUTCOME_RETURNED', outcome)
                              }
                            }}
                          >
                            Return Outcome
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT 1 COL: AI COPILOT & CARE TASKS */}
        <div className="space-y-6">
          {/* ACTIVE PATIENT CONTEXT SELECTOR */}
          <Card className="space-y-3 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Users className="size-4 text-primary" />
                {hindi ? 'सक्रिय मरीज संदर्भ' : 'Active Patient Context'}
              </span>
              {selectedPatientId && (
                <Badge tone="teal" className="text-[10px]">
                  {hindi ? 'सक्रिय' : 'Selected'}
                </Badge>
              )}
            </div>

            {selectedPatientId ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 text-xs">
                <div>
                  <p className="font-bold text-foreground">{selectedPatientName || 'Patient'}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{selectedPatientId.slice(0, 8)}…</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedPatientId('')
                    setSelectedPatientName('')
                  }}
                >
                  {hindi ? 'बदलें' : 'Change'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hindi
                  ? 'क्लिनिकल एआई और रिकॉर्ड देखने के लिए नीचे से मरीज चुनें या खोजें:'
                  : 'Select or search a patient to view clinical records and run Copilot insights:'}
              </p>
            )}

            {/* Quick search input */}
            {(!selectedPatientId || patientSearchQuery) && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => void searchPatients(e.target.value)}
                  placeholder={hindi ? 'नाम या रोगी कोड से खोजें…' : 'Search patient by name or code…'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                />

                {patientSearchLoading && (
                  <p className="text-[11px] text-muted-foreground animate-pulse">
                    {hindi ? 'खोजा जा रहा है…' : 'Searching patients in active care…'}
                  </p>
                )}

                {patientSearchNotice && (
                  <p className="text-[11px] text-warning-foreground bg-warning/10 rounded-md p-2 border border-warning/20">
                    {patientSearchNotice}
                  </p>
                )}

                {patientSearchResults.length > 0 && (
                  <div className="divide-y divide-border rounded-lg border border-border bg-card text-xs max-h-40 overflow-y-auto">
                    {patientSearchResults.map((pt) => (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(pt.id)
                          setSelectedPatientName(pt.full_name || pt.patient_code || 'Patient')
                          setPatientSearchQuery('')
                          setPatientSearchResults([])
                          setPatientSearchNotice('')
                        }}
                        className="w-full p-2 text-left hover:bg-secondary/60 flex items-center justify-between transition-colors"
                      >
                        <span className="font-semibold text-foreground">{pt.full_name || pt.patient_code}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">{pt.patient_code}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick select buttons from OPD queue */}
                {opdQueue.length > 0 && !patientSearchQuery && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold block w-full">
                      {hindi ? 'ओपीडी कतार से:' : 'From OPD Queue:'}
                    </span>
                    {opdQueue.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(item.patient_id)
                          setSelectedPatientName(item.patient_profiles?.full_name || item.patient_profiles?.patient_code || 'Patient')
                        }}
                        className={`rounded-md border px-2 py-1 text-xs transition ${
                          selectedPatientId === item.patient_id
                            ? 'border-primary bg-primary text-primary-foreground font-semibold'
                            : 'border-border bg-card text-foreground hover:border-primary/50'
                        }`}
                      >
                        {item.patient_profiles?.full_name || item.patient_profiles?.patient_code || 'Patient'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* SWASTHYA COPILOT GROUNDED PANEL */}
          <SwasthyaCopilot
            patientId={selectedPatientId}
            workflow="CONSULTATION"
            title={selectedPatientName ? (hindi ? `क्लिनिकल एआई · ${selectedPatientName}` : `Clinical Copilot · ${selectedPatientName}`) : (hindi ? 'क्लिनिकल एआई सहायक' : 'Clinical Copilot')}
            subtitle={selectedPatientName ? (hindi ? `${selectedPatientName} के सत्यापित रिकॉर्ड से अंतर्दृष्टि` : `Grounded insights for ${selectedPatientName}`) : (hindi ? 'मरीज के रिकॉर्ड से उद्धरण खोजें' : 'Extract verified insights from active queue patient')}
            suggestions={
              hindi
                ? [
                    'पिछली पर्चियों में दी गई दवाइयाँ क्या थीं?',
                    'हाल के लैब परीक्षणों में क्या असामान्यता थी?',
                    'क्या मरीज का कोई फॉलो-अप बाकी है?'
                  ]
                : [
                    'Active prescription regimen & dosages',
                    'Abnormal diagnostic parameters from last 90 days',
                    'Open care gaps or overdue follow-up visits'
                  ]
            }
          />

          {/* FOLLOW-UP VERIFICATION QUEUE */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <UserCheck className="size-4 text-teal" />
                <span>{hindi ? 'आशा / कार्यकर्ता फॉलो-अप' : 'CHW Follow-ups'}</span>
              </h3>
              <Badge tone={pendingFollowUps.length > 0 ? 'teal' : 'neutral'}>
                {pendingFollowUps.length}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              {hindi
                ? 'समुदाय स्वास्थ्य कार्यकर्ता द्वारा दर्ज किए गए गृह संपर्क परिणाम।'
                : 'Field outcomes reported by community workers requiring clinician verification.'}
            </p>

            {pendingFollowUps.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pt-2">
                {hindi ? 'सत्यापन के लिए कोई फॉलो-अप लंबित नहीं है।' : 'No follow-up outcomes awaiting verification.'}
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                {pendingFollowUps.map(fu => (
                  <div
                    key={fu.id}
                    className="rounded-lg border border-border p-2.5 text-xs space-y-1 bg-surface-subtle"
                  >
                    <div className="flex items-center justify-between">
                      <Badge tone="warning">Awaiting Verification</Badge>
                      <button
                        type="button"
                        onClick={() => navigate('/care')}
                        className="text-primary hover:underline font-semibold text-[11px]"
                      >
                        {hindi ? 'जाँचें' : 'Verify'}
                      </button>
                    </div>
                    {fu.outcome && (
                      <p className="text-foreground font-medium text-[11px]">
                        {fu.outcome}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
