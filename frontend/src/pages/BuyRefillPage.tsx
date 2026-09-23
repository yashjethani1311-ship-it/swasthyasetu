import { useEffect, useState } from 'react'
import {
  ShoppingBag,
  Pill,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Card, Badge, Button, TruthfulEmptyState } from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { navigate } from '@/lib/route'
import { errorText } from '@/lib/diagnostics/service'

/* ──────────────────────────── Types ───────────────────────────────── */
type RxItem = {
  id: string
  medicine_name: string
  strength: string | null
  dose: string | null
  frequency: string | null
  duration: string | null
  quantity_prescribed: number | null
  dispensed: number
}

type PrescriptionWithItems = {
  id: string
  status: string
  created_at: string
  pharmacy_provider_id: string | null
  pharmacy_name: string | null
  items: RxItem[]
}

/* ═══════════════════════════ MAIN PAGE ══════════════════════════════ */
export function BuyRefillPage() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [prescriptions, setPrescriptions] = useState<PrescriptionWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!profile?.id) return
    loadPrescriptions()
  }, [profile?.id])

  async function loadPrescriptions() {
    if (!profile?.id) return
    setLoading(true)
    try {
      const { data: patientData, error: pErr } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle()
      if (pErr || !patientData) throw pErr ?? new Error('Patient profile not found')

      const { data, error: rxErr } = await supabase
        .from('prescriptions')
        .select(`
          id, status, issued_at,
          prescription_items (id, medicine_name, strength, dose, frequency, duration, quantity_prescribed,
            dispense_events (id, quantity)),
          prescription_fulfilments (pharmacy_provider_id, status)
        `)
        .eq('patient_id', patientData.id)
        .in('status', ['ACTIVE', 'DISPENSED'])
        .order('issued_at', { ascending: false })
        .limit(20)
      if (rxErr) throw rxErr

      // Get pharmacy name for each prescription
      const pharmacyIds = [...new Set((data ?? []).map(r => r.prescription_fulfilments?.[0]?.pharmacy_provider_id).filter(Boolean))]
      let pharmacyMap: Record<string, string> = {}
      if (pharmacyIds.length > 0) {
        const { data: pharmacies } = await supabase
          .from('provider_profiles')
          .select('id, organization_name, full_name')
          .in('id', pharmacyIds as string[])
        for (const p of pharmacies ?? []) {
          pharmacyMap[p.id] = p.organization_name || p.full_name
        }
      }

      const enriched: PrescriptionWithItems[] = (data ?? []).map((rx: any) => {
        const items: RxItem[] = (rx.prescription_items ?? []).map((item: any) => ({
          id: item.id,
          medicine_name: item.medicine_name,
          strength: item.strength,
          dose: item.dose,
          frequency: item.frequency,
          duration: item.duration,
          quantity_prescribed: item.quantity_prescribed,
          dispensed: (item.dispense_events ?? []).reduce((sum: number, event: { quantity: number }) => sum + Number(event.quantity), 0),
        }))

        return {
          id: rx.id,
          status: rx.prescription_fulfilments?.[0]?.status ?? rx.status,
          created_at: rx.issued_at,
          pharmacy_provider_id: rx.prescription_fulfilments?.[0]?.pharmacy_provider_id ?? null,
          pharmacy_name: pharmacyMap[rx.prescription_fulfilments?.[0]?.pharmacy_provider_id] ?? null,
          items,
        }
      })

      setPrescriptions(enriched)
      setError('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  const filtered = prescriptions.filter(rx =>
    rx.items.some(i =>
      i.medicine_name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {hindi ? 'दवाइयाँ खरीदें / दोबारा मँगाएँ' : 'Buy & Refill Medicines'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hindi
                ? 'डॉक्टर द्वारा लिखी पर्ची से दवाइयाँ लें। बिना पर्ची की दवाइयाँ सीधे फार्मेसी से लें।'
                : 'Collect prescribed medicines or purchase OTC medicines from a nearby pharmacy.'}
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShoppingBag className="size-6" />
          </span>
        </div>
      </section>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder={hindi ? 'दवा का नाम खोजें…' : 'Search medicine name…'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Sections */}
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">
          {hindi ? 'डॉक्टर की पर्चियाँ और दवा संग्रह' : 'Prescriptions & Medicine Collection'}
        </h2>

        {loading && (
          <p className="text-sm text-muted-foreground animate-pulse">
            {hindi ? 'पर्चियाँ लोड हो रही हैं…' : 'Loading prescriptions…'}
          </p>
        )}

        {error && (
          <Card className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{error}</span>
          </Card>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Card className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? (hindi ? `"${searchQuery}" नाम की दवा वाली कोई पर्ची नहीं मिली।` : `No prescriptions found for "${searchQuery}".`)
                : (hindi ? 'कोई सक्रिय पर्ची नहीं है।' : 'No active prescriptions.')}
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate('/appointments')}>
              {hindi ? 'डॉक्टर से मिलें' : 'Book a Consultation'}
            </Button>
          </Card>
        )}

        {filtered.map(rx => (
          <PrescriptionCard key={rx.id} rx={rx} hindi={hindi} />
        ))}
      </section>

      {/* OTC section */}
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">
          {hindi ? 'बिना पर्ची की दवाइयाँ (OTC)' : 'Over-the-Counter Medicines (OTC)'}
        </h2>
        <TruthfulEmptyState
          title={hindi ? 'OTC खरीद — जल्द आ रहा है' : 'OTC Purchase — Coming Soon'}
          description={hindi
            ? 'बिना पर्ची की दवाइयाँ ऑनलाइन खरीदने की सुविधा के लिए नजदीकी स्वीकृत फार्मेसी से सीधे संपर्क करें।'
            : 'For OTC medicines, visit your nearest approved pharmacy directly. Online OTC ordering through SwasthyaSetu requires pharmacy catalogue integration.'}
          schemaContractNotice={`OTC ordering requires:
• public.otc_pharmacy_listings (id, pharmacy_provider_id, medicine_name, selling_price, stock_qty)
• public.otc_orders (id, patient_id, pharmacy_id, items_json, total_amount, status)
• RPC: otc_place_order(p_pharmacy, p_items) — server-validates availability
• This schema does not yet exist. Contact your nearest pharmacy directly.`}
        />
        <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/5 p-3">
          <Info className="size-4 shrink-0 text-info mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {hindi
              ? 'OTC दवाइयाँ किसी भी फार्मेसी से बिना पर्ची के मिलती हैं। SwasthyaSetu का ऑनलाइन OTC ऑर्डर जल्द उपलब्ध होगा।'
              : 'OTC medicines are available at any pharmacy without a prescription. SwasthyaSetu online OTC ordering is coming soon.'}
          </p>
        </div>
      </section>

      {/* Nearby pharmacy finder */}
      <section className="space-y-3">
        <h2 className="font-semibold text-foreground">
          {hindi ? 'नजदीकी फार्मेसी खोजें' : 'Find a Nearby Pharmacy'}
        </h2>
        <Button variant="outline" onClick={() => navigate('/facilities')}>
          <Package className="size-4 mr-2" />
          {hindi ? 'सभी स्वास्थ्य केंद्र देखें' : 'Browse Health Facilities & Pharmacies'}
          <ChevronRight className="size-4 ml-1" />
        </Button>
      </section>
    </div>
  )
}

/* ─────────────────────── PrescriptionCard ───────────────────────── */
function PrescriptionCard({ rx, hindi }: { rx: PrescriptionWithItems; hindi: boolean }) {
  const totalPrescribed = rx.items.reduce((sum, i) => sum + (i.quantity_prescribed ?? 0), 0)
  const totalDispensed = rx.items.reduce((sum, i) => sum + i.dispensed, 0)
  const isFullyDispensed = rx.items.length > 0 && rx.items.every(i => i.quantity_prescribed != null && i.quantity_prescribed > 0 && i.dispensed >= i.quantity_prescribed)
  const hasPharmacy = !!rx.pharmacy_provider_id

  const statusColor =
    rx.status === 'DISPENSED' || isFullyDispensed
      ? 'success'
      : rx.status === 'PARTIAL'
        ? 'warning'
        : 'primary'

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {hindi ? 'पर्ची तारीख:' : 'Prescribed:'}{' '}
            {new Date(rx.created_at).toLocaleDateString([], { dateStyle: 'medium' })}
          </p>
          {rx.pharmacy_name && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {hindi ? 'फार्मेसी:' : 'Pharmacy:'} {rx.pharmacy_name}
            </p>
          )}
        </div>
        <Badge tone={statusColor}>
          {isFullyDispensed
            ? (hindi ? 'सभी दवाइयाँ मिल गईं' : 'Fully Dispensed')
            : rx.status === 'PARTIAL'
              ? (hindi ? 'कुछ दवाइयाँ मिलीं' : 'Partially Dispensed')
              : (hindi ? 'सक्रिय' : 'Active')}
        </Badge>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {rx.items.map(item => {
          const dispensed = item.dispensed
          const prescribed = item.quantity_prescribed
          const itemDone = prescribed !== null && dispensed >= prescribed

          return (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                itemDone ? 'border-success/20 bg-success/5' : 'border-border bg-background'
              }`}
            >
              <div className="flex items-start gap-2">
                {itemDone ? (
                  <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />
                ) : (
                  <Pill className="size-4 text-primary mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-sm text-foreground">
                    {item.medicine_name}
                    {item.strength ? ` ${item.strength}` : ''}
                  </p>
                  {(item.dose || item.frequency || item.duration) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[item.dose, item.frequency, item.duration].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {prescribed !== null ? (
                  <p className="text-xs font-semibold text-foreground">
                    {dispensed}/{prescribed} {hindi ? 'इकाई' : 'units'}
                  </p>
                ) : (
                  <p className="text-xs text-warning-foreground">
                    {hindi ? 'मात्रा दर्ज नहीं' : 'Qty not recorded'}
                  </p>
                )}
                {itemDone && (
                  <p className="text-xs text-success font-medium">{hindi ? 'मिल गई' : 'Dispensed'}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Action */}
      {!isFullyDispensed && (
        <div className="flex items-center gap-2 pt-1">
          {!hasPharmacy ? (
            <>
              <AlertTriangle className="size-4 text-warning shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                {hindi
                  ? 'दवाइयाँ लेने के लिए पहले फार्मेसी चुनें।'
                  : 'Choose a pharmacy first to collect your medicines.'}
              </p>
              <Button size="sm" onClick={() => navigate('/prescriptions')}>
                {hindi ? 'फार्मेसी चुनें' : 'Choose Pharmacy'}
              </Button>
            </>
          ) : (
            <>
              <Clock className="size-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground flex-1">
                {hindi
                  ? `${rx.pharmacy_name ?? 'आपकी फार्मेसी'} से दवाइयाँ लेना बाकी है।`
                  : `Collect remaining medicines from ${rx.pharmacy_name ?? 'your pharmacy'}.`}
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate('/prescriptions')}>
                {hindi ? 'पर्ची देखें' : 'View Prescription'}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
