import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Activity,
  CalendarCheck,
  FileText,
  HeartPulse,
  LogOut,
  Menu,
  Pill,
  UserRound,
  Users,
  X
} from 'lucide-react'

import { Button } from '../kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import type { AppRole } from '@/lib/types'

type AncillaryItem = {
  to: string
  labelKey: string
  icon: typeof HeartPulse
}

export function AncillaryShell({
  role,
  children
}: {
  role: AppRole
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const route = useRoute()
  const [open, setOpen] = useState(false)

  const isPharmacy = role === 'PHARMACY'
  const isLab = role === 'LAB'
  const isWorker = role === 'WORKER'

  const title = isPharmacy
    ? 'Pharmacy & Dispensary'
    : isLab
      ? 'Diagnostic Laboratory'
      : isWorker
        ? 'Community Health Worker'
        : `${role} Workspace`

  const navItems: AncillaryItem[] = isPharmacy
    ? [
        { to: '/', labelKey: 'dashboard', icon: HeartPulse },
        { to: '/pharmacy', labelKey: 'pharmacy', icon: Pill },
        { to: '/medicines', labelKey: 'medicines', icon: Pill },
        { to: '/prescriptions', labelKey: 'prescriptions', icon: FileText },
        { to: '/profile', labelKey: 'profile', icon: UserRound }
      ]
    : isLab
      ? [
          { to: '/', labelKey: 'dashboard', icon: HeartPulse },
          { to: '/lab', labelKey: 'diagnostics', icon: Activity },
          { to: '/profile', labelKey: 'profile', icon: UserRound }
        ]
      : isWorker
        ? [
            { to: '/', labelKey: 'dashboard', icon: HeartPulse },
            { to: '/follow-up', labelKey: 'followUp', icon: CalendarCheck },
            { to: '/care', labelKey: 'care', icon: Users },
            { to: '/profile', labelKey: 'profile', icon: UserRound }
          ]
        : [
            { to: '/', labelKey: 'dashboard', icon: HeartPulse },
            { to: '/profile', labelKey: 'profile', icon: UserRound }
          ]

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans">
      <header className="sticky top-0 z-30 border-b border-border bg-card/98 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden -ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
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
                {isPharmacy ? (
                  <Pill className="size-5" />
                ) : isLab ? (
                  <Activity className="size-5" />
                ) : (
                  <Users className="size-5" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display font-bold text-foreground text-base tracking-tight leading-tight">
                    SwasthyaSetu
                  </p>
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground border border-border">
                    {role}
                  </span>
                </div>
                <p className="hidden text-[11px] text-muted-foreground sm:block leading-none mt-0.5 font-medium">
                  {title}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('English')}
                className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold transition ${
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
                className={`min-h-10 rounded-md px-3 py-2 text-xs font-semibold transition ${
                  language === 'Hindi'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                हिन्दी
              </button>
            </div>

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

      <div className="mx-auto flex w-full max-w-[1500px] flex-1">
        <aside className="hidden min-h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-border bg-sidebar p-3 lg:block">
          <nav className="space-y-1">
            <p className="px-3 py-1.5 label-xs text-muted-foreground font-bold">
              {title}
            </p>
            {navItems.map(item => {
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
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition select-none ${
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-sidebar-foreground hover:bg-secondary'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

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
                  <p className="font-display font-bold">{title}</p>
                  <button onClick={() => setOpen(false)} aria-label="Close menu">
                    <X className="size-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {navItems.map(item => {
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
                        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
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

        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-7">
          {children}
        </main>
      </div>
    </div>
  )
}
