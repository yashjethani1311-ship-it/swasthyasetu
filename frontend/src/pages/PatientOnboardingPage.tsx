import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Button, Card } from '@/components/kit'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { navigate } from '@/lib/route'

type PatientOnboardingPageProps = {
  onComplete: () => Promise<void>
}

export function PatientOnboardingPage({
  onComplete
}: PatientOnboardingPageProps) {
  const {
    session,
    refreshProfile,
    signOut
  } = useAuth()

  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    sex: '',
    phone: '',
    city: '',
    state: '',
    preferred_language: 'English'
  })

  const [error, setError] = useState('')
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

  const save = async () => {
    if (!session?.user) {
      setError('Your session is no longer available. Please sign in again.')
      return
    }

    if (!form.full_name.trim()) {
      setError('Full name is required.')
      return
    }

    setBusy(true)
    setError('')

    const { error: createError } = await supabase.rpc(
      'create_patient_profile',
      {
        p_full_name: form.full_name.trim(),
        p_date_of_birth: form.date_of_birth || null,
        p_sex: form.sex || null,
        p_phone: form.phone.trim() || null,
        p_city: form.city.trim() || null,
        p_state: form.state.trim() || null,
        p_preferred_language:
          form.preferred_language.trim() || null
      }
    )

    if (createError) {
      setError(createError.message)
      setBusy(false)
      return
    }

    await refreshProfile()
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
          <h1 className="text-2xl font-bold">
            Create patient profile
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            This starts empty. No medical history, medicines,
            insurance, reports or diagnoses are created automatically.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">

            <Input
              label="Full name"
              value={form.full_name}
              onChange={value =>
                set('full_name', value)
              }
            />

            <Input
              label="Date of birth"
              type="date"
              value={form.date_of_birth}
              onChange={value =>
                set('date_of_birth', value)
              }
            />

            <Select
              label="Sex"
              value={form.sex}
              onChange={value =>
                set('sex', value)
              }
              options={[
                '',
                'Male',
                'Female',
                'Other',
                'Prefer not to say'
              ]}
            />

            <Input
              label="Phone (optional)"
              value={form.phone}
              onChange={value =>
                set('phone', value)
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

            <Input
              label="Preferred language"
              value={form.preferred_language}
              onChange={value =>
                set('preferred_language', value)
              }
            />

          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            className="mt-6"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy
              ? 'Creating profile...'
              : 'Create profile'}
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
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label>
      <span className="label-xs">
        {label}
      </span>

      <input
        type={type}
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
      />
    </label>
  )
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <label>
      <span className="label-xs">
        {label}
      </span>

      <select
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2"
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
      >
        {options.map(option => (
          <option
            key={option}
            value={option}
          >
            {option || 'Select'}
          </option>
        ))}
      </select>
    </label>
  )
}