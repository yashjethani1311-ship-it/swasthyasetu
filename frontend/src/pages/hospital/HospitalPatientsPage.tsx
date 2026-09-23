import { useEffect, useState } from 'react'
import {
  Users,
  Search,
  ShieldCheck,
  Phone,
  MapPin,
  Calendar,
  UserRound,
  Filter
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ClinicalTable,
  SearchInput,
  StatusBadge,
  type TableColumn
} from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type PatientRecord = {
  id: string
  patient_code: string
  full_name: string | null
  date_of_birth: string | null
  sex: string | null
  phone: string | null
  city: string | null
  state: string | null
  preferred_language: string | null
  abha_number_masked: string | null
  abha_address: string | null
  abha_link_status: string | null
}

export function HospitalPatientsPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [patients, setPatients] = useState<PatientRecord[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadPatients()
  }, [])

  async function loadPatients() {
    setLoading(true)
    setError('')

    try {
      const { data, error: pErr } = await supabase
        .from('patient_profiles')
        .select(`
          id,
          patient_code,
          full_name,
          date_of_birth,
          sex,
          phone,
          city,
          state,
          preferred_language,
          abha_number_masked,
          abha_address,
          abha_link_status
        `)
        .order('patient_code', { ascending: true })
        .limit(50)

      if (pErr) throw pErr
      setPatients(data || [])
    } catch (e: unknown) {
      console.error('Failed to load patient directory:', e)
      setError(e instanceof Error ? e.message : 'Unable to load patient records.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = patients.filter(p => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      (p.full_name && p.full_name.toLowerCase().includes(q)) ||
      (p.patient_code && p.patient_code.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.abha_address && p.abha_address.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q))
    )
  })

  const columns: TableColumn<PatientRecord>[] = [
    {
      key: 'patient_code',
      header: hindi ? 'रोगी कोड' : 'Patient ID',
      width: '120px',
      render: r => (
        <span className="font-mono text-xs font-bold text-foreground">
          {r.patient_code}
        </span>
      )
    },
    {
      key: 'full_name',
      header: hindi ? 'रोगी का नाम' : 'Full Name',
      render: r => (
        <div>
          <p className="font-semibold text-foreground text-sm">
            {r.full_name || (hindi ? 'रोगी' : 'Patient')}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.sex || '—'} · {r.date_of_birth ? `${r.date_of_birth}` : 'DOB not recorded'}
          </p>
        </div>
      )
    },
    {
      key: 'abha',
      header: hindi ? 'ABHA स्थिति' : 'ABHA Identity',
      render: r => (
        <div>
          <p className="text-xs font-medium text-foreground">
            {r.abha_address || r.abha_number_masked || '—'}
          </p>
          <div className="mt-0.5">
            <StatusBadge status={r.abha_link_status ?? 'NOT_LINKED'} />
          </div>
        </div>
      )
    },
    {
      key: 'contact',
      header: hindi ? 'संपर्क / शहर' : 'Contact & Location',
      render: r => (
        <div className="text-xs text-muted-foreground">
          <p className="font-tabular text-foreground">{r.phone || 'No phone'}</p>
          <p>{r.city ? `${r.city}${r.state ? `, ${r.state}` : ''}` : 'Location unrecorded'}</p>
        </div>
      )
    },
    {
      key: 'language',
      header: hindi ? 'भाषा' : 'Language',
      width: '100px',
      render: r => (
        <Badge tone="neutral">{r.preferred_language || (hindi ? 'दर्ज नहीं' : 'Not recorded')}</Badge>
      )
    }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl text-foreground">
            {hindi ? 'रोगी मास्टर इंडेक्स (MPI)' : 'Master Patient Index (MPI)'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'अस्पताल के सभी पंजीकृत रोगियों का जनसांख्यिकीय और ABHA विवरण।'
              : 'Enterprise registry of all registered hospital patients, ABHA links, and demographic records.'}
          </p>
        </div>

        <Badge tone="primary" className="text-xs py-1">
          <Users className="size-3.5 mr-1" />
          {patients.length}
          {patients.length >= 50 ? '+' : ''} {hindi ? 'रिकॉर्ड लोड' : 'records loaded'}
        </Badge>
      </div>

      {/* SEARCH BAR */}
      <div className="max-w-md">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={
            hindi
              ? 'नाम, रोगी संख्या, ABHA या फोन से खोजें…'
              : 'Search by name, Patient Code, ABHA, or phone…'
          }
        />
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* PATIENT TABLE */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            {filtered.length} {hindi ? 'परिणाम' : 'records found'}
          </p>
        </div>

        <ClinicalTable
          columns={columns}
          data={filtered}
          keyField="id"
          loading={loading}
          emptyMessage={
            hindi
              ? 'कोई रोगी रिकॉर्ड नहीं मिला।'
              : 'No patient profiles found matching your search query.'
          }
        />
      </Card>
    </div>
  )
}
