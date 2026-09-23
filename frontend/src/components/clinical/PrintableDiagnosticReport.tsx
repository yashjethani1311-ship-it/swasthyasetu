import { Printer, ShieldCheck, CheckCircle2, AlertTriangle, FileText } from 'lucide-react'
import { Button, Badge } from '@/components/kit'

export type DiagnosticKind = 'PATHOLOGY' | 'IMAGING' | 'PROCEDURE'

export interface DiagnosticReportProps {
  id: string
  reportNumber?: string
  kind: DiagnosticKind
  title: string
  issuedAt: string
  status?: string

  // Facility Info
  facility?: {
    name: string
    address?: string | null
    phone?: string | null
    accreditation?: string | null
    license?: string | null
  } | null

  // Patient Info
  patient: {
    id?: string
    name: string
    age?: number | string | null
    gender?: string | null
    patientCode?: string | null
    abhaAddress?: string | null
  }

  // Doctor Info
  referringDoctor?: {
    name: string
    specialty?: string | null
    hprId?: string | null
  } | null

  // Verifying / Reporting Professional
  reportingProfessional: {
    name: string
    designation?: string | null
    registrationNumber?: string | null
    verified?: boolean | null
  }

  // --- Pathology-Specific Fields ---
  pathologyDetails?: {
    specimenCode?: string | null
    specimenType?: string | null
    sampleCondition?: string | null
    collectedAt?: string | null
    receivedAt?: string | null
    verifiedAt?: string | null
    methodology?: string | null
    interpretation?: string | null
    results: Array<{
      parameterName: string
      resultValue: string | number
      unit?: string | null
      referenceRange?: string | null
      flag?: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' | 'ABNORMAL' | string | null
      notes?: string | null
    }>
  }

  // --- Imaging-Specific Fields ---
  imagingDetails?: {
    modality?: string | null
    technique?: string | null
    clinicalIndication?: string | null
    comparison?: string | null
    findings: string
    impression: string
    recommendations?: string | null
  }

  // --- Procedure-Specific Fields ---
  procedureDetails?: {
    procedureName: string
    performedAt?: string | null
    clinicalIndication?: string | null
    findings: string
    measurements?: Array<{ label: string; value: string; unit?: string }> | null
    conclusion: string
  }

  onClose?: () => void
}

export type PrintableDiagnosticReportComponentProps =
  | { data: DiagnosticReportProps; onClose?: () => void; report?: never; patient?: never }
  | { report: any; patient?: any; onClose?: () => void; data?: never }

export function PrintableDiagnosticReport(props: PrintableDiagnosticReportComponentProps) {
  const onClose = props.onClose

  const data: DiagnosticReportProps = props.data ?? {
    id: props.report.id || 'REP',
    reportNumber: props.report.id ? `REP-${props.report.id.slice(0, 8).toUpperCase()}` : undefined,
    kind: (props.report.category === 'IMAGING' ? 'IMAGING' : props.report.category === 'PROCEDURE' ? 'PROCEDURE' : 'PATHOLOGY'),
    title: props.report.test_name || 'Diagnostic Examination',
    issuedAt: props.report.verified_at || '',
    status: props.report.status || 'Status not available',
    facility: props.report.facility ? {
      name: props.report.facility.name || 'Diagnostic Laboratory',
      address: props.report.facility.address || null,
      phone: props.report.facility.phone || null,
      accreditation: props.report.facility.accreditation || null
    } : null,
    patient: {
      id: props.patient?.id,
      name: props.patient?.full_name || props.patient?.name || 'Patient',
      age: props.patient?.age,
      gender: props.patient?.gender,
      patientCode: props.patient?.patient_code || props.patient?.patientCode,
      abhaAddress: props.patient?.abha_number_masked || props.patient?.abhaAddress
    },
    referringDoctor: props.report.ordering_doctor ? {
      name: props.report.ordering_doctor.name || props.report.ordering_doctor.full_name || 'Referring doctor not recorded',
      specialty: props.report.ordering_doctor.specialty || null
    } : null,
    reportingProfessional: {
      name: props.report.pathologist_verification?.pathologist_name || props.report.verifier_name || 'Reporting professional not recorded',
      designation: props.report.pathologist_verification?.designation || null,
      registrationNumber: props.report.pathologist_verification?.registration_number || props.report.verifier_registration || null,
      verified: Boolean(props.report.verified_at || props.report.pathologist_verification)
    },
    pathologyDetails: props.report.category !== 'IMAGING' && props.report.category !== 'PROCEDURE' ? {
      specimenCode: props.report.specimen?.code || props.report.specimen_code || null,
      specimenType: props.report.specimen?.type || props.report.specimen_type || null,
      sampleCondition: props.report.specimen?.condition || props.report.specimen_condition || 'Not recorded',
      collectedAt: props.report.specimen?.collected_at || null,
      receivedAt: props.report.specimen?.received_at || null,
      verifiedAt: props.report.verified_at || null,
      methodology: props.report.methodology || props.report.test_method || null,
      results: (props.report.observations || []).map((o: any) => ({
        parameterName: o.parameter_name || o.parameterName || 'Observation',
        resultValue: o.observed_value !== undefined ? o.observed_value : (o.resultValue !== undefined ? o.resultValue : '-'),
        unit: o.unit || null,
        referenceRange: o.reference_interval || o.referenceRange || 'Reference interval unavailable',
        flag: o.flag || 'Not classified',
        notes: o.clinical_significance || o.notes || null
      }))
    } : undefined,
    imagingDetails: props.report.category === 'IMAGING' ? {
      modality: props.report.modality || 'RADIOLOGY / IMAGING',
      technique: props.report.technique || 'Technique not recorded',
      clinicalIndication: props.report.indication || props.report.clinical_indication || 'Indication not recorded',
      findings: props.report.findings || props.report.observations?.[0]?.observed_value || 'Findings not recorded',
      impression: props.report.impression || props.report.observations?.[0]?.observed_value || 'Impression not recorded',
      recommendations: props.report.recommendations || null
    } : undefined,
    procedureDetails: props.report.category === 'PROCEDURE' ? {
      procedureName: props.report.test_name || 'Clinical Diagnostic Procedure',
      performedAt: props.report.verified_at || null,
      clinicalIndication: props.report.indication || props.report.clinical_indication || 'Indication not recorded',
      findings: props.report.findings || props.report.observations?.[0]?.observed_value || 'Findings not recorded',
      measurements: props.report.measurements || null,
      conclusion: props.report.conclusion || 'Conclusion not recorded'
    } : undefined
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {/* On-screen Action Toolbar (Hidden in Print) */}
      <div className="flex items-center justify-between gap-3 bg-secondary/30 p-3 rounded-xl border border-border print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {data.kind === 'PATHOLOGY'
                ? 'Indian clinical A4 diagnostic report layout (Pathology)'
                : data.kind === 'IMAGING'
                ? 'Indian clinical A4 diagnostic report layout (Radiology)'
                : 'Indian clinical A4 diagnostic report layout (Procedure)'}
            </p>
            <p className="text-xs text-muted-foreground">Governed diagnostic report with verified laboratory provenance</p>
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
      <div className="diagnostic-a4-document bg-white text-slate-900 border border-slate-300 rounded-lg p-8 shadow-sm font-sans max-w-[800px] mx-auto text-[13px] leading-relaxed print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full">
        {/* 1. Facility Header */}
        <header className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
              {data.facility?.name || 'SwasthyaSetu Diagnostic Services'}
            </h1>
            {data.facility?.address && (
              <p className="text-xs text-slate-600 mt-0.5 max-w-md">{data.facility.address}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              {data.facility?.phone && <span>Tel: {data.facility.phone}</span>}
              {data.facility?.license && <span>Licence: {data.facility.license}</span>}
            </div>
          </div>
          <div className="text-right space-y-1">
            {data.facility?.accreditation ? (
              <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-semibold text-slate-800">
                {data.facility.accreditation}
              </span>
            ) : (
              <span className="inline-block px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-500">
                Accreditation not verified
              </span>
            )}
            <p className="text-[11px] font-mono text-slate-500">
              Report ID: {data.reportNumber || data.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-[11px] font-semibold text-slate-700">
              Status: <span className="font-mono">{data.status || 'Status not available'}</span>
            </p>
          </div>
        </header>

        {/* 2. Patient & Referring Clinician Details */}
        <div className="grid grid-cols-2 gap-4 pb-3 mb-4 border-b border-slate-200 text-xs">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Patient Details</p>
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">{data.patient.name}</span>
              <span className="font-mono text-slate-600">{data.patient.patientCode ? `ID: ${data.patient.patientCode}` : ''}</span>
            </div>
            <p className="text-slate-700">
              <span>{data.patient.age ? `${data.patient.age} yrs` : 'Age: —'}</span>
              <span className="mx-1.5">/</span>
              <span>{data.patient.gender || 'Sex: Unspecified'}</span>
            </p>
            {data.patient.abhaAddress && (
              <p className="text-slate-600 font-mono text-[11px]">ABHA: {data.patient.abhaAddress}</p>
            )}
          </div>

          <div className="space-y-1 border-l border-slate-200 pl-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Clinical Context</p>
            <p className="text-slate-800">
              <span className="text-slate-500">Referred by:</span>{' '}
              <span className="font-semibold">{data.referringDoctor?.name || 'Referring doctor not recorded'}</span>
            </p>
            {data.referringDoctor?.specialty && (
              <p className="text-slate-600">{data.referringDoctor.specialty}</p>
            )}
            <p className="text-slate-500 text-[11px]">
              Report Date: {data.issuedAt ? new Date(data.issuedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date not recorded'}
            </p>
          </div>
        </div>

        {/* 3. Specialized Report Body By Kind */}
        {data.kind === 'PATHOLOGY' && (
          <PathologySection title={data.title} details={data.pathologyDetails} />
        )}

        {data.kind === 'IMAGING' && (
          <ImagingSection title={data.title} details={data.imagingDetails} />
        )}

        {data.kind === 'PROCEDURE' && (
          <ProcedureSection title={data.title} details={data.procedureDetails} />
        )}

        {/* 4. Footer & Professional Verification */}
        <footer className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-end text-[11px] text-slate-500">
          <div className="space-y-1 max-w-sm">
            <div className="flex items-center gap-1.5 text-slate-800 font-semibold">
              <CheckCircle2 className="size-3.5 text-teal-700" />
              <span>
                {data.reportingProfessional?.verified
                  ? 'Electronically Verified Diagnostic Report'
                  : 'Diagnostic Report Generated via SwasthyaSetu'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Biological reference intervals applicable to age and gender when available. All diagnostic observations must be correlated clinically.
            </p>
          </div>

          <div className="text-right space-y-1">
            <div className="h-10 border-b border-slate-400 w-48 ml-auto flex items-end justify-center pb-1">
              {data.reportingProfessional?.verified ? (
                <span className="font-serif italic text-slate-800 font-semibold text-xs">
                  {data.reportingProfessional.name}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 italic">
                  Digital verification not available
                </span>
              )}
            </div>
            <p className="font-bold text-slate-900 text-xs">
              {data.reportingProfessional?.name || 'Reporting professional not recorded'}
            </p>
            {data.reportingProfessional?.designation && (
              <p className="text-[11px] text-slate-700">{data.reportingProfessional.designation}</p>
            )}
            <p className="text-[10px] text-slate-500">
              Reg No: {data.reportingProfessional?.registrationNumber || 'Registration identifier unavailable'}
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Pathology Report Layout
// ─────────────────────────────────────────────────────────────────────────────

function PathologySection({
  title,
  details,
}: {
  title: string
  details?: DiagnosticReportProps['pathologyDetails']
}) {
  return (
    <div className="space-y-4">
      {/* Specimen Custody Header Bar */}
      {details && (
        <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Specimen Code</p>
            <p className="font-mono font-bold text-slate-900">{details.specimenCode || 'Not recorded'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Specimen Type</p>
            <p className="font-medium text-slate-800">{details.specimenType || 'Specimen'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Collection Time</p>
            <p className="text-slate-700">
              {details.collectedAt ? new Date(details.collectedAt).toLocaleTimeString() : 'Not recorded'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Sample Integrity</p>
            <p className="text-slate-700">{details.sampleCondition || 'Not recorded'}</p>
          </div>
        </div>
      )}

      {/* Investigation Name */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1">
        {title}
      </h2>

      {/* Results Table */}
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-900 bg-slate-100 text-slate-800">
            <th className="py-2 px-2 font-bold">Investigation / Parameter</th>
            <th className="py-2 px-2 font-bold w-24">Observed Value</th>
            <th className="py-2 px-2 font-bold w-20">Unit</th>
            <th className="py-2 px-2 font-bold w-36">Biological Ref. Interval</th>
            <th className="py-2 px-2 font-bold w-20 text-center">Status Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {!details?.results || details.results.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                No observations entered for this test order.
              </td>
            </tr>
          ) : (
            details.results.map((r, i) => {
              const isHigh = r.flag === 'HIGH' || r.flag === 'H'
              const isLow = r.flag === 'LOW' || r.flag === 'L'
              const isCritical = r.flag === 'CRITICAL' || r.flag === 'ABNORMAL'

              return (
                <tr key={i} className={isCritical ? 'bg-rose-50/60' : undefined}>
                  <td className="py-2 px-2 font-medium text-slate-900">
                    {r.parameterName}
                    {r.notes && <div className="text-[10px] text-slate-500 font-normal">{r.notes}</div>}
                  </td>
                  <td className="py-2 px-2 font-bold font-mono">
                    <span className={isCritical ? 'text-rose-700' : isHigh ? 'text-amber-700' : isLow ? 'text-blue-700' : 'text-slate-900'}>
                      {r.resultValue}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-slate-600 font-mono text-[11px]">{r.unit || '—'}</td>
                  <td className="py-2 px-2 text-slate-600 font-mono text-[11px]">
                    {r.referenceRange || 'Reference interval unavailable'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    {r.flag && r.flag !== 'NORMAL' ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isCritical
                          ? 'bg-rose-600 text-white'
                          : isHigh
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                      }`}>
                        {r.flag}
                      </span>
                    ) : r.flag === 'NORMAL' ? (
                      <span className="text-slate-400 text-[10px]">Normal</span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Not classified</span>
                    )}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {/* Methodology & Remarks */}
      <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1">
        <p className="text-slate-600">
          <span className="font-semibold text-slate-800">Methodology:</span>{' '}
          {details?.methodology || 'Method not provided'}
        </p>
        {details?.interpretation && (
          <p className="text-slate-700 whitespace-pre-line">
            <span className="font-semibold text-slate-800">Pathologist Interpretation:</span> {details.interpretation}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Imaging / Radiology Report Layout
// ─────────────────────────────────────────────────────────────────────────────

function ImagingSection({
  title,
  details,
}: {
  title: string
  details?: DiagnosticReportProps['imagingDetails']
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-300 pb-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Radiological Study: {title}
        </h2>
        {details?.modality && (
          <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-300 font-mono text-xs font-bold text-slate-800">
            {details.modality}
          </span>
        )}
      </div>

      {details?.clinicalIndication && (
        <div className="text-xs">
          <span className="font-bold text-slate-900">Clinical Indication:</span>{' '}
          <span className="text-slate-700">{details.clinicalIndication}</span>
        </div>
      )}

      {details?.technique && (
        <div className="text-xs">
          <span className="font-bold text-slate-900">Technique:</span>{' '}
          <span className="text-slate-700">{details.technique}</span>
        </div>
      )}

      {details?.comparison && (
        <div className="text-xs">
          <span className="font-bold text-slate-900">Comparison:</span>{' '}
          <span className="text-slate-700">{details.comparison}</span>
        </div>
      )}

      {/* Radiology Findings */}
      <div className="space-y-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-0.5">
          Findings
        </h3>
        <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed pl-1">
          {details?.findings || 'Findings not recorded'}
        </p>
      </div>

      {/* Radiology Impression */}
      <div className="space-y-1 bg-slate-50 p-3 rounded border border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          Impression
        </h3>
        <p className="text-xs text-slate-900 font-medium whitespace-pre-line leading-relaxed">
          {details?.impression || 'Impression not recorded'}
        </p>
      </div>

      {details?.recommendations && (
        <div className="text-xs space-y-0.5">
          <span className="font-bold text-slate-900">Recommendations:</span>
          <p className="text-slate-700 whitespace-pre-line">{details.recommendations}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Clinical Procedure Report Layout
// ─────────────────────────────────────────────────────────────────────────────

function ProcedureSection({
  title,
  details,
}: {
  title: string
  details?: DiagnosticReportProps['procedureDetails']
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-300 pb-1">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
          Procedure Report: {details?.procedureName || title}
        </h2>
        {details?.performedAt && (
          <span className="text-xs text-slate-500 font-mono">
            Performed: {new Date(details.performedAt).toLocaleString()}
          </span>
        )}
      </div>

      {details?.clinicalIndication && (
        <div className="text-xs">
          <span className="font-bold text-slate-900">Indication:</span>{' '}
          <span className="text-slate-700">{details.clinicalIndication}</span>
        </div>
      )}

      {/* Quantitative Measurements */}
      {details?.measurements && details.measurements.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-0.5">
            Recorded Measurements
          </h3>
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
            {details.measurements.map((m, i) => (
              <div key={i}>
                <span className="text-slate-500 text-[11px] block">{m.label}</span>
                <span className="font-bold font-mono text-slate-900">{m.value} {m.unit || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Observations & Findings */}
      <div className="space-y-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-0.5">
          Observations &amp; Procedure Findings
        </h3>
        <p className="text-xs text-slate-800 whitespace-pre-line leading-relaxed pl-1">
          {details?.findings || 'Findings not recorded'}
        </p>
      </div>

      {/* Conclusion */}
      <div className="space-y-1 bg-slate-50 p-3 rounded border border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
          Conclusion
        </h3>
        <p className="text-xs text-slate-900 font-medium whitespace-pre-line leading-relaxed">
          {details?.conclusion || 'Conclusion not recorded'}
        </p>
      </div>
    </div>
  )
}
