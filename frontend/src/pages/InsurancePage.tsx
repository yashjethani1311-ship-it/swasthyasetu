import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shield, Plus, CalendarClock, FileCheck2, Hospital, AlertCircle } from 'lucide-react'
import {
  AlertBanner,
  Button,
  Card,
  Disclaimer,
  SectionTitle,
  StatusBadge,
  TruthfulEmptyState,
} from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useCareLanguage } from '@/lib/care-language'

type Policy = {
  id: string
  patient_id: string
  insurer_name: string
  policy_number: string
  valid_from: string | null
  valid_to: string | null
  sum_insured: number | null
  source_type: string
  verification_status: string
  created_at: string
}

const emptyForm = {
  insurer_name: '',
  policy_number: '',
  valid_from: '',
  valid_to: '',
  sum_insured: '',
}

// Eligibility, pre-authorisation and claims are NOT backed by any table or RPC.
// They are rendered as contract-ready unavailable states and never fabricated.
const ELIGIBILITY_CONTRACT =
  'Eligibility verification requires a backend contract (e.g. insurance_eligibility_checks ' +
  'with a live payer/TPA or government-scheme lookup). SwasthyaSetu never infers eligibility on the frontend.'
const PREAUTH_CONTRACT =
  'Pre-authorisation requires public.preauth_requests (policy_id, procedure, requested_amount, ' +
  'status, payer_decision) plus a submit/decide RPC. No preauth is shown as approved without a payer decision.'
const CLAIMS_CONTRACT =
  'Claims require public.insurance_claims (policy_id, hospital/TPA, amount, status timeline) and ' +
  'supporting-document links. Claim status is only ever shown from a backend decision, never guessed.'

export function InsurancePage() {
  const { tr } = useCareLanguage()

  const [pid, setPid] = useState<string | null>(null)
  const [rows, setRows] = useState<Policy[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [showForm, setShowForm] = useState(false)

  const [payerCases, setPayerCases] = useState<any[]>([])
  const [caseActionBusy, setCaseActionBusy] = useState(false)
  const [caseActionMsg, setCaseActionMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const u = (await supabase.auth.getUser()).data.user
      if (!u) throw new Error('Not signed in')
      const { data: p, error: pe } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('user_id', u.id)
        .maybeSingle()
      if (pe) throw pe
      if (!p) throw new Error('Patient profile not found')
      setPid(p.id)
      const { data, error } = await supabase
        .from('insurance_policies')
        .select('*')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows((data ?? []) as Policy[])

      // Load payer cases (025: i1_case, i1_consent, i1_read)
      const { data: casesData } = await supabase
        .from('payer_cases')
        .select(`
          id,
          facility_id,
          patient_id,
          policy_id,
          invoice_id,
          kind,
          requested_amount,
          state,
          consent_status,
          consent_until,
          approved_amount,
          settled_amount,
          decision_reason,
          created_at,
          facilities(name)
        `)
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })

      if (casesData) setPayerCases(casesData)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleConsent(caseId: string, decision: 'GRANTED' | 'REVOKED') {
    setCaseActionBusy(true)
    setCaseActionMsg('')
    try {
      const until = decision === 'GRANTED' ? new Date(Date.now() + 30 * 86400000).toISOString() : null
      const { error } = await supabase.rpc('i1_consent', {
        p_case: caseId,
        p_decision: decision,
        p_until: until
      })
      if (error) throw error
      setCaseActionMsg(
        decision === 'GRANTED'
          ? tr('Consent granted for payer submission (valid 30 days).', 'पेयर सबमिशन के लिए सहमति दी गई (30 दिन वैध)।')
          : tr('Consent revoked.', 'सहमति रद्द कर दी गई।')
      )
      await load()
    } catch (e: unknown) {
      setCaseActionMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setCaseActionBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!pid || !form.insurer_name.trim() || !form.policy_number.trim()) return
    setBusy(true)
    setMsg('')
    const { error } = await supabase.from('insurance_policies').insert({
      patient_id: pid,
      insurer_name: form.insurer_name.trim(),
      policy_number: form.policy_number.trim(),
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      sum_insured: form.sum_insured ? Number(form.sum_insured) : null,
      source_type: 'PATIENT_ENTERED',
      verification_status: 'UNVERIFIED',
    })
    setBusy(false)
    if (error) {
      setMsg(error.message)
      return
    }
    setMsg(tr('Policy saved as patient-entered / unverified.', 'पॉलिसी रोगी-दर्ज / बिना जाँच के रूप में सहेजी गई।'))
    setForm(emptyForm)
    setShowForm(false)
    await load()
  }

  function validity(p: Policy): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
    if (!p.valid_to) return { label: tr('Validity not specified', 'वैधता तारीख नहीं दी गई'), tone: 'neutral' }
    const end = new Date(p.valid_to).getTime()
    const now = Date.now()
    if (end < now) return { label: tr('Expired', 'अवधि समाप्त'), tone: 'danger' }
    if (end - now < 30 * 86400000) return { label: tr('Expires within 30 days', '30 दिनों में समाप्त हो रही है'), tone: 'warning' }
    return { label: tr('Active as per dates entered', 'दर्ज तारीखों के अनुसार सक्रिय'), tone: 'success' }
  }

  const activeCount = useMemo(
    () => rows.filter((p) => p.valid_to && new Date(p.valid_to).getTime() >= Date.now()).length,
    [rows],
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tr('Insurance & scheme records', 'बीमा और योजना रिकॉर्ड')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(
              'Add only a policy or government scheme you actually hold. No fake plans, prices or eligibility.',
              'केवल वही पॉलिसी या सरकारी योजना जोड़ें जो वास्तव में आपके पास है। कोई नकली प्लान, कीमत या पात्रता नहीं।',
            )}
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" />
          {tr('Add policy', 'पॉलिसी जोड़ें')}
        </Button>
      </header>

      <AlertBanner tone="info" title={tr('Eligibility is never invented', 'पात्रता कभी नहीं बनाई जाती')}>
        {tr(
          'SwasthyaSetu stores the policy details you enter and marks them patient-entered / unverified. Coverage, eligibility, pre-authorisation and claim decisions come only from a connected payer, TPA or scheme backend.',
          'SwasthyaSetu आपके दर्ज पॉलिसी विवरण सहेजता है और उन्हें रोगी-दर्ज / बिना जाँच चिह्नित करता है। कवरेज, पात्रता, प्री-ऑथराइज़ेशन और दावा निर्णय केवल जुड़े हुए पेयर, TPA या योजना बैकएंड से आते हैं।',
        )}
      </AlertBanner>

      {loadError ? (
        <AlertBanner
          tone="emergency"
          title={tr('Could not load policies', 'पॉलिसी लोड नहीं हो सकीं')}
          action={<Button size="sm" variant="outline" onClick={() => void load()}>{tr('Retry', 'पुनः प्रयास')}</Button>}
        >
          {loadError}
        </AlertBanner>
      ) : null}

      {showForm ? (
        <Card>
          <SectionTitle title={tr('Add an existing policy or scheme', 'मौजूदा पॉलिसी या योजना जोड़ें')} icon={<Shield className="size-5" />} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="label-xs">{tr('Insurer / scheme name', 'बीमाकर्ता / योजना नाम')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={tr('e.g. Ayushman Bharat PM-JAY', 'जैसे आयुष्मान भारत PM-JAY')}
                value={form.insurer_name}
                onChange={(e) => setForm({ ...form, insurer_name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label-xs">{tr('Policy / beneficiary number', 'पॉलिसी / लाभार्थी संख्या')}</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={form.policy_number}
                onChange={(e) => setForm({ ...form, policy_number: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label-xs">{tr('Valid from', 'मान्य शुरू')}</span>
              <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-xs">{tr('Valid to', 'मान्य अंत')}</span>
              <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
            </label>
            <label className="block">
              <span className="label-xs">{tr('Sum insured (optional)', 'बीमा राशि (वैकल्पिक)')}</span>
              <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" type="number" min="0" value={form.sum_insured} onChange={(e) => setForm({ ...form, sum_insured: e.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              loading={busy}
              disabled={!form.insurer_name.trim() || !form.policy_number.trim()}
              onClick={() => void save()}
            >
              {tr('Save policy', 'पॉलिसी सहेजें')}
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setForm(emptyForm) }}>
              {tr('Cancel', 'रद्द करें')}
            </Button>
          </div>
          {msg ? <p role="status" className="mt-3 text-sm text-muted-foreground">{msg}</p> : null}
        </Card>
      ) : null}

      {/* POLICIES */}
      <section className="space-y-3">
        <SectionTitle
          title={tr('Your policies', 'आपकी पॉलिसियाँ')}
          sub={loading ? tr('Loading…', 'लोड हो रहा है…') : tr('{{n}} linked · {{a}} within validity', '{{n}} जुड़ी · {{a}} वैधता के भीतर').replace('{{n}}', String(rows.length)).replace('{{a}}', String(activeCount))}
        />
        {loading ? (
          <Card className="text-sm text-muted-foreground">{tr('Loading policies…', 'पॉलिसियाँ लोड हो रही हैं…')}</Card>
        ) : rows.length === 0 ? (
          <TruthfulEmptyState
            icon={<Shield className="size-6" />}
            title={tr('No insurance or scheme linked', 'कोई बीमा या योजना नहीं जुड़ी')}
            description={tr(
              'Add a policy or government scheme you hold. Nothing is pre-filled and no coverage is assumed.',
              'अपनी पॉलिसी या सरकारी योजना जोड़ें। कुछ भी पहले से नहीं भरा जाता और कोई कवरेज नहीं मानी जाती।',
            )}
            action={<Button variant="outline" size="sm" onClick={() => setShowForm(true)}>{tr('Add policy', 'पॉलिसी जोड़ें')}</Button>}
          />
        ) : (
          rows.map((p) => {
            const v = validity(p)
            return (
              <Card key={p.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <Shield className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">{p.insurer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {tr('Policy', 'पॉलिसी')}: <span className="font-tabular">{p.policy_number}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={p.verification_status} />
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${v.tone === 'danger' ? 'text-destructive' : v.tone === 'warning' ? 'text-warning-foreground' : v.tone === 'success' ? 'text-success' : 'text-muted-foreground'}`}>
                      <CalendarClock className="size-3.5" />
                      {v.label}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="label-xs">{tr('Valid from', 'मान्य शुरू')}</p>
                    <p className="mt-0.5 font-medium font-tabular">{p.valid_from ?? '—'}</p>
                  </div>
                  <div>
                    <p className="label-xs">{tr('Valid to', 'मान्य अंत')}</p>
                    <p className="mt-0.5 font-medium font-tabular">{p.valid_to ?? '—'}</p>
                  </div>
                  <div>
                    <p className="label-xs">{tr('Sum insured', 'बीमा राशि')}</p>
                    <p className="mt-0.5 font-medium font-tabular">{p.sum_insured != null ? `₹${Number(p.sum_insured).toLocaleString('en-IN')}` : '—'}</p>
                  </div>
                  <div>
                    <p className="label-xs">{tr('Source', 'स्रोत')}</p>
                    <p className="mt-0.5 font-medium">{p.source_type.replaceAll('_', ' ')}</p>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </section>

      {/* 025 PAYER & TPA CASES */}
      <section className="space-y-3">
        <SectionTitle
          title={tr('Payer / TPA claims & pre-authorisation cases', 'पेयर / TPA दावे व प्री-ऑथराइज़ेशन केस')}
          sub={tr('Hospital-initiated cases governed by your explicit consent (025 / i1_*)', 'अस्पताल द्वारा शुरू किए गए केस जो आपकी सहमति पर निर्भर हैं (025 / i1_*)')}
          icon={<Hospital className="size-5" />}
        />

        {caseActionMsg && (
          <AlertBanner tone="info" title={tr('Consent action', 'सहमति कार्रवाई')}>
            {caseActionMsg}
          </AlertBanner>
        )}

        {payerCases.length === 0 ? (
          <TruthfulEmptyState
            icon={<Hospital className="size-6" />}
            title={tr('No active payer cases', 'कोई सक्रिय पेयर केस नहीं')}
            description={tr(
              'External payer connection required. When a hospital initiates an insurance pre-authorization or claim for your admission, it will appear here for your explicit consent.',
              'बाहरी पेयर कनेक्शन आवश्यक है। जब कोई अस्पताल आपकी भर्ती के लिए प्री-ऑथराइज़ेशन या दावा शुरू करेगा, तो वह आपकी सहमति के लिए यहाँ दिखाई देगा।'
            )}
          />
        ) : (
          <div className="space-y-3">
            {payerCases.map((c) => (
              <Card key={c.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">
                        {c.kind === 'PREAUTH' ? tr('Pre-Authorisation', 'प्री-ऑथराइज़ेशन') : tr('Insurance Claim', 'बीमा दावा')}
                      </span>
                      <StatusBadge status={c.state} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tr('Hospital:', 'अस्पताल:')} <strong>{c.facilities?.name ?? tr('Hospital', 'अस्पताल')}</strong> · {tr('Requested:', 'अनुरोध राशि:')} ₹{Number(c.requested_amount).toLocaleString('en-IN')}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-xs font-semibold">
                      {tr('Consent:', 'सहमति:')}{' '}
                      <span className={c.consent_status === 'GRANTED' ? 'text-success font-bold' : 'text-warning-foreground font-bold'}>
                        {c.consent_status}
                      </span>
                    </span>
                    {c.consent_status === 'REQUESTED' ? (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={caseActionBusy}
                          onClick={() => void handleConsent(c.id, 'GRANTED')}
                        >
                          {tr('Grant Consent', 'सहमति दें')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={caseActionBusy}
                          onClick={() => void handleConsent(c.id, 'REVOKED')}
                        >
                          {tr('Deny', 'अस्वीकार')}
                        </Button>
                      </div>
                    ) : c.consent_status === 'GRANTED' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={caseActionBusy}
                        onClick={() => void handleConsent(c.id, 'REVOKED')}
                      >
                        {tr('Revoke Consent', 'सहमति वापस लें')}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {c.decision_reason && (
                  <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                    {tr('Payer note:', 'पेयर टिप्पणी:')} {c.decision_reason}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* FUTURE-READY: truthful unavailable, never fabricated */}
      <section className="grid gap-4 lg:grid-cols-3">
        <TruthfulEmptyState
          icon={<FileCheck2 className="size-6" />}
          title={tr('Eligibility & coverage', 'पात्रता और कवरेज')}
          description={tr(
            'External payer connection required. Live eligibility, covered services and government-scheme entitlement require a connected payer or scheme backend.',
            'बाहरी पेयर कनेक्शन आवश्यक है। लाइव पात्रता, कवर की गई सेवाएँ और सरकारी-योजना लाभ के लिए जुड़ा हुआ पेयर या योजना बैकएंड चाहिए।',
          )}
          schemaContractNotice={ELIGIBILITY_CONTRACT}
        />
        <TruthfulEmptyState
          icon={<Hospital className="size-6" />}
          title={tr('Pre-authorisation', 'प्री-ऑथराइज़ेशन')}
          description={tr(
            'External payer connection required. Pre-authorisation requests and payer decisions are not yet backed. No request is shown as approved without a payer decision.',
            'बाहरी पेयर कनेक्शन आवश्यक है। प्री-ऑथराइज़ेशन अनुरोध और पेयर निर्णय अभी बैकएंड में नहीं हैं। पेयर निर्णय के बिना कोई अनुरोध स्वीकृत नहीं दिखाया जाता।',
          )}
          schemaContractNotice={PREAUTH_CONTRACT}
        />
        <TruthfulEmptyState
          icon={<AlertCircle className="size-6" />}
          title={tr('Claims & TPA', 'दावे और TPA')}
          description={tr(
            'External payer connection required. Claim submission, status timeline, denial and settlement require a claims backend and document links.',
            'बाहरी पेयर कनेक्शन आवश्यक है। दावा प्रस्तुति, स्थिति टाइमलाइन, अस्वीकृति और निपटान के लिए दावा बैकएंड और दस्तावेज़ लिंक चाहिए।',
          )}
          schemaContractNotice={CLAIMS_CONTRACT}
        />
      </section>

      <Disclaimer>
        {tr(
          'Policy details you enter are stored as patient-entered and unverified. Verification, eligibility and claim outcomes are separate backend processes and are never assumed by this page.',
          'आपके दर्ज पॉलिसी विवरण रोगी-दर्ज और बिना जाँच के सहेजे जाते हैं। सत्यापन, पात्रता और दावा परिणाम अलग बैकएंड प्रक्रियाएँ हैं और इस पेज द्वारा कभी नहीं माने जाते।',
        )}
      </Disclaimer>
    </div>
  )
}
