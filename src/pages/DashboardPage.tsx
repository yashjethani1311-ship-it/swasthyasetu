import { useEffect, useState } from 'react'
import { Activity, CalendarCheck, FileText, Pill, ShieldCheck, Stethoscope } from 'lucide-react'
import { Card, EmptyState, Stat } from '@/components/kit'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export function DashboardPage() {
  const { profile } = useAuth()
  if (!profile) return null
  if (profile.role === 'PATIENT') return <PatientDashboard />
  return <ProviderDashboard />
}

function PatientDashboard() {
  const [counts, setCounts] = useState({appointments:0,records:0,prescriptions:0,gaps:0})
  const [loading,setLoading]=useState(true)
  useEffect(()=>{(async()=>{ const { data: patient } = await supabase.from('patient_profiles').select('id').eq('user_id',(await supabase.auth.getUser()).data.user?.id).maybeSingle(); if(!patient){setLoading(false);return} const pid=patient.id; const [a,r,p,g]=await Promise.all([supabase.from('appointments').select('id',{count:'exact',head:true}).eq('patient_id',pid),supabase.from('health_records').select('id',{count:'exact',head:true}).eq('patient_id',pid),supabase.from('prescriptions').select('id',{count:'exact',head:true}).eq('patient_id',pid),supabase.from('care_gaps').select('id',{count:'exact',head:true}).eq('patient_id',pid).eq('status','OPEN')]); setCounts({appointments:a.count??0,records:r.count??0,prescriptions:p.count??0,gaps:g.count??0}); setLoading(false) })()},[])
  return <div><h1 className="text-2xl font-bold">My care journey</h1><p className="mt-1 text-sm text-muted-foreground">Everything here comes from records actually created or uploaded in SwasthyaSetu.</p><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Appointments" value={loading?'—':counts.appointments} icon={<CalendarCheck className="size-4"/>}/><Stat label="Health Records" value={loading?'—':counts.records} icon={<FileText className="size-4"/>}/><Stat label="Prescriptions" value={loading?'—':counts.prescriptions} icon={<Stethoscope className="size-4"/>}/><Stat label="Open Care Gaps" value={loading?'—':counts.gaps} icon={<Activity className="size-4"/>} tone={counts.gaps?'warning':'success'}/></div><Card className="mt-6"><h2 className="text-lg font-semibold">Next step</h2><div className="mt-4"><EmptyState text="No next action has been created yet. Book care or upload an existing health record to begin."/></div></Card></div>
}
function ProviderDashboard(){const{profile}=useAuth();const[provider,setProvider]=useState<any>(null);useEffect(()=>{supabase.from('provider_profiles').select('*').eq('user_id',profile?.id).maybeSingle().then(({data})=>setProvider(data))},[profile?.id]);return <div><h1 className="text-2xl font-bold">{profile?.role} workspace</h1><p className="mt-1 text-sm text-muted-foreground">No patient or clinical data is seeded into this workspace.</p><div className="mt-6 grid gap-4 md:grid-cols-3"><Stat label="Verification" value={provider?.verification_status??'Pending'} icon={<ShieldCheck className="size-4"/>}/><Stat label="Assigned work" value="0" icon={<Activity className="size-4"/>}/><Stat label="Active patients" value="0" icon={<Pill className="size-4"/>}/></div><Card className="mt-6"><EmptyState text={provider?.verification_status==='APPROVED'?'No work has been assigned yet.':'Your clinical/provider actions remain locked until provider verification is approved.'}/></Card></div>}
