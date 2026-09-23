import { useEffect, useState } from 'react'
import {
  Pill,
  Clock,
  AlertCircle,
  FileText,
  Volume2,
  Calendar,
  CheckCircle2,
  ShoppingBag,
  Info
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, SectionTitle, SkeletonCard } from '@/components/kit'
import { useAuth } from '@/lib/auth'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { speakText } from '@/lib/voice'
import { navigate } from '@/lib/route'

type MedicineItem = {
  id: string
  prescription_id: string
  medicine_name: string
  strength: string | null
  dose: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  instructions: string | null
  quantity_prescribed: number | null
  doctor_name?: string | null
  issued_at: string
  prescription_status: string
  fulfilment_status: string | null
  dispensed_quantity: number
}

export function MedicinesPage() {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [loading, setLoading] = useState(true)
  const [medicines, setMedicines] = useState<MedicineItem[]>([])
  const [activeTab, setActiveTab] = useState<'active' | 'all'>('active')
  const [error, setError] = useState('')

  useEffect(() => {
    loadMedicines()
  }, [profile?.id])

  async function loadMedicines() {
    if (!profile?.id) return
    setLoading(true)
    setError('')

    try {
      // 1. Get patient id
      const { data: patient, error: pErr } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (pErr) throw pErr
      if (!patient) {
        setLoading(false)
        return
      }

      // 2. Query real prescriptions with prescription items and fulfilment
      const { data: rxList, error: rxErr } = await supabase
        .from('prescriptions')
        .select(`
          id,
          issued_at,
          status,
          doctor_provider_id,
          provider_profiles(full_name),
          prescription_items(
            id,
            medicine_name,
            strength,
            dose,
            route,
            frequency,
            duration,
            instructions,
            quantity_prescribed
          ),
          prescription_fulfilments(
            status
          )
        `)
        .eq('patient_id', patient.id)
        .order('issued_at', { ascending: false })

      if (rxErr) throw rxErr

      if (!rxList || rxList.length === 0) {
        setMedicines([])
        setLoading(false)
        return
      }

      // 3. Query dispense events for items to see dispensed units
      const itemIds = rxList.flatMap(rx =>
        ((rx.prescription_items as unknown as Array<{ id: string }>) || []).map(i => i.id)
      )

      let dispenseMap: Record<string, number> = {}
      if (itemIds.length > 0) {
        const { data: dEvents, error: dErr } = await supabase
          .from('dispense_events')
          .select('prescription_item_id, quantity_dispensed')
          .in('prescription_item_id', itemIds)

        if (!dErr && dEvents) {
          for (const ev of dEvents) {
            dispenseMap[ev.prescription_item_id] =
              (dispenseMap[ev.prescription_item_id] || 0) + (ev.quantity_dispensed || 0)
          }
        }
      }

      // Flatten items into user-friendly medicine entries
      const flattened: MedicineItem[] = []
      for (const rx of rxList) {
        const docName = (rx.provider_profiles as unknown as { full_name?: string })?.full_name ?? 'Doctor'
        const items = (rx.prescription_items as unknown as Array<Omit<MedicineItem, 'doctor_name' | 'issued_at' | 'prescription_status' | 'fulfilment_status' | 'dispensed_quantity'>>) || []
        const fulfilments = (rx.prescription_fulfilments as unknown as Array<{ status: string }>) || []
        const fulStatus = fulfilments[0]?.status ?? null

        for (const it of items) {
          flattened.push({
            ...it,
            doctor_name: docName,
            issued_at: rx.issued_at,
            prescription_status: rx.status,
            fulfilment_status: fulStatus,
            dispensed_quantity: dispenseMap[it.id] || 0
          })
        }
      }

      setMedicines(flattened)
    } catch (e: unknown) {
      console.error('Error loading medicines:', e)
      setError(e instanceof Error ? e.message : 'Unable to load medicines.')
    } finally {
      setLoading(false)
    }
  }

  const activeMeds = medicines.filter(
    m => m.prescription_status === 'ACTIVE' || m.prescription_status === 'PARTIALLY DISPENSED'
  )
  const displayedMeds = activeTab === 'active' ? activeMeds : medicines

  function speakDosage(m: MedicineItem) {
    const text = hindi
      ? `दवाई का नाम: ${m.medicine_name} ${m.strength || ''}। खुराक: ${m.dose || ''}। समय: ${m.frequency || ''}। निर्देश: ${m.instructions || 'पानी के साथ लें'}।`
      : `Medicine: ${m.medicine_name} ${m.strength || ''}. Dosage: ${m.dose || ''}. Frequency: ${m.frequency || ''}. Instructions: ${m.instructions || 'Take as directed'}.`
    speakText(text, language)
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">
            {hindi ? 'मेरी दवाइयाँ (दैनिक खुराक)' : 'My Medicines (Daily Regimen)'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'आपकी सक्रिय दवाइयों की खुराक, समय और फार्मेसी वितरण की स्थिति।'
              : 'Your active medication schedule, dosages, directions, and pharmacy collection status.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/prescriptions')}
          >
            <FileText className="size-4 mr-1.5" />
            {hindi ? 'पर्ची दस्तावेज़ देखें' : 'View Prescriptions'}
          </Button>
        </div>
      </div>

      {/* CONCEPT SEPARATION BANNER */}
      <Card tinted className="border-info/30 bg-info/5 p-4">
        <div className="flex items-start gap-3">
          <Info className="size-5 text-info shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">
              {hindi ? 'दवाइयों का शेड्यूल बनाम डॉक्टर की पर्ची:' : 'Medications vs Doctor’s Prescription:'}
            </strong>{' '}
            {hindi
              ? 'यहाँ आप अपनी चालू दवाइयों की दैनिक खुराक व निर्देश देख सकते हैं। आधिकारिक डिजिटल पर्ची डाउनलोड करने या दुकान चुनने के लिए पर्ची पेज पर जाएँ।'
              : 'This page tracks your active daily medication schedule, intake frequency, and dispensed units. To download the stamped legal prescription or assign an approved pharmacy, visit the Prescriptions page.'}
          </div>
        </div>
      </Card>

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'active'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {hindi ? `सक्रिय दवाइयाँ (${activeMeds.length})` : `Active Regimen (${activeMeds.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'all'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {hindi ? `सभी दवाइयाँ (${medicines.length})` : `All Prescribed Medicines (${medicines.length})`}
        </button>
      </div>

      {/* ERROR */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : displayedMeds.length === 0 ? (
        <Card>
          <EmptyState
            text={
              hindi
                ? activeTab === 'active'
                  ? 'अभी कोई सक्रिय दवाई का शेड्यूल नहीं है। जब डॉक्टर पर्ची लिखेंगे, दवाइयाँ यहाँ दिखेंगी।'
                  : 'आपके खाते में कोई दवाइयाँ दर्ज नहीं हैं।'
                : activeTab === 'active'
                  ? 'No active medicines right now. Prescribed medications will appear here once issued by your doctor.'
                  : 'No medicines have been prescribed yet.'
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayedMeds.map(m => {
            const isFullyDispensed =
              m.quantity_prescribed !== null &&
              m.dispensed_quantity >= m.quantity_prescribed
            const remaining =
              m.quantity_prescribed !== null
                ? Math.max(0, m.quantity_prescribed - m.dispensed_quantity)
                : null

            return (
              <Card key={m.id} className="flex flex-col justify-between border-border hover:border-primary/30 transition">
                <div>
                  {/* TOP ROW: NAME & STATUS */}
                  <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-start gap-2.5">
                      <div className="grid size-9 place-items-center rounded-lg bg-teal/15 text-teal shrink-0">
                        <Pill className="size-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground">
                          {m.medicine_name}
                        </h3>
                        {m.strength && (
                          <span className="text-xs font-semibold text-muted-foreground">
                            {m.strength}
                          </span>
                        )}
                      </div>
                    </div>

                    <Badge tone={isFullyDispensed ? 'success' : m.dispensed_quantity > 0 ? 'warning' : 'primary'}>
                      {isFullyDispensed
                        ? (hindi ? 'दवा मिल गई' : 'Dispensed')
                        : m.dispensed_quantity > 0
                          ? (hindi ? 'आंशिक मिली' : 'Partial')
                          : (hindi ? 'लेना बाकी' : 'To Collect')}
                    </Badge>
                  </div>

                  {/* DOSAGE & TIMING */}
                  <div className="mt-3.5 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="label-xs">{hindi ? 'खुराक' : 'Dose'}</p>
                      <p className="mt-0.5 font-semibold text-foreground">
                        {m.dose || '—'} {m.route ? `(${m.route})` : ''}
                      </p>
                    </div>

                    <div>
                      <p className="label-xs">{hindi ? 'समय / आवृत्ति' : 'Frequency'}</p>
                      <p className="mt-0.5 font-semibold text-foreground flex items-center gap-1">
                        <Clock className="size-3 text-primary shrink-0" />
                        <span>{m.frequency || 'As directed'}</span>
                      </p>
                    </div>

                    {m.duration && (
                      <div>
                        <p className="label-xs">{hindi ? 'अवधि' : 'Duration'}</p>
                        <p className="mt-0.5 font-medium text-foreground flex items-center gap-1">
                          <Calendar className="size-3 text-muted-foreground" />
                          <span>{m.duration}</span>
                        </p>
                      </div>
                    )}

                    {m.quantity_prescribed !== null && (
                      <div>
                        <p className="label-xs">{hindi ? 'कुल मात्रा' : 'Units'}</p>
                        <p className="mt-0.5 font-medium text-foreground font-tabular">
                          {m.dispensed_quantity} / {m.quantity_prescribed}{' '}
                          {remaining !== null && remaining > 0 ? (
                            <span className="text-warning-foreground font-semibold">({remaining} remaining)</span>
                          ) : null}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* INSTRUCTIONS */}
                  {m.instructions && (
                    <div className="mt-3 rounded-lg border border-border bg-surface-subtle p-2 text-xs">
                      <span className="font-semibold text-foreground">
                        {hindi ? 'डॉक्टर का निर्देश: ' : 'Directions: '}
                      </span>
                      <span className="text-muted-foreground">{m.instructions}</span>
                    </div>
                  )}
                </div>

                {/* FOOTER & ACTIONS */}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
                  <span>
                    {hindi ? 'डॉक्टर:' : 'Prescribed by:'} {m.doctor_name} · {new Date(m.issued_at).toLocaleDateString()}
                  </span>

                  <button
                    type="button"
                    onClick={() => speakDosage(m)}
                    title={hindi ? 'खुराक निर्देश सुनें' : 'Listen to dosage'}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10 transition"
                  >
                    <Volume2 className="size-3.5" />
                    <span>{hindi ? 'सुनें' : 'Listen'}</span>
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
