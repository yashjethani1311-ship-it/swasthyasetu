import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth'
import { useRoute, navigate } from '@/lib/route'
import { supabase } from '@/lib/supabase'

import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/kit'

import { AccessPage } from '@/pages/AccessPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { InsurancePage } from '@/pages/InsurancePage'
import { AppointmentsPage } from '@/pages/AppointmentsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EmptyModulePage } from '@/pages/EmptyModulePage'

type ProviderStatus =
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'SUSPENDED'
    | null

export default function App() {
    const {
        session,
        profile,
        loading,
        signOut
    } = useAuth()

    const route = useRoute()

    const [hasRoleRecord, setHasRoleRecord] =
        useState<boolean | null>(null)

    const [providerStatus, setProviderStatus] =
        useState<ProviderStatus>(null)

    const [accountError, setAccountError] =
        useState('')

    /* =====================================================
       CHECK ROLE-SPECIFIC PROFILE
       ===================================================== */

    const checkRoleRecord = useCallback(async () => {

        if (!session?.user || !profile) {
            setHasRoleRecord(null)
            setProviderStatus(null)
            return
        }

        setAccountError('')

        /* -----------------------------
           PATIENT
           ----------------------------- */

        if (profile.role === 'PATIENT') {

            const { data, error } = await supabase
                .from('patient_profiles')
                .select('id')
                .eq('user_id', session.user.id)
                .maybeSingle()

            if (error) {
                console.error(
                    'Patient profile check failed:',
                    error
                )

                setAccountError(error.message)
                return
            }

            setHasRoleRecord(Boolean(data))
            setProviderStatus(null)

            return
        }

        /* -----------------------------
           ADMIN
           ----------------------------- */

        if (profile.role === 'ADMIN') {
            setHasRoleRecord(true)
            setProviderStatus(null)
            return
        }

        /* -----------------------------
           PROVIDERS

           DOCTOR
           LAB
           PHARMACY
           WORKER
           FACILITY
           ----------------------------- */

        const { data, error } = await supabase
            .from('provider_profiles')
            .select('id, verification_status')
            .eq('user_id', session.user.id)
            .maybeSingle()

        if (error) {
            console.error(
                'Provider profile check failed:',
                error
            )

            setAccountError(error.message)
            return
        }

        setHasRoleRecord(Boolean(data))

        if (data) {
            setProviderStatus(
                data.verification_status as ProviderStatus
            )
        } else {
            setProviderStatus(null)
        }

    }, [
        session?.user?.id,
        profile?.role
    ])

    /* =====================================================
       CHECK ACCOUNT WHEN SESSION / ROLE CHANGES
       ===================================================== */

    useEffect(() => {
        void checkRoleRecord()
    }, [checkRoleRecord])

    /* =====================================================
       AUTH LOADING
       ===================================================== */

    if (loading) {
        return (
            <div className="grid min-h-screen place-items-center bg-surface text-sm text-muted-foreground">
                Loading secure session…
            </div>
        )
    }

    /* =====================================================
       NOT LOGGED IN
       ===================================================== */

    if (!session) {
        return <AccessPage />
    }

    /* =====================================================
       WAITING FOR BASE PROFILE

       profiles row is created by the auth trigger.
       ===================================================== */

    if (!profile) {
        return (
            <div className="grid min-h-screen place-items-center bg-surface text-sm text-muted-foreground">
                Creating account profile…
            </div>
        )
    }

    /* =====================================================
       CHECKING ROLE RECORD
       ===================================================== */

    if (hasRoleRecord === null) {
        return (
            <div className="grid min-h-screen place-items-center bg-surface text-sm text-muted-foreground">
                Loading account…
            </div>
        )
    }

    /* =====================================================
       DATABASE ERROR
       ===================================================== */

    if (accountError) {
        return (
            <div className="grid min-h-screen place-items-center bg-surface px-4">

                <div className="w-full max-w-md text-center">

                    <h2 className="text-xl font-bold">
                        Account check failed
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {accountError}
                    </p>

                    <div className="mt-5 flex justify-center gap-3">

                        <Button
                            onClick={() =>
                                void checkRoleRecord()
                            }
                        >
                            Retry
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() =>
                                void signOut()
                            }
                        >
                            Sign out
                        </Button>

                    </div>

                </div>

            </div>
        )
    }

    /* =====================================================
       INCOMPLETE REGISTRATION

       IMPORTANT:
       We DO NOT ask the user to enter profile details again.

       All details belong to registration.

       If the Auth account exists but patient_profiles /
       provider_profiles does not exist, registration did
       not finish successfully.
       ===================================================== */

    if (hasRoleRecord === false) {
        return (
            <div className="grid min-h-screen place-items-center bg-surface px-4">

                <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">

                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent">
                        <span className="text-lg font-bold">
                            !
                        </span>
                    </div>

                    <h1 className="mt-4 text-2xl font-bold">
                        Registration incomplete
                    </h1>

                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        Your login account exists, but your
                        SwasthyaSetu profile was not created
                        successfully.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        You will not be asked to enter your
                        patient or provider details again here.
                        Please retry the account check or sign
                        out and complete registration again.
                    </p>

                    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">

                        <Button
                            onClick={() =>
                                void checkRoleRecord()
                            }
                        >
                            Check again
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() =>
                                void signOut()
                            }
                        >
                            Sign out
                        </Button>

                    </div>

                </div>

            </div>
        )
    }

    /* =====================================================
       PROVIDER VERIFICATION STATUS

       Demo provider identity may still be:
       identity_source = DEMO
       registry_verified = false

       verification_status is SwasthyaSetu operational
       approval, not government registry verification.
       ===================================================== */

    if (
        profile.role !== 'PATIENT' &&
        profile.role !== 'ADMIN' &&
        providerStatus === 'PENDING'
    ) {
        return (
            <ProviderStatusScreen
                title="Verification pending"
                text="Your provider registration has been submitted. Access remains locked until the provider account is approved for SwasthyaSetu prototype operations."
                onRefresh={checkRoleRecord}
                onSignOut={signOut}
            />
        )
    }

    if (
        profile.role !== 'PATIENT' &&
        profile.role !== 'ADMIN' &&
        providerStatus === 'REJECTED'
    ) {
        return (
            <ProviderStatusScreen
                title="Registration not approved"
                text="This provider registration is currently not approved."
                onRefresh={checkRoleRecord}
                onSignOut={signOut}
            />
        )
    }

    if (
        profile.role !== 'PATIENT' &&
        profile.role !== 'ADMIN' &&
        providerStatus === 'SUSPENDED'
    ) {
        return (
            <ProviderStatusScreen
                title="Provider access suspended"
                text="Access for this provider account has been suspended."
                onRefresh={checkRoleRecord}
                onSignOut={signOut}
            />
        )
    }

    /* =====================================================
       MAIN APPLICATION
       ===================================================== */

    let page

    switch (route) {

        /* -----------------------------
           DASHBOARD
           ----------------------------- */

        case '/':
            page = <DashboardPage />
            break

        /* -----------------------------
           APPOINTMENTS
           ----------------------------- */

        case '/appointments':
            page = <AppointmentsPage />
            break

        /* -----------------------------
           HEALTH RECORDS
           ----------------------------- */

        case '/records':

            page =
                profile.role === 'PATIENT' ? (
                    <RecordsPage />
                ) : (
                    <EmptyModulePage
                        title="Health Records"
                        text="Patient records become accessible only through authorised care and consent flows."
                    />
                )

            break

        /* -----------------------------
           INSURANCE
           ----------------------------- */

        case '/insurance':
            page = <InsurancePage />
            break

        /* -----------------------------
           PROFILE
           ----------------------------- */

        case '/profile':
            page = <ProfilePage />
            break

        /* -----------------------------
           PRESCRIPTIONS
           ----------------------------- */

        case '/prescriptions':

            page = (
                <EmptyModulePage
                    title="Prescriptions"
                    text="No prescriptions exist yet."
                />
            )

            break

        /* -----------------------------
           DIAGNOSTICS
           ----------------------------- */

        case '/lab':

            page = (
                <EmptyModulePage
                    title="Diagnostics"
                    text="No diagnostic orders exist yet."
                />
            )

            break

        /* -----------------------------
           MEDICINES
           ----------------------------- */

        case '/medicines':

            page = (
                <EmptyModulePage
                    title="Medicines"
                    text="No medicine data exists yet."
                />
            )

            break

        /* -----------------------------
           FACILITIES
           ----------------------------- */

        case '/facilities':

            page = (
                <EmptyModulePage
                    title="Facilities"
                    text="No verified facilities exist yet."
                />
            )

            break

        /* -----------------------------
           UNKNOWN ROUTE
           ----------------------------- */

        default:

            navigate('/')
            page = <DashboardPage />
    }

    /* =====================================================
       APPLICATION SHELL
       ===================================================== */

    return (
        <AppShell>
            {page}
        </AppShell>
    )
}

/* =========================================================
   PROVIDER STATUS SCREEN
   ========================================================= */

function ProviderStatusScreen({
    title,
    text,
    onRefresh,
    onSignOut
}: {
    title: string
    text: string
    onRefresh: () => Promise<void>
    onSignOut: () => void | Promise<void>
}) {
    return (
        <div className="grid min-h-screen place-items-center bg-surface px-4">

            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">

                <h1 className="text-2xl font-bold">
                    {title}
                </h1>

                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {text}
                </p>

                <div className="mt-6 flex justify-center gap-3">

                    <Button
                        onClick={() =>
                            void onRefresh()
                        }
                    >
                        Check status
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() =>
                            void onSignOut()
                        }
                    >
                        Sign out
                    </Button>

                </div>

            </div>

        </div>
    )
}