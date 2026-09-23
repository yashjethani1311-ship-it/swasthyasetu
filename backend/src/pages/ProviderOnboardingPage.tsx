import { useState } from 'react'
import { ArrowLeft, MapPin, Stethoscope } from 'lucide-react'

import { Button, Card } from '@/components/kit'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'

type ProviderOnboardingProps = {
    onComplete: () => Promise<void>
}

type ProviderRole =
    | 'DOCTOR'
    | 'LAB'
    | 'PHARMACY'
    | 'WORKER'
    | 'FACILITY'

export function ProviderOnboardingPage({
    onComplete
}: ProviderOnboardingProps) {
    const {
        session,
        profile,
        signOut
    } = useAuth()

    const role = profile?.role as ProviderRole | undefined

    const [form, setForm] = useState({
        full_name: profile?.full_name ?? '',
        hpr_id: '',
        registration_id: '',
        specialization: '',
        organization_name: '',
        city: '',
        state: ''
    })

    const [latitude, setLatitude] =
        useState<number | null>(null)

    const [longitude, setLongitude] =
        useState<number | null>(null)

    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)

    const set = (
        key: keyof typeof form,
        value: string
    ) => {
        setForm(current => ({
            ...current,
            [key]: value
        }))
    }

    const goBack = async () => {
        await signOut()
        navigate('/')
    }

    const getLocation = () => {
        setMessage('')

        if (!navigator.geolocation) {
            setMessage(
                'Location is not supported by this browser.'
            )
            return
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                setLatitude(position.coords.latitude)
                setLongitude(position.coords.longitude)

                setMessage(
                    'Current location captured successfully.'
                )
            },

            error => {
                setMessage(
                    `Could not capture location: ${error.message}`
                )
            },

            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        )
    }

    const getTitle = () => {
        switch (role) {
            case 'DOCTOR':
                return 'Doctor registration'

            case 'LAB':
                return 'Diagnostic lab registration'

            case 'PHARMACY':
                return 'Pharmacy registration'

            case 'WORKER':
                return 'Health worker registration'

            case 'FACILITY':
                return 'Healthcare facility registration'

            default:
                return 'Healthcare provider registration'
        }
    }

    const getOrganisationLabel = () => {
        switch (role) {
            case 'LAB':
                return 'Lab name'

            case 'PHARMACY':
                return 'Pharmacy name'

            case 'FACILITY':
                return 'Facility name'

            case 'WORKER':
                return 'Organisation / Assigned facility'

            default:
                return 'Hospital / Clinic / Organisation'
        }
    }

    const getRegistrationLabel = () => {
        switch (role) {
            case 'LAB':
                return 'Lab registration / licence number'

            case 'PHARMACY':
                return 'Drug licence number'

            case 'WORKER':
                return 'Worker / Employee ID'

            case 'FACILITY':
                return 'Facility registration number'

            default:
                return 'Professional registration number'
        }
    }

    const submit = async () => {
        if (!session?.user || !profile || !role) {
            setMessage(
                'Your account session is unavailable. Please sign in again.'
            )
            return
        }

        if (!form.full_name.trim()) {
            setMessage('Name is required.')
            return
        }

        if (!form.city.trim() || !form.state.trim()) {
            setMessage('City and state are required.')
            return
        }

        if (
            role === 'DOCTOR' &&
            !form.hpr_id.trim()
        ) {
            setMessage('HPR ID is required for doctor registration.')
            return
        }

        if (
            role !== 'DOCTOR' &&
            !form.organization_name.trim()
        ) {
            setMessage(
                `${getOrganisationLabel()} is required.`
            )
            return
        }

        setBusy(true)
        setMessage('')

        const providerData = {
            user_id: session.user.id,
            provider_type: role,
            full_name: form.full_name.trim(),

            hpr_id:
                role === 'DOCTOR'
                    ? form.hpr_id.trim()
                    : null,

            registration_id:
                form.registration_id.trim() || null,

            specialization:
                role === 'DOCTOR'
                    ? form.specialization.trim() || null
                    : null,

            organization_name:
                form.organization_name.trim() || null,

            city: form.city.trim(),
            state: form.state.trim(),

            latitude,
            longitude,

            verification_status: 'PENDING'
        }

        const { error } = await supabase
            .from('provider_profiles')
            .insert(providerData)

        if (error) {
            if (
                error.code === '23505' ||
                error.message
                    .toLowerCase()
                    .includes('duplicate')
            ) {
                setMessage(
                    'A provider profile already exists for this account or HPR ID.'
                )
            } else {
                setMessage(error.message)
            }

            setBusy(false)
            return
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: form.full_name.trim()
            })
            .eq('id', session.user.id)

        if (profileError) {
            console.error(
                'Could not update profile name:',
                profileError
            )
        }

        await onComplete()

        navigate('/')

        setBusy(false)
    }

    return (
        <div className="min-h-screen bg-surface px-4 py-8">
            <div className="mx-auto max-w-2xl">

                <Button
                    variant="ghost"
                    className="mb-3"
                    onClick={() => void goBack()}
                >
                    <ArrowLeft className="size-4" />

                    Back to access
                </Button>

                <Card>
                    <div className="flex items-start gap-3">

                        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                            <Stethoscope className="size-5" />
                        </div>

                        <div>
                            <h1 className="text-2xl font-bold">
                                {getTitle()}
                            </h1>

                            <p className="mt-1 text-sm text-muted-foreground">
                                Complete your registration details.
                                Access remains locked until verification.
                            </p>
                        </div>

                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">

                        <Input
                            label={
                                role === 'FACILITY'
                                    ? 'Contact person name'
                                    : 'Full name'
                            }
                            value={form.full_name}
                            onChange={value =>
                                set('full_name', value)
                            }
                        />

                        <Input
                            label="Provider type"
                            value={role ?? ''}
                            disabled
                            onChange={() => { }}
                        />

                        {role === 'DOCTOR' && (
                            <>
                                <Input
                                    label="HPR ID"
                                    value={form.hpr_id}
                                    onChange={value =>
                                        set('hpr_id', value)
                                    }
                                />

                                <Input
                                    label="Specialization"
                                    value={form.specialization}
                                    onChange={value =>
                                        set('specialization', value)
                                    }
                                />
                            </>
                        )}

                        <Input
                            label={getRegistrationLabel()}
                            value={form.registration_id}
                            onChange={value =>
                                set('registration_id', value)
                            }
                        />

                        <Input
                            label={getOrganisationLabel()}
                            value={form.organization_name}
                            onChange={value =>
                                set('organization_name', value)
                            }
                        />

                        <Input
                            label="City"
                            value={form.city}
                            onChange={value =>
                                set('city', value)
                            }
                        />

                        <Input
                            label="State"
                            value={form.state}
                            onChange={value =>
                                set('state', value)
                            }
                        />

                    </div>

                    <div className="mt-5">

                        <Button
                            variant="outline"
                            type="button"
                            onClick={getLocation}
                        >
                            <MapPin className="size-4" />

                            Use Current Location
                        </Button>

                        {latitude !== null &&
                            longitude !== null && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Location captured successfully.
                                </p>
                            )}

                    </div>

                    {message && (
                        <p className="mt-4 text-sm text-muted-foreground">
                            {message}
                        </p>
                    )}

                    <Button
                        className="mt-6 w-full"
                        disabled={busy}
                        onClick={() => void submit()}
                    >
                        {busy
                            ? 'Submitting registration...'
                            : 'Submit for verification'}
                    </Button>

                </Card>
            </div>
        </div>
    )
}

function Input({
    label,
    value,
    onChange,
    disabled = false
}: {
    label: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}) {
    return (
        <label>
            <span className="label-xs">
                {label}
            </span>

            <input
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                value={value}
                disabled={disabled}
                onChange={event =>
                    onChange(event.target.value)
                }
            />
        </label>
    )
}