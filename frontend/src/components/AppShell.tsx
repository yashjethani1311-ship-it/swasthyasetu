import type { ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { PatientShell } from './shells/PatientShell'
import { DoctorShell } from './shells/DoctorShell'
import { HospitalShell } from './shells/HospitalShell'
import { AncillaryShell } from './shells/AncillaryShell'

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth()

  if (!profile) {
    return <div className="min-h-screen bg-surface">{children}</div>
  }

  if (profile.role === 'PATIENT') {
    return <PatientShell>{children}</PatientShell>
  }

  if (profile.role === 'DOCTOR') {
    return <DoctorShell>{children}</DoctorShell>
  }

  if (profile.role === 'FACILITY' || profile.role === 'ADMIN') {
    return <HospitalShell>{children}</HospitalShell>
  }

  return <AncillaryShell role={profile.role}>{children}</AncillaryShell>
}