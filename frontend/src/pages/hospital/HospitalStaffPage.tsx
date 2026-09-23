import { resolveFacilityId } from '@/lib/facility'
import { useAuth } from '@/lib/auth'
import { useEffect, useState } from 'react'
import {
  Users,
  Search,
  ShieldCheck,
  Stethoscope,
  Activity,
  Pill,
  Filter
} from 'lucide-react'
import {
  Badge,
  Card,
  ClinicalTable,
  SearchInput,
  StatusBadge,
  type TableColumn
} from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type StaffMember = {
  id: string
  full_name: string
  provider_type: string
  registration_id: string | null
  specialization: string | null
  organization_name: string | null
  verification_status: string
}

export function HospitalStaffPage() {
  const { profile } = useAuth()
  const [offset, setOffset] = useState(0)
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadStaff()
  }, [profile?.id, offset])

  async function loadStaff() {
    setLoading(true)
    setError('')

    try {
      const facility = await resolveFacilityId(profile?.id)
      if (!facility) throw new Error('No operational facility membership is available.')
      const { data, error: sErr } = await supabase.rpc('h4_staff', {p_facility:facility,p_offset:offset})
      if (sErr) throw sErr
      setStaff((data ?? []).map((r:any)=>({...r, full_name:r.full_name ?? 'Name not recorded', provider_type:r.provider_type ?? r.staff_role, verification_status:r.active ? 'MEMBERSHIP_ACTIVE' : 'MEMBERSHIP_INACTIVE'})))
    } catch (e: unknown) {
      console.error('Failed to load hospital staff:', e)
      setError(e instanceof Error ? e.message : 'Unable to load clinical staff directory.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = staff.filter(s => {
    const matchQuery =
      !query.trim() ||
      s.full_name.toLowerCase().includes(query.toLowerCase()) ||
      (s.registration_id && s.registration_id.toLowerCase().includes(query.toLowerCase())) ||
      (s.specialization && s.specialization.toLowerCase().includes(query.toLowerCase()))

    const matchRole = !roleFilter || s.provider_type === roleFilter

    return matchQuery && matchRole
  })

  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'full_name',
      header: hindi ? 'प्रोफेशनल का नाम' : 'Practitioner Name',
      render: r => (
        <div>
          <p className="font-semibold text-foreground text-sm">
            {r.provider_type === 'DOCTOR' ? `Dr. ${r.full_name}` : r.full_name}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {r.registration_id ? `Reg: ${r.registration_id}` : 'Reg not specified'}
          </p>
        </div>
      )
    },
    {
      key: 'provider_type',
      header: hindi ? 'भूमिका' : 'Role & Cadre',
      width: '140px',
      render: r => (
        <Badge tone={r.provider_type === 'DOCTOR' ? 'primary' : r.provider_type === 'LAB' ? 'teal' : 'neutral'}>
          {r.provider_type}
        </Badge>
      )
    },
    {
      key: 'specialization',
      header: hindi ? 'विशेषज्ञता / विभाग' : 'Specialization',
      render: r => (
        <span className="text-xs font-medium text-foreground">
          {r.specialization || (hindi ? 'विशेषज्ञता दर्ज नहीं' : 'Specialization not recorded')}
        </span>
      )
    },
    {
      key: 'verification_status',
      header: hindi ? 'सत्यापन स्थिति' : 'Verification Status',
      width: '150px',
      render: r => <StatusBadge status={r.verification_status} />
    }
  ]

  return (
    <div className="space-y-6"><div className="flex gap-3"><button disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button disabled={staff.length<50||offset>=9950} onClick={()=>setOffset(offset+50)}>Next</button><span>Facility membership · page {offset/50+1}</span></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl text-foreground">
            {hindi ? 'अस्पताल डॉक्टर व स्टाफ रोस्टर' : 'Hospital Medical Staff & Doctors Roster'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'सत्यापित चिकित्सक, प्रयोगशाला विशेषज्ञ, फार्मासिस्ट और समुदाय स्वास्थ्य कार्यकर्ता।'
              : 'Listed clinical practitioners, lab specialists, pharmacists, and community health workforce.'}
          </p>
        </div>

        <Badge tone="success" className="text-xs py-1">
          <ShieldCheck className="size-3.5 mr-1" />
          {staff.length} {hindi ? 'कर्मचारी दर्ज' : 'Staff Records'}
        </Badge>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              hindi
                ? 'नाम, पंजीकरण संख्या या विशेषज्ञता से खोजें…'
                : 'Search by practitioner name, registration ID, or specialty…'
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground shrink-0" />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold focus:border-primary focus:outline-hidden"
          >
            <option value="">{hindi ? 'सभी भूमिकाएँ' : 'All Roles'}</option>
            <option value="DOCTOR">Doctor</option>
            <option value="LAB">Laboratory</option>
            <option value="PHARMACY">Pharmacy</option>
            <option value="WORKER">Community Worker</option>
          </select>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      <Card className="space-y-3">
        <ClinicalTable
          columns={columns}
          data={filtered}
          keyField="id"
          loading={loading}
          emptyMessage={
            hindi
              ? 'कोई डॉक्टर या स्टाफ रिकॉर्ड नहीं मिला।'
              : 'No staff profiles matched your search criteria.'
          }
        />
      </Card>
    </div>
  )
}
