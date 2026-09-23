import { useEffect, useState } from 'react'
import {
  Stethoscope,
  Clock,
  UserCheck,
  Users,
  Search,
  Filter,
  CheckCircle2
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

type OpdQueueRow = {
  id: string
  scheduled_at: string
  mode: string
  status: string
  doctor_provider_id: string
  doctor_name?: string
  specialization?: string
  patient_name?: string
  patient_code?: string
}

export function HospitalOpdPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<OpdQueueRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedDoctor, setSelectedDoctor] = useState('')

  useEffect(() => {
    loadQueue()
  }, [])

  async function loadQueue() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          scheduled_at,
          mode,
          status,
          doctor_provider_id,
          provider_profiles(full_name, specialization),
          patient_profiles(full_name, patient_code)
        `)
        .in('status', ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])
        .order('scheduled_at', { ascending: true })

      if (error) throw error

      const mapped: OpdQueueRow[] = (data || []).map((a: any) => ({
        id: a.id,
        scheduled_at: a.scheduled_at,
        mode: a.mode,
        status: a.status,
        doctor_provider_id: a.doctor_provider_id,
        doctor_name: a.provider_profiles?.full_name ?? 'Doctor',
        specialization: a.provider_profiles?.specialization ?? '—',
        patient_name: a.patient_profiles?.full_name ?? 'Patient',
        patient_code: a.patient_profiles?.patient_code ?? '—'
      }))

      setQueue(mapped)
    } catch (e: unknown) {
      console.error('Failed to load OPD queue:', e)
    } finally {
      setLoading(false)
    }
  }

  const doctors = Array.from(
    new Set(queue.map(q => q.doctor_name).filter(Boolean) as string[])
  )

  const filtered = queue.filter(q => {
    const matchSearch =
      !search.trim() ||
      (q.patient_name && q.patient_name.toLowerCase().includes(search.toLowerCase())) ||
      (q.patient_code && q.patient_code.toLowerCase().includes(search.toLowerCase())) ||
      (q.doctor_name && q.doctor_name.toLowerCase().includes(search.toLowerCase()))

    const matchDoc = !selectedDoctor || q.doctor_name === selectedDoctor

    return matchSearch && matchDoc
  })

  const columns: TableColumn<OpdQueueRow>[] = [
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
      header: hindi ? 'रोगी' : 'Patient',
      render: r => (
        <div>
          <p className="font-semibold text-foreground text-sm">{r.patient_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{r.patient_code}</p>
        </div>
      )
    },
    {
      key: 'doctor',
      header: hindi ? 'डॉक्टर / क्लिनिक' : 'Physician & Dept',
      render: r => (
        <div>
          <p className="text-xs font-semibold text-foreground">Dr. {r.doctor_name}</p>
          <p className="text-[11px] text-muted-foreground">{r.specialization}</p>
        </div>
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
      header: hindi ? 'स्थिति' : 'Queue State',
      width: '130px',
      render: r => <StatusBadge status={r.status} />
    }
  ]

  const waitingCount = filtered.filter(q => q.status === 'CONFIRMED').length
  const activeCount = filtered.filter(q => q.status === 'IN_PROGRESS').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl text-foreground">
            {hindi ? 'ओपीडी कतार व कंसल्टेशन ट्रैकर' : 'Hospital OPD Queue & Consultation Tracker'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'विभागवार बाह्य रोगी कतार, प्रतीक्षारत मरीज और परामर्श स्थिति।'
              : 'Multi-department outpatient queues, consultation progress, and waiting time monitoring.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone="warning">
            {waitingCount} {hindi ? 'प्रतीक्षारत' : 'Waiting'}
          </Badge>
          <Badge tone="success">
            {activeCount} {hindi ? 'परामर्श में' : 'In Consultation'}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              hindi
                ? 'रोगी का नाम, कोड या डॉक्टर खोजें…'
                : 'Search patient, doctor, or code…'
            }
          />
        </div>

        {doctors.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground shrink-0" />
            <select
              value={selectedDoctor}
              onChange={e => setSelectedDoctor(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:outline-hidden"
            >
              <option value="">{hindi ? 'सभी डॉक्टर' : 'All Physicians'}</option>
              {doctors.map(doc => (
                <option key={doc} value={doc}>
                  Dr. {doc}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Card className="space-y-3">
        <ClinicalTable
          columns={columns}
          data={filtered}
          keyField="id"
          loading={loading}
          emptyMessage={
            hindi
              ? 'ओपीडी कतार में कोई सक्रिय मरीज नहीं है।'
              : 'No patients found in the active OPD queue.'
          }
        />
      </Card>
    </div>
  )
}
