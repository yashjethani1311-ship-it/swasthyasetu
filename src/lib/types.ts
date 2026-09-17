export type AppRole = 'PATIENT' | 'DOCTOR' | 'LAB' | 'PHARMACY' | 'WORKER' | 'FACILITY' | 'ADMIN'
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

export type Profile = {
  id: string
  role: AppRole
  full_name: string | null
}

export type PatientProfile = {
  id: string
  user_id: string
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
  abha_link_status: 'NOT_LINKED' | 'VERIFICATION_PENDING' | 'VERIFIED'
}

export type ProviderProfile = {
  id: string
  user_id: string
  provider_type: Exclude<AppRole, 'PATIENT' | 'ADMIN'>
  full_name: string
  registration_id: string | null
  specialization: string | null
  organization_name: string | null
  verification_status: VerificationStatus
}
