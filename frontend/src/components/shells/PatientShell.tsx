import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  Hospital,
  LogOut,
  Menu,
  Pill,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  UserRound,
  Volume2,
  X,
  History,
  PhoneCall,
  ChevronRight,
  Bot,
  Siren
} from 'lucide-react'

import { Button } from '../kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { speakText } from '@/lib/voice'
import { supabase } from '@/lib/supabase'

type NavEntry = {
  to: string
  labelKey: string
  icon: typeof HeartPulse
  badge?: string
}

const patientNavItems: NavEntry[] = [
  { to: '/', labelKey: 'dashboard', icon: HeartPulse },
  { to: '/emergency', labelKey: 'sos', icon: Siren },
  { to: '/doctors', labelKey: 'doctors', icon: Stethoscope },
  { to: '/facilities', labelKey: 'facilities', icon: Hospital },
  { to: '/appointments', labelKey: 'appointments', icon: CalendarCheck },
  { to: '/prescriptions', labelKey: 'prescriptions', icon: FileText },
  { to: '/medicines', labelKey: 'medicines', icon: Pill },
  { to: '/buy-refill', labelKey: 'buyRefill', icon: ShoppingBag },
  { to: '/health-ai', labelKey: 'healthAi', icon: Bot },
  { to: '/lab', labelKey: 'diagnostics', icon: Activity },
  { to: '/records', labelKey: 'records', icon: FileText },
  { to: '/care', labelKey: 'care', icon: History },
  { to: '/consent', labelKey: 'consent', icon: ShieldCheck },
  { to: '/insurance', labelKey: 'insurance', icon: Shield },
  { to: '/profile', labelKey: 'profile', icon: UserRound }
]

export function PatientShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const [abhaInfo, setAbhaInfo] = useState<{ masked: string | null; linkStatus: string | null }>({
    masked: null,
    linkStatus: null
  })

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('patient_profiles')
      .select('abha_number_masked, abha_link_status')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAbhaInfo({
            masked: data.abha_number_masked,
            linkStatus: data.abha_link_status
          })
        }
      })
  }, [profile?.id])

  const hindi = language === 'Hindi'

  function listenCurrentPage() {
    const activeItem = patientNavItems.find(i => i.to === route)
    const label = activeItem ? t('nav', activeItem.labelKey) : 'SwasthyaSetu'
    const msg = hindi
      ? `आप स्वास्थ सेतु के ${label} पेज पर हैं। नीचे आपकी स्वास्थ्य जानकारी और सेवाएँ उपलब्ध हैं।`
      : `You are on the ${label} page of SwasthyaSetu. Your health records and services are available below.`
    speakText(msg, language)
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* CONSUMER HEALTHCARE HEADER */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 lg:px-6">
          {/* BRAND */}
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
                <HeartPulse className="size-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold text-foreground text-base tracking-tight leading-tight">
                    SwasthyaSetu
                  </p>
                  <span className="rounded-md bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal">
                    Patient
                  </span>
                </div>
                <p className="hidden text-[11px] text-muted-foreground sm:block leading-none mt-0.5">
                  {hindi ? 'जुड़ी हुई स्वास्थ्य सेवा' : 'Connected Patient Care'}
                </p>
              </div>
            </div>
          </div>

          {/* HEADER CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* ABHA BADGE */}
            {abhaInfo.linkStatus && (
              <div className="hidden md:flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs">
                <ShieldCheck className="size-3.5 text-teal" />
                <span className="font-medium text-muted-foreground text-[11px]">
                  ABHA: {abhaInfo.masked ?? abhaInfo.linkStatus}
                </span>
              </div>
            )}

            {/* VOICE AUDIO READER */}
            <button
              type="button"
              onClick={listenCurrentPage}
              title={hindi ? 'पेज सुनें' : 'Listen to page'}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground hover:bg-secondary"
            >
              <Volume2 className="size-3.5 text-primary" />
              <span className="hidden sm:inline">{hindi ? 'सुनें' : 'Listen'}</span>
            </button>

            {/* BILINGUAL TOGGLE */}
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

            {/* USER & SIGN OUT */}
            <div className="flex items-center gap-2 pl-1">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground font-semibold text-xs transition hover:ring-2 hover:ring-primary/20"
                title={profile?.full_name ?? 'Profile'}
              >
                {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : <UserRound className="size-4" />}
              </button>

              <Button
                variant="ghost"
                size="sm"
                aria-label={t('common', 'signOut')}
                onClick={() => void signOut()}
                className="hidden sm:inline-flex text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <div className="mx-auto flex w-full max-w-[1500px] flex-1">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-border bg-sidebar p-4 lg:flex flex-col justify-between">
          <nav className="space-y-1">
            <p className="px-3 pb-2 label-xs text-muted-foreground font-bold">
              {hindi ? 'रोगी सेवाएँ' : 'My Healthcare'}
            </p>
            {patientNavItems.map(item => {
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
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition select-none ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-sidebar-foreground hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 shrink-0" />
                    <span>{label}</span>
                  </div>
                  {item.to === '/medicines' ? (
                    <span className="rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-teal">
                      Daily
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          {/* HELPLINE CALLOUT */}
          <div className="mt-6 rounded-xl border border-border bg-surface-subtle p-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground font-semibold">
              <PhoneCall className="size-3.5 text-primary" />
              <span>{hindi ? 'आपातकालीन सहायता' : 'Emergency Help'}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              National: <strong className="text-foreground">112</strong> · Ayushman: <strong className="text-foreground">14555</strong>
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
                    <HeartPulse className="size-5 text-primary" />
                    <p className="font-display font-bold">SwasthyaSetu</p>
                  </div>
                  <button onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {patientNavItems.map(item => {
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
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                          active
                            ? 'bg-primary/10 text-primary'
                            : 'text-foreground hover:bg-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="size-4" />
                          <span>{label}</span>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground opacity-50" />
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

        {/* CONTENT AREA */}
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR FOR PATIENT */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-2 py-1.5 flex items-center justify-around">
        <button
          type="button"
          onClick={() => navigate('/')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-semibold transition ${
            route === '/' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <HeartPulse className="size-4" />
          <span>{hindi ? 'होम' : 'Home'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/appointments')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-semibold transition ${
            route === '/appointments' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <CalendarCheck className="size-4" />
          <span>{hindi ? 'मुलाकात' : 'Appts'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/medicines')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-semibold transition ${
            route === '/medicines' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Pill className="size-4" />
          <span>{hindi ? 'दवाइयाँ' : 'Meds'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/records')}
          className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-semibold transition ${
            route === '/records' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <FileText className="size-4" />
          <span>{hindi ? 'रिपोर्ट्स' : 'Records'}</span>
        </button>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-semibold text-muted-foreground"
        >
          <Menu className="size-4" />
          <span>{hindi ? 'मेनू' : 'More'}</span>
        </button>
      </nav>
    </div>
  )
}
