import { useCallback, useEffect, useState } from 'react'
import {
  Clock,
  Ticket,
  AlertCircle,
  RefreshCw,
  Users
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ClinicalTable,
  SearchInput,
  SectionTitle,
  StatusBadge,
  type TableColumn
} from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { resolveFacilityId, reqId } from '@/lib/facility'
import { localServiceDate, normalizeReceptionQueue } from '@/lib/reception'

type ReceptionAppointment = {
  id: string
  scheduled_at: string
  status: string
  mode: string
  patient_id: string
  doctor_provider_id: string
  doctor_name?: string
  patient_name?: string
  patient_code?: string
  phone?: string
}

// A row from reception_queue via h1_queue (013). Field names are normalised
// defensively because the RPC returns jsonb.
type QueueRow = {
  id: string
  token: string | null
  token_number: string | null
  status: string
  patient_id: string | null
  patient_name: string | null
  patient_code: string | null
  department: string | null
  position: number | null
  checked_in_at: string | null
}

type Department = { id: string; name: string }

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

function normalizeQueue(data: unknown): QueueRow[] {
  return normalizeReceptionQueue(data)
}

export function HospitalReceptionPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'
  const { profile } = useAuth()

  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<ReceptionAppointment[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')

  // 013 reception contracts
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [queueError, setQueueError] = useState('')
  const [queueLoading, setQueueLoading] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [department, setDepartment] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const queueAvailable = !queueError

  // h1_* are facility-scoped. Resolve the signed-in user's facility from
  // facility_memberships (013); never invent one. Without it the queue, setup
  // and check-in are disabled with a truthful context-required state.
  useEffect(() => {
    let active = true
    void resolveFacilityId(profile?.id).then((id) => {
      if (active) setFacilityId(id)
    })
    return () => {
      active = false
    }
  }, [profile?.id])

  const loadTodayAppointments = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          scheduled_at,
          status,
          mode,
          patient_id,
          doctor_provider_id,
          provider_profiles(full_name),
          patient_profiles(full_name, patient_code, phone)
        `)
        .gte('scheduled_at', startOfDay.toISOString())
        .lte('scheduled_at', endOfDay.toISOString())
        .order('scheduled_at', { ascending: true })

      if (error) throw error

      const mapped: ReceptionAppointment[] = (data || []).map((a: any) => ({
        id: a.id,
        scheduled_at: a.scheduled_at,
        status: a.status,
        mode: a.mode,
        patient_id: a.patient_id,
        doctor_provider_id: a.doctor_provider_id,
        doctor_name: a.provider_profiles?.full_name ?? 'Doctor',
        patient_name: a.patient_profiles?.full_name ?? 'Patient',
        patient_code: a.patient_profiles?.patient_code ?? '—',
        phone: a.patient_profiles?.phone ?? ''
      }))

      setAppointments(mapped)
    } catch (e: unknown) {
      console.error('Error loading reception queue:', e)
      setLoadError(
        e instanceof Error
          ? e.message
          : (hindi
              ? 'आज का आगमन शेड्यूल लोड नहीं हो सका।'
              : 'Could not load today’s arrival schedule.')
      )
    } finally {
      setLoading(false)
    }
  }, [hindi])

  // Live reception queue (h1_queue) is facility + date scoped. Returns the
  // normalised rows so a check-in can read the server-minted token_number from
  // the queue row it just created (h1_check_in returns the queue UUID, not a token).
  const loadQueue = useCallback(async (): Promise<QueueRow[]> => {
    if (!facilityId) {
      setQueue([])
      setQueueLoading(false)
      return []
    }
    setQueueLoading(true)
    setQueueError('')
    try {
      const today = localServiceDate()
      const { data, error } = await supabase.rpc('h1_queue', {
        p_facility: facilityId,
        p_date: today,
        p_offset: 0
      })
      if (error) throw error
      const rows = normalizeQueue(data)
      setQueue(rows)
      return rows
    } catch (e: unknown) {
      // h1_queue may be unavailable; degrade truthfully to the arrival list.
      setQueue([])
      setQueueError(e instanceof Error ? e.message : String(e))
      return []
    } finally {
      setQueueLoading(false)
    }
  }, [facilityId])

  useEffect(() => {
    void loadTodayAppointments()
  }, [loadTodayAppointments])

  // Department setup (h1_setup) is facility-scoped and supplies the optional
  // departments a check-in can be routed to (h1_check_in's p_department is nullable).
  useEffect(() => {
    if (!facilityId) return
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('h1_setup', {
          p_facility: facilityId,
          p_offset: 0
        })
        if (error || !active) return
        const rows = asRows(data, ['departments', 'facility_departments', 'data'])
        setDepartments(
          rows
            .map((d) => ({
              id: String(d.id ?? ''),
              name: String(d.name ?? d.department_name ?? d.id ?? '')
            }))
            .filter((d) => d.id)
        )
      } catch {
        /* setup is best-effort only */
      }
    })()
    return () => {
      active = false
    }
  }, [facilityId])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue, version])

  // Real check-in via h1_check_in (013):
  //   h1_check_in(p_facility, p_appointment, p_department, p_request)
  // Returns the reception_queue UUID (NOT a token number). p_department is
  // nullable — check-in is NOT blocked when no department is chosen. After the
  // server mints the queue row we reload h1_queue and read the real token_number
  // from that returned row. No token is fabricated.
  async function handleCheckIn(appt: ReceptionAppointment) {
    if (!facilityId) return
    setBusyId(appt.id)
    setNotice('')
    try {
      const { data, error } = await supabase.rpc('h1_check_in', {
        p_facility: facilityId,
        p_appointment: appt.id,
        p_department: department || null,
        p_request: reqId()
      })
      if (error) throw error
      // The RPC returns the queue row UUID; resolve the human token from h1_queue.
      const queueId =
        data && typeof data === 'object'
          ? str(
              (data as Record<string, unknown>).queue_id ??
                (data as Record<string, unknown>).id
            )
          : typeof data === 'string'
            ? data
            : null
      const rows = await loadQueue()
      const row = queueId ? rows.find((r) => r.id === queueId) : undefined
      const token = row?.token_number ?? row?.token ?? null
      setVersion((v) => v + 1)
      void loadTodayAppointments()
      setNotice(
        token
          ? (hindi
              ? `${appt.patient_name} (${appt.patient_code}) चेक-इन हुआ। टोकन: ${token}`
              : `Checked in ${appt.patient_name} (${appt.patient_code}). Token: ${token}`)
          : (hindi
              ? `${appt.patient_name} (${appt.patient_code}) चेक-इन हुआ। टोकन कतार में दिखाई देगा।`
              : `Checked in ${appt.patient_name} (${appt.patient_code}). Token will appear in the live queue.`)
      )
      setTimeout(() => setNotice(''), 6000)
    } catch (e: unknown) {
      setNotice(
        (hindi
          ? 'चेक-इन विफल — सर्वर ने कहा: '
          : 'Check-in failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
      setTimeout(() => setNotice(''), 8000)
    } finally {
      setBusyId(null)
    }
  }

  // Advance a live queue entry via h1_queue_transition(p_queue, p_state).
  async function transition(row: QueueRow, state: string) {
    setBusyId(row.id)
    setNotice('')
    try {
      const { error } = await supabase.rpc('h1_queue_transition', {
        p_queue: row.id,
        p_state: state
      })
      if (error) throw error
      setVersion((v) => v + 1)
    } catch (e: unknown) {
      setNotice(
        (hindi ? 'कतार संक्रमण विफल — सर्वर ने कहा: ' : 'Queue transition failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
      setTimeout(() => setNotice(''), 8000)
    } finally {
      setBusyId(null)
    }
  }

  const filtered = appointments.filter(a => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (a.patient_name && a.patient_name.toLowerCase().includes(q)) ||
      (a.patient_code && a.patient_code.toLowerCase().includes(q)) ||
      (a.phone && a.phone.includes(q)) ||
      (a.doctor_name && a.doctor_name.toLowerCase().includes(q))
    )
  })

  const queueColumns: TableColumn<QueueRow>[] = [
    {
      key: 'token',
      header: hindi ? 'टोकन' : 'Token',
      width: '110px',
      render: r => (
        <span className="font-mono font-semibold text-foreground">
          {r.token ?? r.token_number ?? '—'}
        </span>
      )
    },
    {
      key: 'patient',
      header: hindi ? 'रोगी' : 'Patient',
      render: r => (
        <div>
          <p className="text-sm font-semibold text-foreground">{r.patient_name ?? '—'}</p>
          {r.patient_code && (
            <p className="font-mono text-xs text-muted-foreground">{r.patient_code}</p>
          )}
        </div>
      )
    },
    {
      key: 'department',
      header: hindi ? 'विभाग' : 'Department',
      render: r => <span className="text-xs text-foreground">{r.department ?? '—'}</span>
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
      width: '220px',
      render: r => {
        const closed = ['COMPLETED', 'CANCELLED', 'SERVED'].includes(r.status)
        return (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={closed || busyId === r.id}
              onClick={() => void transition(r, 'CALLED')}
            >
              {hindi ? 'बुलाएँ' : 'Call'}
            </Button>
            <Button
              size="sm"
              disabled={closed || busyId === r.id}
              onClick={() => void transition(r, 'SERVING')}
            >
              {hindi ? 'सेवा में' : 'Serve'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={closed || busyId === r.id}
              onClick={() => void transition(r, 'COMPLETED')}
            >
              {hindi ? 'पूर्ण' : 'Done'}
            </Button>
          </div>
        )
      }
    }
  ]

  const columns: TableColumn<ReceptionAppointment>[] = [
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
      header: hindi ? 'रोगी का नाम व कोड' : 'Patient Information',
      render: r => (
        <div>
          <p className="font-semibold text-foreground text-sm">{r.patient_name}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {r.patient_code} {r.phone ? `· ${r.phone}` : ''}
          </p>
        </div>
      )
    },
    {
      key: 'doctor',
      header: hindi ? 'परामर्श डॉक्टर' : 'Consulting Doctor',
      render: r => (
        <span className="text-xs font-medium text-foreground">
          Dr. {r.doctor_name}
        </span>
      )
    },
    {
      key: 'status',
      header: hindi ? 'अपॉइंटमेंट स्थिति' : 'Status',
      width: '120px',
      render: r => <StatusBadge status={r.status} />
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      width: '200px',
      render: r => {
        const closed = r.status === 'COMPLETED' || r.status === 'CANCELLED'
        const canCheckIn = !!facilityId && !closed
        return (
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!canCheckIn || busyId === r.id}
              onClick={() => void handleCheckIn(r)}
              title={
                canCheckIn
                  ? hindi
                    ? 'चेक-इन server-minted टोकन बनाता है; विभाग वैकल्पिक है'
                    : 'Check-in mints a server token; department is optional'
                  : hindi
                    ? 'चेक-इन के लिए सुविधा संदर्भ आवश्यक है'
                    : 'Facility context is required to check in'
              }
            >
              <Ticket className="size-3.5 mr-1" />
              {hindi ? 'चेक-इन / टोकन' : 'Check-in / Token'}
            </Button>
          </div>
        )
      }
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            {hindi ? 'रिसेप्शन व टोकन डेस्क' : 'Reception & Patient Check-in Desk'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'आगमन चेक-इन, ओपीडी टोकन और लाइव प्रतीक्षा कतार — रिसेप्शन कॉन्ट्रैक्ट (h1_*) द्वारा संचालित।'
              : 'Patient arrival check-in, OPD tokens and the live waiting queue — driven by the reception contracts (h1_*).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {departments.length > 0 && (
            <select
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">{hindi ? 'सभी विभाग' : 'All departments'}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button size="sm" variant="outline" onClick={() => setVersion(v => v + 1)} disabled={queueLoading}>
            <RefreshCw className="size-3.5 mr-1" />
            {hindi ? 'नई जानकारी' : 'Refresh'}
          </Button>
          <Badge tone={queueAvailable ? 'outline' : 'warning'} className="py-1 text-xs">
            <Users className="size-3.5 mr-1" />
            {queueAvailable
              ? (hindi ? 'लाइव कतार · h1_queue' : 'Live queue · h1_queue')
              : (hindi ? 'कतार अनुपलब्ध' : 'Queue unavailable')}
          </Badge>
        </div>
      </div>

      {/* FACILITY CONTEXT REQUIRED */}
      {!facilityId && (
        <Card className="border-warning/30 bg-warning/10 p-3.5">
          <p className="text-xs font-semibold text-warning-foreground">
            {hindi
              ? 'सुविधा संदर्भ आवश्यक है — h1_queue / h1_setup / h1_check_in सुविधा-स्कॉप्ड हैं। इस खाते के लिए facility_memberships से कोई सुविधा नहीं मिली, इसलिए लाइव कतार और चेक-इन निष्क्रिय हैं। कोई टोकन कल्पित नहीं किया गया।'
              : 'Facility context required — h1_queue / h1_setup / h1_check_in are facility-scoped. No facility was resolved from facility_memberships for this account, so the live queue and check-in are disabled. No tokens are invented.'}
          </p>
        </Card>
      )}

      {/* NOTICE ALERT */}
      {notice && (
        <Card className="animate-in fade-in border-info/30 bg-info/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertCircle className="size-4 shrink-0 text-info" />
            <span>{notice}</span>
          </div>
        </Card>
      )}

      {/* LOAD ERROR */}
      {loadError && (
        <Card className="space-y-2 border-destructive/30 bg-destructive/10 p-3.5">
          <p className="text-xs font-semibold text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void loadTodayAppointments()}>
            {hindi ? 'फिर कोशिश करें' : 'Retry'}
          </Button>
        </Card>
      )}

      {/* LIVE RECEPTION QUEUE (013) */}
      <Card className="space-y-4">
        <SectionTitle
          title={hindi ? 'लाइव ओपीडी कतार' : 'Live OPD Queue'}
          sub={
            queueError
              ? (hindi
                  ? `reception_queue उपलब्ध नहीं है (h1_queue)। कोई टोकन कल्पित नहीं किया गया। सर्वर: ${queueError}`
                  : `reception_queue unavailable (h1_queue). No tokens are invented. Server: ${queueError}`)
              : (hindi
                  ? 'reception_queue से वास्तविक टोकन और स्थिति; संक्रमण h1_queue_transition द्वारा।'
                  : 'Real tokens and status from reception_queue; transitions via h1_queue_transition.')
          }
          icon={<Ticket className="size-4" />}
        />
        {!queueError && (
          <ClinicalTable
            columns={queueColumns}
            data={queue}
            keyField="id"
            loading={queueLoading}
            emptyMessage={
              hindi
                ? 'अभी कतार में कोई टोकन नहीं है।'
                : 'No tokens in the queue yet.'
            }
          />
        )}
      </Card>

      {/* SEARCH INPUT */}
      <div className="max-w-md">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={
            hindi
              ? 'रोगी का नाम, पर्ची कोड या मोबाइल नंबर खोजें…'
              : 'Search arrival by patient name, ID, phone…'
          }
        />
      </div>

      {/* ARRIVAL TABLE */}
      <Card className="space-y-4">
        <SectionTitle
          title={hindi ? 'आज का ओपीडी आगमन शेड्यूल' : "Today's OPD Arrival List"}
          sub={
            hindi
              ? 'वास्तविक अपॉइंटमेंट; चेक-इन h1_check_in से टोकन जारी करता है।'
              : 'Live appointments; check-in mints a token via h1_check_in.'
          }
          icon={<Clock className="size-4" />}
        />

        <ClinicalTable
          columns={columns}
          data={filtered}
          keyField="id"
          loading={loading}
          emptyMessage={
            hindi
              ? 'आज के आगमन शेड्यूल में कोई मरीज नहीं है।'
              : 'No patient arrivals scheduled for today.'
          }
        />
      </Card>
    </div>
  )
}
