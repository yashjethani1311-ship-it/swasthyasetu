import type { ReactNode } from 'react'
import { Activity, CalendarCheck, FileText, HeartPulse, Hospital, LogOut, Menu, Pill, ShieldCheck, Stethoscope, UserRound, X } from 'lucide-react'
import { Button } from './kit'
import { navigate, useRoute } from '@/lib/route'
import { useAuth } from '@/lib/auth'
import { useState } from 'react'
import type { AppRole } from '@/lib/types'

const items: Array<{ to: string; label: string; icon: typeof HeartPulse; roles: AppRole[] | 'ALL' }> = [
  { to: '/', label: 'Dashboard', icon: HeartPulse, roles: 'ALL' },
  { to: '/appointments', label: 'Appointments', icon: CalendarCheck, roles: ['PATIENT','DOCTOR'] },
  { to: '/records', label: 'Health Records', icon: FileText, roles: ['PATIENT','DOCTOR'] },
  { to: '/prescriptions', label: 'Prescriptions', icon: Stethoscope, roles: ['PATIENT','DOCTOR','PHARMACY'] },
  { to: '/lab', label: 'Diagnostics', icon: Activity, roles: ['PATIENT','DOCTOR','LAB'] },
  { to: '/medicines', label: 'Medicines', icon: Pill, roles: ['PATIENT','PHARMACY','DOCTOR'] },
  { to: '/facilities', label: 'Facilities', icon: Hospital, roles: ['PATIENT','DOCTOR','FACILITY','ADMIN'] },
  { to: '/insurance', label: 'Insurance', icon: ShieldCheck, roles: ['PATIENT'] },
  { to: '/profile', label: 'Profile', icon: UserRound, roles: 'ALL' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const route = useRoute()
  const [open, setOpen] = useState(false)
  const nav = items.filter(i => i.roles === 'ALL' || (profile && i.roles.includes(profile.role)))

  return <div className="min-h-screen bg-surface">
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><HeartPulse className="size-5" /></div>
          <div><p className="font-display font-bold">SwasthyaSetu</p><p className="text-[11px] text-muted-foreground">Connected care, real data only</p></div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:inline">{profile?.role}</span>
          <Button variant="outline" size="sm" onClick={() => signOut()}><LogOut className="size-4"/> Sign out</Button>
        </div>
      </div>
    </header>
    <div className="mx-auto flex max-w-[1500px]">
      <aside className="hidden min-h-[calc(100vh-4rem)] w-64 border-r border-border bg-sidebar p-4 lg:block">
        <Nav nav={nav} route={route} />
      </aside>
      {open && <div className="fixed inset-0 z-50 lg:hidden"><button className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} /><aside className="relative h-full w-72 bg-card p-4 shadow-2xl"><div className="mb-5 flex justify-end"><button onClick={() => setOpen(false)}><X /></button></div><Nav nav={nav} route={route} onGo={() => setOpen(false)} /></aside></div>}
      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">{children}</main>
    </div>
  </div>
}

function Nav({ nav, route, onGo }: { nav: typeof items; route: string; onGo?: () => void }) {
  return <nav className="space-y-1">{nav.map(item => { const Icon = item.icon; const active = route === item.to; return <button key={item.to} onClick={() => { navigate(item.to); onGo?.() }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-sidebar-accent text-primary' : 'text-sidebar-foreground hover:bg-secondary'}`}><Icon className="size-4"/>{item.label}</button> })}</nav>
}
