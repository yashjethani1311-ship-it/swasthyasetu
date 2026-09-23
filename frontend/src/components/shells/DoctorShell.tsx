import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  LogOut,
  Menu,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
  LayoutDashboard
} from 'lucide-react'

import { Button } from '../kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type DoctorProfileData = {
  id: string
  full_name: string
  specialization: string | null
  registration_id: string | null
  verification_status: string
  organization_name: string | null
}

const doctorNavItems = [
  { to: '/', labelKey: 'dashboard', icon: LayoutDashboard },
  { to: '/appointments', labelKey: 'opdQueue', icon: CalendarCheck },
  { to: '/encounter', labelKey: 'encounter', icon: Stethoscope },
  { to: '/care', labelKey: 'care', icon: Users },
  { to: '/lab', labelKey: 'diagnostics', icon: Activity },
  { to: '/prescriptions', labelKey: 'prescriptions', icon: FileText },
  { to: '/profile', labelKey: 'profile', icon: UserRound }
]

export function DoctorShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const [doctorInfo, setDoctorInfo] = useState<DoctorProfileData | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('provider_profiles')
      .select('id, full_name, specialization, registration_id, verification_status, organization_name')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDoctorInfo(data as DoctorProfileData)
      })
  }, [profile?.id])

  const hindi = language === 'Hindi'

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans">
      {/* CLINICAL WORKSTATION HEADER */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/98 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1700px] items-center justify-between px-4 lg:px-6">
          {/* LEFT: BRAND & CLINICAL CONTEXT */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 -ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            <div
              onClick={() => navigate('/')}
              className="flex items-center gap-2.5 cursor-pointer select-none"
            >
              <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Stethoscope className="size-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold text-foreground text-base tracking-tight leading-tight">
                    SwasthyaSetu
                  </p>
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
                    Clinical Workstation
                  </span>
                </div>
                <p className="hidden text-[11px] text-muted-foreground sm:block leading-none mt-0.5 font-medium">
                  {doctorInfo?.organization_name ?? (hindi ? 'चिकित्सा कार्यक्षेत्र' : 'Doctor Workstation')}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: DOCTOR CREDENTIALS & CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* DOCTOR CREDENTIALS BADGE */}
            {doctorInfo && (
              <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-1 text-xs">
                <div className="size-2 rounded-full bg-success animate-pulse" />
                <span className="font-semibold text-foreground">
                  Dr. {doctorInfo.full_name}
                </span>
                {doctorInfo.specialization && (
                  <span className="text-muted-foreground border-l border-border pl-2">
                    {doctorInfo.specialization}
                  </span>
                )}
                {doctorInfo.registration_id && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                    {doctorInfo.registration_id}
                  </span>
                )}
              </div>
            )}

            {/* VERIFICATION BADGE */}
            {doctorInfo?.verification_status === 'APPROVED' && (
              <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                <ShieldCheck className="size-3" />
                Operational access approved
              </span>
            )}

            {/* LANGUAGE SWITCH */}
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('English')}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                  language === 'English'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('Hindi')}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                  language === 'Hindi'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                हिन्दी
              </button>
            </div>

            {/* QUICK CONSULTATION SHORTCUT */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/encounter')}
              className="hidden sm:inline-flex text-xs font-semibold"
            >
              <Stethoscope className="size-3.5 mr-1" />
              {hindi ? 'परामर्श' : 'Consultation'}
            </Button>

            {/* SIGN OUT */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              className="text-muted-foreground hover:text-destructive"
              aria-label={t('common', 'signOut')}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="mx-auto flex w-full max-w-[1700px] flex-1">
        {/* CLINICAL SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-sidebar p-3 lg:flex flex-col justify-between">
          <nav className="space-y-1">
            <p className="px-3 py-1.5 label-xs text-muted-foreground font-bold">
              {hindi ? 'क्लिनिकल मॉड्यूल' : 'Clinical Modules'}
            </p>
            {doctorNavItems.map(item => {
              const Icon = item.icon
              const active = route === item.to
              const label =
                item.labelKey === 'profile'
                  ? t('common', 'profile')
                  : t('nav', item.labelKey)

              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition select-none ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-sidebar-foreground hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4 shrink-0" />
                    <span>{label}</span>
                  </div>
                  {item.to === '/encounter' ? (
                    <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
                    }`}>
                      OPD
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          {/* CLINICAL FOOTER */}
          <div className="rounded-xl border border-border bg-surface-subtle p-3 text-xs">
            <div className="flex items-center gap-1.5 text-foreground font-semibold">
              <HeartPulse className="size-3.5 text-teal" />
              <span>{hindi ? 'सुरक्षित सत्र' : 'Encrypted Session'}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
              {hindi
                ? 'क्लिनिकल डेटा केवल अधिकृत सहमति से ही दिखाई देता है।'
                : 'Longitudinal records accessible under patient consent only.'}
            </p>
          </div>
        </aside>

        {/* MOBILE DRAWER */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            />
            <aside className="relative h-full w-72 bg-card p-4 shadow-2xl flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="mb-5 flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="size-5 text-primary" />
                    <p className="font-display font-bold">Dr. Workstation</p>
                  </div>
                  <button onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {doctorNavItems.map(item => {
                    const Icon = item.icon
                    const active = route === item.to
                    const label =
                      item.labelKey === 'profile'
                        ? t('common', 'profile')
                        : t('nav', item.labelKey)

                    return (
                      <button
                        key={item.to}
                        onClick={() => {
                          navigate(item.to)
                          setOpen(false)
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground hover:bg-secondary'
                        }`}
                      >
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              <div className="border-t border-border pt-4 mt-6">
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => {
                    setOpen(false)
                    void signOut()
                  }}
                >
                  <LogOut className="size-4 mr-2" />
                  {t('common', 'signOut')}
                </Button>
              </div>
            </aside>
          </div>
        )}

        {/* CLINICAL MAIN */}
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}
