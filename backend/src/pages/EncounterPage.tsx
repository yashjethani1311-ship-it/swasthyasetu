import { TestCatalogPicker } from '@/components/TestCatalogPicker'
import { useEffect, useState } from 'react'
import {
    Activity,
    ArrowLeft,
    ClipboardPlus,
    FlaskConical,
    HeartPulse,
    Pill,
    Save,
    Stethoscope,
    Volume2
} from 'lucide-react'

import {
    Badge,
    Button,
    Card,
    EmptyState
} from '@/components/kit'

import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { navigate } from '@/lib/route'
import { speakText } from '@/lib/voice'
import { supabase } from '@/lib/supabase'
import {
    validateAndNormalizeEncounterVitals,
    normalizeSpO2,
    normalizePulse,
    normalizeSystolicBP,
    normalizeDiastolicBP,
    normalizeTemperature,
    normalizeWeight,
    normalizeFollowUpDays,
    formatDatabaseError
} from '@/lib/vitals'

type Appointment = {
    id: string
    patient_id: string
    doctor_provider_id: string
    scheduled_at: string
    mode: string
    status: string
    reason: string | null
    patient_note: string | null

    patient_profiles?: {
        patient_code?: string | null
        abha_number_masked?: string | null
        abha_link_status?: string | null
    } | null

    provider_practices?: {
        practice_name?: string | null
    } | null
}

type Encounter = {
    id: string
    appointment_id: string
    patient_id: string
    doctor_provider_id: string
    status: string

    chief_complaint: string | null
    symptoms: string | null

    temperature_c: number | null
    pulse_bpm: number | null
    systolic_bp: number | null
    diastolic_bp: number | null
    spo2_percent: number | null
    weight_kg: number | null

    diagnosis: string | null
    clinical_notes: string | null
    follow_up_in_days: number | null

    started_at: string
    completed_at: string | null
}

type MedicineDraft = {
    quantity_prescribed: string
    medicine_name: string
    strength: string
    dose: string
    route: string
    frequency: string
    duration: string
    instructions: string
}

const emptyMedicine: MedicineDraft = {
    quantity_prescribed: '',
    medicine_name: '',
    strength: '',
    dose: '',
    route: 'ORAL',
    frequency: '',
    duration: '',
    instructions: ''
}

export function EncounterPage() {
    const { profile } = useAuth()
    const { language } = useLanguage()

    const hindi = language === 'Hindi'

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [appointment, setAppointment] =
        useState<Appointment | null>(null)

    const [encounter, setEncounter] =
        useState<Encounter | null>(null)

    const [providerId, setProviderId] =
        useState<string | null>(null)

    const [errorMessage, setErrorMessage] =
        useState('')

    const [successMessage, setSuccessMessage] =
        useState('')

    const [chiefComplaint, setChiefComplaint] =
        useState('')

    const [symptoms, setSymptoms] =
        useState('')

    const [temperature, setTemperature] =
        useState('')

    const [pulse, setPulse] =
        useState('')

    const [systolic, setSystolic] =
        useState('')

    const [diastolic, setDiastolic] =
        useState('')

    const [spo2, setSpo2] =
        useState('')

    const [weight, setWeight] =
        useState('')

    const [diagnosis, setDiagnosis] =
        useState('')

    const [clinicalNotes, setClinicalNotes] =
        useState('')

    const [followUpDays, setFollowUpDays] =
        useState('')

    const [vitalErrors, setVitalErrors] =
        useState<Record<string, string>>({})

    const [medicines, setMedicines] =
        useState<MedicineDraft[]>([
            { ...emptyMedicine }
        ])

    const [labTests, setLabTests] =
        useState<string[]>([''])

    useEffect(() => {
        void loadEncounter()
    }, [profile?.id])

    async function loadEncounter() {
        if (!profile?.id) return

        setLoading(true)
        setErrorMessage('')

        const appointmentId =
            sessionStorage.getItem(
                'swasthyasetu-active-appointment'
            )

        if (!appointmentId) {
            setErrorMessage(
                hindi
                    ? 'कोई मरीज का समय नहीं चुना गया है।'
                    : 'No appointment was selected.'
            )

            setLoading(false)
            return
        }

        const {
            data: provider,
            error: providerError
        } = await supabase
            .from('provider_profiles')
            .select(
                'id, provider_type, verification_status'
            )
            .eq(
                'user_id',
                profile.id
            )
            .maybeSingle()

        if (
            providerError ||
            !provider ||
            provider.provider_type !== 'DOCTOR'
        ) {
            console.error(
                'Doctor provider error:',
                providerError
            )

            setErrorMessage(
                hindi
                    ? 'डॉक्टर की प्रोफ़ाइल नहीं मिली।'
                    : 'Doctor profile could not be found.'
            )

            setLoading(false)
            return
        }

        if (
            provider.verification_status !==
            'APPROVED'
        ) {
            setErrorMessage(
                hindi
                    ? 'डॉक्टर का खाता अभी मंजूर नहीं है।'
                    : 'Doctor account is not approved.'
            )

            setLoading(false)
            return
        }

        setProviderId(provider.id)

        const {
            data: appointmentData,
            error: appointmentError
        } = await supabase
            .from('appointments')
            .select(`
                id,
                patient_id,
                doctor_provider_id,
                scheduled_at,
                mode,
                status,
                reason,
                patient_note,
                patient_profiles(
                    patient_code,
                    abha_number_masked,
                    abha_link_status
                ),
                provider_practices(
                    practice_name
                )
            `)
            .eq(
                'id',
                appointmentId
            )
            .eq(
                'doctor_provider_id',
                provider.id
            )
            .maybeSingle()

        if (
            appointmentError ||
            !appointmentData
        ) {
            console.error(
                'Appointment error:',
                appointmentError
            )

            setErrorMessage(
                appointmentError?.message ??
                (
                    hindi
                        ? 'मरीज का समय नहीं मिला।'
                        : 'Appointment could not be found.'
                )
            )

            setLoading(false)
            return
        }

        const appointmentRow =
            appointmentData as unknown as Appointment

        if (
            ![
                'CONFIRMED',
                'IN_PROGRESS',
                'COMPLETED'
            ].includes(
                appointmentRow.status
            )
        ) {
            setErrorMessage(
                hindi
                    ? 'इस मरीज का समय consultation के लिए तैयार नहीं है।'
                    : 'This appointment is not ready for consultation.'
            )

            setLoading(false)
            return
        }

        setAppointment(
            appointmentRow
        )

        const {
            data: existingEncounter,
            error: encounterError
        } = await supabase
            .from('encounters')
            .select('*')
            .eq(
                'appointment_id',
                appointmentId
            )
            .maybeSingle()

        if (encounterError) {
            console.error(
                'Encounter load error:',
                encounterError
            )

            setErrorMessage(
                encounterError.message
            )

            setLoading(false)
            return
        }

        if (existingEncounter) {
            const row =
                existingEncounter as Encounter

            setEncounter(row)

            populateEncounter(row)

            setLoading(false)
            return
        }

        if (
            appointmentRow.status ===
            'COMPLETED'
        ) {
            setErrorMessage(
                hindi
                    ? 'यह consultation पहले ही पूरा हो चुका है।'
                    : 'This consultation has already been completed.'
            )

            setLoading(false)
            return
        }

        const {
            data: newEncounter,
            error: createError
        } = await supabase.rpc('a2_start_encounter',{p_appointment:appointmentId})

        if (
            createError ||
            !newEncounter
        ) {
            console.error(
                'Encounter create error:',
                createError
            )

            setErrorMessage(
                createError?.message ??
                'Could not start consultation.'
            )

            setLoading(false)
            return
        }

        const row =
            newEncounter as Encounter

        setEncounter(row)

        populateEncounter(row)

        setAppointment({
            ...appointmentRow,
            status: appointmentRow.status
        })

        setLoading(false)
    }

    function populateEncounter(
        row: Encounter
    ) {
        setChiefComplaint(
            row.chief_complaint ?? ''
        )

        setSymptoms(
            row.symptoms ?? ''
        )

        setTemperature(
            row.temperature_c?.toString() ??
            ''
        )

        setPulse(
            row.pulse_bpm?.toString() ??
            ''
        )

        setSystolic(
            row.systolic_bp?.toString() ??
            ''
        )

        setDiastolic(
            row.diastolic_bp?.toString() ??
            ''
        )

        setSpo2(
            row.spo2_percent?.toString() ??
            ''
        )

        setWeight(
            row.weight_kg?.toString() ??
            ''
        )

        setDiagnosis(
            row.diagnosis ?? ''
        )

        setClinicalNotes(
            row.clinical_notes ?? ''
        )

        setFollowUpDays(
            row.follow_up_in_days?.toString() ??
            ''
        )
    }

    function nullableNumber(
        value: string
    ) {
        const trimmed =
            value.trim()

        if (!trimmed) {
            return null
        }

        const parsed =
            Number(trimmed)

        return Number.isFinite(parsed)
            ? parsed
            : null
    }

    async function saveEncounter(
        showMessage = true
    ) {
        if (!encounter) {
            return false
        }

        setErrorMessage('')
        setSuccessMessage('')

        const vitalsResult = validateAndNormalizeEncounterVitals(
            {
                temperature,
                pulse,
                systolic,
                diastolic,
                spo2,
                weight,
                followUpDays
            },
            hindi
        )

        setVitalErrors(vitalsResult.errors)

        if (!vitalsResult.isValid) {
            const firstError = Object.values(vitalsResult.errors)[0]
            setErrorMessage(
                firstError ||
                    (hindi
                        ? 'कृपया अमान्य शारीरिक माप ठीक करें।'
                        : 'Please correct the invalid vital signs before saving.')
            )
            return false
        }

        setSaving(true)

        const {
            error
        } = await supabase
            .from('encounters')
            .update({
                chief_complaint:
                    chiefComplaint.trim() ||
                    null,

                symptoms:
                    symptoms.trim() ||
                    null,

                temperature_c:
                    vitalsResult.values.temperature_c,

                pulse_bpm:
                    vitalsResult.values.pulse_bpm,

                systolic_bp:
                    vitalsResult.values.systolic_bp,

                diastolic_bp:
                    vitalsResult.values.diastolic_bp,

                spo2_percent:
                    vitalsResult.values.spo2_percent,

                weight_kg:
                    vitalsResult.values.weight_kg,

                diagnosis:
                    diagnosis.trim() ||
                    null,

                clinical_notes:
                    clinicalNotes.trim() ||
                    null,

                follow_up_in_days:
                    vitalsResult.values.follow_up_in_days,

                updated_at:
                    new Date().toISOString()
            })
            .eq(
                'id',
                encounter.id
            ).select('id').single()

        if (error) {
            console.error(
                'Encounter save error:',
                error
            )

            setErrorMessage(
                formatDatabaseError(error, hindi)
            )

            setSaving(false)
            return false
        }

        if (showMessage) {
            setSuccessMessage(
                hindi
                    ? 'Consultation की जानकारी सुरक्षित हो गई।'
                    : 'Consultation saved.'
            )
        }

        setSaving(false)
        return true
    }

    function addMedicine() {
        setMedicines(current => [
            ...current,
            { ...emptyMedicine }
        ])
    }

    function updateMedicine(
        index: number,
        field: keyof MedicineDraft,
        value: string
    ) {
        setMedicines(current =>
            current.map(
                (medicine, medicineIndex) =>
                    medicineIndex === index
                        ? {
                            ...medicine,
                            [field]: value
                        }
                        : medicine
            )
        )
    }

    function removeMedicine(
        index: number
    ) {
        setMedicines(current => {
            if (
                current.length === 1
            ) {
                return [
                    { ...emptyMedicine }
                ]
            }

            return current.filter(
                (_, medicineIndex) =>
                    medicineIndex !== index
            )
        })
    }

    function addLabTest() {
        setLabTests(current => [
            ...current,
            ''
        ])
    }

    function updateLabTest(
        index: number,
        value: string
    ) {
        setLabTests(current =>
            current.map(
                (test, testIndex) =>
                    testIndex === index
                        ? value
                        : test
            )
        )
    }

    function removeLabTest(
        index: number
    ) {
        setLabTests(current => {
            if (
                current.length === 1
            ) {
                return ['']
            }

            return current.filter(
                (_, testIndex) =>
                    testIndex !== index
            )
        })
    }

    async function completeConsultation() {
        if (!encounter || !appointment || saving) return
        if (!chiefComplaint.trim() || (!diagnosis.trim() && !clinicalNotes.trim())) {
            setErrorMessage(hindi ? 'मुख्य परेशानी और डॉक्टर की टिप्पणी लिखें।' : 'Enter the chief complaint and diagnosis or clinical notes.')
            return
        }
        if (medicines.some(m => !m.medicine_name.trim() && [m.strength,m.dose,m.frequency,m.duration,m.instructions,m.quantity_prescribed].some(v=>v.trim()))) {
            setErrorMessage(hindi ? 'अधूरी दवा का नाम लिखें या उसे हटाएँ।' : 'Enter the missing medicine name or remove that unfinished row.')
            return
        }
        const selected = medicines.filter(m => m.medicine_name.trim())
        if (selected.some(m => !Number.isSafeInteger(Number(m.quantity_prescribed)) || Number(m.quantity_prescribed) <= 0)) {
            setErrorMessage(hindi ? 'हर दवा की कुल मात्रा लिखें।' : 'Enter an explicit positive whole-number total quantity for every medicine.')
            return
        }
        setSaving(true)
        setErrorMessage('')
        try {
            if (!await saveEncounter(false)) return
            setSaving(true)
            const { error } = await supabase.rpc('c1_finish_encounter', {
                p_encounter: encounter.id,
                p_medicines: selected.map(m => ({ ...m, quantity_prescribed: Number(m.quantity_prescribed) })),
                p_tests: [...new Set(labTests.filter(Boolean))]
            })
            if (error) throw error
            const {data, error: readError} = await supabase.from('encounters').select('completed_at').eq('id',encounter.id).single()
            if (readError) throw readError
            setEncounter(current => current ? {...current, status:'COMPLETED', completed_at:data.completed_at} : current)
            setAppointment(current => current ? {...current, status:'COMPLETED'} : current)
            setSuccessMessage(hindi ? 'मुलाकात पूरी हुई। पर्ची और जाँच सुरक्षित हो गई हैं।' : 'Consultation completed. Prescription and test orders are saved.')
        } catch(e) { setErrorMessage(e instanceof Error ? e.message : (e as {message?:string}).message ?? 'Unable to complete consultation') }
        finally { setSaving(false) }
    }

    function listenPage() {
        if (!appointment) {
            return
        }

        if (hindi) {
            speakText(
                `यह डॉक्टर consultation पेज है।
                मरीज की पहचान ${appointment.patient_profiles?.patient_code ?? 'उपलब्ध नहीं'} है।
                मिलने का कारण ${appointment.reason ?? 'नहीं लिखा गया'} है।
                यहाँ डॉक्टर मरीज की परेशानी, लक्षण, जरूरी जाँच, diagnosis, दवा और आगे की सलाह दर्ज कर सकते हैं।`,
                'Hindi'
            )

            return
        }

        speakText(
            `This is the doctor consultation workspace.
            Patient code is ${appointment.patient_profiles?.patient_code ?? 'not available'}.
            Reason for visit is ${appointment.reason ?? 'not recorded'}.
            Record symptoms, vitals, clinical assessment, medicines, diagnostic orders and follow-up here.`,
            'English'
        )
    }

    if (loading) {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                {hindi
                    ? 'Consultation खोला जा रहा है...'
                    : 'Opening consultation...'}
            </div>
        )
    }

    if (
        errorMessage &&
        !appointment
    ) {
        return (
            <div className="space-y-4">
                <Button
                    variant="outline"
                    onClick={() =>
                        navigate(
                            '/appointments'
                        )
                    }
                >
                    <ArrowLeft className="mr-2 size-4" />

                    {hindi
                        ? 'वापस जाएँ'
                        : 'Back to appointments'}
                </Button>

                <Card>
                    <EmptyState
                        text={
                            errorMessage
                        }
                    />
                </Card>
            </div>
        )
    }

    if (
        !appointment ||
        !encounter
    ) {
        return null
    }

    const completed =
        encounter.status ===
        'COMPLETED'

    return (
        <div className="space-y-6">

            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                '/appointments'
                            )
                        }
                        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="size-4" />

                        {hindi
                            ? 'मरीजों के समय पर वापस'
                            : 'Back to appointments'}
                    </button>

                    <p className="text-sm font-medium text-primary">
                        {hindi
                            ? 'डॉक्टर Consultation'
                            : 'Clinical encounter'}
                    </p>

                    <h1 className="mt-1 text-2xl font-bold md:text-3xl">
                        {hindi
                            ? 'मरीज की Consultation'
                            : 'Patient consultation'}
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {appointment.patient_profiles
                            ?.patient_code ??
                            'Patient'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Badge>
                        {completed
                            ? 'COMPLETED'
                            : 'IN PROGRESS'}
                    </Badge>

                    <button
                        type="button"
                        onClick={listenPage}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                    >
                        <Volume2 className="size-4" />

                        {hindi
                            ? 'यह पेज सुनें'
                            : 'Listen to this page'}
                    </button>
                </div>
            </section>

            <Card>
                <div className="flex items-start gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                        <Stethoscope className="size-5" />
                    </div>

                    <div>
                        <h2 className="font-semibold">
                            {hindi
                                ? 'मरीज और मिलने की जानकारी'
                                : 'Patient & appointment'}
                        </h2>

                        <p className="mt-2 text-sm">
                            <strong>
                                {hindi
                                    ? 'मरीज ID'
                                    : 'Patient ID'}:
                            </strong>{' '}
                            {appointment.patient_profiles
                                ?.patient_code ??
                                '—'}
                        </p>

                        <p className="mt-1 text-sm">
                            <strong>
                                {hindi
                                    ? 'समय'
                                    : 'Appointment'}:
                            </strong>{' '}
                            {new Date(
                                appointment.scheduled_at
                            ).toLocaleString(
                                hindi
                                    ? 'hi-IN'
                                    : 'en-IN'
                            )}
                        </p>

                        <p className="mt-1 text-sm">
                            <strong>
                                {hindi
                                    ? 'तरीका'
                                    : 'Mode'}:
                            </strong>{' '}
                            {appointment.mode}
                        </p>

                        {appointment.reason && (
                            <p className="mt-1 text-sm">
                                <strong>
                                    {hindi
                                        ? 'कारण'
                                        : 'Reason'}:
                                </strong>{' '}
                                {appointment.reason}
                            </p>
                        )}

                        {appointment.patient_note && (
                            <p className="mt-1 text-sm">
                                <strong>
                                    {hindi
                                        ? 'मरीज की बात'
                                        : 'Patient note'}:
                                </strong>{' '}
                                {appointment.patient_note}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            <Card>
                <SectionTitle
                    icon={
                        <ClipboardPlus className="size-5" />
                    }
                    title={
                        hindi
                            ? 'परेशानी और लक्षण'
                            : 'Complaint & symptoms'
                    }
                />

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <TextAreaField
                        label={
                            hindi
                                ? 'मुख्य परेशानी'
                                : 'Chief complaint'
                        }
                        value={
                            chiefComplaint
                        }
                        onChange={
                            setChiefComplaint
                        }
                        disabled={
                            completed
                        }
                    />

                    <TextAreaField
                        label={
                            hindi
                                ? 'लक्षण'
                                : 'Symptoms'
                        }
                        value={
                            symptoms
                        }
                        onChange={
                            setSymptoms
                        }
                        disabled={
                            completed
                        }
                    />
                </div>
            </Card>

            <Card>
                <SectionTitle
                    icon={
                        <HeartPulse className="size-5" />
                    }
                    title={
                        hindi
                            ? 'जरूरी माप'
                            : 'Vitals'
                    }
                />

                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InputField
                        label="Temperature °C"
                        value={temperature}
                        onChange={setTemperature}
                        disabled={completed}
                    />

                    <InputField
                        label="Pulse / min"
                        value={pulse}
                        onChange={setPulse}
                        disabled={completed}
                    />

                    <InputField
                        label="SpO₂ %"
                        value={spo2}
                        onChange={setSpo2}
                        disabled={completed}
                    />

                    <InputField
                        label="Systolic BP"
                        value={systolic}
                        onChange={setSystolic}
                        disabled={completed}
                    />

                    <InputField
                        label="Diastolic BP"
                        value={diastolic}
                        onChange={setDiastolic}
                        disabled={completed}
                    />

                    <InputField
                        label="Weight kg"
                        value={weight}
                        onChange={setWeight}
                        disabled={completed}
                    />
                </div>
            </Card>

            <Card>
                <SectionTitle
                    icon={
                        <Activity className="size-5" />
                    }
                    title={
                        hindi
                            ? 'डॉक्टर की Clinical Assessment'
                            : 'Clinical assessment'
                    }
                />

                <div className="mt-5 grid gap-4">
                    <TextAreaField
                        label={
                            hindi
                                ? 'Diagnosis / Clinical impression'
                                : 'Diagnosis / clinical impression'
                        }
                        value={diagnosis}
                        onChange={setDiagnosis}
                        disabled={completed}
                    />

                    <TextAreaField
                        label={
                            hindi
                                ? 'Clinical notes'
                                : 'Clinical notes'
                        }
                        value={clinicalNotes}
                        onChange={setClinicalNotes}
                        disabled={completed}
                    />

                    <div className="max-w-xs">
                        <InputField
                            label={
                                hindi
                                    ? 'कितने दिन बाद follow-up?'
                                    : 'Follow-up after days'
                            }
                            value={followUpDays}
                            onChange={setFollowUpDays}
                            disabled={completed}
                        />
                    </div>
                </div>
            </Card>

            {!completed && (
                <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <SectionTitle
                            icon={
                                <Pill className="size-5" />
                            }
                            title={
                                hindi
                                    ? 'दवाइयाँ'
                                    : 'Prescription'
                            }
                        />

                        <Button
                            variant="outline"
                            onClick={
                                addMedicine
                            }
                        >
                            + {hindi
                                ? 'दवा जोड़ें'
                                : 'Add medicine'}
                        </Button>
                    </div>

                    <div className="mt-5 space-y-4">
                        {medicines.map(
                            (
                                medicine,
                                index
                            ) => (
                                <div
                                    key={index}
                                    className="rounded-xl border border-border p-4"
                                >
                                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                        <MedicineInput placeholder={hindi ? 'कुल मात्रा (इकाइयाँ)' : 'Total quantity (units)'} value={medicine.quantity_prescribed} onChange={value=>updateMedicine(index,'quantity_prescribed',value)} />
                                        <MedicineInput
                                            placeholder="Medicine name"
                                            value={
                                                medicine.medicine_name
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'medicine_name',
                                                    value
                                                )
                                            }
                                        />

                                        <MedicineInput
                                            placeholder="Strength e.g. 500 mg"
                                            value={
                                                medicine.strength
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'strength',
                                                    value
                                                )
                                            }
                                        />

                                        <MedicineInput
                                            placeholder="Dose e.g. 1 tablet"
                                            value={
                                                medicine.dose
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'dose',
                                                    value
                                                )
                                            }
                                        />

                                        <MedicineInput
                                            placeholder="Route e.g. ORAL"
                                            value={
                                                medicine.route
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'route',
                                                    value
                                                )
                                            }
                                        />

                                        <MedicineInput
                                            placeholder="Frequency e.g. twice daily"
                                            value={
                                                medicine.frequency
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'frequency',
                                                    value
                                                )
                                            }
                                        />

                                        <MedicineInput
                                            placeholder="Duration e.g. 5 days"
                                            value={
                                                medicine.duration
                                            }
                                            onChange={value =>
                                                updateMedicine(
                                                    index,
                                                    'duration',
                                                    value
                                                )
                                            }
                                        />
                                    </div>

                                    <input
                                        value={
                                            medicine.instructions
                                        }
                                        onChange={event =>
                                            updateMedicine(
                                                index,
                                                'instructions',
                                                event.target.value
                                            )
                                        }
                                        placeholder={
                                            hindi
                                                ? 'मरीज के लिए निर्देश'
                                                : 'Patient instructions'
                                        }
                                        className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                                    />

                                    <button
                                        type="button"
                                        onClick={() =>
                                            removeMedicine(
                                                index
                                            )
                                        }
                                        className="mt-3 text-xs font-semibold text-red-600"
                                    >
                                        {hindi
                                            ? 'दवा हटाएँ'
                                            : 'Remove medicine'}
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                </Card>
            )}

            {!completed && (
                <Card>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <SectionTitle
                            icon={
                                <FlaskConical className="size-5" />
                            }
                            title={
                                hindi
                                    ? 'जाँच / टेस्ट'
                                    : 'Diagnostic orders'
                            }
                        />

                        <Button
                            variant="outline"
                            onClick={
                                addLabTest
                            }
                        >
                            + {hindi
                                ? 'जाँच जोड़ें'
                                : 'Add test'}
                        </Button>
                    </div>

                    <div className="mt-5 space-y-3">
                        {labTests.map(
                            (
                                test,
                                index
                            ) => (
                                <div
                                    key={index}
                                    className="flex gap-2"
                                >
                                    <TestCatalogPicker value={test} disabled={saving} onChange={value => updateLabTest(index, value)} />

                                    <button
                                        type="button"
                                        onClick={() =>
                                            removeLabTest(
                                                index
                                            )
                                        }
                                        className="rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary"
                                    >
                                        ×
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                </Card>
            )}

            {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                    {successMessage}
                </div>
            )}

            {!completed ? (
                <div className="flex flex-col gap-3 pb-8 sm:flex-row">
                    <Button
                        variant="outline"
                        disabled={saving}
                        onClick={() =>
                            void saveEncounter()
                        }
                    >
                        <Save className="mr-2 size-4" />

                        {saving
                            ? hindi
                                ? 'सुरक्षित हो रहा है...'
                                : 'Saving...'
                            : hindi
                                ? 'Draft सुरक्षित करें'
                                : 'Save draft'}
                    </Button>

                    <Button
                        disabled={saving}
                        onClick={() =>
                            void completeConsultation()
                        }
                    >
                        <Stethoscope className="mr-2 size-4" />

                        {saving
                            ? hindi
                                ? 'पूरा किया जा रहा है...'
                                : 'Completing...'
                            : hindi
                                ? 'Consultation पूरा करें'
                                : 'Complete consultation'}
                    </Button>
                </div>
            ) : (
                <Card>
                    <div className="flex items-start gap-3">
                        <div className="grid size-10 place-items-center rounded-xl bg-secondary text-primary">
                            ✓
                        </div>

                        <div>
                            <h3 className="font-semibold">
                                {hindi
                                    ? 'Consultation पूरा हो गया'
                                    : 'Consultation completed'}
                            </h3>

                            <p className="mt-1 text-sm text-muted-foreground">
                                {hindi
                                    ? 'यह clinical encounter अब read-only है।'
                                    : 'This clinical encounter is now read-only.'}
                            </p>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    )
}

function SectionTitle({
    icon,
    title
}: {
    icon: React.ReactNode
    title: string
}) {
    return (
        <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-secondary text-primary">
                {icon}
            </div>

            <h2 className="font-semibold">
                {title}
            </h2>
        </div>
    )
}

function InputField({
    label,
    value,
    onChange,
    disabled
}: {
    label: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}) {
    return (
        <label className="block">
            <span className="text-sm font-semibold">
                {label}
            </span>

            <input
                type="number"
                step="any"
                value={value}
                disabled={disabled}
                onChange={event =>
                    onChange(
                        event.target.value
                    )
                }
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
        </label>
    )
}

function TextAreaField({
    label,
    value,
    onChange,
    disabled
}: {
    label: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}) {
    return (
        <label className="block">
            <span className="text-sm font-semibold">
                {label}
            </span>

            <textarea
                value={value}
                disabled={disabled}
                onChange={event =>
                    onChange(
                        event.target.value
                    )
                }
                rows={4}
                className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
        </label>
    )
}

function MedicineInput({
    placeholder,
    value,
    onChange
}: {
    placeholder: string
    value: string
    onChange: (value: string) => void
}) {
    return (
        <input
            value={value}
            placeholder={placeholder}
            onChange={event =>
                onChange(
                    event.target.value
                )
            }
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
    )
}
