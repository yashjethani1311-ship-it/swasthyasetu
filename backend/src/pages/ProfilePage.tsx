import {PracticeTerms} from '@/components/PracticeTerms'
import { FacilityLocations } from '@/components/FacilityLocations'
import { useEffect, useState } from 'react'
import {
    Building2,
    CalendarDays,
    Clock3,
    MapPin,
    Plus,
    Save,
    Stethoscope,
    Trash2,
    Volume2,
    Activity,
    HeartPulse,
    FileText,
    Pill
} from 'lucide-react'

import {
    Badge,
    Button,
    Card,
    EmptyState,
    Field
} from '@/components/kit'

import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'

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

const DAYS = [
    { value: 0, en: 'Sunday', hi: 'रविवार' },
    { value: 1, en: 'Monday', hi: 'सोमवार' },
    { value: 2, en: 'Tuesday', hi: 'मंगलवार' },
    { value: 3, en: 'Wednesday', hi: 'बुधवार' },
    { value: 4, en: 'Thursday', hi: 'गुरुवार' },
    { value: 5, en: 'Friday', hi: 'शुक्रवार' },
    { value: 6, en: 'Saturday', hi: 'शनिवार' }
]

export function ProfilePage() {
    const { profile } = useAuth()
    const { language } = useLanguage()

    const hindi = language === 'Hindi'

    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadProfile()
    }, [profile?.id, profile?.role])

    async function loadProfile() {
        if (!profile) return

        setLoading(true)

        const table =
            profile.role === 'PATIENT'
                ? 'patient_profiles'
                : 'provider_profiles'

        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle()

        if (error) {
            console.error('Profile load error:', error)
        }

        setData(data)
        setLoading(false)
    }

    if (!profile) return null

    if (loading) {
        return (
            <div className="py-16 text-center text-sm text-muted-foreground">
                {hindi
                    ? 'प्रोफ़ाइल लोड हो रही है...'
                    : 'Loading profile...'}
            </div>
        )
    }

    if (
        profile.role === 'DOCTOR' &&
        data
    ) {
        return (
            <DoctorProfile
                profile={profile}
                provider={data}
            />
        )
    }

    if (profile.role === 'PATIENT') {
        return (
            <PatientProfile
                profile={profile}
                data={data}
                onRefresh={loadProfile}
            />
        )
    }

    return (
        <div className="space-y-6"><GeneralProfile profile={profile} data={data} />{['LAB','FACILITY','PHARMACY'].includes(profile.role) && <FacilityLocations />}</div>
    )
}

/* ============================================================
   PATIENT PROFILE
============================================================ */

function PatientProfile({
    profile,
    data,
    onRefresh
}: {
    profile: any
    data: any
    onRefresh: () => void
}) {
    const { language } = useLanguage()
    const hindi = language === 'Hindi'

    const [isEditing, setIsEditing] = useState(false)
    const [phone, setPhone] = useState(data?.phone ?? '')
    const [dob, setDob] = useState(data?.date_of_birth ?? '')
    const [sex, setSex] = useState(data?.sex ?? '')
    const [city, setCity] = useState(data?.city ?? '')
    const [state, setState] = useState(data?.state ?? '')
    const [preferredLanguage, setPreferredLanguage] = useState(data?.preferred_language ?? 'English')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState('')
    const [clinicalData, setClinicalData] = useState<{
        encountersCount: number;
        prescriptionsCount: number;
        diagnosticsCount: number;
        recordsCount: number;
        activeMedicines: { name: string; dose?: string; frequency?: string }[];
        clinicalAlerts: { gap: string; severity: string; due?: string }[];
        latestCareContext: { startedAt: string; chiefComplaint?: string; diagnosis?: string; status: string } | null;
    }>({
        encountersCount: 0,
        prescriptionsCount: 0,
        diagnosticsCount: 0,
        recordsCount: 0,
        activeMedicines: [],
        clinicalAlerts: [],
        latestCareContext: null,
    })

    useEffect(() => {
        setPhone(data?.phone ?? '')
        setDob(data?.date_of_birth ?? '')
        setSex(data?.sex ?? '')
        setCity(data?.city ?? '')
        setState(data?.state ?? '')
        setPreferredLanguage(data?.preferred_language ?? 'English')

        if (data?.id) {
            let active = true
            void (async () => {
                try {
                    let careCtx: any = null
                    try {
                        const rpcRes = await supabase.rpc('c1_care_context', { p_patient: data.id, p_offset: 0 })
                        careCtx = rpcRes.data
                    } catch {
                        // Fallback to table queries below
                    }

                    const [encRes, rxRes, labRes, recRes, gapRes] = await Promise.all([
                        supabase.from('encounters').select('id, started_at, chief_complaint, symptoms, diagnosis, status').eq('patient_id', data.id).order('started_at', { ascending: false }).limit(20),
                        supabase.from('prescriptions').select('id, issued_at, status, prescription_items(id, medicine_name, strength, dose, frequency)').eq('patient_id', data.id).order('issued_at', { ascending: false }).limit(20),
                        supabase.from('lab_orders').select('id', { count: 'exact', head: true }).eq('patient_id', data.id),
                        supabase.from('health_records').select('id', { count: 'exact', head: true }).eq('patient_id', data.id),
                        supabase.from('care_gaps').select('id, gap_type, severity, due_at, status').eq('patient_id', data.id).eq('status', 'OPEN').limit(10)
                    ])

                    if (!active) return

                    const encounters = encRes.data && encRes.data.length > 0 ? encRes.data : (careCtx?.encounters ?? [])
                    const prescriptions = rxRes.data && rxRes.data.length > 0 ? rxRes.data : (careCtx?.prescriptions ?? [])
                    const openGaps = gapRes.data && gapRes.data.length > 0 ? gapRes.data : ((careCtx?.care_gaps ?? []).filter((g: any) => g.status === 'OPEN'))

                    const activeMeds: { name: string; dose?: string; frequency?: string }[] = []
                    for (const rx of prescriptions) {
                        if (rx.status === 'ACTIVE') {
                            const items = rx.prescription_items || rx.items || []
                            for (const item of items) {
                                if (item.medicine_name) {
                                    activeMeds.push({
                                        name: `${item.medicine_name}${item.strength ? ` ${item.strength}` : ''}`,
                                        dose: item.dose,
                                        frequency: item.frequency
                                    })
                                }
                            }
                        }
                    }

                    const clinicalAlerts = openGaps.map((g: any) => ({
                        gap: typeof g.gap_type === 'string' ? g.gap_type.replace(/_/g, ' ') : 'Care Gap',
                        severity: g.severity ?? 'ROUTINE',
                        due: g.due_at
                    }))

                    const latestEnc = encounters[0] ?? null
                    const latestCareContext = latestEnc ? {
                        startedAt: latestEnc.started_at,
                        chiefComplaint: latestEnc.chief_complaint || undefined,
                        diagnosis: latestEnc.diagnosis || undefined,
                        status: latestEnc.status
                    } : null

                    setClinicalData({
                        encountersCount: encounters.length || (careCtx?.encounters?.length ?? 0),
                        prescriptionsCount: prescriptions.length || (careCtx?.prescriptions?.length ?? 0),
                        diagnosticsCount: labRes.count ?? (careCtx?.diagnostics?.length ?? 0),
                        recordsCount: recRes.count ?? (careCtx?.health_records?.length ?? 0),
                        activeMedicines: activeMeds,
                        clinicalAlerts,
                        latestCareContext
                    })
                } catch {
                    // Safe failover
                }
            })()
            return () => { active = false }
        }
    }, [data])

    function listenProfile() {
        speakText(
            hindi
                ? `यह आपकी प्रोफ़ाइल है। आपका नाम ${data?.full_name ?? profile?.full_name ?? ''} है। आपका रोगी नंबर ${data?.patient_code ?? 'दर्ज नहीं है'} है। आपकी ABHA स्थिति ${data?.abha_link_status ?? 'जुड़ी नहीं है'} है।`
                : `This is your profile. Your name is ${data?.full_name ?? profile?.full_name ?? ''}. Your patient ID is ${data?.patient_code ?? 'not available'}. Your ABHA status is ${data?.abha_link_status ?? 'not linked'}.`,
            hindi ? 'Hindi' : 'English'
        )
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setSaveError('')
        setSaveSuccess('')

        try {
            const { error: updateErr } = await supabase
                .from('patient_profiles')
                .update({
                    phone: phone.trim() || null,
                    date_of_birth: dob || null,
                    sex: sex || null,
                    city: city.trim() || null,
                    state: state.trim() || null,
                    preferred_language: preferredLanguage || null,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', profile.id)

            if (updateErr) throw updateErr

            setSaveSuccess(hindi ? 'विवरण सफलतापूर्वक सुरक्षित हुआ।' : 'Demographics updated successfully.')
            setIsEditing(false)
            onRefresh()
        } catch (err: any) {
            setSaveError(err.message || 'Failed to update profile')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold md:text-3xl text-foreground">
                        {hindi ? 'मेरी जानकारी (रोगी प्रोफ़ाइल)' : 'Patient Profile'}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {hindi
                            ? 'आपके खाते, पहचान और जनसांख्यिकीय विवरण।'
                            : 'Your account, health identity, and demographic details.'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={listenProfile}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                    >
                        <Volume2 className="size-4" />
                        {hindi ? 'यह पेज सुनें' : 'Listen'}
                    </button>
                    <Button
                        variant={isEditing ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => {
                            setIsEditing(!isEditing)
                            setSaveError('')
                            setSaveSuccess('')
                        }}
                    >
                        {isEditing
                            ? (hindi ? 'रद्द करें' : 'Cancel')
                            : (hindi ? 'विवरण बदलें' : 'Edit Demographics')}
                    </Button>
                </div>
            </section>

            {saveSuccess && (
                <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm font-medium text-success">
                    {saveSuccess}
                </div>
            )}
            {saveError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {saveError}
                </div>
            )}

            {/* Account & Identity Card */}
            <Card className="space-y-4">
                <h2 className="text-base font-semibold text-foreground">
                    {hindi ? 'खाता और प्राथमिक पहचान' : 'Account & Identity'}
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                    <Field
                        label={hindi ? 'खाते का प्रकार' : 'Role'}
                        value={profile?.role ?? 'PATIENT'}
                    />
                    <Field
                        label={hindi ? 'नाम' : 'Full Name'}
                        value={data?.full_name ?? profile?.full_name ?? (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                    />
                    <Field
                        label={hindi ? 'रोगी नंबर' : 'Patient Code'}
                        value={data?.patient_code ?? '—'}
                    />
                    <Field
                        label={hindi ? 'खाता बना' : 'Member Since'}
                        value={data?.created_at ? new Date(data.created_at).toLocaleDateString([], { dateStyle: 'medium' }) : '—'}
                    />
                </div>
            </Card>

            {/* ABHA & Health Registry Card */}
            <Card className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">
                        {hindi ? 'आयुष्मान भारत डिजिटल मिशन (ABDM / ABHA)' : 'Digital Health Identity (ABHA)'}
                    </h2>
                    <Badge tone={data?.abha_link_status === 'VERIFIED' ? 'success' : 'outline'}>
                        {data?.abha_link_status ?? 'NOT_LINKED'}
                    </Badge>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                    <Field
                        label={hindi ? 'ABHA नंबर' : 'Masked ABHA Number'}
                        value={data?.abha_number_masked || (hindi ? 'जुड़ा नहीं' : 'Not linked')}
                    />
                    <Field
                        label={hindi ? 'ABHA पता / PHR' : 'ABHA Address (PHR)'}
                        value={data?.abha_address || (hindi ? 'जुड़ा नहीं' : 'Not linked')}
                    />
                    <Field
                        label={hindi ? 'पहचान स्रोत' : 'Identity Source'}
                        value={data?.identity_source ?? 'DEMO'}
                    />
                    <Field
                        label={hindi ? 'रजिस्ट्री सत्यापन स्थिति' : 'Registry Verification'}
                        value={
                            <Badge tone={data?.registry_verified ? 'success' : 'neutral'}>
                                {data?.registry_verified
                                    ? (hindi ? 'सत्यापित' : 'Registry Verified')
                                    : (hindi ? 'प्रोटोटाइप / असत्यापित' : 'Self-declared / Prototype')}
                            </Badge>
                        }
                    />
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3 text-xs text-muted-foreground">
                    {hindi
                        ? 'आधिकारिक ABHA / NDHM गेटवे इस प्रोटोटाइप वातावरण में कनेक्टेड नहीं है। डेमो पहचान का उपयोग परीक्षण के लिए किया गया है।'
                        : 'Official ABHA national health registry integration is not configured in this prototype environment. Demo credentials are simulated for workflow verification.'}
                </div>
            </Card>

            {/* Demographics & Contact Card */}
            <Card className="space-y-4">
                <h2 className="text-base font-semibold text-foreground">
                    {hindi ? 'जनसांख्यिकीय व संपर्क जानकारी' : 'Demographics & Contact Details'}
                </h2>

                {isEditing ? (
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'फ़ोन नंबर' : 'Phone Number'}
                                <input
                                    type="tel"
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="+91 98765 43210"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                />
                            </label>

                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'जन्म तिथि' : 'Date of Birth'}
                                <input
                                    type="date"
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    value={dob}
                                    onChange={e => setDob(e.target.value)}
                                />
                            </label>

                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'लिंग' : 'Gender / Sex'}
                                <select
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    value={sex}
                                    onChange={e => setSex(e.target.value)}
                                >
                                    <option value="">{hindi ? 'चुनें…' : 'Select…'}</option>
                                    <option value="MALE">{hindi ? 'पुरुष' : 'Male'}</option>
                                    <option value="FEMALE">{hindi ? 'महिला' : 'Female'}</option>
                                    <option value="OTHER">{hindi ? 'अन्य' : 'Other'}</option>
                                </select>
                            </label>

                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'पसंदीदा भाषा' : 'Preferred Language'}
                                <select
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    value={preferredLanguage}
                                    onChange={e => setPreferredLanguage(e.target.value)}
                                >
                                    <option value="English">English</option>
                                    <option value="Hindi">हिंदी (Hindi)</option>
                                </select>
                            </label>

                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'शहर / ज़िला' : 'City / District'}
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="e.g. Pune"
                                    value={city}
                                    onChange={e => setCity(e.target.value)}
                                />
                            </label>

                            <label className="block text-xs font-semibold text-muted-foreground">
                                {hindi ? 'राज्य' : 'State'}
                                <input
                                    type="text"
                                    className="mt-1 w-full rounded-xl border border-border bg-background p-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    placeholder="e.g. Maharashtra"
                                    value={state}
                                    onChange={e => setState(e.target.value)}
                                />
                            </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button type="submit" disabled={saving}>
                                {saving ? (hindi ? 'सुरक्षित हो रहा है…' : 'Saving…') : (hindi ? 'सुरक्षित करें' : 'Save Details')}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                                {hindi ? 'रद्द करें' : 'Cancel'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2">
                        <Field
                            label={hindi ? 'फ़ोन नंबर' : 'Phone'}
                            value={data?.phone || (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                        />
                        <Field
                            label={hindi ? 'जन्म तिथि' : 'Date of Birth'}
                            value={data?.date_of_birth || (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                        />
                        <Field
                            label={hindi ? 'लिंग' : 'Gender / Sex'}
                            value={data?.sex || (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                        />
                        <Field
                            label={hindi ? 'पसंदीदा भाषा' : 'Preferred Language'}
                            value={data?.preferred_language || 'English'}
                        />
                        <Field
                            label={hindi ? 'शहर' : 'City'}
                            value={data?.city || (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                        />
                        <Field
                            label={hindi ? 'राज्य' : 'State'}
                            value={data?.state || (hindi ? 'दर्ज नहीं' : 'Not recorded')}
                        />
                    </div>
                )}
            </Card>

            {/* Medical Profile & Clinical History Card */}
            <Card className="space-y-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                        <HeartPulse className="size-5 text-primary" />
                        {hindi ? 'चिकित्सा प्रोफ़ाइल और नैदानिक इतिहास' : 'Medical Profile & Clinical History'}
                    </h2>
                    <Badge tone="teal">
                        {hindi ? 'दर्ज देखभाल' : 'Recorded care'}
                    </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-border bg-surface-subtle p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{clinicalData.encountersCount}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hindi ? 'परामर्श विज़िट' : 'Clinical Encounters'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{clinicalData.prescriptionsCount}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hindi ? 'दवा पर्चियाँ' : 'Prescriptions'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{clinicalData.diagnosticsCount}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hindi ? 'जाँच आदेश' : 'Diagnostic Orders'}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-subtle p-3 text-center">
                        <p className="text-2xl font-bold text-foreground">{clinicalData.recordsCount}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{hindi ? 'अपलोड किए गए दस्तावेज़' : 'Health Documents'}</p>
                    </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2 pt-2 border-t border-border">
                    {/* No canonical reconciled medical profile exists in the current schema. */}
                    <Field label={hindi ? 'रक्त समूह' : 'Blood Group'} value={hindi ? 'दर्ज नहीं' : 'Not recorded'} />
                    <Field label={hindi ? 'आपातकालीन संपर्क' : 'Emergency Contact'} value={hindi ? 'दर्ज नहीं' : 'Not recorded'} />
                    <Field label={hindi ? 'एलर्जी की जानकारी' : 'Allergy information'} value={hindi ? 'कोई संरचित एलर्जी जानकारी दर्ज नहीं है' : 'No structured allergy information recorded'} />
                    <Field label={hindi ? 'दीर्घकालिक स्थितियाँ' : 'Chronic Conditions'} value={hindi ? 'कोई संरचित दीर्घकालिक स्थिति रिकॉर्ड उपलब्ध नहीं है' : 'No structured chronic-condition record available'} />
                    <Field
                        label={hindi ? 'वर्तमान सक्रिय दवाइयाँ' : 'Active / Current Medicines'}
                        value={
                            clinicalData.activeMedicines.length > 0 ? (
                                <div className="space-y-1">
                                    {clinicalData.activeMedicines.map((m, i) => (
                                        <div key={i} className="text-xs font-medium text-foreground">
                                            • {m.name}{m.dose ? ` — ${m.dose}` : ''}{m.frequency ? ` (${m.frequency})` : ''}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    {hindi ? 'कोई सक्रिय दवा दर्ज नहीं' : 'No active medicines recorded'}
                                </span>
                            )
                        }
                    />
                    <Field
                        label={hindi ? 'महत्वपूर्ण नैदानिक अलर्ट' : 'Clinical Alerts & Care Gaps'}
                        value={
                            clinicalData.clinicalAlerts.length > 0 ? (
                                <div className="space-y-1.5">
                                    {clinicalData.clinicalAlerts.map((a, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <Badge tone={a.severity === 'CRITICAL' ? 'danger' : a.severity === 'HIGH' ? 'warning' : 'neutral'}>
                                                {a.severity}
                                            </Badge>
                                            <span className="text-xs font-medium text-foreground">{a.gap}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    {hindi ? 'कोई सक्रिय अलर्ट नहीं' : 'No active clinical alerts'}
                                </span>
                            )
                        }
                    />
                </div>

                {/* Latest Care Context */}
                <div className="pt-2 border-t border-border space-y-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {hindi ? 'नवीनतम देखभाल संदर्भ' : 'Latest Relevant Care Context'}
                    </h3>
                    {clinicalData.latestCareContext ? (
                        <div className="rounded-xl border border-border bg-surface-subtle p-3.5 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span className="font-semibold text-foreground">
                                    {new Date(clinicalData.latestCareContext.startedAt).toLocaleDateString([], { dateStyle: 'medium' })}
                                </span>
                                <Badge tone="outline">{clinicalData.latestCareContext.status}</Badge>
                            </div>
                            {clinicalData.latestCareContext.chiefComplaint && (
                                <p className="text-muted-foreground">
                                    <strong className="text-foreground">{hindi ? 'मुख्य शिकायत: ' : 'Chief Complaint: '}</strong>
                                    {clinicalData.latestCareContext.chiefComplaint}
                                </p>
                            )}
                            {clinicalData.latestCareContext.diagnosis && (
                                <p className="text-muted-foreground">
                                    <strong className="text-foreground">{hindi ? 'निदान: ' : 'Diagnosis: '}</strong>
                                    {clinicalData.latestCareContext.diagnosis}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground italic">
                            {hindi ? 'कोई पिछला परामर्श दर्ज नहीं है।' : 'No prior care encounters recorded.'}
                        </p>
                    )}
                </div>

                {/* Quick Access Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="outline" onClick={() => navigate('/prescriptions')}>
                        <Pill className="mr-1.5 size-3.5" />
                        {hindi ? 'दवाइयाँ देखें' : 'View Prescriptions'} ({clinicalData.prescriptionsCount})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/records')}>
                        <FileText className="mr-1.5 size-3.5" />
                        {hindi ? 'मेडिकल रिकॉर्ड्स' : 'Health Records'} ({clinicalData.recordsCount})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/diagnostics')}>
                        <Activity className="mr-1.5 size-3.5" />
                        {hindi ? 'जाँच रिपोर्ट' : 'Diagnostic Reports'} ({clinicalData.diagnosticsCount})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/appointments')}>
                        <CalendarDays className="mr-1.5 size-3.5" />
                        {hindi ? 'परामर्श इतिहास' : 'Appointments'} ({clinicalData.encountersCount})
                    </Button>
                </div>
            </Card>
        </div>
    )
}

/* ============================================================
   PATIENT / OTHER PROVIDERS
============================================================ */

function GeneralProfile({
    profile,
    data
}: {
    profile: any
    data: any
}) {
    const { language } = useLanguage()

    const hindi =
        language === 'Hindi'

    function listenProfile() {
        if (profile.role === 'PATIENT') {
            speakText(
                hindi
                    ? `यह आपकी प्रोफ़ाइल है।
             आपका नाम ${data?.full_name ?? profile?.full_name ?? ''} है।
             आपका रोगी नंबर ${data?.patient_code ?? 'दर्ज नहीं है'} है।
             आपकी ABHA स्थिति ${data?.abha_link_status ?? 'जुड़ी नहीं है'} है।`
                    : `This is your profile.
             Your name is ${data?.full_name ?? profile?.full_name ?? ''}.
             Your patient ID is ${data?.patient_code ?? 'not available'}.
             Your ABHA status is ${data?.abha_link_status ?? 'not linked'}.`,
                hindi ? 'Hindi' : 'English'
            )
        }
    }

    return (
        <div className="space-y-6">
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold md:text-3xl">
                        {hindi
                            ? 'मेरी जानकारी'
                            : 'Profile'}
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {hindi
                            ? 'आपके खाते और पहचान की जानकारी।'
                            : 'Your account and identity information.'}
                    </p>
                </div>

                {profile.role === 'PATIENT' && (
                    <button
                        type="button"
                        onClick={listenProfile}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                    >
                        <Volume2 className="size-4" />

                        {hindi
                            ? 'यह पेज सुनें'
                            : 'Listen to this page'}
                    </button>
                )}
            </section>

            <Card>
                <div className="grid gap-5 md:grid-cols-2">
                    <Field
                        label={
                            hindi
                                ? 'खाते का प्रकार'
                                : 'Role'
                        }
                        value={profile?.role ?? '—'}
                    />

                    <Field
                        label={
                            hindi
                                ? 'नाम'
                                : 'Name'
                        }
                        value={
                            data?.full_name ??
                            profile?.full_name ??
                            (hindi
                                ? 'दर्ज नहीं'
                                : 'Not supplied')
                        }
                    />

                    {profile.role === 'PATIENT' ? (
                        <>
                            <Field
                                label={
                                    hindi
                                        ? 'रोगी नंबर'
                                        : 'Patient code'
                                }
                                value={
                                    data?.patient_code ?? '—'
                                }
                            />

                            <Field
                                label="ABHA"
                                value={
                                    <Badge
                                        tone={
                                            data?.abha_link_status ===
                                                'VERIFIED'
                                                ? 'success'
                                                : 'outline'
                                        }
                                    >
                                        {data?.abha_link_status ??
                                            'NOT_LINKED'}
                                    </Badge>
                                }
                            />
                        </>
                    ) : (
                        <>
                            <Field
                                label="Provider type"
                                value={
                                    data?.provider_type ?? '—'
                                }
                            />

                            <Field
                                label="Verification"
                                value={
                                    <Badge
                                        tone={
                                            data?.verification_status ===
                                                'APPROVED'
                                                ? 'success'
                                                : 'warning'
                                        }
                                    >
                                        {data?.verification_status ??
                                            'PENDING'}
                                    </Badge>
                                }
                            />
                        </>
                    )}
                </div>
            </Card>
        </div>
    )
}

/* ============================================================
   DOCTOR PROFILE
============================================================ */

function DoctorProfile({
    profile,
    provider
}: {
    profile: any
    provider: any
}) {
    const { language } = useLanguage()

    const hindi =
        language === 'Hindi'

    const [practices, setPractices] =
        useState<Practice[]>([])

    const [schedules, setSchedules] =
        useState<Schedule[]>([])

    const [selectedPracticeId, setSelectedPracticeId] =
        useState('')

    const [practiceName, setPracticeName] =
        useState('')

    const [address, setAddress] =
        useState('')

    const [city, setCity] =
        useState('')

    const [state, setState] =
        useState('')

    const [postalCode, setPostalCode] =
        useState('')

    const [phone, setPhone] =
        useState('')

    const [consultationMode, setConsultationMode] =
        useState('PHYSICAL')

    const [selectedDays, setSelectedDays] =
        useState<number[]>([])

    const [startTime, setStartTime] =
        useState('09:00')

    const [endTime, setEndTime] =
        useState('13:00')

    const [slotMinutes, setSlotMinutes] =
        useState(30)

    const [savingPractice, setSavingPractice] =
        useState(false)

    const [savingSchedule, setSavingSchedule] =
        useState(false)

    const [message, setMessage] =
        useState('')

    const [errorMessage, setErrorMessage] =
        useState('')

    useEffect(() => {
        if (provider?.id) {
            loadPracticeData()
        }
    }, [provider?.id])

    async function loadPracticeData() {
        const [
            practicesResult,
            schedulesResult
        ] = await Promise.all([
            supabase
                .from('provider_practices')
                .select('*')
                .eq('provider_id', provider.id)
                .order('created_at', {
                    ascending: true
                }),

            supabase
                .from('provider_schedules')
                .select('*')
                .eq('provider_id', provider.id)
                .eq('active', true)
        ])

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

        setPractices(
            (practicesResult.data ?? []) as Practice[]
        )

        setSchedules(
            (schedulesResult.data ?? []) as Schedule[]
        )

        if (
            !selectedPracticeId &&
            practicesResult.data?.length
        ) {
            setSelectedPracticeId(
                practicesResult.data[0].id
            )
        }
    }

    function clearMessages() {
        setMessage('')
        setErrorMessage('')
    }

    async function addPractice() {
        clearMessages()

        if (
            !practiceName.trim() ||
            !city.trim() ||
            !state.trim()
        ) {
            setErrorMessage(
                hindi
                    ? 'क्लिनिक या अस्पताल का नाम, शहर और राज्य भरें।'
                    : 'Practice name, city and state are required.'
            )

            return
        }

        setSavingPractice(true)

        const {
            data: newPractice,
            error
        } = await supabase
            .from('provider_practices')
            .insert({
                provider_id: provider.id,

                practice_name:
                    practiceName.trim(),

                address_line:
                    address.trim() || null,

                city:
                    city.trim(),

                state:
                    state.trim(),

                postal_code:
                    postalCode.trim() || null,

                phone:
                    phone.trim() || null,

                consultation_mode:
                    consultationMode,

                active: true
            })
            .select()
            .single()

        if (error) {
            console.error(
                'Practice save error:',
                error
            )

            setErrorMessage(
                error.message
            )

            setSavingPractice(false)
            return
        }

        setPracticeName('')
        setAddress('')
        setCity('')
        setState('')
        setPostalCode('')
        setPhone('')
        setConsultationMode('PHYSICAL')

        if (newPractice) {
            setSelectedPracticeId(
                newPractice.id
            )
        }

        setMessage(
            hindi
                ? 'मिलने की जगह सेव हो गई। अब नीचे समय जोड़ें।'
                : 'Practice location saved. Now add its schedule below.'
        )

        await loadPracticeData()

        setSavingPractice(false)
    }

    function toggleDay(
        day: number
    ) {
        setSelectedDays(
            current =>
                current.includes(day)
                    ? current.filter(
                        item =>
                            item !== day
                    )
                    : [
                        ...current,
                        day
                    ]
        )
    }

    async function saveSchedule() {
        clearMessages()

        if (!selectedPracticeId) {
            setErrorMessage(
                hindi
                    ? 'पहले क्लिनिक या अस्पताल चुनें।'
                    : 'Select a practice first.'
            )

            return
        }

        if (
            selectedDays.length === 0
        ) {
            setErrorMessage(
                hindi
                    ? 'कम से कम एक दिन चुनें।'
                    : 'Select at least one working day.'
            )

            return
        }

        if (
            !startTime ||
            !endTime ||
            startTime >= endTime
        ) {
            setErrorMessage(
                hindi
                    ? 'शुरू और खत्म होने का सही समय चुनें।'
                    : 'Choose a valid start and end time.'
            )

            return
        }

        setSavingSchedule(true)

        /*
          For this practice/day we replace the doctor's
          previous active schedule with the new one.
        */
        const {
            error: deleteError
        } = await supabase
            .from('provider_schedules')
            .delete()
            .eq(
                'provider_id',
                provider.id
            )
            .eq(
                'practice_id',
                selectedPracticeId
            )
            .in(
                'day_of_week',
                selectedDays
            )

        if (deleteError) {
            console.error(
                'Old schedule remove error:',
                deleteError
            )

            setErrorMessage(
                deleteError.message
            )

            setSavingSchedule(false)
            return
        }

        const scheduleRows =
            selectedDays.map(
                day => ({
                    provider_id:
                        provider.id,

                    practice_id:
                        selectedPracticeId,

                    day_of_week:
                        day,

                    start_time:
                        startTime,

                    end_time:
                        endTime,

                    slot_minutes:
                        slotMinutes,

                    active:
                        true
                })
            )

        const {
            error
        } = await supabase
            .from('provider_schedules')
            .insert(scheduleRows)

        if (error) {
            console.error(
                'Schedule save error:',
                error
            )

            setErrorMessage(
                error.message
            )

            setSavingSchedule(false)
            return
        }

        setMessage(
            hindi
                ? 'डॉक्टर से मिलने का समय सेव हो गया।'
                : 'Availability schedule saved.'
        )

        await loadPracticeData()

        setSavingSchedule(false)
    }

    async function removePractice(
        practiceId: string
    ) {
        clearMessages()

        const confirmed =
            window.confirm(
                hindi
                    ? 'क्या आप यह मिलने की जगह हटाना चाहते हैं?'
                    : 'Remove this practice location?'
            )

        if (!confirmed) return

        const {
            error
        } = await supabase
            .from('provider_practices')
            .delete()
            .eq('id', practiceId)
            .eq(
                'provider_id',
                provider.id
            )

        if (error) {
            setErrorMessage(
                error.message
            )

            return
        }

        if (
            selectedPracticeId ===
            practiceId
        ) {
            setSelectedPracticeId('')
        }

        await loadPracticeData()
    }

    function listenPage() {
        const scheduleCount =
            schedules.length

        if (hindi) {
            speakText(
                `यह आपकी डॉक्टर प्रोफ़ाइल है।
        आपका नाम ${provider.full_name ?? profile.full_name ?? ''} है।
        आपकी सत्यापन स्थिति ${provider.verification_status ?? 'पेंडिंग'} है।
        आपने ${practices.length} मिलने की जगह जोड़ी हैं।
        आपके ${scheduleCount} दिन और समय दर्ज हैं।
        नई जगह जोड़ने के लिए क्लिनिक या अस्पताल का नाम, पता और शहर भरें।
        फिर नीचे मरीजों से मिलने के दिन और समय चुनें।`,
                'Hindi'
            )

            return
        }

        speakText(
            `This is your doctor profile.
      Your verification status is ${provider.verification_status ?? 'pending'}.
      You have ${practices.length} practice locations and ${scheduleCount} active schedule entries.
      Add a clinic or hospital location, then configure the days and times when patients can book you.`,
            'English'
        )
    }

    return (
        <div className="space-y-6">
            <PracticeTerms providerId={provider.id}/>

            {/* HEADER */}
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-primary">
                        {hindi
                            ? 'डॉक्टर प्रोफ़ाइल'
                            : 'Doctor profile'}
                    </p>

                    <h1 className="mt-1 text-2xl font-bold md:text-3xl">
                        {provider.full_name ??
                            profile.full_name}
                    </h1>

                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        {hindi
                            ? 'अपनी पहचान, मिलने की जगह और मरीजों से मिलने का समय देखें।'
                            : 'Manage your identity, practice locations and patient availability.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={listenPage}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:bg-secondary"
                >
                    <Volume2 className="size-4" />

                    {hindi
                        ? 'यह पेज सुनें'
                        : 'Listen to this page'}
                </button>
            </section>

            {/* DOCTOR IDENTITY */}
            <Card>
                <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                        <Stethoscope className="size-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="grid gap-5 md:grid-cols-2">
                            <Field
                                label={
                                    hindi
                                        ? 'नाम'
                                        : 'Name'
                                }
                                value={
                                    provider.full_name ??
                                    profile.full_name ??
                                    '—'
                                }
                            />

                            <Field
                                label={
                                    hindi
                                        ? 'डॉक्टर की किस्म'
                                        : 'Specialization'
                                }
                                value={
                                    provider.specialization ??
                                    '—'
                                }
                            />

                            <Field
                                label="HPR ID"
                                value={
                                    provider.hpr_id ??
                                    '—'
                                }
                            />

                            <Field
                                label={
                                    hindi
                                        ? 'सत्यापन'
                                        : 'Verification'
                                }
                                value={
                                    <Badge
                                        tone={
                                            provider.verification_status ===
                                                'APPROVED'
                                                ? 'success'
                                                : 'warning'
                                        }
                                    >
                                        {provider.verification_status ??
                                            'PENDING'}
                                    </Badge>
                                }
                            />
                        </div>
                    </div>
                </div>

                {provider.verification_status !==
                    'APPROVED' && (
                        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            {hindi
                                ? 'आप अपनी मिलने की जगह और समय तैयार कर सकते हैं, लेकिन मरीजों को आपकी प्रोफ़ाइल सत्यापन मंजूर होने के बाद ही दिखाई देगी।'
                                : 'You can prepare your practice and schedule now, but patients will only see you after verification is approved.'}
                        </div>
                    )}
            </Card>

            {/* EXISTING PRACTICES */}
            <section>
                <h2 className="text-lg font-semibold">
                    {hindi
                        ? 'मैं कहाँ मरीज देखता हूँ'
                        : 'My practice locations'}
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                    {hindi
                        ? 'यह डॉक्टर की लाइव जगह नहीं है। यहाँ क्लिनिक या अस्पताल की तय जगह दिखाई जाती है।'
                        : 'These are fixed clinic or hospital locations, not the doctor’s live GPS location.'}
                </p>

                {practices.length === 0 ? (
                    <Card className="mt-4">
                        <EmptyState
                            text={
                                hindi
                                    ? 'अभी कोई क्लिनिक या अस्पताल नहीं जोड़ा गया है।'
                                    : 'No practice location has been added yet.'
                            }
                        />
                    </Card>
                ) : (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {practices.map(
                            practice => {
                                const practiceSchedules =
                                    schedules.filter(
                                        schedule =>
                                            schedule.practice_id ===
                                            practice.id
                                    )

                                return (
                                    <Card key={practice.id}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                                                    <Building2 className="size-5" />
                                                </div>

                                                <div>
                                                    <p className="font-semibold">
                                                        {practice.practice_name}
                                                    </p>

                                                    <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                                                        <MapPin className="mt-0.5 size-3.5 shrink-0" />

                                                        <span>
                                                            {[
                                                                practice.address_line,
                                                                practice.city,
                                                                practice.state,
                                                                practice.postal_code
                                                            ]
                                                                .filter(Boolean)
                                                                .join(', ') || '—'}
                                                        </span>
                                                    </div>

                                                    <p className="mt-3 text-xs font-medium">
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

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removePractice(
                                                        practice.id
                                                    )
                                                }
                                                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                                            >
                                                <Trash2 className="size-4" />
                                            </button>
                                        </div>

                                        {practiceSchedules.length >
                                            0 ? (
                                            <div className="mt-4 border-t border-border pt-4">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                    {hindi
                                                        ? 'मरीज कब समय ले सकते हैं'
                                                        : 'Booking hours'}
                                                </p>

                                                <div className="mt-3 space-y-2">
                                                    {practiceSchedules
                                                        .sort(
                                                            (a, b) =>
                                                                a.day_of_week -
                                                                b.day_of_week
                                                        )
                                                        .map(schedule => (
                                                            <div
                                                                key={schedule.id}
                                                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                                            >
                                                                <span>
                                                                    {getDayName(
                                                                        schedule.day_of_week,
                                                                        hindi
                                                                    )}
                                                                </span>

                                                                <span className="text-muted-foreground">
                                                                    {formatTime(
                                                                        schedule.start_time
                                                                    )}
                                                                    {' – '}
                                                                    {formatTime(
                                                                        schedule.end_time
                                                                    )}
                                                                    {' · '}
                                                                    {schedule.slot_minutes}{' '}
                                                                    {hindi
                                                                        ? 'मिनट'
                                                                        : 'min'}
                                                                </span>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="mt-4 border-t border-border pt-4 text-xs text-amber-700">
                                                {hindi
                                                    ? 'इस जगह के लिए अभी मिलने का समय नहीं जोड़ा गया है।'
                                                    : 'No booking schedule has been added for this location.'}
                                            </p>
                                        )}
                                    </Card>
                                )
                            }
                        )}
                    </div>
                )}
            </section>

            {/* ADD PRACTICE */}
            <Card>
                <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                        <Plus className="size-5" />
                    </div>

                    <div>
                        <h2 className="font-semibold">
                            {hindi
                                ? 'नई मिलने की जगह जोड़ें'
                                : 'Add practice location'}
                        </h2>

                        <p className="mt-1 text-xs text-muted-foreground">
                            {hindi
                                ? 'क्लिनिक, अस्पताल या अपनी तय प्रैक्टिस की जगह जोड़ें।'
                                : 'Add a clinic, hospital or fixed practice location.'}
                        </p>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <InputField
                        label={
                            hindi
                                ? 'क्लिनिक / अस्पताल का नाम *'
                                : 'Clinic / hospital name *'
                        }
                        value={practiceName}
                        onChange={setPracticeName}
                        placeholder={
                            hindi
                                ? 'जैसे City Care Clinic'
                                : 'e.g. City Care Clinic'
                        }
                    />

                    <InputField
                        label={
                            hindi
                                ? 'फोन नंबर'
                                : 'Practice phone'
                        }
                        value={phone}
                        onChange={setPhone}
                        placeholder="9876543210"
                    />

                    <div className="md:col-span-2">
                        <InputField
                            label={
                                hindi
                                    ? 'पूरा पता'
                                    : 'Address'
                            }
                            value={address}
                            onChange={setAddress}
                            placeholder={
                                hindi
                                    ? 'सड़क, इलाका, बिल्डिंग'
                                    : 'Street, locality, building'
                            }
                        />
                    </div>

                    <InputField
                        label={
                            hindi
                                ? 'शहर *'
                                : 'City *'
                        }
                        value={city}
                        onChange={setCity}
                        placeholder="Delhi"
                    />

                    <InputField
                        label={
                            hindi
                                ? 'राज्य *'
                                : 'State *'
                        }
                        value={state}
                        onChange={setState}
                        placeholder="Delhi"
                    />

                    <InputField
                        label={
                            hindi
                                ? 'पिन कोड'
                                : 'PIN code'
                        }
                        value={postalCode}
                        onChange={setPostalCode}
                        placeholder="110001"
                    />

                    <div>
                        <label className="text-sm font-semibold">
                            {hindi
                                ? 'मरीज से कैसे मिलेंगे?'
                                : 'Consultation mode'}
                        </label>

                        <select
                            value={consultationMode}
                            onChange={event =>
                                setConsultationMode(
                                    event.target.value
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                        >
                            <option value="PHYSICAL">
                                {hindi
                                    ? 'क्लिनिक पर'
                                    : 'Physical'}
                            </option>

                            <option value="TELECONSULT">
                                {hindi
                                    ? 'वीडियो पर'
                                    : 'Teleconsultation'}
                            </option>

                            <option value="BOTH">
                                {hindi
                                    ? 'दोनों'
                                    : 'Both'}
                            </option>
                        </select>
                    </div>
                </div>

                <Button
                    className="mt-5"
                    onClick={addPractice}
                    disabled={savingPractice}
                >
                    <Save className="mr-2 size-4" />

                    {savingPractice
                        ? hindi
                            ? 'सेव हो रहा है...'
                            : 'Saving...'
                        : hindi
                            ? 'मिलने की जगह सेव करें'
                            : 'Save practice location'}
                </Button>
            </Card>

            {/* SCHEDULE */}
            <Card>
                <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                        <CalendarDays className="size-5" />
                    </div>

                    <div>
                        <h2 className="font-semibold">
                            {hindi
                                ? 'मरीज कब समय ले सकते हैं?'
                                : 'Set booking hours'}
                        </h2>

                        <p className="mt-1 text-xs text-muted-foreground">
                            {hindi
                                ? 'जगह, दिन और समय चुनें। इन्हीं समयों से मरीज को खाली स्लॉट दिखेंगे।'
                                : 'Choose a location, working days and hours. Patient booking slots are generated from this schedule.'}
                        </p>
                    </div>
                </div>

                {practices.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                        {hindi
                            ? 'पहले ऊपर एक क्लिनिक या अस्पताल जोड़ें।'
                            : 'Add a practice location above first.'}
                    </div>
                ) : (
                    <>
                        <div className="mt-6">
                            <label className="text-sm font-semibold">
                                {hindi
                                    ? 'क्लिनिक / अस्पताल'
                                    : 'Practice location'}
                            </label>

                            <select
                                value={selectedPracticeId}
                                onChange={event =>
                                    setSelectedPracticeId(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                            >
                                <option value="">
                                    {hindi
                                        ? 'जगह चुनें'
                                        : 'Select location'}
                                </option>

                                {practices.map(
                                    practice => (
                                        <option
                                            key={practice.id}
                                            value={practice.id}
                                        >
                                            {practice.practice_name}
                                            {practice.city
                                                ? ` — ${practice.city}`
                                                : ''}
                                        </option>
                                    )
                                )}
                            </select>
                        </div>

                        <div className="mt-6">
                            <label className="text-sm font-semibold">
                                {hindi
                                    ? 'कौन से दिन मरीज देखेंगे?'
                                    : 'Working days'}
                            </label>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {DAYS.map(day => {
                                    const selected =
                                        selectedDays.includes(
                                            day.value
                                        )

                                    return (
                                        <button
                                            type="button"
                                            key={day.value}
                                            onClick={() =>
                                                toggleDay(day.value)
                                            }
                                            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${selected
                                                    ? 'border-primary bg-secondary text-primary'
                                                    : 'border-border hover:bg-secondary/50'
                                                }`}
                                        >
                                            {hindi
                                                ? day.hi
                                                : day.en}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            <div>
                                <label className="text-sm font-semibold">
                                    {hindi
                                        ? 'शुरू होने का समय'
                                        : 'Start time'}
                                </label>

                                <div className="relative mt-2">
                                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                                    <input
                                        type="time"
                                        value={startTime}
                                        onChange={event =>
                                            setStartTime(
                                                event.target.value
                                            )
                                        }
                                        className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-semibold">
                                    {hindi
                                        ? 'खत्म होने का समय'
                                        : 'End time'}
                                </label>

                                <div className="relative mt-2">
                                    <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                                    <input
                                        type="time"
                                        value={endTime}
                                        onChange={event =>
                                            setEndTime(
                                                event.target.value
                                            )
                                        }
                                        className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-semibold">
                                    {hindi
                                        ? 'एक मरीज का समय'
                                        : 'Slot duration'}
                                </label>

                                <select
                                    value={slotMinutes}
                                    onChange={event =>
                                        setSlotMinutes(
                                            Number(
                                                event.target.value
                                            )
                                        )
                                    }
                                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                                >
                                    <option value={10}>
                                        10 {hindi ? 'मिनट' : 'minutes'}
                                    </option>

                                    <option value={15}>
                                        15 {hindi ? 'मिनट' : 'minutes'}
                                    </option>

                                    <option value={20}>
                                        20 {hindi ? 'मिनट' : 'minutes'}
                                    </option>

                                    <option value={30}>
                                        30 {hindi ? 'मिनट' : 'minutes'}
                                    </option>

                                    <option value={45}>
                                        45 {hindi ? 'मिनट' : 'minutes'}
                                    </option>

                                    <option value={60}>
                                        60 {hindi ? 'मिनट' : 'minutes'}
                                    </option>
                                </select>
                            </div>
                        </div>

                        <Button
                            className="mt-6"
                            onClick={saveSchedule}
                            disabled={savingSchedule}
                        >
                            <Save className="mr-2 size-4" />

                            {savingSchedule
                                ? hindi
                                    ? 'समय सेव हो रहा है...'
                                    : 'Saving schedule...'
                                : hindi
                                    ? 'मिलने का समय सेव करें'
                                    : 'Save booking hours'}
                        </Button>
                    </>
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
            </Card>
        </div>
    )
}

/* ============================================================
   HELPERS
============================================================ */

function InputField({
    label,
    value,
    onChange,
    placeholder
}: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
}) {
    return (
        <div>
            <label className="text-sm font-semibold">
                {label}
            </label>

            <input
                value={value}
                onChange={event =>
                    onChange(event.target.value)
                }
                placeholder={placeholder}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
        </div>
    )
}

function getDayName(
    day: number,
    hindi: boolean
) {
    const item =
        DAYS.find(
            current =>
                current.value === day
        )

    if (!item) return '—'

    return hindi
        ? item.hi
        : item.en
}

function formatTime(
    value: string
) {
    if (!value) return '—'

    const parts =
        value.split(':')

    const hour =
        Number(parts[0])

    const minute =
        Number(parts[1])

    const date =
        new Date()

    date.setHours(
        hour,
        minute,
        0,
        0
    )

    return date.toLocaleTimeString(
        'en-IN',
        {
            hour: 'numeric',
            minute: '2-digit'
        }
    )
}