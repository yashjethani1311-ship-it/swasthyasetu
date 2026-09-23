import { FulfilmentPanel } from '@/components/FulfilmentPanel'
import { useEffect, useState } from 'react'
import {
    CalendarDays,
    Download,
    Eye,
    FileText,
    Pill,
    Stethoscope,
    Volume2
} from 'lucide-react'
import jsPDF from 'jspdf'

import {
    Badge,
    Card,
    EmptyState
} from '@/components/kit'

import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'
import { supabase } from '@/lib/supabase'

type PrescriptionItem = {
    id: string
    medicine_name: string
    strength: string | null
    dose: string | null
    route: string | null
    frequency: string | null
    duration: string | null
    instructions: string | null
}

type Prescription = {
    id: string
    clinical_notes: string | null
    status: string
    issued_at: string

    provider_profiles?: {
        full_name?: string | null
        specialization?: string | null
        registration_id?: string | null
        hpr_id?: string | null
        identity_source?: string | null
        registry_verified?: boolean | null
        organization_name?: string | null
    } | null

    prescription_items?: PrescriptionItem[]
}

type Patient = {
    id: string
    patient_code: string | null
    abha_number_masked: string | null
    full_name?: string | null
}

export function PrescriptionsPage() {
    const { profile } = useAuth()
    const { language } = useLanguage()

    const hindi = language === 'Hindi'

    const [loading, setLoading] =
        useState(true)

    const [prescriptions, setPrescriptions] =
        useState<Prescription[]>([])

    const [patient, setPatient] =
        useState<Patient | null>(null)

    const [errorMessage, setErrorMessage] =
        useState('')

    useEffect(() => {
        void loadPrescriptions()
    }, [profile?.id])

    async function loadPrescriptions() {
        if (!profile?.id) return

        setLoading(true)
        setErrorMessage('')

        const {
            data: patientData,
            error: patientError
        } = await supabase
            .from('patient_profiles')
            .select(`
                id,
                patient_code,
                abha_number_masked
            `)
            .eq('user_id', profile.id)
            .maybeSingle()

        if (
            patientError ||
            !patientData
        ) {
            setErrorMessage(
                patientError?.message ??
                (
                    hindi
                        ? 'मरीज की प्रोफ़ाइल नहीं मिली।'
                        : 'Patient profile could not be found.'
                )
            )

            setLoading(false)
            return
        }

        setPatient({
            ...patientData,
            full_name:
                profile.full_name ?? null
        })

        const {
            data,
            error
        } = await supabase
            .from('prescriptions')
            .select(`
                id,
                clinical_notes,
                status,
                issued_at,

                provider_profiles!prescriptions_doctor_provider_id_fkey(
                    full_name,
                    specialization,
                    registration_id,
                    hpr_id,
                    identity_source,
                    registry_verified,
                    organization_name
                ),

                prescription_items(
                    id,
                    medicine_name,
                    strength,
                    dose,
                    route,
                    frequency,
                    duration,
                    instructions
                )
            `)
            .eq(
                'patient_id',
                patientData.id
            )
            .order(
                'issued_at',
                {
                    ascending: false
                }
            )

        if (error) {
            console.error(
                'Prescription load error:',
                error
            )

            setErrorMessage(
                error.message
            )

            setLoading(false)
            return
        }

        setPrescriptions(
            (data ?? []) as unknown as Prescription[]
        )

        setLoading(false)
    }

    function createPrescriptionPDF(
        prescription: Prescription
    ) {
        const pdf =
            new jsPDF()

        const doctor =
            prescription.provider_profiles

        const medicines =
            prescription.prescription_items ?? []

        const pageWidth =
            pdf.internal.pageSize.getWidth()

        const pageHeight =
            pdf.internal.pageSize.getHeight()

        const left = 18
        const right = pageWidth - 18

        pdf.setFontSize(20)

        pdf.text(
            'SwasthyaSetu',
            left,
            20
        )

        pdf.setFontSize(11)

        pdf.text(
            'Electronic Prescription',
            left,
            28
        )

        pdf.setFontSize(8)

        pdf.text(
            'Structured digital prescription generated from the treating doctor record',
            left,
            34
        )

        pdf.line(
            left,
            39,
            right,
            39
        )

        let y = 49

        pdf.setFontSize(11)
        pdf.text(
            'PATIENT',
            left,
            y
        )

        y += 8

        pdf.setFontSize(9)

        pdf.text(
            `Name: ${patient?.full_name ||
            'Patient'
            }`,
            left,
            y
        )

        y += 6

        pdf.text(
            `Patient ID: ${patient?.patient_code ||
            patient?.id ||
            '-'
            }`,
            left,
            y
        )

        y += 6

        if (
            patient?.abha_number_masked
        ) {
            pdf.text(
                `ABHA: ${patient.abha_number_masked}`,
                left,
                y
            )

            y += 6
        }

        y += 4

        pdf.line(
            left,
            y,
            right,
            y
        )

        y += 10

        pdf.setFontSize(11)

        pdf.text(
            'PRESCRIBING DOCTOR',
            left,
            y
        )

        y += 8

        pdf.setFontSize(9)

        pdf.text(
            `Doctor: ${doctor?.full_name ||
            'Doctor'
            }`,
            left,
            y
        )

        y += 6

        if (
            doctor?.specialization
        ) {
            pdf.text(
                `Specialization: ${doctor.specialization}`,
                left,
                y
            )

            y += 6
        }

        if (
            doctor?.organization_name
        ) {
            pdf.text(
                `Practice / Organization: ${doctor.organization_name}`,
                left,
                y
            )

            y += 6
        }

        if (
            doctor?.hpr_id
        ) {
            pdf.text(
                `HPR ID: ${doctor.hpr_id}`,
                left,
                y
            )

            y += 6
        } else if (
            doctor?.registration_id
        ) {
            pdf.text(
                `Registration ID: ${doctor.registration_id}`,
                left,
                y
            )

            y += 6
        }

        const identityText =
            doctor?.registry_verified
                ? 'Registry verification: Verified'
                : doctor?.identity_source ===
                    'DEMO'
                    ? 'Registry verification: Demo identity - not registry verified'
                    : 'Registry verification: Not verified'

        pdf.text(
            identityText,
            left,
            y
        )

        y += 6

        pdf.text(
            `Issued: ${new Date(
                prescription.issued_at
            ).toLocaleString('en-IN')}`,
            left,
            y
        )

        y += 6

        pdf.text(
            `Prescription ID: ${prescription.id}`,
            left,
            y
        )

        y += 10

        pdf.line(
            left,
            y,
            right,
            y
        )

        y += 11

        pdf.setFontSize(14)

        pdf.text(
            'Rx',
            left,
            y
        )

        y += 9

        if (
            medicines.length === 0
        ) {
            pdf.setFontSize(9)

            pdf.text(
                'No medicines recorded.',
                left,
                y
            )

            y += 8
        }

        medicines.forEach(
            (medicine, index) => {
                if (
                    y >
                    pageHeight - 55
                ) {
                    pdf.addPage()
                    y = 20
                }

                pdf.setFontSize(10)

                const medicineTitle =
                    `${index + 1}. ${medicine.medicine_name}` +
                    (
                        medicine.strength
                            ? ` - ${medicine.strength}`
                            : ''
                    )

                pdf.text(
                    pdf.splitTextToSize(
                        medicineTitle,
                        170
                    ),
                    left,
                    y
                )

                y += 7

                pdf.setFontSize(8.5)

                const details = [
                    medicine.dose
                        ? `Dose: ${medicine.dose}`
                        : null,

                    medicine.route
                        ? `Route: ${medicine.route}`
                        : null,

                    medicine.frequency
                        ? `Frequency: ${medicine.frequency}`
                        : null,

                    medicine.duration
                        ? `Duration: ${medicine.duration}`
                        : null
                ]
                    .filter(Boolean)
                    .join('   |   ')

                if (details) {
                    const detailLines =
                        pdf.splitTextToSize(
                            details,
                            170
                        )

                    pdf.text(
                        detailLines,
                        left + 5,
                        y
                    )

                    y +=
                        detailLines.length *
                        5 +
                        2
                }

                if (
                    medicine.instructions
                ) {
                    const instructionLines =
                        pdf.splitTextToSize(
                            `Instructions: ${medicine.instructions}`,
                            165
                        )

                    pdf.text(
                        instructionLines,
                        left + 5,
                        y
                    )

                    y +=
                        instructionLines.length *
                        5 +
                        2
                }

                y += 4
            }
        )

        if (
            prescription.clinical_notes
        ) {
            if (
                y >
                pageHeight - 60
            ) {
                pdf.addPage()
                y = 20
            }

            pdf.line(
                left,
                y,
                right,
                y
            )

            y += 10

            pdf.setFontSize(10)

            pdf.text(
                'Clinical Notes',
                left,
                y
            )

            y += 7

            pdf.setFontSize(8.5)

            const noteLines =
                pdf.splitTextToSize(
                    prescription.clinical_notes,
                    170
                )

            pdf.text(
                noteLines,
                left,
                y
            )

            y +=
                noteLines.length *
                5
        }

        if (
            y >
            pageHeight - 40
        ) {
            pdf.addPage()
            y = 20
        }

        y += 12

        pdf.line(
            left,
            y,
            right,
            y
        )

        y += 8

        pdf.setFontSize(8)

        pdf.text(
            `Status: ${prescription.status}`,
            left,
            y
        )

        y += 6

        pdf.text(
            'Medicine names, dose and instructions are reproduced from the doctor-entered prescription.',
            left,
            y
        )

        y += 6

        pdf.text(
            'Do not modify medicines or dosage based on this generated document.',
            left,
            y
        )

        pdf.setFontSize(7)

        pdf.text(
            'Generated through SwasthyaSetu',
            left,
            pageHeight - 10
        )

        return pdf
    }

    function viewPrescription(
        prescription: Prescription
    ) {
        const pdf =
            createPrescriptionPDF(
                prescription
            )

        const blob =
            pdf.output('blob')

        const url =
            URL.createObjectURL(blob)

        window.open(
            url,
            '_blank',
            'noopener,noreferrer'
        )

        setTimeout(
            () =>
                URL.revokeObjectURL(
                    url
                ),
            60000
        )
    }

    function downloadPrescription(
        prescription: Prescription
    ) {
        const pdf =
            createPrescriptionPDF(
                prescription
            )

        const date =
            new Date(
                prescription.issued_at
            )
                .toISOString()
                .slice(0, 10)

        pdf.save(
            `SwasthyaSetu-Prescription-${date}-${prescription.id.slice(
                0,
                8
            )}.pdf`
        )
    }

    function listenPrescription(
        prescription: Prescription
    ) {
        const doctor =
            prescription
                .provider_profiles
                ?.full_name ??
            (
                hindi
                    ? 'डॉक्टर'
                    : 'Doctor'
            )

        const medicines =
            prescription
                .prescription_items ??
            []

        if (hindi) {
            const medicineText =
                medicines.length
                    ? medicines
                        .map(
                            medicine =>
                                `${medicine.medicine_name}.
                                  ${medicine.strength ?? ''}.
                                  ${medicine.dose ?? ''}.
                                  ${medicine.frequency ?? ''}.
                                  ${medicine.duration ?? ''}.
                                  ${medicine.instructions ?? ''}.`
                        )
                        .join(' ')
                    : 'कोई दवा दर्ज नहीं है।'

            speakText(
                `यह डॉक्टर की पर्ची है।
                डॉक्टर ${doctor}.
                ${medicineText}
                दवा के नाम और मात्रा वही हैं जो डॉक्टर ने दर्ज किए हैं।`,
                'Hindi'
            )

            return
        }

        const medicineText =
            medicines.length
                ? medicines
                    .map(
                        medicine =>
                            `${medicine.medicine_name}.
                              ${medicine.strength ?? ''}.
                              Dose ${medicine.dose ?? ''}.
                              ${medicine.frequency ?? ''}.
                              ${medicine.duration ?? ''}.
                              ${medicine.instructions ?? ''}.`
                    )
                    .join(' ')
                : 'No medicines are recorded.'

        speakText(
            `This prescription was issued by ${doctor}.
            ${medicineText}`,
            'English'
        )
    }

    function listenPage() {
        if (hindi) {
            speakText(
                `यह आपकी डॉक्टर की पर्चियों वाला पेज है।
                आपके पास ${prescriptions.length} पर्चियाँ दर्ज हैं।
                आप पर्ची देख सकते हैं, सुन सकते हैं या पीडीएफ डाउनलोड कर सकते हैं।`,
                'Hindi'
            )

            return
        }

        speakText(
            `This is your prescriptions page.
            You have ${prescriptions.length} prescription records.
            You can view, listen to, or download each electronic prescription.`,
            'English'
        )
    }

    if (loading) {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                {hindi
                    ? 'डॉक्टर की पर्चियाँ लोड हो रही हैं...'
                    : 'Loading prescriptions...'}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">
                        {hindi
                            ? 'इलाज'
                            : 'Treatment'}
                    </p>

                    <h1 className="mt-1 text-2xl font-bold md:text-3xl">
                        {hindi
                            ? 'डॉक्टर की पर्ची'
                            : 'Prescriptions'}
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {hindi
                            ? 'डॉक्टर द्वारा लिखी गई दवाइयाँ और निर्देश यहाँ देख और डाउनलोड कर सकते हैं।'
                            : 'View and download electronic prescriptions issued by your doctor.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={
                        listenPage
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                >
                    <Volume2 className="size-4" />

                    {hindi
                        ? 'यह पेज सुनें'
                        : 'Listen to this page'}
                </button>
            </section>

            {errorMessage && (
                <Card>
                    <p className="text-sm font-medium text-red-600">
                        {errorMessage}
                    </p>
                </Card>
            )}

            {!errorMessage &&
                prescriptions.length ===
                0 && (
                    <Card>
                        <EmptyState
                            text={
                                hindi
                                    ? 'अभी डॉक्टर ने कोई पर्ची नहीं लिखी है।'
                                    : 'No prescriptions have been issued yet.'
                            }
                        />
                    </Card>
                )}

            <div className="space-y-4">
                {prescriptions.map(
                    prescription => (
                        <Card
                            key={
                                prescription.id
                            }
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                                        <Stethoscope className="size-5" />
                                    </div>

                                    <div>
                                        <p className="font-semibold">
                                            {prescription
                                                .provider_profiles
                                                ?.full_name ??
                                                (
                                                    hindi
                                                        ? 'डॉक्टर'
                                                        : 'Doctor'
                                                )}
                                        </p>

                                        {prescription
                                            .provider_profiles
                                            ?.specialization && (
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {
                                                        prescription
                                                            .provider_profiles
                                                            ?.specialization
                                                    }
                                                </p>
                                            )}

                                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                            <CalendarDays className="size-3.5" />

                                            {new Date(
                                                prescription.issued_at
                                            ).toLocaleString(
                                                hindi
                                                    ? 'hi-IN'
                                                    : 'en-IN'
                                            )}
                                        </div>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                            ID:{' '}
                                            {prescription.id.slice(
                                                0,
                                                8
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Badge>
                                        {
                                            prescription.status
                                        }
                                    </Badge>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            viewPrescription(
                                                prescription
                                            )
                                        }
                                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary"
                                    >
                                        <Eye className="size-4" />

                                        {hindi
                                            ? 'पर्ची देखें'
                                            : 'View PDF'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            downloadPrescription(
                                                prescription
                                            )
                                        }
                                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary"
                                    >
                                        <Download className="size-4" />

                                        {hindi
                                            ? 'डाउनलोड'
                                            : 'Download'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            listenPrescription(
                                                prescription
                                            )
                                        }
                                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary"
                                    >
                                        <Volume2 className="size-4" />

                                        {hindi
                                            ? 'सुनें'
                                            : 'Listen'}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                {(prescription
                                    .prescription_items ??
                                    []
                                ).map(
                                    medicine => (
                                        <div
                                            key={
                                                medicine.id
                                            }
                                            className="rounded-xl border border-border p-4"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                                                    <Pill className="size-4" />
                                                </div>

                                                <div className="min-w-0">
                                                    <h3 className="font-semibold">
                                                        {
                                                            medicine.medicine_name
                                                        }

                                                        {medicine.strength
                                                            ? ` · ${medicine.strength}`
                                                            : ''}
                                                    </h3>

                                                    <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                                                        {medicine.dose && (
                                                            <p>
                                                                <strong>
                                                                    {hindi
                                                                        ? 'मात्रा'
                                                                        : 'Dose'}
                                                                    :
                                                                </strong>{' '}
                                                                {
                                                                    medicine.dose
                                                                }
                                                            </p>
                                                        )}

                                                        {medicine.frequency && (
                                                            <p>
                                                                <strong>
                                                                    {hindi
                                                                        ? 'कितनी बार'
                                                                        : 'Frequency'}
                                                                    :
                                                                </strong>{' '}
                                                                {
                                                                    medicine.frequency
                                                                }
                                                            </p>
                                                        )}

                                                        {medicine.duration && (
                                                            <p>
                                                                <strong>
                                                                    {hindi
                                                                        ? 'कितने दिन'
                                                                        : 'Duration'}
                                                                    :
                                                                </strong>{' '}
                                                                {
                                                                    medicine.duration
                                                                }
                                                            </p>
                                                        )}

                                                        {medicine.route && (
                                                            <p>
                                                                <strong>
                                                                    Route:
                                                                </strong>{' '}
                                                                {
                                                                    medicine.route
                                                                }
                                                            </p>
                                                        )}
                                                    </div>

                                                    {medicine.instructions && (
                                                        <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm">
                                                            <strong>
                                                                {hindi
                                                                    ? 'डॉक्टर की सलाह:'
                                                                    : 'Instructions:'}
                                                            </strong>{' '}
                                                            {
                                                                medicine.instructions
                                                            }
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            {prescription.clinical_notes && (
                                <div className="mt-4 border-t border-border pt-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {hindi
                                            ? 'डॉक्टर की Clinical Notes'
                                            : 'Clinical notes'}
                                    </p>

                                    <p className="mt-2 text-sm leading-6">
                                        {
                                            prescription.clinical_notes
                                        }
                                    </p>
                                </div>
                            )}

                            <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                                <FileText className="size-4" />

                                {hindi
                                    ? 'यह ई-पर्ची डॉक्टर द्वारा दर्ज किए गए असली prescription data से बनाई गई है।'
                                    : 'This e-prescription is generated from the structured prescription issued by the doctor.'}
                            </div>
                        <FulfilmentPanel prescriptionId={prescription.id} active={prescription.status === 'ACTIVE'} />
                        </Card>
                    )
                )}
            </div>
        </div>
    )
}