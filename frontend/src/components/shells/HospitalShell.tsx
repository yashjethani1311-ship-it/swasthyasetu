import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import {
  Activity,
  Bed,
  Building2,
  CalendarCheck,
  CreditCard,
  FileBarChart,
  FileText,
  HeartPulse,
  Hospital,
  Layers,
  Link2,
  LogOut,
  Menu,
  Pill,
  Shield,
  Stethoscope,
  Truck,
  UserPlus,
  Users,
  X,
  Clock
} from 'lucide-react'

import { Button } from '../kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

type NavGroup = {
  title: string
  titleHi: string
  items: {
    to: string
    labelKey: string
    icon: typeof Hospital
    badge?: string
  }[]
}

const hospitalNavGroups: NavGroup[] = [
  {
    title: 'Command & Front Desk',
    titleHi: 'कमांड और स्वागत',
    items: [
      { to: '/', labelKey: 'commandCentre', icon: Building2 },
      { to: '/hospital/reception', labelKey: 'reception', icon: UserPlus }
    ]
  },
  {
    title: 'Clinical & Outpatient',
    titleHi: 'क्लिनिकल और ओपीडी',
    items: [
      { to: '/appointments', labelKey: 'appointments', icon: CalendarCheck },
      { to: '/hospital/opd', labelKey: 'opdQueue', icon: Stethoscope },
      { to: '/hospital/patients', labelKey: 'patients', icon: Users },
      { to: '/hospital/departments', labelKey: 'departments', icon: Layers },
      { to: '/hospital/staff', labelKey: 'staff', icon: Users },
      { to: '/hospital/schedules', labelKey: 'schedules', icon: Clock }
    ]
  },
  {
    title: 'Inpatient & Emergency',
    titleHi: 'भर्ती और आपातकाल',
    items: [
      { to: '/hospital/beds', labelKey: 'beds', icon: Bed },
      { to: '/hospital/ipd', labelKey: 'ipd', icon: Building2 },
      { to: '/hospital/emergency', labelKey: 'emergency', icon: HeartPulse }
    ]
  },
  {
    title: 'Ancillary Services',
    titleHi: 'सहायक सेवाएँ',
    items: [
      { to: '/lab', labelKey: 'diagnostics', icon: Activity },
      { to: '/pharmacy', labelKey: 'medicines', icon: Pill },
      { to: '/hospital/inventory', labelKey: 'inventory', icon: Truck }
    ]
  },
  {
    title: 'Finance, MIS & Integration',
    titleHi: 'वित्त, प्रबंधन और एकीकरण',
    items: [
      { to: '/hospital/billing', labelKey: 'billing', icon: CreditCard },
      { to: '/insurance', labelKey: 'insurance', icon: Shield },
      { to: '/hospital/referrals', labelKey: 'referrals', icon: FileText },
      { to: '/hospital/reports', labelKey: 'reports', icon: FileBarChart },
      { to: '/hospital/integrations', labelKey: 'integrations', icon: Link2 },
      { to: '/profile', labelKey: 'profile', icon: Hospital }
    ]
  },
  {
    title: 'Governance',
    titleHi: 'गवर्नेंस',
    items: [
      { to: '/admin', labelKey: 'adminGovernance', icon: Shield }
    ]
  }
]

export function HospitalShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const [facilityName, setFacilityName] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('provider_profiles')
      .select('organization_name')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.organization_name) setFacilityName(data.organization_name)
      })
  }, [profile?.id])

  const hindi = language === 'Hindi'

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans">
      {/* ENTERPRISE HMIS HEADER */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/98 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1750px] items-center justify-between px-4 lg:px-6">
          {/* BRAND & FACILITY DETAILS */}
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
                <Hospital className="size-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold text-foreground text-base tracking-tight leading-tight">
                    SwasthyaSetu
                  </p>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground border border-border">
                    HIS / HMIS
                  </span>
                </div>
                <p className="hidden text-[11px] text-muted-foreground sm:block leading-none mt-0.5 font-medium">
                  {facilityName ?? (hindi ? 'अस्पताल प्रबंधन प्रणाली' : 'Hospital Operations System')}
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: OPERATIONS STATUS & CONTROLS */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* SHIFT STATUS */}
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-1 text-xs">
              <span className="size-2 rounded-full bg-muted-foreground" />
              <span className="font-semibold text-foreground">Facility workspace</span>
              <span className="text-muted-foreground border-l border-border pl-2 font-tabular">
                Shift status not recorded
              </span>
            </div>

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
      <div className="mx-auto flex w-full max-w-[1750px] flex-1">
        {/* ENTERPRISE SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-border bg-sidebar p-3 lg:block overflow-y-auto max-h-[calc(100vh-4rem)]">
          <div className="space-y-4">
            {hospitalNavGroups.map(group => (
              <div key={group.title}>
                <p className="px-3 py-1 label-xs text-muted-foreground font-bold tracking-wider">
                  {hindi ? group.titleHi : group.title}
                </p>
                <nav className="space-y-0.5 mt-1">
                  {group.items.map(item => {
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
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition select-none ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'text-sidebar-foreground hover:bg-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className="size-3.5 shrink-0" />
                          <span className="truncate">{label}</span>
                        </div>
                      </button>
                    )
                  })}
                </nav>
              </div>
            ))}
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
            <aside className="relative h-full w-80 bg-card p-4 shadow-2xl flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <Hospital className="size-5 text-primary" />
                    <p className="font-display font-bold">HIS Operations</p>
                  </div>
                  <button onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {hospitalNavGroups.map(group => (
                    <div key={group.title}>
                      <p className="px-2 py-1 label-xs text-muted-foreground font-bold">
                        {hindi ? group.titleHi : group.title}
                      </p>
                      <nav className="space-y-1">
                        {group.items.map(item => {
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
                              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
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
                  ))}
                </div>
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

        {/* ENTERPRISE MAIN CONTENT */}
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}
