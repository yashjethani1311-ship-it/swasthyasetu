import { useState } from 'react'
import { Printer, ShieldCheck, AlertCircle, FileText, CheckCircle2, QrCode } from 'lucide-react'
import { Button, Badge } from '@/components/kit'

export interface PrescriptionData {
  id: string
  prescriptionNumber?: string
  issuedAt: string
  status?: string

  // Facility Info
  facility?: {
    name: string
    address?: string | null
    phone?: string | null
    hfrId?: string | null
    email?: string | null
  } | null

  // Doctor Info
  doctor: {
    name: string
    qualification?: string | null
    specialty?: string | null
    registrationNumber?: string | null
    hprId?: string | null
    signatureText?: string | null
    verified?: boolean | null
  }

  // Patient Info
  patient: {
    id?: string
    name: string
    age?: number | string | null
    dob?: string | null
    gender?: string | null
    patientCode?: string | null
    abhaAddress?: string | null
    phone?: string | null
  }

  // Clinical Summary
  encounterNumber?: string | null
  chiefComplaints?: string | null
  diagnosis?: string | null
  allergies?: string[] | string | null
  vitals?: {
    bloodPressure?: string | null
    pulseBpm?: number | string | null
    spo2Percent?: number | string | null
    temperatureF?: number | string | null
    weightKg?: number | string | null
    heightCm?: number | string | null
  } | null

  // Medication Lines
  items: Array<{
    id?: string
    medicineName: string
    genericName?: string | null
    strength?: string | null
    dosageForm?: string | null // Tab, Cap, Syp, Inj, etc.
    route?: string | null // Oral, IV, Topical, etc.
    dose?: string | null
    frequency?: string | null // 1-0-1, Once daily, etc.
    duration?: string | null // 5 days
    quantity?: number | string | null
    timing?: string | null // After food, Before food, Bedtime
    instructions?: string | null
  }>

  // Advised Care
  investigationsAdvised?: string[] | string | null
  referralAdvised?: string | null
  followUpDays?: number | string | null
  followUpDate?: string | null
  specialInstructions?: string | null
}

export type PrintablePrescriptionProps =
  | { data: PrescriptionData; onClose?: () => void; prescription?: never; patient?: never }
  | { prescription: any; patient?: any; onClose?: () => void; data?: never }

export function PrintablePrescription(props: PrintablePrescriptionProps) {
  const onClose = props.onClose

  const data: PrescriptionData = props.data ?? {
    id: props.prescription.id || 'RX',
    prescriptionNumber: props.prescription.id ? `RX-${props.prescription.id.slice(0, 8).toUpperCase()}` : undefined,
    issuedAt: props.prescription.issued_at || props.prescription.issuedAt || '',
    status: props.prescription.status || 'Status not recorded',
    facility: props.prescription.facility || (props.prescription.doctor?.organization_name ? {
      name: props.prescription.doctor.organization_name,
      address: props.prescription.doctor.practice_address || null,
    } : null),
    doctor: {
      name: props.prescription.doctor?.name || props.prescription.doctor?.full_name || 'Prescriber not recorded',
      qualification: props.prescription.doctor?.qualification || null,
      specialty: props.prescription.doctor?.specialty || props.prescription.doctor?.specialization || null,
      registrationNumber: props.prescription.doctor?.registration_number || props.prescription.doctor?.registrationNumber || null,
      hprId: props.prescription.doctor?.hpr_id || props.prescription.doctor?.hprId || null,
      signatureText: props.prescription.doctor?.full_name || props.prescription.doctor?.name || null,
      verified: Boolean(props.prescription.doctor?.verified ?? props.prescription.signature_verified)
    },
    patient: {
      id: props.patient?.id,
      name: props.patient?.full_name || props.patient?.name || 'Patient',
      age: props.patient?.age,
      gender: props.patient?.gender,
      patientCode: props.patient?.patient_code || props.patient?.patientCode,
      abhaAddress: props.patient?.abha_number_masked || props.patient?.abhaAddress
    },
    encounterNumber: props.prescription.encounterNumber,
    chiefComplaints: props.prescription.chief_complaints || props.prescription.chiefComplaints,
    diagnosis: props.prescription.diagnosis,
    allergies: props.prescription.allergies,
    vitals: props.prescription.vitals ? {
      bloodPressure: props.prescription.vitals.bp || props.prescription.vitals.bloodPressure,
      pulseBpm: props.prescription.vitals.pulse || props.prescription.vitals.pulseBpm,
      spo2Percent: props.prescription.vitals.spo2 || props.prescription.vitals.spo2Percent,
      temperatureF: props.prescription.vitals.temp || props.prescription.vitals.temperatureF,
      weightKg: props.prescription.vitals.weight || props.prescription.vitals.weightKg,
    } : null,
    items: (props.prescription.items || []).map((it: any) => ({
      id: it.id,
      medicineName: it.medicine_name || it.medicineName || 'Medicine',
      genericName: it.generic_name || it.genericName,
      strength: it.strength,
      dosageForm: it.dosage_form || it.dosageForm || null,
      route: it.route || null,
      dose: it.dose || it.dosage,
      frequency: it.frequency,
      duration: it.duration_days ? `${it.duration_days} days` : it.duration,
      quantity: it.quantity_prescribed ?? it.quantity,
      timing: it.timing || it.instructions,
      instructions: it.instructions
    })),
    investigationsAdvised: props.prescription.investigationsAdvised || props.prescription.investigations_advised,
    referralAdvised: props.prescription.referralAdvised || props.prescription.referral_advised,
    followUpDays: props.prescription.followUpDays || props.prescription.follow_up_days,
    followUpDate: props.prescription.follow_up_date || props.prescription.followUpDate,
    specialInstructions: props.prescription.clinical_notes || props.prescription.specialInstructions
  }

  const handlePrint = () => {
    window.print()
  }

  const formatAllergies = () => {
    if (!data.allergies) return 'No allergy documented'
    if (Array.isArray(data.allergies)) {
      return data.allergies.length > 0 ? data.allergies.join(', ') : 'No allergy documented'
    }
    return data.allergies.trim() ? data.allergies : 'No allergy documented'
  }

  const isNoAllergyDocumented = formatAllergies() === 'No allergy documented'

  return (
    <div className="space-y-4">
      {/* On-screen Action Toolbar (Hidden in Print) */}
      <div className="flex items-center justify-between gap-3 bg-secondary/30 p-3 rounded-xl border border-border print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Indian clinical A4 Prescription layout</p>
            <p className="text-xs text-muted-foreground">Standard clinical prescription record</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close Preview
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <Printer className="size-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* A4 Printable Document Container */}
      <div className="prescription-a4-document bg-white text-slate-900 border border-slate-300 rounded-lg p-8 shadow-sm font-sans max-w-[800px] mx-auto text-[13px] leading-relaxed print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full">
        {/* 1. Facility Header */}
        <header className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
              {data.facility?.name || 'Healthcare Facility'}
            </h1>
            {data.facility?.address && (
              <p className="text-xs text-slate-600 mt-0.5 max-w-md">{data.facility.address}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              {data.facility?.phone && <span>Tel: {data.facility.phone}</span>}
              {data.facility?.hfrId && <span>HFR ID: {data.facility.hfrId}</span>}
              {data.facility?.email && <span>Email: {data.facility.email}</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold border border-slate-300">
              <ShieldCheck className="size-3.5 text-teal-700" />
              <span>Electronic care record</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-1">
              Rx No: {data.prescriptionNumber || data.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-[11px] font-semibold text-slate-700">
              Status: <span className="font-mono">{data.status || 'Status not recorded'}</span>
            </p>
          </div>
        </header>

        {/* 2. Doctor & Patient Demographics Grid */}
        <div className="grid grid-cols-2 gap-4 pb-4 mb-4 border-b border-slate-200 text-xs">
          {/* Doctor Info */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prescribing Practitioner</p>
            <p className="text-sm font-bold text-slate-900">{data.doctor.name}</p>
            {(data.doctor.qualification || data.doctor.specialty) && (
              <p className="text-slate-700">
                {data.doctor.qualification || ''}
                {data.doctor.specialty ? (data.doctor.qualification ? ` · ${data.doctor.specialty}` : data.doctor.specialty) : ''}
              </p>
            )}
            <p className="text-slate-600">
              Reg No:{' '}
              {data.doctor.registrationNumber ? (
                <span className="font-semibold">{data.doctor.registrationNumber}</span>
              ) : (
                <span className="italic text-slate-500">Registration number not available</span>
              )}
            </p>
            {data.doctor.hprId && (
              <p className="text-slate-500 font-mono text-[11px]">HPR ID: {data.doctor.hprId}</p>
            )}
          </div>

          {/* Patient Info */}
          <div className="space-y-1 border-l border-slate-200 pl-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Patient Details</p>
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">{data.patient.name}</span>
              <span className="font-mono text-slate-600">
                {data.patient.patientCode ? `ID: ${data.patient.patientCode}` : ''}
              </span>
            </div>
            <p className="text-slate-700">
              <span>{data.patient.age ? `${data.patient.age} yrs` : data.patient.dob ? `DOB: ${data.patient.dob}` : 'Age: —'}</span>
              <span className="mx-1.5">/</span>
              <span>{data.patient.gender || 'Sex: Unspecified'}</span>
            </p>
            <div className="flex flex-wrap gap-x-3 text-slate-600 font-mono text-[11px]">
              {data.patient.abhaAddress && <span>ABHA: {data.patient.abhaAddress}</span>}
              {data.patient.phone && <span>Ph: {data.patient.phone}</span>}
            </div>
            <p className="text-slate-500 text-[11px] pt-1">
              Date: {data.issuedAt ? new Date(data.issuedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not recorded'}
            </p>
          </div>
        </div>

        {/* 3. Clinical Summary / Vitals & Allergies Banner */}
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {/* Allergies Notice (Strict Indian Clinical Requirement) */}
            <div
              className={`flex-1 min-w-[200px] p-2 rounded border ${
                isNoAllergyDocumented
                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                  : 'bg-amber-50 border-amber-200 text-amber-900 font-semibold'
              }`}
            >
              <span className="text-[10px] uppercase tracking-wider block font-bold">
                Drug Allergies / Contraindications
              </span>
              <span>{formatAllergies()}</span>
            </div>

            {/* Vitals Summary */}
            {data.vitals && (
              <div className="flex-1 min-w-[260px] p-2 rounded bg-slate-50 border border-slate-200 text-slate-700">
                <span className="text-[10px] uppercase tracking-wider block font-bold text-slate-500">
                  Recorded Clinical Vitals
                </span>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs font-mono">
                  {data.vitals.bloodPressure && <span>BP: {data.vitals.bloodPressure} mmHg</span>}
                  {data.vitals.pulseBpm && <span>Pulse: {data.vitals.pulseBpm} bpm</span>}
                  {data.vitals.spo2Percent && <span>SpO2: {data.vitals.spo2Percent}%</span>}
                  {data.vitals.temperatureF && <span>Temp: {data.vitals.temperatureF} °F</span>}
                  {data.vitals.weightKg && <span>Wt: {data.vitals.weightKg} kg</span>}
                </div>
              </div>
            )}
          </div>

          {/* Chief Complaints & Provisional Diagnosis */}
          {(data.chiefComplaints || data.diagnosis) && (
            <div className="p-2.5 rounded bg-slate-50/70 border border-slate-200 text-xs space-y-1">
              {data.chiefComplaints && (
                <p className="text-slate-800">
                  <span className="font-bold text-slate-900">Chief Complaints:</span> {data.chiefComplaints}
                </p>
              )}
              {data.diagnosis && (
                <p className="text-slate-800">
                  <span className="font-bold text-slate-900">Provisional / Final Diagnosis:</span>{' '}
                  <span className="font-semibold text-slate-950">{data.diagnosis}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* 4. Rx Symbol & Structured Medication Table */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2 border-b border-slate-900 pb-1">
            <span className="text-2xl font-serif font-black text-slate-900">℞</span>
            <span className="font-bold uppercase tracking-wider text-xs text-slate-700">
              Prescribed Medications (Generic Composition / Brand)
            </span>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-slate-800">
                <th className="py-1.5 px-2 font-bold w-6">#</th>
                <th className="py-1.5 px-2 font-bold">Medicine (Generic &amp; Brand Name)</th>
                <th className="py-1.5 px-2 font-bold w-24">Dosage Form</th>
                <th className="py-1.5 px-2 font-bold w-24">Dose &amp; Route</th>
                <th className="py-1.5 px-2 font-bold w-28">Frequency</th>
                <th className="py-1.5 px-2 font-bold w-20">Duration</th>
                <th className="py-1.5 px-2 font-bold w-14 text-center">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500 italic">
                    No medications prescribed in this consultation.
                  </td>
                </tr>
              ) : (
                data.items.map((it, idx) => (
                  <tr key={it.id || idx} className="align-top">
                    <td className="py-2 px-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <p className="font-bold text-slate-900">{it.medicineName}</p>
                      {it.genericName && (
                        <p className="text-[11px] text-slate-600">Generic: {it.genericName}</p>
                      )}
                      {it.strength && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700">
                          {it.strength}
                        </span>
                      )}
                      {(it.instructions || it.timing) && (
                        <p className="text-[11px] text-teal-800 italic mt-0.5">
                          Note: {it.timing ? `${it.timing}. ` : ''}{it.instructions || ''}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-700 font-medium">{it.dosageForm || 'Not recorded'}</td>
                    <td className="py-2 px-2 text-slate-700">
                      <div>{it.dose || 'Not recorded'}</div>
                      <div className="text-[10px] text-slate-500">{it.route || 'Not recorded'}</div>
                    </td>
                    <td className="py-2 px-2 text-slate-800 font-semibold">{it.frequency || 'Not recorded'}</td>
                    <td className="py-2 px-2 text-slate-700">{it.duration || 'Not recorded'}</td>
                    <td className="py-2 px-2 text-center font-mono font-bold text-slate-900">{it.quantity ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Additional Advice, Investigations & Referrals */}
        <div className="grid grid-cols-2 gap-4 pb-4 mb-4 border-b border-slate-200 text-xs">
          {/* Diagnostic Investigations Advised */}
          <div className="space-y-1">
            <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Investigations Advised</p>
            {data.investigationsAdvised ? (
              Array.isArray(data.investigationsAdvised) ? (
                <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                  {data.investigationsAdvised.map((inv, i) => (
                    <li key={i}>{inv}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-700">{data.investigationsAdvised}</p>
              )
            ) : (
              <p className="text-slate-400 italic">Investigations not recorded.</p>
            )}

            {data.referralAdvised && (
              <div className="pt-2">
                <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Specialist Referral</p>
                <p className="text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-200">{data.referralAdvised}</p>
              </div>
            )}
          </div>

          {/* Follow-up & Special Instructions */}
          <div className="space-y-2 border-l border-slate-200 pl-4">
            <div>
              <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Next Consultation / Follow-up</p>
              <p className="text-slate-800 font-semibold">
                {data.followUpDays ? `Review after ${data.followUpDays} days` : data.followUpDate ? `On or before ${data.followUpDate}` : 'Follow-up not recorded'}
              </p>
            </div>

            {data.specialInstructions && (
              <div>
                <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Special Instructions</p>
                <p className="text-slate-700 whitespace-pre-line">{data.specialInstructions}</p>
              </div>
            )}
          </div>
        </div>

        {/* Registry identity or a document hash is not signature evidence. */}
        <footer className="pt-2 flex justify-between items-end text-[11px] text-slate-500">
          <div className="space-y-1 max-w-sm">
            <p className="font-semibold text-slate-700">Electronic Prescription Generated via SwasthyaSetu</p>
            <p className="text-[10px] text-slate-400">Digital signature verification not available for this record.</p>
          </div>
          <div className="text-right space-y-1">
            <div className="h-10 border-b border-dashed border-slate-300 w-44 ml-auto flex items-end justify-center pb-1">
              <span className="text-[10px] text-slate-400 italic">Digital signature verification not available</span>
            </div>
            <p className="font-bold text-slate-900 text-xs">{data.doctor.name}</p>
            <p className="text-[10px] text-slate-500">Prescribing Medical Practitioner</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
