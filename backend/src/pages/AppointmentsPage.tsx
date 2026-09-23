import { useEffect, useMemo, useState, useRef } from 'react'
import {
    CalendarCheck,
    Clock3,
    MapPin,
    Search,
    Stethoscope,
    Video,
    Volume2,
    Building2,
    UserRound,
    RefreshCw
} from 'lucide-react'

import {
    Badge,
    Button,
    Card,
    EmptyState
} from '@/components/kit'

import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'
import { navigate } from '@/lib/route'

type Doctor = {
    id: string
    full_name: string | null
    specialization: string | null
    organization_name: string | null
    hpr_id: string | null
    city: string | null
    state: string | null
    verification_status: string | null
}

type Practice = {
    id: string
    provider_id: string
    facility_id: string | null
    practice_name: string
    address_line: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    phone: string | null
    consultation_mode: string
    active: boolean
}

type Schedule = {
    id: string
    provider_id: string
    practice_id: string
    day_of_week: number
    start_time: string
    end_time: string
    slot_minutes: number
    active: boolean
}

type AppointmentRow = {
    id: string
    patient_id: string
    doctor_provider_id: string
    practice_id: string | null
    scheduled_at: string
    mode: string
    status: string
    reason: string | null
    patient_note: string | null
    duration_minutes: number | null
    provider_profiles?: {
        full_name?: string | null
        specialization?: string | null
        organization_name?: string | null
        hpr_id?: string | null
    } | null
    provider_practices?: {
        practice_name?: string | null
        address_line?: string | null
        city?: string | null
        state?: string | null
    } | null
}

type Slot = {
    fee: number | null
    iso: string
    label: string
    dateLabel: string
}

export function AppointmentsPage() {
    const { profile } = useAuth()

    if (!profile) return null

    return profile.role === 'PATIENT'
        ? <PatientAppointments />
        : <DoctorAppointments />
}

/* ============================================================
   PATIENT
============================================================ */

function PatientAppointments() {
    const { profile } = useAuth()
    const { language } = useLanguage()

    const hindi = language === 'Hindi'

    const [patientId, setPatientId] =
        useState<string | null>(null)

    const [doctors, setDoctors] =
        useState<Doctor[]>([])

    const [practices, setPractices] =
        useState<Practice[]>([])

    const [schedules, setSchedules] =
        useState<Schedule[]>([])

    const [appointments, setAppointments] =
        useState<AppointmentRow[]>([])

    const [existingAppointments, setExistingAppointments] =
        useState<AppointmentRow[]>([])

    const [search, setSearch] = useState('')

    const [selectedDoctorId, setSelectedDoctorId] =
        useState('')

    const [selectedPracticeId, setSelectedPracticeId] =
        useState('')

    const [selectedSlot, setSelectedSlot] =
        useState('')

    const [mode, setMode] =
        useState('PHYSICAL')

    const [reason, setReason] =
        useState('')

    const [patientNote, setPatientNote] =
        useState('')

    const [loading, setLoading] =
        useState(true)

    const [booking, setBooking] =
        useState(false)

    const [message, setMessage] =
        useState('')

    const [errorMessage, setErrorMessage] =
        useState('')

    useEffect(() => {
        loadEverything()
    }, [profile?.id])

    async function loadEverything() {
        if (!profile?.id) return

        setLoading(true)
        setErrorMessage('')

        const {
            data: patient,
            error: patientError
        } = await supabase
            .from('patient_profiles')
            .select('id')
            .eq('user_id', profile.id)
            .maybeSingle()

        if (patientError || !patient) {
            console.error(
                'Patient profile error:',
                patientError
            )

            setErrorMessage(
                hindi
                    ? 'आपकी रोगी प्रोफ़ाइल नहीं मिली।'
                    : 'Your patient profile could not be found.'
            )

            setLoading(false)
            return
        }

        setPatientId(patient.id)

        const [
            doctorsResult,
            practicesResult,
            schedulesResult,
            appointmentResult,
            existingResult
        ] = await Promise.all([
            supabase
                .from('provider_profiles')
                .select(
                    `
          id,
          full_name,
          specialization,
          organization_name,
          hpr_id,
          city,
          state,
          verification_status
          `
                )
                .eq('provider_type', 'DOCTOR')
                .eq('verification_status', 'APPROVED'),

            supabase
                .from('provider_practices')
                .select('*')
                .eq('active', true),

            supabase
                .from('provider_schedules')
                .select('*')
                .eq('active', true),

            supabase
                .from('appointments')
                .select(
                    `
          *,
          provider_profiles!appointments_doctor_provider_id_fkey(
            full_name,
            specialization,
            organization_name,
            hpr_id
          ),
          provider_practices(
            practice_name,
            address_line,
            city,
            state
          )
          `
                )
                .eq('patient_id', patient.id)
                .order('scheduled_at', {
                    ascending: true
                }),

            supabase
                .from('appointments')
                .select(
                    `
          id,
          patient_id,
          doctor_provider_id,
          practice_id,
          scheduled_at,
          mode,
          status,
          reason,
          patient_note,
          duration_minutes
          `
                )
                .gte(
                    'scheduled_at',
                    new Date().toISOString()
                )
                .not(
                    'status',
                    'in',
                    '("CANCELLED","REJECTED")'
                )
        ])

        if (doctorsResult.error) {
            console.error(
                'Doctor load error:',
                doctorsResult.error
            )
        }

        if (practicesResult.error) {
            console.error(
                'Practice load error:',
                practicesResult.error
            )
        }

        if (schedulesResult.error) {
            console.error(
                'Schedule load error:',
                schedulesResult.error
            )
        }

        if (appointmentResult.error) {
            console.error(
                'Appointment load error:',
                appointmentResult.error
            )
        }

        if (existingResult.error) {
            console.error(
                'Existing slots error:',
                existingResult.error
            )
        }

        setDoctors(
            (doctorsResult.data ?? []) as Doctor[]
        )

        setPractices(
            (practicesResult.data ?? []) as Practice[]
        )

        setSchedules(
            (schedulesResult.data ?? []) as Schedule[]
        )

        setAppointments(
            (appointmentResult.data ?? []) as unknown as AppointmentRow[]
        )

        setExistingAppointments(
            (existingResult.data ?? []) as AppointmentRow[]
        )

        setLoading(false)
    }

    const filteredDoctors = useMemo(() => {
        const q = search
            .trim()
            .toLowerCase()

        if (!q) return doctors

        return doctors.filter(doctor => {
            const doctorPractices =
                practices.filter(
                    practice =>
                        practice.provider_id === doctor.id
                )

            const text = [
                doctor.full_name,
                doctor.specialization,
                doctor.organization_name,
                doctor.hpr_id,
                doctor.city,
                doctor.state,
                ...doctorPractices.flatMap(
                    practice => [
                        practice.practice_name,
                        practice.city,
                        practice.state,
                        practice.address_line
                    ]
                )
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()

            return text.includes(q)
        })
    }, [search, doctors, practices])

    const selectedDoctor =
        doctors.find(
            doctor =>
                doctor.id === selectedDoctorId
        ) ?? null

    const doctorPractices = useMemo(() => {
        if (!selectedDoctorId) return []

        return practices.filter(
            practice =>
                practice.provider_id ===
                selectedDoctorId
        )
    }, [practices, selectedDoctorId])

    const selectedPractice =
        practices.find(
            practice =>
                practice.id === selectedPracticeId
        ) ?? null

    const [slotsLoading,setSlotsLoading]=useState(false)
    const [slotError,setSlotError]=useState('')
    const [slotsVersion,setSlotsVersion]=useState(0)
    const [availableSlots,setAvailableSlots]=useState<Slot[]>([])
    const bookingAttempt=useRef<{signature:string;key:string}|null>(null)
    useEffect(()=>{let active=true;setAvailableSlots([]);setSelectedSlot('');setSlotError('');setSlotsLoading(Boolean(selectedPracticeId));if(selectedPracticeId){void supabase.rpc('a2_available_slots',{p_practice:selectedPracticeId,p_mode:mode}).then(({data,error})=>{if(!active)return;setSlotsLoading(false);if(error){setSlotError(error.message);return}setAvailableSlots((data??[]).map((r:any)=>({iso:r.scheduled_at,fee:r.consultation_fee===null?null:Number(r.consultation_fee),dateLabel:new Date(r.scheduled_at).toLocaleDateString(hindi?'hi-IN':'en-IN',{timeZone:r.practice_timezone}),label:new Date(r.scheduled_at).toLocaleTimeString(hindi?'hi-IN':'en-IN',{timeZone:r.practice_timezone,hour:'2-digit',minute:'2-digit'})+' · '+r.practice_timezone+' · '+(r.consultation_fee===null?(hindi?'शुल्क की पुष्टि करें':'Fee: confirm with practice'):'₹'+r.consultation_fee)})))})}return()=>{active=false}},[selectedPracticeId,mode,hindi,slotsVersion])

    function chooseDoctor(doctorId: string) {
        setSelectedDoctorId(doctorId)
        setSelectedPracticeId('')
        setSelectedSlot('')
        setMessage('')
        setErrorMessage('')

        const doctorPracticeList =
            practices.filter(
                practice =>
                    practice.provider_id === doctorId
            )

        if (doctorPracticeList.length === 1) {
            const practice =
                doctorPracticeList[0]

            setSelectedPracticeId(
                practice.id
            )

            if (
                practice.consultation_mode ===
                'TELECONSULT'
            ) {
                setMode('TELECONSULT')
            } else {
                setMode('PHYSICAL')
            }
        }
    }

    function choosePractice(
        practiceId: string
    ) {
        setSelectedPracticeId(practiceId)
        setSelectedSlot('')
        setMessage('')
        setErrorMessage('')

        const practice =
            practices.find(
                item =>
                    item.id === practiceId
            )

        if (!practice) return

        if (
            practice.consultation_mode ===
            'TELECONSULT'
        ) {
            setMode('TELECONSULT')
        }

        if (
            practice.consultation_mode ===
            'PHYSICAL'
        ) {
            setMode('PHYSICAL')
        }
    }

    async function bookAppointment() {
        if (
            !patientId ||
            !selectedDoctorId ||
            !selectedPracticeId ||
            !selectedSlot
        ) {
            setErrorMessage(
                hindi
                    ? 'डॉक्टर, जगह और समय चुनें।'
                    : 'Select a doctor, practice and time.'
            )

            return
        }

        if(booking)return
        const signature=JSON.stringify([selectedPracticeId,selectedSlot,mode,reason,patientNote])
        if(bookingAttempt.current?.signature!==signature)bookingAttempt.current={signature,key:crypto.randomUUID()}
        setBooking(true)
        setMessage('')
        setErrorMessage('')

        const {
            error
        } = await supabase.rpc('a2_book_appointment', {
            p_expected_fee:availableSlots.find(s=>s.iso===selectedSlot)?.fee??null,p_practice:selectedPracticeId,p_slot:selectedSlot,p_mode:mode,p_reason:reason.trim()||null,p_note:patientNote.trim()||null,p_request:bookingAttempt.current!.key
        })

        if (error) {
            setSlotsVersion(v=>v+1)
            console.error(
                'Appointment booking error:',
                error
            )

            if (
                error.code === '23505'
            ) {
                setErrorMessage(
                    hindi
                        ? 'यह समय अभी किसी और ने ले लिया है। दूसरा समय चुनें।'
                        : 'This slot was just booked by someone else. Please select another time.'
                )
            } else {
                setErrorMessage(
                    error.message
                )
            }

            setBooking(false)
            return
        }

        setMessage(
            hindi
                ? 'डॉक्टर से मिलने का अनुरोध भेज दिया गया है।'
                : 'Appointment request sent successfully.'
        )

        bookingAttempt.current=null
        setSelectedSlot('')
        setReason('')
        setPatientNote('')

        await loadEverything()

        setBooking(false)
    }

    function listenToPage() {
        const upcoming =
            appointments.filter(
                appointment =>
                    new Date(
                        appointment.scheduled_at
                    ).getTime() >= Date.now() &&
                    ![
                        'CANCELLED',
                        'REJECTED'
                    ].includes(
                        appointment.status
                    )
            )

        if (hindi) {
            const doctorCount =
                doctors.length

            const upcomingText =
                upcoming.length > 0
                    ? `आपके ${upcoming.length} आने वाले डॉक्टर से मिलने के समय दर्ज हैं।`
                    : 'अभी डॉक्टर से मिलने का कोई आने वाला समय दर्ज नहीं है।'

            speakText(
                `यह डॉक्टर से मिलने वाला पेज है।
        अभी ${doctorCount} सत्यापित डॉक्टर उपलब्ध हैं।
        ${upcomingText}
        डॉक्टर खोजने के लिए नाम, बीमारी के डॉक्टर की किस्म, एच पी आर नंबर, शहर या अस्पताल का नाम लिख सकते हैं।
        डॉक्टर चुनने के बाद अस्पताल या क्लिनिक और उपलब्ध समय चुनें।`,
                'Hindi'
            )

            return
        }

        speakText(
            `This is the appointments page.
      There are ${doctors.length} verified doctors currently available.
      You have ${upcoming.length} upcoming appointment records.
      Search by doctor name, specialization, HPR ID, city, clinic or hospital.
      Then select a practice location and an available time slot.`,
            'English'
        )
    }

    function listenDoctor(
        doctor: Doctor
    ) {
        const doctorPracticeList =
            practices.filter(
                practice =>
                    practice.provider_id ===
                    doctor.id
            )

        const practiceText =
            doctorPracticeList.length
                ? doctorPracticeList
                    .map(
                        practice =>
                            `${practice.practice_name}${practice.city
                                ? `, ${practice.city}`
                                : ''
                            }`
                    )
                    .join('. ')
                : hindi
                    ? 'अभी क्लिनिक की जानकारी नहीं है'
                    : 'No practice location is currently listed'

        if (hindi) {
            speakText(
                `डॉक्टर ${doctor.full_name ?? ''}.
        ${doctor.specialization
                    ? `ये ${doctor.specialization} के डॉक्टर हैं।`
                    : ''
                }
        ${doctor.hpr_id
                    ? `एच पी आर पहचान ${doctor.hpr_id}.`
                    : ''
                }
        ये इन जगहों पर मिलते हैं। ${practiceText}.`,
                'Hindi'
            )

            return
        }

        speakText(
            `Doctor ${doctor.full_name ?? ''}.
      ${doctor.specialization
                ? `Specialization: ${doctor.specialization}.`
                : ''
            }
      ${doctor.hpr_id
                ? `HPR ID: ${doctor.hpr_id}.`
                : ''
            }
      Practice locations: ${practiceText}.`,
            'English'
        )
    }

    function listenAppointment(
        appointment: AppointmentRow
    ) {
        const doctorName =
            appointment.provider_profiles
                ?.full_name ??
            (hindi ? 'डॉक्टर' : 'Doctor')

        const place =
            appointment.provider_practices
                ?.practice_name ?? ''

        const date =
            formatDateTime(
                appointment.scheduled_at,
                hindi
            )

        if (hindi) {
            speakText(
                `आपका डॉक्टर से मिलने का समय।
        डॉक्टर ${doctorName}.
        ${date}.
        ${place
                    ? `जगह ${place}.`
                    : ''
                }
        स्थिति ${appointment.status}.`,
                'Hindi'
            )

            return
        }

        speakText(
            `Your appointment is with ${doctorName}.
      ${date}.
      ${place
                ? `Location: ${place}.`
                : ''
            }
      Status: ${appointment.status}.`,
            'English'
        )
    }

    if (loading) {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                {hindi
                    ? 'डॉक्टर और समय की जानकारी लोड हो रही है...'
                    : 'Loading doctors and appointments...'}
            </div>
        )
    }

    return (
        <div className="space-y-6">

            {/* HEADER */}
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">
                        {hindi
                            ? 'डॉक्टर से मिलें'
                            : 'Appointments'}
                    </p>

                    <h1 className="mt-1 text-2xl font-bold md:text-3xl">
                        {hindi
                            ? 'डॉक्टर खोजें और समय लें'
                            : 'Find a doctor & book'}
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {hindi
                            ? 'सत्यापित डॉक्टर खोजें, अस्पताल या क्लिनिक चुनें और उपलब्ध समय लें।'
                            : 'Find a verified doctor, choose their practice location and book an available slot.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={listenToPage}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:bg-secondary"
                >
                    <Volume2 className="size-4" />

                    {hindi
                        ? 'यह पेज सुनें'
                        : 'Listen to this page'}
                </button>
            </section>

            {/* SEARCH */}
            <Card>
                <div className="flex items-center gap-3">
                    <Search className="size-5 shrink-0 text-muted-foreground" />

                    <input
                        value={search}
                        onChange={event =>
                            setSearch(
                                event.target.value
                            )
                        }
                        placeholder={
                            hindi
                                ? 'डॉक्टर का नाम, किस तरह के डॉक्टर, HPR नंबर, शहर या अस्पताल खोजें'
                                : 'Search doctor, specialization, HPR ID, city, clinic or hospital'
                        }
                        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
            </Card>

            {/* DOCTORS */}
            <section>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold">
                            {hindi
                                ? 'उपलब्ध डॉक्टर'
                                : 'Available doctors'}
                        </h2>

                        <p className="mt-1 text-xs text-muted-foreground">
                            {hindi
                                ? 'केवल SwasthyaSetu में मंजूर किए गए डॉक्टर यहाँ दिखते हैं।'
                                : 'Only approved doctors registered in SwasthyaSetu appear here.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={loadEverything}
                        className="grid size-9 place-items-center rounded-xl border border-border hover:bg-secondary"
                        title={
                            hindi
                                ? 'फिर से लोड करें'
                                : 'Refresh'
                        }
                    >
                        <RefreshCw className="size-4" />
                    </button>
                </div>

                {filteredDoctors.length === 0 ? (
                    <Card className="mt-4">
                        <EmptyState
                            text={
                                doctors.length === 0
                                    ? hindi
                                        ? 'अभी कोई मंजूर डॉक्टर उपलब्ध नहीं है। डॉक्टर के खाते को मंजूरी मिलने के बाद वह यहाँ दिखेगा।'
                                        : 'No approved doctor is available yet. A doctor will appear here after their account is approved.'
                                    : hindi
                                        ? 'इस खोज से कोई डॉक्टर नहीं मिला।'
                                        : 'No doctor matched your search.'
                            }
                        />
                    </Card>
                ) : (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {filteredDoctors.map(
                            doctor => {
                                const doctorPracticeList =
                                    practices.filter(
                                        practice =>
                                            practice.provider_id ===
                                            doctor.id
                                    )

                                const isSelected =
                                    selectedDoctorId ===
                                    doctor.id

                                return (
                                    <Card
                                        key={doctor.id}
                                        className={
                                            isSelected
                                                ? 'ring-2 ring-primary'
                                                : ''
                                        }
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                                                <UserRound className="size-5" />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <h3 className="font-semibold">
                                                            {doctor.full_name ??
                                                                (hindi
                                                                    ? 'डॉक्टर'
                                                                    : 'Doctor')}
                                                        </h3>

                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                            {doctor.specialization ||
                                                                (hindi
                                                                    ? 'सामान्य डॉक्टर'
                                                                    : 'General practice')}
                                                        </p>
                                                    </div>

                                                    <Badge>
                                                        {hindi
                                                            ? 'मंजूर'
                                                            : 'APPROVED'}
                                                    </Badge>
                                                </div>

                                                {doctor.hpr_id && (
                                                    <p className="mt-3 text-xs text-muted-foreground">
                                                        HPR: {doctor.hpr_id}
                                                    </p>
                                                )}

                                                {doctorPracticeList.length >
                                                    0 && (
                                                        <div className="mt-3 space-y-2">
                                                            {doctorPracticeList.map(
                                                                practice => (
                                                                    <div
                                                                        key={
                                                                            practice.id
                                                                        }
                                                                        className="flex items-start gap-2 text-xs text-muted-foreground"
                                                                    >
                                                                        <MapPin className="mt-0.5 size-3.5 shrink-0" />

                                                                        <span>
                                                                            {
                                                                                practice.practice_name
                                                                            }

                                                                            {practice.city
                                                                                ? ` · ${practice.city}`
                                                                                : ''}

                                                                            {practice.state
                                                                                ? `, ${practice.state}`
                                                                                : ''}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    )}

                                                {doctorPracticeList.length ===
                                                    0 && (
                                                        <p className="mt-3 text-xs text-amber-700">
                                                            {hindi
                                                                ? 'डॉक्टर ने अभी मिलने की जगह और समय नहीं जोड़ा है।'
                                                                : 'This doctor has not added a practice location and schedule yet.'}
                                                        </p>
                                                    )}

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <Button
                                                        onClick={() =>
                                                            chooseDoctor(
                                                                doctor.id
                                                            )
                                                        }
                                                        disabled={
                                                            doctorPracticeList.length ===
                                                            0
                                                        }
                                                    >
                                                        {isSelected
                                                            ? hindi
                                                                ? 'चुना गया'
                                                                : 'Selected'
                                                            : hindi
                                                                ? 'डॉक्टर चुनें'
                                                                : 'Select doctor'}
                                                    </Button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            listenDoctor(
                                                                doctor
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
                                        </div>
                                    </Card>
                                )
                            }
                        )}
                    </div>
                )}
            </section>

            {/* BOOKING */}
            {selectedDoctor && (
                <Card>
                    <div className="flex items-start gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                            <CalendarCheck className="size-5" />
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                                {hindi
                                    ? 'समय लें'
                                    : 'Book appointment'}
                            </p>

                            <h2 className="mt-1 text-lg font-semibold">
                                {selectedDoctor.full_name}
                            </h2>
                        </div>
                    </div>

                    {/* PRACTICE */}
                    <div className="mt-6">
                        <label className="text-sm font-semibold">
                            {hindi
                                ? 'कहाँ मिलना है?'
                                : 'Choose practice location'}
                        </label>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            {doctorPractices.map(
                                practice => (
                                    <button
                                        type="button"
                                        key={practice.id}
                                        onClick={() =>
                                            choosePractice(
                                                practice.id
                                            )
                                        }
                                        className={`rounded-xl border p-4 text-left transition ${selectedPracticeId ===
                                            practice.id
                                            ? 'border-primary ring-1 ring-primary'
                                            : 'border-border hover:bg-secondary/50'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />

                                            <div>
                                                <p className="font-semibold">
                                                    {
                                                        practice.practice_name
                                                    }
                                                </p>

                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {[
                                                        practice.address_line,
                                                        practice.city,
                                                        practice.state,
                                                        practice.postal_code
                                                    ]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </p>

                                                <p className="mt-2 text-xs font-medium">
                                                    {practice.consultation_mode ===
                                                        'BOTH'
                                                        ? hindi
                                                            ? 'क्लिनिक और वीडियो दोनों'
                                                            : 'Physical & teleconsult'
                                                        : practice.consultation_mode ===
                                                            'TELECONSULT'
                                                            ? hindi
                                                                ? 'वीडियो पर'
                                                                : 'Teleconsult'
                                                            : hindi
                                                                ? 'क्लिनिक पर'
                                                                : 'Physical'}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {/* MODE */}
                    {selectedPractice && (
                        <div className="mt-6">
                            <label className="text-sm font-semibold">
                                {hindi
                                    ? 'कैसे मिलना है?'
                                    : 'Consultation mode'}
                            </label>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {(selectedPractice.consultation_mode ===
                                    'PHYSICAL' ||
                                    selectedPractice.consultation_mode ===
                                    'BOTH') && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setMode(
                                                    'PHYSICAL'
                                                )
                                            }
                                            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${mode === 'PHYSICAL'
                                                ? 'border-primary bg-secondary'
                                                : 'border-border'
                                                }`}
                                        >
                                            <MapPin className="size-4" />

                                            {hindi
                                                ? 'क्लिनिक पर'
                                                : 'Physical'}
                                        </button>
                                    )}

                                {(selectedPractice.consultation_mode ===
                                    'TELECONSULT' ||
                                    selectedPractice.consultation_mode ===
                                    'BOTH') && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setMode(
                                                    'TELECONSULT'
                                                )
                                            }
                                            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${mode ===
                                                'TELECONSULT'
                                                ? 'border-primary bg-secondary'
                                                : 'border-border'
                                                }`}
                                        >
                                            <Video className="size-4" />

                                            {hindi
                                                ? 'वीडियो पर'
                                                : 'Teleconsult'}
                                        </button>
                                    )}
                            </div>
                        </div>
                    )}

                    {/* SLOTS */}
                    {selectedPracticeId && (
                        <div className="mt-6">
                            <label className="text-sm font-semibold">
                                {hindi
                                    ? 'मिलने का समय चुनें'
                                    : 'Choose an available time'}
                            </label>

                            {slotsLoading ? <p role="status">{hindi?'समय की जानकारी आ रही है…':'Loading available times…'}</p> : slotError ? <p role="alert">{slotError}</p> : availableSlots.length ===
                                0 ? (
                                <div className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                                    {hindi
                                        ? 'अगले 14 दिनों में अभी कोई उपलब्ध समय नहीं मिला।'
                                        : 'No available slot was found in the next 14 days.'}
                                </div>
                            ) : (
                                <div className="mt-3 space-y-4">
                                    {groupSlotsByDate(
                                        availableSlots
                                    ).map(group => (
                                        <div
                                            key={group.date}
                                        >
                                            <p className="text-sm font-semibold">
                                                {group.date}
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {group.slots.map(
                                                    slot => (
                                                        <button
                                                            type="button"
                                                            key={
                                                                slot.iso
                                                            }
                                                            onClick={() =>
                                                                setSelectedSlot(
                                                                    slot.iso
                                                                )
                                                            }
                                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${selectedSlot ===
                                                                slot.iso
                                                                ? 'border-primary bg-secondary font-semibold'
                                                                : 'border-border hover:bg-secondary/50'
                                                                }`}
                                                        >
                                                            <Clock3 className="size-4" />
                                                            {
                                                                slot.label
                                                            }
                                                        </button>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* REASON */}
                    {selectedSlot && (
                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-semibold">
                                    {hindi
                                        ? 'डॉक्टर से क्यों मिलना है?'
                                        : 'Reason for visit'}
                                </label>

                                <input
                                    value={reason}
                                    onChange={event =>
                                        setReason(
                                            event.target.value
                                        )
                                    }
                                    placeholder={
                                        hindi
                                            ? 'जैसे बुखार, पेट दर्द, पुरानी रिपोर्ट दिखानी है'
                                            : 'e.g. fever, stomach pain, follow-up'
                                    }
                                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-semibold">
                                    {hindi
                                        ? 'डॉक्टर के लिए कोई और बात'
                                        : 'Note for doctor'}
                                </label>

                                <input
                                    value={patientNote}
                                    onChange={event =>
                                        setPatientNote(
                                            event.target.value
                                        )
                                    }
                                    placeholder={
                                        hindi
                                            ? 'जरूरी बात लिखें, अगर कोई हो'
                                            : 'Optional additional note'
                                    }
                                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                                />
                            </div>
                        </div>
                    )}

                    {errorMessage && (
                        <p className="mt-4 text-sm font-medium text-red-600">
                            {errorMessage}
                        </p>
                    )}

                    {message && (
                        <p className="mt-4 text-sm font-medium text-emerald-700">
                            {message}
                        </p>
                    )}

                    <Button
                        className="mt-6"
                        disabled={
                            booking ||
                            !selectedDoctorId ||
                            !selectedPracticeId ||
                            !selectedSlot
                        }
                        onClick={
                            bookAppointment
                        }
                    >
                        {booking
                            ? hindi
                                ? 'समय लिया जा रहा है...'
                                : 'Booking...'
                            : hindi
                                ? 'डॉक्टर से मिलने का अनुरोध भेजें'
                                : 'Request appointment'}
                    </Button>
                </Card>
            )}

            {/* MY APPOINTMENTS */}
            <section>
                <h2 className="text-lg font-semibold">
                    {hindi
                        ? 'मेरे डॉक्टर से मिलने के समय'
                        : 'My appointments'}
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                    {hindi
                        ? 'आपके असली बुक किए गए समय यहाँ दिखेंगे।'
                        : 'Your actual appointment records appear here.'}
                </p>

                <div className="mt-4 space-y-3">
                    {appointments.length === 0 ? (
                        <Card>
                            <EmptyState
                                text={
                                    hindi
                                        ? 'अभी आपने डॉक्टर से मिलने का कोई समय नहीं लिया है।'
                                        : 'You have no appointments yet.'
                                }
                            />
                        </Card>
                    ) : (
                        appointments.map(
                            appointment => (
                                <Card
                                    key={
                                        appointment.id
                                    }
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                                                <Stethoscope className="size-5" />
                                            </div>

                                            <div>
                                                <p className="font-semibold">
                                                    {appointment
                                                        .provider_profiles
                                                        ?.full_name ??
                                                        (hindi
                                                            ? 'डॉक्टर'
                                                            : 'Doctor')}
                                                </p>

                                                {appointment
                                                    .provider_profiles
                                                    ?.specialization && (
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            {
                                                                appointment
                                                                    .provider_profiles
                                                                    ?.specialization
                                                            }
                                                        </p>
                                                    )}

                                                <p className="mt-2 text-sm font-medium">
                                                    {formatDateTime(
                                                        appointment.scheduled_at,
                                                        hindi
                                                    )}
                                                </p>

                                                {appointment
                                                    .provider_practices
                                                    ?.practice_name && (
                                                        <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                                                            <MapPin className="mt-0.5 size-3.5 shrink-0" />

                                                            <span>
                                                                {
                                                                    appointment
                                                                        .provider_practices
                                                                        ?.practice_name
                                                                }

                                                                {appointment
                                                                    .provider_practices
                                                                    ?.city
                                                                    ? ` · ${appointment.provider_practices.city}`
                                                                    : ''}
                                                            </span>
                                                        </div>
                                                    )}

                                                {appointment.reason && (
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                        {hindi
                                                            ? 'कारण'
                                                            : 'Reason'}
                                                        :{' '}
                                                        {
                                                            appointment.reason
                                                        }
                                                    </p>
                                                )}

                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {appointment.mode ===
                                                        'TELECONSULT'
                                                        ? hindi
                                                            ? 'वीडियो पर'
                                                            : 'Teleconsultation'
                                                        : hindi
                                                            ? 'क्लिनिक पर'
                                                            : 'Physical consultation'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge>
                                                {
                                                    appointment.status
                                                }
                                            </Badge>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    listenAppointment(
                                                        appointment
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
                                </Card>
                            )
                        )
                    )}
                </div>
            </section>
        </div>
    )
}

/* ============================================================
   DOCTOR
============================================================ */

function DoctorAppointments() {
    const { profile } = useAuth()
    const { language } = useLanguage()

    const hindi =
        language === 'Hindi'

    const [provider, setProvider] =
        useState<any>(null)

    const [rows, setRows] =
        useState<any[]>([])

    const [loading, setLoading] =
        useState(true)

    useEffect(() => {
        load()
    }, [profile?.id])

    async function load() {
        if (!profile?.id) return

        setLoading(true)

        const {
            data: providerData,
            error: providerError
        } = await supabase
            .from('provider_profiles')
            .select(
                'id, full_name, verification_status'
            )
            .eq(
                'user_id',
                profile.id
            )
            .maybeSingle()

        if (providerError) {
            console.error(
                providerError
            )
        }

        setProvider(
            providerData
        )

        if (!providerData) {
            setLoading(false)
            return
        }

        const {
            data,
            error
        } = await supabase
            .from('appointments')
            .select(
                `
        *,
        patient_profiles(
          patient_code
        ),
        provider_practices(
          practice_name,
          address_line,
          city,
          state
        )
        `
            )
            .eq(
                'doctor_provider_id',
                providerData.id
            )
            .order(
                'scheduled_at',
                {
                    ascending: true
                }
            )

        if (error) {
            console.error(
                'Doctor appointments error:',
                error
            )
        }

        setRows(
            data ?? []
        )

        setLoading(false)
    }

    async function changeStatus(
        appointmentId: string,
        status: string
    ) {
        const {
            error
        } = await supabase.rpc('a2_appointment_transition',{p_appointment:appointmentId,p_status:status})

        if (error) {
            alert(
                error.message
            )

            return
        }

        await load()
    }
    function startConsultation(
        appointmentId: string
    ) {
        sessionStorage.setItem(
            'swasthyasetu-active-appointment',
            appointmentId
        )

        navigate('/encounter')
    }
    function listenPage() {
        if (hindi) {
            speakText(
                `यह डॉक्टर का मिलने के समय वाला पेज है।
        आपके पास ${rows.length} मरीजों के समय दर्ज हैं।
        नए अनुरोध को देखकर आप उसे मंजूर या मना कर सकते हैं।`,
                'Hindi'
            )

            return
        }

        speakText(
            `This is your appointments workspace.
      You currently have ${rows.length} appointment records.
      Review new patient requests and confirm or reject them.`,
            'English'
        )
    }

    if (loading) {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                {hindi
                    ? 'जानकारी लोड हो रही है...'
                    : 'Loading appointments...'}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">
                        {hindi
                            ? 'डॉक्टर'
                            : 'Doctor'}
                    </p>

                    <h1 className="mt-1 text-2xl font-bold md:text-3xl">
                        {hindi
                            ? 'मरीजों से मिलने का समय'
                            : 'Appointments'}
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {hindi
                            ? 'मरीजों के असली बुकिंग अनुरोध यहाँ दिखाई देंगे।'
                            : 'Real appointment requests from patients appear here.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={
                        listenPage
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                >
                    <Volume2 className="size-4" />

                    {hindi
                        ? 'यह पेज सुनें'
                        : 'Listen to this page'}
                </button>
            </section>

            {provider?.verification_status !==
                'APPROVED' ? (
                <Card>
                    <EmptyState
                        text={
                            hindi
                                ? 'डॉक्टर का सत्यापन अभी पूरा नहीं हुआ है। मिलने के समय से जुड़े काम अभी बंद हैं।'
                                : 'Provider verification is pending. Appointment actions are locked.'
                        }
                    />
                </Card>
            ) : rows.length === 0 ? (
                <Card>
                    <EmptyState
                        text={
                            hindi
                                ? 'अभी किसी मरीज ने मिलने का समय नहीं माँगा है।'
                                : 'No appointment requests yet.'
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {rows.map(
                        appointment => (
                            <Card
                                key={
                                    appointment.id
                                }
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <UserRound className="size-4 text-primary" />

                                            <p className="font-semibold">
                                                {hindi
                                                    ? 'मरीज'
                                                    : 'Patient'}
                                            </p>
                                        </div>

                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {appointment
                                                .patient_profiles
                                                ?.patient_code ??
                                                '—'}
                                        </p>

                                        <p className="mt-3 font-medium">
                                            {formatDateTime(
                                                appointment.scheduled_at,
                                                hindi
                                            )}
                                        </p>

                                        {appointment
                                            .provider_practices
                                            ?.practice_name && (
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {
                                                        appointment
                                                            .provider_practices
                                                            ?.practice_name
                                                    }
                                                </p>
                                            )}

                                        {appointment.reason && (
                                            <p className="mt-3 text-sm">
                                                <span className="font-semibold">
                                                    {hindi
                                                        ? 'मिलने का कारण'
                                                        : 'Reason'}
                                                    :{' '}
                                                </span>

                                                {
                                                    appointment.reason
                                                }
                                            </p>
                                        )}

                                        {appointment.patient_note && (
                                            <p className="mt-2 text-sm">
                                                <span className="font-semibold">
                                                    {hindi
                                                        ? 'मरीज की बात'
                                                        : 'Patient note'}
                                                    :{' '}
                                                </span>

                                                {
                                                    appointment.patient_note
                                                }
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Badge>
                                            {
                                                appointment.status
                                            }
                                        </Badge>

                                        {appointment.status ===
                                            'REQUESTED' && (
                                                <>
                                                    <Button
                                                        onClick={() =>
                                                            changeStatus(
                                                                appointment.id,
                                                                'CONFIRMED'
                                                            )
                                                        }
                                                    >
                                                        {hindi
                                                            ? 'मंजूर करें'
                                                            : 'Confirm'}
                                                    </Button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            changeStatus(
                                                                appointment.id,
                                                                'CANCELLED'
                                                            )
                                                        }
                                                        className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary"
                                                    >
                                                        {hindi
                                                            ? 'मना करें'
                                                            : 'Reject'}
                                                    </button>
                                                </>
                                            )}{appointment.status === 'CONFIRMED' && (
                                                <Button
                                                    onClick={() =>
                                                        startConsultation(
                                                            appointment.id
                                                        )
                                                    }
                                                >
                                                    <Stethoscope className="mr-2 size-4" />

                                                    {hindi
                                                        ? 'Consultation शुरू करें'
                                                        : 'Start Consultation'}
                                                </Button>
                                            )}
                                    </div>
                                </div>
                            </Card>
                        )
                    )}
                </div>
            )}
        </div>
    )
}

/* ============================================================
   HELPERS
============================================================ */

function groupSlotsByDate(
    slots: Slot[]
) {
    const map =
        new Map<
            string,
            Slot[]
        >()

    for (
        const slot of slots
    ) {
        const existing =
            map.get(
                slot.dateLabel
            ) ?? []

        existing.push(
            slot
        )

        map.set(
            slot.dateLabel,
            existing
        )
    }

    return Array.from(
        map.entries()
    ).map(
        ([date, groupedSlots]) => ({
            date,
            slots: groupedSlots
        })
    )
}

function formatDateTime(
    value: string,
    hindi: boolean
) {
    return new Date(
        value
    ).toLocaleString(
        hindi
            ? 'hi-IN'
            : 'en-IN',
        {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }
    )
}