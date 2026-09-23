import { useState } from 'react'
import {
  FlaskConical,
  HeartPulse,
  Hospital,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound
} from 'lucide-react'

import { Button, Card } from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { navigate } from '@/lib/route'

type Role =
  | 'PATIENT'
  | 'DOCTOR'
  | 'FACILITY'
  | 'LAB'
  | 'PHARMACY'
  | 'WORKER'

type RegisterMode = 'choose' | 'official' | 'demo'

const abhaEnabled =
  import.meta.env.VITE_ABHA_INTEGRATION_ENABLED === 'true'

export function AccessPage() {
  const [tab, setTab] =
    useState<'login' | 'register'>('login')

  return (
    <div className="min-h-screen bg-surface px-4 py-8 md:py-12">
      <div className="mx-auto max-w-6xl">

        <header className="flex flex-col items-center text-center">

          <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <HeartPulse className="size-7" />
          </div>

          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            SwasthyaSetu
          </h1>

          <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
            One patient. One connected care journey.
            From access to recovery.
          </p>

        </header>

        {/* LOGIN / REGISTER */}

        <div className="mx-auto mt-8 flex max-w-xl rounded-xl border border-border bg-card p-1 shadow-sm">

          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === 'login'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground'
              }`}
          >
            Sign in
          </button>

          <button
            type="button"
            onClick={() => setTab('register')}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === 'register'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground'
              }`}
          >
            Register
          </button>

        </div>

        {tab === 'login'
          ? <Login />
          : <Register />}

      </div>
    </div>
  )
}

/* ============================================================
   LOGIN
   ============================================================ */

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signIn() {
    setError('')

    if (!email.trim() || !password) {
      setError('Enter email and password.')
      return
    }

    setBusy(true)

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

    if (signInError) {
      setError(signInError.message)
      setBusy(false)
      return
    }

    navigate('/')
    setBusy(false)
  }

  return (
    <Card className="mx-auto mt-6 max-w-xl">

      <div className="flex items-center gap-3">

        <div className="grid size-11 place-items-center rounded-xl bg-accent">
          <ShieldCheck className="size-5" />
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            Sign in
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Use your registered SwasthyaSetu account.
          </p>
        </div>

      </div>

      <div className="mt-6 space-y-4">

        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
        />

        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Enter password"
        />

        {error && (
          <ErrorBox text={error} />
        )}

        <Button
          className="w-full"
          size="lg"
          disabled={busy}
          onClick={() => void signIn()}
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>

      </div>

    </Card>
  )
}

/* ============================================================
   REGISTER
   ============================================================ */

function Register() {
  const [role, setRole] =
    useState<Role>('PATIENT')

  const [mode, setMode] =
    useState<RegisterMode>('choose')

  const changeRole = (newRole: Role) => {
    setRole(newRole)
    setMode('choose')
  }

  return (
    <Card className="mx-auto mt-6 max-w-3xl">

      <div className="flex items-center gap-3">

        <div className="grid size-11 place-items-center rounded-xl bg-accent">
          <UserRound className="size-5" />
        </div>

        <div>
          <h2 className="text-xl font-semibold">
            Create your account
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Select your role and choose how you want
            to verify your healthcare identity.
          </p>
        </div>

      </div>

      {/* ROLE SELECTION */}

      <div className="mt-6">

        <p className="label-xs">
          Register as
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">

          <RoleButton
            active={role === 'PATIENT'}
            label="Patient"
            icon={<UserRound className="size-4" />}
            onClick={() => changeRole('PATIENT')}
          />

          <RoleButton
            active={role === 'DOCTOR'}
            label="Doctor"
            icon={<Stethoscope className="size-4" />}
            onClick={() => changeRole('DOCTOR')}
          />

          <RoleButton
            active={role === 'FACILITY'}
            label="Hospital"
            icon={<Hospital className="size-4" />}
            onClick={() => changeRole('FACILITY')}
          />

          <RoleButton
            active={role === 'LAB'}
            label="Lab"
            icon={<FlaskConical className="size-4" />}
            onClick={() => changeRole('LAB')}
          />

          <RoleButton
            active={role === 'PHARMACY'}
            label="Pharmacy"
            icon={<Pill className="size-4" />}
            onClick={() => changeRole('PHARMACY')}
          />

          <RoleButton
            active={role === 'WORKER'}
            label="Worker"
            icon={<UsersRound className="size-4" />}
            onClick={() => changeRole('WORKER')}
          />

        </div>

      </div>

      {mode === 'choose' && (
        <IdentityChoice
          role={role}
          onOfficial={() => setMode('official')}
          onDemo={() => setMode('demo')}
        />
      )}

      {mode === 'official' && (
        <OfficialIdentity
          role={role}
          onBack={() => setMode('choose')}
          onDemo={() => setMode('demo')}
        />
      )}

      {mode === 'demo' && (
        <DemoRegistration
          role={role}
          onBack={() => setMode('choose')}
        />
      )}

    </Card>
  )
}

/* ============================================================
   OFFICIAL / DEMO CHOICE
   ============================================================ */

function IdentityChoice({
  role,
  onOfficial,
  onDemo
}: {
  role: Role
  onOfficial: () => void
  onDemo: () => void
}) {
  return (
    <div className="mt-6">

      <h3 className="font-semibold">
        {getRoleTitle(role)}
      </h3>

      <p className="mt-1 text-sm text-muted-foreground">
        Choose how you want to register.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">

        {/* OFFICIAL */}

        <button
          type="button"
          onClick={onOfficial}
          className="rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary"
        >

          <div className="flex items-center gap-3">

            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent">
              <ShieldCheck className="size-5" />
            </div>

            <div>

              <p className="font-semibold">
                Continue with {getRegistryName(role)}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Use your official healthcare identity.
              </p>

            </div>

          </div>

        </button>

        {/* DEMO */}

        <button
          type="button"
          onClick={onDemo}
          className="rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary"
        >

          <div className="flex items-center gap-3">

            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent">
              <UserRound className="size-5" />
            </div>

            <div>

              <p className="font-semibold">
                Demo Registration
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Create a prototype account without
                live registry integration.
              </p>

            </div>

          </div>

        </button>

      </div>

      <div className="mt-4 flex gap-2 rounded-lg bg-surface p-3 text-xs text-muted-foreground">

        <ShieldCheck className="mt-0.5 size-4 shrink-0" />

        <span>
          Demo identities are simulated prototype
          identities and are never represented as
          government-verified identities.
        </span>

      </div>

    </div>
  )
}

/* ============================================================
   OFFICIAL IDENTITY
   ============================================================ */

function OfficialIdentity({
  role,
  onBack,
  onDemo
}: {
  role: Role
  onBack: () => void
  onDemo: () => void
}) {
  const [registryId, setRegistryId] = useState('')
  const [message, setMessage] = useState('')

  /* --------------------------
     PATIENT / ABHA
     -------------------------- */

  const continueWithABHA = () => {
    setMessage('')

    if (abhaEnabled) {
      navigate('/abha')
      return
    }

    setMessage(
      'ABHA live integration is not connected in this prototype yet. You can continue using Demo Registration.'
    )
  }

  /* --------------------------
     PROVIDER REGISTRY
     -------------------------- */

  const verifyRegistryIdentity = () => {
    setMessage('')

    if (!registryId.trim()) {
      setMessage(
        `Enter ${getRegistryLabel(role)}.`
      )
      return
    }

    /*
      REAL INTEGRATION POINT

      DOCTOR:
      HPR lookup / authentication

      FACILITY:
      HFR lookup

      LAB:
      HFR lookup

      PHARMACY:
      HFR / applicable facility registry

      WORKER:
      applicable professional /
      employer / authority identity

      IMPORTANT:
      Never simulate a successful
      government registry verification.
    */

    setMessage(
      `${getRegistryName(role)} live integration is not connected in this prototype yet. You can continue using Demo Registration.`
    )
  }

  return (
    <div className="mt-6">

      <button
        type="button"
        className="text-sm font-semibold text-primary"
        onClick={onBack}
      >
        ← Back
      </button>

      <div className="mt-4 rounded-xl border border-border p-5">

        <div className="flex items-start justify-between gap-3">

          <div>

            <h3 className="font-semibold">
              {getRegistryName(role)} Verification
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              {getRegistryDescription(role)}
            </p>

          </div>

          <ShieldCheck className="size-5 shrink-0" />

        </div>

        {/* PATIENT */}

        {role === 'PATIENT' ? (

          <div className="mt-5">

            <Button
              className="w-full"
              onClick={continueWithABHA}
            >
              Continue with ABHA
            </Button>

          </div>

        ) : (

          /* PROVIDERS */

          <div className="mt-5">

            <Field
              label={getRegistryLabel(role)}
              value={registryId}
              onChange={setRegistryId}
              placeholder={`Enter ${getRegistryLabel(role)}`}
            />

            <Button
              className="mt-3 w-full"
              onClick={verifyRegistryIdentity}
            >
              Verify {getRegistryLabel(role)}
            </Button>

          </div>

        )}

        {message && (

          <div className="mt-4 rounded-lg border border-border bg-surface p-3">

            <p className="text-sm text-muted-foreground">
              {message}
            </p>

            <Button
              className="mt-3"
              variant="outline"
              onClick={onDemo}
            >
              Continue with Demo Registration
            </Button>

          </div>

        )}

      </div>

    </div>
  )
}

/* ============================================================
   DEMO REGISTRATION
   ============================================================ */

export function CompleteRegistration({ role, onComplete }: { role: Role; onComplete: () => void }) {
  const { signOut } = useAuth()
  return <div className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">Complete your demo profile</h1><p className="mt-2 text-sm text-muted-foreground">Your email is confirmed. Enter your profile details to finish registration. These details were not saved before confirmation.</p><DemoRegistration role={role} onBack={() => void signOut()} completing onComplete={onComplete} /></div>
}

function DemoRegistration({
  role,
  onBack,
  completing = false,
  onComplete
}: {
  role: Role
  onBack: () => void
  completing?: boolean
  onComplete?: () => void
}) {
  /* BASIC DETAILS */

  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [sex, setSex] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [language, setLanguage] =
    useState('English')

  /* PROVIDER DETAILS */

  const [registrationId, setRegistrationId] =
    useState('')

  const [specialization, setSpecialization] =
    useState('')

  const [organization, setOrganization] =
    useState('')

  const [address, setAddress] =
    useState('')

  /* AUTH */

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /* ========================================================
     CREATE ACCOUNT
     ======================================================== */

  async function createAccount() {
    setError('')

    /* --------------------------
       BASIC VALIDATION
       -------------------------- */

    if (!fullName.trim()) {
      setError(
        `${getNameLabel(role)} is required.`
      )
      return
    }

    if (!phone.trim()) {
      setError('Phone number is required.')
      return
    }

    if (!city.trim()) {
      setError('City is required.')
      return
    }

    if (!state.trim()) {
      setError('State is required.')
      return
    }

    /* --------------------------
       PATIENT
       -------------------------- */

    if (role === 'PATIENT') {
      if (!dob) {
        setError('Date of birth is required.')
        return
      }

      if (!sex) {
        setError('Select sex.')
        return
      }

      if (!language) {
        setError('Select preferred language.')
        return
      }
    }

    /* --------------------------
       DOCTOR
       -------------------------- */

    if (
      role === 'DOCTOR' &&
      !registrationId.trim()
    ) {
      setError(
        'Medical registration number is required.'
      )
      return
    }

    if (
      role === 'DOCTOR' &&
      !specialization.trim()
    ) {
      setError('Specialization is required.')
      return
    }

    /* --------------------------
       FACILITY / LAB / PHARMACY
       -------------------------- */

    if (
      ['FACILITY', 'LAB', 'PHARMACY'].includes(role) &&
      !address.trim()
    ) {
      setError('Address is required.')
      return
    }

    /* --------------------------
       AUTH DETAILS
       -------------------------- */

    if (!completing && !email.trim()) {
      setError('Email is required.')
      return
    }

    if (!completing && password.length < 6) {
      setError(
        'Password must contain at least 6 characters.'
      )
      return
    }

    if (!completing && password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)

    /* ======================================================
       CREATE AUTH ACCOUNT

       requested_role is read by our existing
       database auth trigger.
       ====================================================== */

    if (!completing) {
    const { data, error: signUpError } =
      await supabase.auth.signUp({
        email: email.trim(),
        password,

        options: {
          data: {
            requested_role: role,
            full_name: fullName.trim()
          }
        }
      })

    if (signUpError) {
      setError(signUpError.message)
      setBusy(false)
      return
    }

    if (!data.user) {
      setError(
        'Account could not be created.'
      )
      setBusy(false)
      return
    }

    if (!data.session) {
      setError('Check your email to confirm your account, then sign in here to complete your demo profile. Email confirmation must remain enabled. Your profile details have not been saved yet.')
      setBusy(false)
      return
    }
    }

    /* ======================================================
       PATIENT PROFILE
       ====================================================== */

    if (role === 'PATIENT') {

      const {
        error: patientProfileError
      } = await supabase.rpc(
        'register_demo_patient',
        {
          p_full_name:
            fullName.trim(),

          p_date_of_birth:
            dob || null,

          p_sex:
            sex || null,

          p_phone:
            phone.trim() || null,

          p_city:
            city.trim() || null,

          p_state:
            state.trim() || null,

          p_preferred_language:
            language || null
        }
      )

      if (patientProfileError) {
        setError(
          `Account created but patient profile creation failed: ${patientProfileError.message}`
        )

        setBusy(false)
        return
      }

    } else {

      /* ====================================================
         PROVIDER PROFILE
         ==================================================== */

      const {
        error: providerProfileError
      } = await supabase.rpc(
        'register_demo_provider',
        {
          p_provider_type:
            role,

          p_full_name:
            fullName.trim(),

          p_registration_id:
            registrationId.trim() || null,

          p_specialization:
            specialization.trim() || null,

          p_organization_name:
            organization.trim() || null,

          p_phone:
            phone.trim() || null,

          p_city:
            city.trim() || null,

          p_state:
            state.trim() || null,

          p_address_text:
            address.trim() || null
        }
      )

      if (providerProfileError) {
        setError(
          `Account created but provider profile creation failed: ${providerProfileError.message}`
        )

        setBusy(false)
        return
      }
    }

    /* ======================================================
       REGISTRATION COMPLETE

       No second onboarding page.
       App.tsx checks role-specific DB record
       and routes to the appropriate state.
       ====================================================== */

    if (onComplete) onComplete()
    else window.location.reload()
    setBusy(false)
  }

  /* ========================================================
     UI
     ======================================================== */

  return (
    <div className="mt-6">

      <button
        type="button"
        className="text-sm font-semibold text-primary"
        onClick={onBack}
      >
        ← Back
      </button>

      <div className="mt-4">

        {/* TITLE */}

        <div className="flex items-start gap-3">

          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent">
            {getRoleIcon(role)}
          </div>

          <div>

            <h3 className="font-semibold">
              {getRoleTitle(role)} — Demo Registration
            </h3>

            <p className="mt-1 text-xs text-muted-foreground">
              {getDemoText(role)}
            </p>

          </div>

        </div>

        {/* DETAILS */}

        <div className="mt-6">

          <h4 className="text-sm font-semibold">
            {role === 'PATIENT'
              ? 'Personal details'
              : 'Professional / organisation details'}
          </h4>

          <div className="mt-3 grid gap-4 md:grid-cols-2">

            <Field
              label={getNameLabel(role)}
              value={fullName}
              onChange={setFullName}
              placeholder={`Enter ${getNameLabel(role).toLowerCase()}`}
            />

            <Field
              label="Phone number"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="Enter phone number"
            />

            {/* PATIENT FIELDS */}

            {role === 'PATIENT' && (
              <>
                <Field
                  label="Date of birth"
                  type="date"
                  value={dob}
                  onChange={setDob}
                />

                <SelectField
                  label="Sex"
                  value={sex}
                  onChange={setSex}
                  options={[
                    ['MALE', 'Male'],
                    ['FEMALE', 'Female'],
                    ['OTHER', 'Other'],
                    [
                      'UNDISCLOSED',
                      'Prefer not to say'
                    ]
                  ]}
                />

                <SelectField
                  label="Preferred language"
                  value={language}
                  onChange={setLanguage}
                  options={[
                    [
                      'English',
                      'English'
                    ],
                    [
                      'Hindi',
                      'हिन्दी (Hindi)'
                    ]
                  ]}
                />
              </>
            )}

            {/* DOCTOR */}

            {role === 'DOCTOR' && (
              <>
                <Field
                  label="Medical registration number"
                  value={registrationId}
                  onChange={setRegistrationId}
                  placeholder="Enter registration number"
                />

                <Field
                  label="Specialization"
                  value={specialization}
                  onChange={setSpecialization}
                  placeholder="e.g. General Medicine"
                />

                <Field
                  label="Organisation / Hospital (optional)"
                  value={organization}
                  onChange={setOrganization}
                  placeholder="Optional"
                />
              </>
            )}

            {/* WORKER */}

            {role === 'WORKER' && (
              <>
                <Field
                  label="Worker / Employee ID (optional)"
                  value={registrationId}
                  onChange={setRegistrationId}
                  placeholder="Enter ID if available"
                />

                <Field
                  label="Assigning organisation (optional)"
                  value={organization}
                  onChange={setOrganization}
                  placeholder="PHC / Hospital / Organisation"
                />
              </>
            )}

            {/* FACILITY / LAB / PHARMACY */}

            {['FACILITY', 'LAB', 'PHARMACY'].includes(role) && (
              <>
                <Field
                  label="Registration / licence number (optional)"
                  value={registrationId}
                  onChange={setRegistrationId}
                  placeholder="Enter registration number"
                />

                <Field
                  label="Complete address"
                  value={address}
                  onChange={setAddress}
                  placeholder="Enter facility address"
                />
              </>
            )}

            {/* COMMON LOCATION */}

            <Field
              label="City"
              value={city}
              onChange={setCity}
              placeholder="Enter city"
            />

            <Field
              label="State"
              value={state}
              onChange={setState}
              placeholder="Enter state"
            />

          </div>

        </div>

        {/* LOGIN DETAILS */}

        {!completing && <div className="mt-7 border-t border-border pt-6">

          <h4 className="text-sm font-semibold">
            Login details
          </h4>

          <p className="mt-1 text-xs text-muted-foreground">
            Enter these details once during registration.
            Use the same email and password for future sign-ins.
          </p>

          <div className="mt-3 grid gap-4 md:grid-cols-2">

            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
            />

            <div className="hidden md:block" />

            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Create password"
            />

            <Field
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Enter password again"
            />

          </div>

        </div>

        }

        {error && (
          <div className="mt-5">
            <ErrorBox text={error} />
          </div>
        )}

        <Button
          className="mt-6 w-full"
          size="lg"
          disabled={busy}
          onClick={() =>
            void createAccount()
          }
        >
          {busy
            ? 'Creating account...'
            : completing ? 'Complete Demo Profile' : 'Create Demo Account'}
        </Button>

      </div>

    </div>
  )
}

/* ============================================================
   FIELD
   ============================================================ */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">

      <span className="label-xs">
        {label}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event =>
          onChange(event.target.value)
        }
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 outline-none transition focus:border-primary"
      />

    </label>
  )
}

/* ============================================================
   SELECT
   ============================================================ */

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <label className="block">

      <span className="label-xs">
        {label}
      </span>

      <select
        value={value}
        onChange={event =>
          onChange(event.target.value)
        }
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 outline-none transition focus:border-primary"
      >

        <option value="">
          Select
        </option>

        {options.map(
          ([optionValue, optionLabel]) => (
            <option
              key={optionValue}
              value={optionValue}
            >
              {optionLabel}
            </option>
          )
        )}

      </select>

    </label>
  )
}

/* ============================================================
   ROLE BUTTON
   ============================================================ */

function RoleButton({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition ${active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card hover:bg-surface'
        }`}
    >
      {icon}
      {label}
    </button>
  )
}

/* ============================================================
   ERROR
   ============================================================ */

function ErrorBox({
  text
}: {
  text: string
}) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">

      <p className="text-sm text-destructive">
        {text}
      </p>

    </div>
  )
}

/* ============================================================
   ROLE / REGISTRY HELPERS
   ============================================================ */

function getRegistryName(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'ABHA'

    case 'DOCTOR':
      return 'HPR'

    case 'FACILITY':
    case 'LAB':
    case 'PHARMACY':
      return 'HFR'

    case 'WORKER':
      return 'Official / Professional ID'
  }
}

function getRegistryLabel(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'ABHA'

    case 'DOCTOR':
      return 'HPR ID'

    case 'FACILITY':
    case 'LAB':
    case 'PHARMACY':
      return 'HFR ID'

    case 'WORKER':
      return 'Official / Worker ID'
  }
}

function getRegistryDescription(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'Authenticate using ABHA and fetch authorised demographic details.'

    case 'DOCTOR':
      return 'Verify professional identity through the Healthcare Professional Registry.'

    case 'FACILITY':
      return 'Verify hospital or facility identity through the Health Facility Registry.'

    case 'LAB':
      return 'Verify diagnostic facility identity through the Health Facility Registry.'

    case 'PHARMACY':
      return 'Use applicable registered facility identity where available.'

    case 'WORKER':
      return 'Use an applicable professional, official or employer-linked identity.'
  }
}

function getRoleTitle(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'Patient Registration'

    case 'DOCTOR':
      return 'Doctor Registration'

    case 'FACILITY':
      return 'Hospital Registration'

    case 'LAB':
      return 'Diagnostic Lab Registration'

    case 'PHARMACY':
      return 'Pharmacy Registration'

    case 'WORKER':
      return 'Frontline Worker Registration'
  }
}

function getNameLabel(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'Full name'

    case 'DOCTOR':
      return 'Doctor name'

    case 'FACILITY':
      return 'Hospital / Facility name'

    case 'LAB':
      return 'Diagnostic Lab name'

    case 'PHARMACY':
      return 'Pharmacy name'

    case 'WORKER':
      return 'Worker name'
  }
}

function getDemoText(role: Role) {
  switch (role) {
    case 'PATIENT':
      return 'A simulated Demo ABHA identity will be generated for prototype testing. It is not an ABDM-verified ABHA.'

    case 'DOCTOR':
      return 'A unique Demo HPR identity will be generated. It is not HPR verified.'

    case 'FACILITY':
      return 'A unique Demo HFR Hospital identity will be generated. It is not HFR verified.'

    case 'LAB':
      return 'A unique Demo HFR Lab identity will be generated. It is not HFR verified.'

    case 'PHARMACY':
      return 'A unique Demo HFR Pharmacy identity will be generated. It is not HFR verified.'

    case 'WORKER':
      return 'A unique SwasthyaSetu Demo Worker identity will be generated. It is not a government credential.'
  }
}

function getRoleIcon(role: Role) {
  switch (role) {
    case 'PATIENT':
      return (
        <UserRound className="size-5" />
      )

    case 'DOCTOR':
      return (
        <Stethoscope className="size-5" />
      )

    case 'FACILITY':
      return (
        <Hospital className="size-5" />
      )

    case 'LAB':
      return (
        <FlaskConical className="size-5" />
      )

    case 'PHARMACY':
      return (
        <Pill className="size-5" />
      )

    case 'WORKER':
      return (
        <UsersRound className="size-5" />
      )
  }
}