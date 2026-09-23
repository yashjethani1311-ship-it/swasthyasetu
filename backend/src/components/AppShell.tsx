import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  Hospital,
  LogOut,
  Menu,
  Pill,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X
} from 'lucide-react'

import { Button } from './kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import type { AppRole } from '@/lib/types'

type NavItem = {
  to: string
  labelKey: string
  icon: typeof HeartPulse
  roles: AppRole[] | 'ALL'
}

const items: NavItem[] = [
  {to:'/consent',labelKey:'consent',icon:ShieldCheck,roles:['PATIENT']},
  {to:'/care', labelKey:'care', icon:HeartPulse, roles:['PATIENT','DOCTOR']},
  {to:'/follow-up', labelKey:'followUp', icon:CalendarCheck, roles:['WORKER']},
  {
    to: '/',
    labelKey: 'dashboard',
    icon: HeartPulse,
    roles: 'ALL'
  },
  {
    to: '/appointments',
    labelKey: 'appointments',
    icon: CalendarCheck,
    roles: ['PATIENT', 'DOCTOR']
  },
  {
    to: '/records',
    labelKey: 'records',
    icon: FileText,
    roles: ['PATIENT', 'DOCTOR']
  },
  {
    to: '/prescriptions',
    labelKey: 'prescriptions',
    icon: Stethoscope,
    roles: ['PATIENT', 'DOCTOR', 'PHARMACY']
  },
  {
    to: '/lab',
    labelKey: 'diagnostics',
    icon: Activity,
    roles: ['PATIENT', 'DOCTOR', 'LAB', 'FACILITY']
  },
  {
    to: '/medicines',
    labelKey: 'medicines',
    icon: Pill,
    roles: ['PATIENT', 'PHARMACY', 'DOCTOR']
  },
  {
    to: '/facilities',
    labelKey: 'facilities',
    icon: Hospital,
    roles: ['PATIENT', 'DOCTOR', 'FACILITY', 'ADMIN']
  },
  {
    to: '/insurance',
    labelKey: 'insurance',
    icon: ShieldCheck,
    roles: ['PATIENT']
  },
  {
    to: '/profile',
    labelKey: 'profile',
    icon: UserRound,
    roles: 'ALL'
  }
]

export function AppShell({
  children
}: {
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()

  const route = useRoute()
  const [open, setOpen] = useState(false)

  const nav = items.filter(
    item =>
      item.roles === 'ALL' ||
      (profile && item.roles.includes(profile.role))
  )

  return (
    <div className="min-h-screen bg-surface">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 lg:px-6">

          {/* LEFT */}
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>

            <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <HeartPulse className="size-5" />
            </div>

            <div>
              <p className="font-display font-bold">
                SwasthyaSetu
              </p>

              <p className="hidden text-[11px] text-muted-foreground sm:block">
                {language === 'Hindi'
                  ? 'जुड़ी हुई स्वास्थ्य सेवा, वास्तविक डेटा के साथ'
                  : 'Connected care, real data only'}
              </p>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-2 md:gap-3">

            {/* LANGUAGE SWITCH */}
            <div className="flex items-center rounded-lg border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setLanguage('English')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${language === 'English'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                EN
              </button>

              <button
                type="button"
                onClick={() => setLanguage('Hindi')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${language === 'Hindi'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                हिन्दी
              </button>
            </div>

            {/* ROLE */}
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground md:inline">
              {profile?.role}
            </span>

            {/* SIGN OUT */}
            <Button
              variant="outline"
              size="sm"
              aria-label={t('common', 'signOut')}
              onClick={() => signOut()}
            >
              <LogOut className="size-4" />

              <span className="hidden sm:inline">
                {t('common', 'signOut')}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">

        {/* DESKTOP SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-4rem)] w-64 border-r border-border bg-sidebar p-4 lg:block">
          <Nav nav={nav} route={route} />
        </aside>

        {/* MOBILE SIDEBAR */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/30"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            />

            <aside className="relative h-full w-72 bg-card p-4 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <p className="font-display font-bold">
                  SwasthyaSetu
                </p>

                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                >
                  <X className="size-5" />
                </button>
              </div>

              <Nav
                nav={nav}
                route={route}
                onGo={() => setOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* PAGE */}
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

function Nav({
  nav,
  route,
  onGo
}: {
  nav: NavItem[]
  route: string
  onGo?: () => void
}) {
  const { t } = useLanguage()

  return (
    <nav className="space-y-1">
      {nav.map(item => {
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
              onGo?.()
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active
                ? 'bg-sidebar-accent text-primary'
                : 'text-sidebar-foreground hover:bg-secondary'
              }`}
          >
            <Icon className="size-4 shrink-0" />

            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}