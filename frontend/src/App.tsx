import {ConsentPage} from '@/pages/ConsentPage'
import { CarePage } from '@/pages/CarePage'
import { PharmacyPage } from '@/pages/PharmacyPage'
import { WorkerPage } from '@/pages/WorkerPage'
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@/lib/auth'
import { useRoute, navigate } from '@/lib/route'
import { supabase } from '@/lib/supabase'

import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/kit'

import { AccessPage, CompleteRegistration } from '@/pages/AccessPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { InsurancePage } from '@/pages/InsurancePage'
import { AppointmentsPage } from '@/pages/AppointmentsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { EmptyModulePage } from '@/pages/EmptyModulePage'
import { EncounterPage } from '@/pages/EncounterPage'
import { PrescriptionsPage } from '@/pages/PrescriptionsPage'
import { DiagnosticsPage } from '@/pages/DiagnosticsPage'
import { LabWorkspacePage } from '@/pages/LabWorkspacePage'
import { DoctorsPage } from '@/pages/DoctorsPage'
import { FacilitiesPage } from '@/pages/FacilitiesPage'
import { MedicinesPage } from '@/pages/MedicinesPage'
import { BuyRefillPage } from '@/pages/BuyRefillPage'
import { HealthAiPage } from '@/pages/HealthAiPage'
import { EmergencyPage } from '@/pages/EmergencyPage'
import { HospitalReceptionPage } from '@/pages/hospital/HospitalReceptionPage'
import { HospitalPatientsPage } from '@/pages/hospital/HospitalPatientsPage'
import { HospitalStaffPage } from '@/pages/hospital/HospitalStaffPage'
import { HospitalBedsPage } from '@/pages/hospital/HospitalBedsPage'
import { HospitalOpdPage } from '@/pages/hospital/HospitalOpdPage'
import { HospitalEnterpriseModulePage } from '@/pages/hospital/HospitalEnterpriseModulePage'
import { AdminGovernancePage } from '@/pages/AdminGovernancePage'
import { CareIntelligenceView } from '@/components/clinical/CareIntelligenceView'

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
        error: authError,
        signOut
    } = useAuth()

    const route = useRoute()

    const [hasRoleRecord, setHasRoleRecord] =
        useState<boolean | null>(null)
    const [carePatientId, setCarePatientId] = useState<string | undefined>(undefined)

    const [providerStatus, setProviderStatus] =
        useState<ProviderStatus>(null)

    const [accountError, setAccountError] =
        useState('')

    /* =====================================================
       CHECK ROLE-SPECIFIC PROFILE
       ===================================================== */

    const checkRoleRecord = useCallback(async () => {

        if (!session?.user || !profile) {
            setCarePatientId(undefined)
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
            setCarePatientId(data?.id)
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

    if (authError) {
        return <div className="mx-auto max-w-lg space-y-4 p-8"><p role="alert">{authError}</p><Button onClick={() => window.location.reload()}>Retry</Button><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></div>
    }

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

    if (hasRoleRecord === null && !accountError) {
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

    // Confirmed accounts finish their role profile without recreating Auth users.
    if (hasRoleRecord === false && profile.role !== 'ADMIN') {
        return <CompleteRegistration role={profile.role} onComplete={() => void checkRoleRecord()} />
    }

    /* =====================================================
       PROVIDER VERIFICATION STATUS

       Demo provider identity may still be:
       identity_source = DEMO
       registry_verified = false

       verification_status is SwasthyaSetu operational
       approval, not government registry verification.

       STAGING/DEMO: The 'PENDING' approval gate is bypassed
       so fresh demo provider accounts proceed directly to
       their dashboard without manual approval.
       REJECTED and SUSPENDED states remain active.
       ===================================================== */


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

    /* =====================================================
       HOSPITAL HMIS ROLE SAFETY

       Hospital information-system modules are restricted to
       authorised facility / administrator workspaces. Other
       roles degrade safely instead of opening HMIS surfaces.
       ===================================================== */

    if (
        route.startsWith('/hospital/') &&
        profile.role !== 'FACILITY' &&
        profile.role !== 'ADMIN'
    ) {
        return (
            <AppShell>
                <EmptyModulePage
                    title="Hospital Operations"
                    text="Hospital information system modules (reception, OPD, beds, billing, inventory, referrals, MIS) are restricted to authorised facility and administrator workspaces."
                />
            </AppShell>
        )
    }

    let page

    if (route.startsWith('/doctor/') || route === '/doctor') {
        page = profile.role === 'DOCTOR' ? <CarePage /> : <EmptyModulePage title="Doctor Workspace" text="Doctor surfaces are restricted to registered medical practitioners." />
    } else if (route.startsWith('/encounter/') || route === '/encounter') {
        page = profile.role === 'DOCTOR' ? <EncounterPage /> : <EmptyModulePage title="Clinical Encounter" text="Clinical encounters are available to authorised doctors." />
    } else if (route.startsWith('/worker/') || route === '/worker') {
        page = profile.role === 'WORKER' ? <WorkerPage /> : <EmptyModulePage title="Worker Workspace" text="Field health worker surfaces are restricted to authorised ASHA / ANM workers." />
    } else {
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
                    profile.role === 'DOCTOR' ? <CarePage /> : <DashboardPage />
                )

            break

        /* -----------------------------
           INSURANCE
           ----------------------------- */

        case '/insurance':
            page =
                profile.role === 'PATIENT' ? (
                    <InsurancePage />
                ) : (
                    <EmptyModulePage
                        title="Insurance"
                        text="Personal insurance and scheme records are only available in the patient workspace. Hospital-side insurance and TPA workflows live under the hospital billing modules."
                    />
                )
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

            page =
                profile.role === 'PATIENT' ? (
                    <PrescriptionsPage />
                ) : (
                    profile.role === 'PHARMACY' ? <PharmacyPage /> : profile.role === 'DOCTOR' ? <CarePage /> : <DashboardPage />
                )

            break

        /* -----------------------------
           DIAGNOSTICS
           ----------------------------- */

        case '/lab':

            if ((profile.role === 'PATIENT' || profile.role === 'DOCTOR')) {
                page = <DiagnosticsPage />
            } else if (profile.role === 'LAB' || profile.role === 'FACILITY') {
                page = <LabWorkspacePage />
            } else {
                page = (
                    <EmptyModulePage
                        title="Diagnostics"
                        text="Diagnostic workflows are available to patients and laboratories."
                    />
                )
            }

            break
        /* -----------------------------
           MEDICINES
           ----------------------------- */

        case '/consent':
            page = profile.role === 'PATIENT' ? <ConsentPage/> : <CarePage/>
            break
        case '/care':
            page = ['PATIENT','DOCTOR'].includes(profile.role) ? <CarePage /> : <DashboardPage />
            break
        case '/follow-up':
            page = profile.role === 'WORKER' ? <WorkerPage /> : ['PATIENT','DOCTOR'].includes(profile.role) ? <CarePage /> : <DashboardPage />
            break
        case '/buy-refill':
            page =
                profile.role === 'PATIENT' ? (
                    <BuyRefillPage />
                ) : (
                    <DashboardPage />
                )
            break

        case '/health-ai':
            page =
                profile.role === 'PATIENT' ? (
                    <HealthAiPage />
                ) : (
                    <EmptyModulePage
                        title="Health AI"
                        text="Health AI is available in the patient workspace and only uses consented, verified records."
                    />
                )
            break

        case '/emergency':
            page =
                profile.role === 'PATIENT' ? (
                    <EmergencyPage />
                ) : (
                    <EmptyModulePage
                        title="Emergency / SOS"
                        text="The patient emergency surface is available in the patient workspace. Facility-side emergency and triage operations live under the hospital modules."
                    />
                )
            break

        case '/admin':
            page =
                profile.role === 'ADMIN' ? (
                    <AdminGovernancePage />
                ) : (
                    <EmptyModulePage title="Governance" text="Governance controls are restricted to authorised administrators." />
                )
            break

        /* -----------------------------
           FACILITIES
           ----------------------------- */

        case '/facilities':
            page = <FacilitiesPage />
            break

        case '/doctors':
            page = <DoctorsPage />
            break

        case '/medicines':
            page =
                profile.role === 'PHARMACY' ? (
                    <PharmacyPage />
                ) : profile.role === 'PATIENT' ? (
                    <MedicinesPage />
                ) : profile.role === 'DOCTOR' ? (
                    <CarePage />
                ) : (
                    <DashboardPage />
                )
            break

        case '/pharmacy':
            page =
                profile.role === 'PHARMACY' ? (
                    <PharmacyPage />
                ) : (
                    <EmptyModulePage
                        title="Pharmacy ERP / POS"
                        text="Pharmacy operations are restricted to authorised pharmacy staff."
                    />
                )
            break

        case '/hospital/reception':
            page = <HospitalReceptionPage />
            break

        case '/hospital/patients':
            page = <HospitalPatientsPage />
            break

        case '/hospital/staff':
            page = <HospitalStaffPage />
            break

        case '/hospital/beds':
            page = <HospitalBedsPage />
            break

        case '/hospital/opd':
            page = <HospitalOpdPage />
            break

        case '/hospital/emergency':
            page = <HospitalEnterpriseModulePage moduleKey="emergency" />
            break

        case '/hospital/billing':
            page = <HospitalEnterpriseModulePage moduleKey="billing" />
            break

        case '/hospital/inventory':
            page = <HospitalEnterpriseModulePage moduleKey="inventory" />
            break

        case '/hospital/referrals':
            page = <HospitalEnterpriseModulePage moduleKey="referrals" />
            break

        case '/hospital/reports':
            page = <HospitalEnterpriseModulePage moduleKey="reports" />
            break

        case '/hospital/integrations':
            page = <HospitalEnterpriseModulePage moduleKey="integrations" />
            break

        case '/hospital/departments':
            page = <HospitalEnterpriseModulePage moduleKey="departments" />
            break

        case '/hospital/schedules':
            page = <HospitalEnterpriseModulePage moduleKey="schedules" />
            break

        case '/hospital/ipd':
            page = <HospitalEnterpriseModulePage moduleKey="ipd" />
            break

        case '/twin':
            page = <CareIntelligenceView patientId={profile.role === 'PATIENT' ? carePatientId : undefined} initialMode="TWIN" />
            break

        case '/replay':
            page = <CareIntelligenceView patientId={profile.role === 'PATIENT' ? carePatientId : undefined} initialMode="REPLAY" />
            break

        case '/pulse':
            page = <CareIntelligenceView initialMode="PULSE" />
            break

        case '/teleconsult':
            page = profile.role === 'DOCTOR' ? <EncounterPage /> : <AppointmentsPage />
            break

        case '/governance':
            page =
                profile.role === 'ADMIN' ? (
                    <AdminGovernancePage />
                ) : (
                    <EmptyModulePage title="Governance" text="Governance controls are restricted to authorised administrators." />
                )
            break

        /* -----------------------------
           UNKNOWN ROUTE
           ----------------------------- */

        default:

            navigate('/')
            page = <DashboardPage />
    }
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
