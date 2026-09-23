import { useCallback, useEffect, useState } from 'react'
import {
  CreditCard,
  AlertCircle,
  Plus,
  Ban,
  Receipt,
  Search
} from 'lucide-react'
import { Badge, Button, Card, SectionTitle } from '@/components/kit'
import { useLanguage } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { resolveFacilityId, reqId } from '@/lib/facility'

const str = (v: unknown) => (v == null ? null : String(v))
const num = (v: unknown) => (v == null ? 0 : Number(v))

function asRows(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of keys) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[]
    }
  }
  return []
}

// h3_issue supports ONLY these two billing source kinds. Any other source kind
// (notably a bare clinical-encounter id) is intentionally never offered here.
type SourceKind = 'APPOINTMENT' | 'ADMISSION'

type Invoice = {
  id: string
  invoice_number: string | null
  patient_name: string | null
  patient_code: string | null
  total_amount: number
  paid_amount: number
  payment_status: string
  created_at: string | null
  void: boolean
}

// h3_issue invoice line shape (exact): { description, quantity, unit_price, tax_rate }.
type Line = { description: string; quantity: string; unit_price: string; tax_rate: string }

type SourceOption = { id: string; label: string }

function normalizeInvoice(r: Record<string, unknown>): Invoice {
  const status = String(r.payment_status ?? r.status ?? 'PENDING').toUpperCase()
  return {
    id: String(r.id ?? ''),
    invoice_number: str(r.invoice_number ?? r.number),
    patient_name: str(r.patient_name ?? r.full_name),
    patient_code: str(r.patient_code),
    total_amount: num(r.total_amount ?? r.total ?? r.amount),
    paid_amount: num(r.paid_amount ?? r.paid ?? r.amount_paid),
    payment_status: status,
    created_at: str(r.created_at ?? r.issued_at),
    void: status === 'VOID' || status === 'VOIDED' || r.voided_at != null
  }
}

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PAID: 'success',
  PARTIAL: 'warning',
  PENDING: 'neutral',
  VOID: 'danger',
  VOIDED: 'danger',
  WAIVED: 'neutral'
}

export function HospitalBillingPage() {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'
  const { profile } = useAuth()

  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // h3_invoice is DETAIL lookup only — the register uses the authorized invoice-list RPC (h3_register). No amounts are invented.
  const [register, setRegister] = useState<any[]>([])
  const [registerOffset, setRegisterOffset] = useState(0)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerError, setRegisterError] = useState('')
  useEffect(() => {
    if (!facilityId) return
    let active = true
    setRegisterLoading(true); setRegisterError('')
    void supabase.rpc('h3_register', {p_facility:facilityId,p_offset:registerOffset}).then(({data,error})=>{
      if (!active) return
      setRegisterLoading(false)
      if (error) { setRegister([]); setRegisterError(error.message) } else setRegister(data ?? [])
    })
    return () => { active = false }
  }, [facilityId, registerOffset, notice])
  const [lookupId, setLookupId] = useState('')
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // Payment dialog — h3_record_payment requires p_method + p_reference.
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('CASH')
  const [payReference, setPayReference] = useState('')

  // Void — h3_void requires p_reason.
  const [voidFor, setVoidFor] = useState<Invoice | null>(null)
  const [voidReason, setVoidReason] = useState('')

  // Issue-invoice dialog — h3_issue bills an APPOINTMENT or ADMISSION source.
  const [issueOpen, setIssueOpen] = useState(false)
  const [sourceKind, setSourceKind] = useState<SourceKind>('APPOINTMENT')
  const [sources, setSources] = useState<SourceOption[]>([])
  const [srcLoading, setSrcLoading] = useState(false)
  const [srcError, setSrcError] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: '1', unit_price: '', tax_rate: '0' }])

  useEffect(() => {
    let active = true
    void resolveFacilityId(profile?.id).then((id) => {
      if (active) setFacilityId(id)
    })
    return () => {
      active = false
    }
  }, [profile?.id])

  function flash(msg: string) {
    setNotice(msg)
    setTimeout(() => setNotice(''), 7000)
  }

  // Detail lookup via h3_invoice (never a list). Truthful error if unreachable.
  const lookupInvoice = useCallback(async (overrideId?: string) => {
    const id = (typeof overrideId === 'string' ? overrideId : lookupId).trim()
    if (!id) return
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    try {
      const { data, error } = await supabase.rpc('h3_invoice', { p_invoice: id })
      if (error) throw error
      const rows = asRows(data, ['invoice', 'rows', 'items', 'data'])
      const one =
        rows.length > 0
          ? rows[0]
          : data && typeof data === 'object'
            ? (data as Record<string, unknown>)
            : null
      if (!one || !one.id) {
        setDetailError(hindi ? 'इनवॉइस नहीं मिला।' : 'No invoice found for that id.')
      } else {
        setDetail(normalizeInvoice(one))
      }
    } catch (e: unknown) {
      setDetailError(
        (hindi ? 'इनवॉइस लुकअप विफल — सर्वर ने कहा: ' : 'Invoice lookup failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setDetailLoading(false)
    }
  }, [lookupId, hindi])

  // Load real APPOINTMENT / ADMISSION candidates for the chosen h3_issue source.
  useEffect(() => {
    if (!issueOpen) return
    let active = true
    setSrcLoading(true)
    setSrcError('')
    setSources([])
    setSourceId('')
    void (async () => {
      try {
        if (sourceKind === 'APPOINTMENT') {
          const start = new Date()
          start.setHours(0, 0, 0, 0)
          const end = new Date()
          end.setHours(23, 59, 59, 999)
          const { data, error } = await supabase
            .from('appointments')
            .select('id, scheduled_at, patient_profiles(full_name, patient_code)')
            .gte('scheduled_at', start.toISOString())
            .lte('scheduled_at', end.toISOString())
            .order('scheduled_at', { ascending: true })
          if (error) throw error
          const opts = ((data ?? []) as Record<string, unknown>[]).map((a) => {
            const p = a.patient_profiles as Record<string, unknown> | Record<string, unknown>[] | null | undefined
            const one = Array.isArray(p) ? p[0] : p
            const name = one?.full_name == null ? null : String(one.full_name)
            const code = one?.patient_code == null ? null : String(one.patient_code)
            const when = a.scheduled_at
              ? new Date(String(a.scheduled_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''
            return {
              id: String(a.id),
              label: [when, name, code].filter(Boolean).join(' · ') || String(a.id).slice(0, 8)
            }
          })
          if (active) setSources(opts)
        } else {
          if (!facilityId) {
            if (active) setSrcError(hindi ? 'सुविधा संदर्भ आवश्यक है।' : 'Facility context required.')
            return
          }
          const { data, error } = await supabase.rpc('h2_admissions', { p_facility: facilityId, p_offset: 0 })
          if (error) throw error
          const rows = asRows(data, ['admissions', 'rows', 'items', 'data'])
          const opts = rows
            .map((r) => ({
              id: String(r.id ?? ''),
              label:
                [str(r.patient_name ?? r.full_name), str(r.patient_code), str(r.bed_label ?? r.bed)]
                  .filter(Boolean)
                  .join(' · ') || String(r.id ?? '').slice(0, 8)
            }))
            .filter((o) => o.id)
          if (active) setSources(opts)
        }
      } catch (e: unknown) {
        if (active) {
          setSources([])
          setSrcError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (active) setSrcLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [issueOpen, sourceKind, facilityId, hindi])

  async function recordPayment() {
    if (!payFor) return
    const amount = Number(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      flash(hindi ? 'मान्य भुगतान राशि दर्ज करें।' : 'Enter a valid payment amount.')
      return
    }
    setBusyId(payFor.id)
    try {
      const { error } = await supabase.rpc('h3_record_payment', {
        p_invoice: payFor.id,
        p_amount: amount,
        p_method: payMode,
        p_reference: payReference.trim() || null,
        p_request: reqId()
      })
      if (error) throw error
      flash(
        hindi
          ? `₹${amount} भुगतान दर्ज हुआ (${payMode})।`
          : `Recorded ₹${amount} payment (${payMode}).`
      )
      setPayFor(null)
      setPayAmount('')
      setPayReference('')
      if (detail && detail.id === payFor.id) void lookupInvoice()
    } catch (e: unknown) {
      flash(
        (hindi ? 'भुगतान विफल — सर्वर ने कहा: ' : 'Payment failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function voidInvoice() {
    if (!voidFor) return
    if (!voidReason.trim()) {
      flash(hindi ? 'रद्द करने का कारण लिखें।' : 'Enter a void reason (required).')
      return
    }
    setBusyId(voidFor.id)
    try {
      const { error } = await supabase.rpc('h3_void', {
        p_invoice: voidFor.id,
        p_reason: voidReason.trim()
      })
      if (error) throw error
      flash(hindi ? 'इनवॉइस रद्द किया गया।' : 'Invoice voided.')
      setVoidFor(null)
      setVoidReason('')
      if (detail && detail.id === voidFor.id) void lookupInvoice()
    } catch (e: unknown) {
      flash(
        (hindi ? 'इनवॉइस रद्द करना विफल — सर्वर ने कहा: ' : 'Void failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  async function issueInvoice() {
    if (!facilityId || !sourceId) return
    // Exact h3_issue line shape: { description, quantity, unit_price, tax_rate }.
    const items = lines
      .filter(l => l.description.trim() && Number(l.unit_price) > 0 && Number(l.quantity) > 0)
      .map(l => ({
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        tax_rate: Number(l.tax_rate) || 0
      }))
    if (items.length === 0) {
      flash(hindi ? 'कम से कम एक मान्य लाइन जोड़ें।' : 'Add at least one valid line item.')
      return
    }
    setBusyId('issue')
    try {
      const { error } = await supabase.rpc('h3_issue', {
        p_facility: facilityId,
        p_source_kind: sourceKind,
        p_source: sourceId,
        p_lines: items,
        p_request: reqId()
      })
      if (error) throw error
      flash(hindi ? 'इनवॉइस जारी हुआ।' : 'Invoice issued.')
      setIssueOpen(false)
      setSourceId('')
      setLines([{ description: '', quantity: '1', unit_price: '', tax_rate: '0' }])
    } catch (e: unknown) {
      flash(
        (hindi ? 'इनवॉइस जारी करना विफल — सर्वर ने कहा: ' : 'Issue failed — server said: ') +
          (e instanceof Error ? e.message : String(e))
      )
    } finally {
      setBusyId(null)
    }
  }

  const lineTotal = (l: Line) =>
    Number(l.quantity) > 0 && Number(l.unit_price) > 0
      ? Number(l.quantity) * Number(l.unit_price) * (1 + (Number(l.tax_rate) || 0) / 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              {hindi ? 'अस्पताल बिलिंग व कैशियर काउंटर' : 'Hospital Billing & Cashier Counter'}
            </h1>
            <Badge tone="success">h3_* live</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hindi
              ? 'इनवॉइस जारी (h3_issue), भुगतान (h3_record_payment), रद्दीकरण (h3_void) और विवरण लुकअप (h3_invoice)।'
              : 'Issue (h3_issue), payments (h3_record_payment), voids (h3_void) and detail lookup (h3_invoice).'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setIssueOpen(true)} disabled={!facilityId}>
            <Plus className="size-4 mr-1.5" />
            {hindi ? 'इनवॉइस जारी करें' : 'Issue Invoice'}
          </Button>
        </div>
      </div>

      {!facilityId && (
        <Card className="border-warning/30 bg-warning/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertCircle className="size-4 shrink-0 text-warning-foreground" />
            <span>
              {hindi
                ? 'सुविधा संदर्भ (facility_id) उपलब्ध नहीं है — इनवॉइस जारी करना निष्क्रिय है। कोई सुविधा कल्पित नहीं की गई।'
                : 'Facility context (facility_id) unavailable — issuing invoices is disabled. No facility is invented.'}
            </span>
          </div>
        </Card>
      )}

      {notice && (
        <Card className="border-info/30 bg-info/10 p-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <AlertCircle className="size-4 shrink-0 text-info" />
            <span>{notice}</span>
          </div>
        </Card>
      )}

      {/* REGISTER — truthful backend-required state (no authorized list RPC) */}
      <Card className="space-y-4">
        <SectionTitle title="Invoice register" sub="Facility-scoped invoices. Paid amounts represent recorded payment evidence; external settlement is not verified." icon={<Receipt className="size-4" />} />
        {registerLoading && <p>Loading invoices…</p>}
        {registerError && <p role="alert" className="text-destructive">{registerError}</p>}
        {!registerLoading && !registerError && !register.length && <p>No invoices recorded on this page.</p>}
        {register.map(row=><button key={row.id} className="block w-full rounded-lg border border-border p-3 text-left text-sm" onClick={()=>{setLookupId(row.id);void lookupInvoice(row.id)}}><strong>{row.patient_name ?? row.patient_code}</strong><p>{row.status} · Total ₹{row.total} · Paid ₹{row.paid} · Outstanding ₹{row.outstanding}</p><span>{new Date(row.created_at).toLocaleString()}</span></button>)}
        <div className="flex gap-2"><Button disabled={registerLoading||registerOffset===0} onClick={()=>setRegisterOffset(Math.max(0,registerOffset-30))}>Previous</Button><Button disabled={registerLoading||register.length<30||registerOffset>=9960} onClick={()=>setRegisterOffset(registerOffset+30)}>Next</Button></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[240px] flex-1 text-sm">
            <span className="mb-1 block font-medium">
              {hindi ? 'इनवॉइस आईडी से देखें' : 'Look up invoice by id'}
            </span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              value={lookupId}
              onChange={e => setLookupId(e.target.value)}
              placeholder={hindi ? 'इनवॉइस UUID…' : 'Invoice UUID…'}
            />
          </label>
          <Button variant="outline" onClick={() => void lookupInvoice()} disabled={detailLoading || !lookupId.trim()}>
            <Search className="size-4 mr-1.5" />
            {detailLoading ? (hindi ? 'खोज रहे हैं…' : 'Looking up…') : (hindi ? 'खोजें' : 'Look up')}
          </Button>
        </div>

        {detailError && (
          <p className="text-sm text-warning-foreground">{detailError}</p>
        )}

        {detail && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="font-mono text-sm font-semibold text-foreground">
                {detail.invoice_number ?? detail.id.slice(0, 8)}
              </p>
              <p className="text-xs text-muted-foreground">
                {[detail.patient_name, detail.patient_code].filter(Boolean).join(' · ')}
                {detail.created_at ? ` · ${new Date(detail.created_at).toLocaleDateString()}` : ''}
              </p>
              <p className="mt-1 text-xs text-foreground">
                {hindi ? 'कुल' : 'Total'} ₹{detail.total_amount.toFixed(2)} ·{' '}
                {hindi ? 'भुगतान' : 'Paid'} ₹{detail.paid_amount.toFixed(2)} ·{' '}
                <span
                  className={
                    Math.max(0, detail.total_amount - detail.paid_amount) > 0
                      ? 'font-semibold text-warning'
                      : 'text-success'
                  }
                >
                  {hindi ? 'बकाया' : 'Due'} ₹{Math.max(0, detail.total_amount - detail.paid_amount).toFixed(2)}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={STATUS_TONE[detail.payment_status] ?? 'neutral'}>{detail.payment_status}</Badge>
              {!detail.void && detail.total_amount - detail.paid_amount > 0 && (
                <Button
                  size="sm"
                  disabled={busyId === detail.id}
                  onClick={() => {
                    setPayFor(detail)
                    setPayAmount(Math.max(0, detail.total_amount - detail.paid_amount).toFixed(2))
                  }}
                >
                  <CreditCard className="size-3.5 mr-1" />
                  {hindi ? 'भुगतान' : 'Take payment'}
                </Button>
              )}
              {!detail.void && (
                <Button size="sm" variant="outline" disabled={busyId === detail.id} onClick={() => setVoidFor(detail)}>
                  <Ban className="size-3.5 mr-1" />
                  {hindi ? 'रद्द' : 'Void'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* PAYMENT DIALOG */}
      {payFor && (
        <Card className="space-y-4 border-primary/30">
          <SectionTitle
            title={hindi ? 'भुगतान दर्ज करें' : 'Record Payment'}
            sub={`${payFor.invoice_number ?? payFor.id.slice(0, 8)} · ${hindi ? 'बकाया' : 'due'} ₹${Math.max(0, payFor.total_amount - payFor.paid_amount).toFixed(2)}`}
            icon={<CreditCard className="size-4" />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{hindi ? 'राशि (₹)' : 'Amount (₹)'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{hindi ? 'माध्यम' : 'Method'}</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={payMode}
                onChange={e => setPayMode(e.target.value)}
              >
                {['CASH', 'CARD', 'UPI', 'INSURANCE', 'OTHER'].map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {hindi ? 'संदर्भ / रसीद संख्या (वैकल्पिक)' : 'Reference / receipt number (optional)'}
            </span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={payReference}
              onChange={e => setPayReference(e.target.value)}
              placeholder={hindi ? 'जैसे UPI रेफरेंस' : 'e.g. UPI reference'}
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={busyId === payFor.id} onClick={() => void recordPayment()}>
              {hindi ? 'भुगतान दर्ज करें' : 'Record payment'}
            </Button>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              {hindi ? 'रद्द करें' : 'Cancel'}
            </Button>
          </div>
        </Card>
      )}

      {/* VOID DIALOG */}
      {voidFor && (
        <Card className="space-y-4 border-danger/30">
          <SectionTitle
            title={hindi ? 'इनवॉइस रद्द करें' : 'Void Invoice'}
            sub={`${voidFor.invoice_number ?? voidFor.id.slice(0, 8)} · ${hindi ? 'h3_void के लिए कारण आवश्यक है' : 'a reason is required by h3_void'}`}
            icon={<Ban className="size-4" />}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{hindi ? 'कारण (आवश्यक)' : 'Reason (required)'}</span>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder={hindi ? 'रद्द करने का कारण…' : 'Reason for voiding…'}
            />
          </label>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busyId === voidFor.id || !voidReason.trim()}
              onClick={() => void voidInvoice()}
            >
              {hindi ? 'इनवॉइस रद्द करें' : 'Void invoice'}
            </Button>
            <Button variant="outline" onClick={() => setVoidFor(null)}>
              {hindi ? 'वापस' : 'Cancel'}
            </Button>
          </div>
        </Card>
      )}

      {/* ISSUE INVOICE DIALOG */}
      {issueOpen && (
        <Card className="space-y-4 border-primary/30">
          <SectionTitle
            title={hindi ? 'इनवॉइस जारी करें' : 'Issue Invoice'}
            sub={
              hindi
                ? 'एक APPOINTMENT या ADMISSION स्रोत चुनें और लाइन आइटम जोड़ें। h3_issue(p_facility,p_source_kind,p_source,p_lines,p_request); केवल यही दो स्रोत मान्य हैं।'
                : 'Choose an APPOINTMENT or ADMISSION source and add line items. h3_issue(p_facility,p_source_kind,p_source,p_lines,p_request); only these two source kinds are valid.'
            }
            icon={<Plus className="size-4" />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{hindi ? 'स्रोत प्रकार' : 'Source kind'}</span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={sourceKind}
                onChange={e => setSourceKind(e.target.value as SourceKind)}
              >
                <option value="APPOINTMENT">{hindi ? 'अपॉइंटमेंट' : 'Appointment'}</option>
                <option value="ADMISSION">{hindi ? 'एडमिशन' : 'Admission'}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {sourceKind === 'APPOINTMENT'
                  ? (hindi ? 'अपॉइंटमेंट चुनें' : 'Choose an appointment')
                  : (hindi ? 'एडमिशन चुनें' : 'Choose an admission')}
              </span>
              <select
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                disabled={srcLoading || !!srcError}
              >
                <option value="">{hindi ? 'चुनें…' : 'Select…'}</option>
                {sources.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label} · {s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {srcLoading && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {hindi ? 'स्रोत लोड हो रहे हैं…' : 'Loading sources…'}
                </span>
              )}
              {srcError && (
                <span className="mt-1 block text-xs text-warning-foreground">
                  {hindi ? `स्रोत उपलब्ध नहीं: ${srcError}` : `Sources unavailable: ${srcError}`}
                </span>
              )}
              {!srcLoading && !srcError && sources.length === 0 && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {hindi
                    ? 'आपके RLS स्कोप में कोई स्रोत उपलब्ध नहीं है।'
                    : 'No sources available under your RLS scope.'}
                </span>
              )}
            </label>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_64px_96px_72px_32px] gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>{hindi ? 'विवरण' : 'Description'}</span>
              <span>{hindi ? 'मात्रा' : 'Qty'}</span>
              <span>{hindi ? 'दर ₹' : 'Unit ₹'}</span>
              <span>{hindi ? 'कर %' : 'Tax %'}</span>
              <span />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px_96px_72px_32px] items-center gap-2">
                <input
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={l.description}
                  onChange={e =>
                    setLines(prev => prev.map((p, idx) => (idx === i ? { ...p, description: e.target.value } : p)))
                  }
                  placeholder={hindi ? 'जैसे परामर्श, लैब' : 'e.g. consultation, lab'}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  value={l.quantity}
                  onChange={e =>
                    setLines(prev => prev.map((p, idx) => (idx === i ? { ...p, quantity: e.target.value } : p)))
                  }
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  value={l.unit_price}
                  onChange={e =>
                    setLines(prev => prev.map((p, idx) => (idx === i ? { ...p, unit_price: e.target.value } : p)))
                  }
                  placeholder="₹"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                  value={l.tax_rate}
                  onChange={e =>
                    setLines(prev => prev.map((p, idx) => (idx === i ? { ...p, tax_rate: e.target.value } : p)))
                  }
                />
                {lines.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ban className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines(prev => [...prev, { description: '', quantity: '1', unit_price: '', tax_rate: '0' }])}
            >
              <Plus className="size-3.5 mr-1" />
              {hindi ? 'लाइन जोड़ें' : 'Add line'}
            </Button>
          </div>
          <p className="text-sm font-semibold">
            {hindi ? 'कुल (कर सहित): ' : 'Total (incl. tax): '}₹
            {lines.reduce((s, l) => s + lineTotal(l), 0).toFixed(2)}
          </p>
          <div className="flex gap-2">
            <Button disabled={!facilityId || !sourceId || busyId === 'issue'} onClick={() => void issueInvoice()}>
              {hindi ? 'इनवॉइस जारी करें' : 'Issue invoice'}
            </Button>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              {hindi ? 'रद्द करें' : 'Cancel'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
