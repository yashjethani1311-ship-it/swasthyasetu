import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileUp,
  FileText,
  Download,
  ShieldAlert,
  ScanLine,
  Info,
} from 'lucide-react'
import {
  AlertBanner,
  Button,
  Card,
  Disclaimer,
  Modal,
  SearchInput,
  SegmentedTabs,
  Skeleton,
  StatusBadge,
  TruthfulEmptyState,
} from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useCareLanguage } from '@/lib/care-language'

type HealthRecord = {
  id: string
  patient_id: string
  record_type: string
  record_date: string | null
  source_type: string
  storage_path: string
  original_filename: string
  mime_type: string | null
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED'
  verified_by: string | null
  created_at: string
}

const RECORD_TYPES = [
  'PRESCRIPTION',
  'LAB_REPORT',
  'IMAGING_REPORT',
  'DISCHARGE_SUMMARY',
  'VACCINATION_RECORD',
  'OTHER',
] as const

const typeLabels: Record<string, [string, string]> = {
  PRESCRIPTION: ['Prescription', 'दवा की पर्ची'],
  LAB_REPORT: ['Lab report', 'लैब रिपोर्ट'],
  IMAGING_REPORT: ['Imaging report', 'इमेजिंग रिपोर्ट'],
  DISCHARGE_SUMMARY: ['Discharge summary', 'अस्पताल से छुट्टी सारांश'],
  VACCINATION_RECORD: ['Vaccination record', 'टीकाकरण रिकॉर्ड'],
  OTHER: ['Other clinical document', 'अन्य स्वास्थ्य दस्तावेज़'],
}

const sourceLabels: Record<string, [string, string]> = {
  PATIENT_UPLOAD: ['Uploaded by you', 'आपके द्वारा अपलोड'],
  PROVIDER_SHARED: ['Shared by provider', 'प्रदाता द्वारा साझा'],
  FACILITY: ['Facility record', 'सुविधा रिकॉर्ड'],
}

// The health_records table only stores UNVERIFIED / VERIFIED / REJECTED.
// Automated OCR/extraction states are NOT backed by the schema and are
// therefore reported truthfully as a backend requirement, never faked.
const EXTRACTION_CONTRACT =
  'public.health_records has no extraction columns. OCR / extraction-draft / ' +
  'human-verification states require backend support (e.g. extraction_status, ' +
  'extracted_json, verified_by, verified_at) before they can be shown.'

export function RecordsPage() {
  const { tr, language } = useCareLanguage()
  const hi = language === 'Hindi'

  const [patientId, setPatientId] = useState<string | null>(null)
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [type, setType] = useState<string>('LAB_REPORT')
  const [date, setDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgTone, setMsgTone] = useState<'info' | 'warning' | 'success'>('info')

  const [filter, setFilter] = useState('ALL')
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<HealthRecord | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  // Document Intelligence (migration 027: q1_request, q1_read, q1_cancel)
  const [extractionJob, setExtractionJob] = useState<any>(null)
  const [extractionLoading, setExtractionLoading] = useState(false)
  const [extractionActionMsg, setExtractionActionMsg] = useState('')

  async function loadExtractionJob(recId: string) {
    setExtractionLoading(true)
    setExtractionActionMsg('')
    setExtractionJob(null)
    try {
      const { data } = await supabase
        .from('document_extraction_jobs')
        .select('*')
        .eq('record_id', recId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data?.id) {
        const { data: readData, error: readError } = await supabase.rpc('q1_read', {
          p_job: data.id
        })
        if (!readError && readData) {
          setExtractionJob(readData)
        } else {
          setExtractionJob({ job: data })
        }
      }
    } catch {
      // Extraction jobs optional or pending
    } finally {
      setExtractionLoading(false)
    }
  }

  async function requestExtraction(recId: string) {
    setExtractionLoading(true)
    setExtractionActionMsg('')
    try {
      const reqKey = crypto.randomUUID()
      const { error } = await supabase.rpc('q1_request', {
        p_record: recId,
        p_request: reqKey
      })
      if (error) throw error
      setExtractionActionMsg(
        tr('Extraction authorization submitted (valid 1 hour).', 'एक्सट्रैक्शन अनुमति सबमिट की गई (1 घंटे के लिए वैध)।')
      )
      await loadExtractionJob(recId)
    } catch (e: unknown) {
      setExtractionActionMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setExtractionLoading(false)
    }
  }

  async function cancelExtraction(jobId: string, recId: string) {
    setExtractionLoading(true)
    try {
      const { error } = await supabase.rpc('q1_cancel', { p_job: jobId })
      if (error) throw error
      setExtractionActionMsg(tr('Extraction authorization revoked.', 'एक्सट्रैक्शन अनुमति रद्द कर दी गई।'))
      await loadExtractionJob(recId)
    } catch (e: unknown) {
      setExtractionActionMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setExtractionLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        setLoadError(hi ? 'रिकॉर्ड देखने के लिए साइन इन करें।' : 'You must be signed in to view records.')
        return
      }
      const { data: p, error: pe } = await supabase
        .from('patient_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (pe) throw pe
      if (!p) {
        setLoadError(hi ? 'इस खाते के लिए रोगी प्रोफ़ाइल नहीं मिली।' : 'Patient profile not found for this account.')
        return
      }
      setPatientId(p.id)
      const { data, error } = await supabase
        .from('health_records')
        .select('*')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setRecords((data ?? []) as HealthRecord[])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [hi])

  useEffect(() => {
    void load()
  }, [load])

  async function upload() {
    if (!file || !patientId) return
    setBusy(true)
    setMsg('')
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) throw new Error('Not signed in')
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: u } = await supabase.storage
        .from('health-records')
        .upload(path, file, { upsert: false })
      if (u) throw u
      const { error: d } = await supabase.from('health_records').insert({
        patient_id: patientId,
        record_type: type,
        record_date: date || null,
        source_type: 'PATIENT_UPLOAD',
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type || null,
        verification_status: 'UNVERIFIED',
      })
      if (d) throw d
      setMsgTone('success')
      setMsg(
        tr(
          'Record uploaded. It stays “Uploaded — not clinically verified” until a provider reviews it.',
          'रिकॉर्ड अपलोड हो गया। जब तक डॉक्टर जाँच नहीं करते, यह “अपलोड हुआ — क्लिनिकल रूप से जाँचा नहीं” रहेगा।',
        ),
      )
      setFile(null)
      setDate('')
      await load()
    } catch (e) {
      setMsgTone('warning')
      const raw = e instanceof Error ? e.message : String(e)
      const isStorageIssue = /bucket|storage|not found|permission|row-level/i.test(raw)
      setMsg(
        isStorageIssue
          ? tr(
              `Upload requires configured document storage. (${raw})`,
              `अपलोड के लिए कॉन्फ़िगर किया गया दस्तावेज़ स्टोरेज आवश्यक है। (${raw})`,
            )
          : raw,
      )
    } finally {
      setBusy(false)
    }
  }

  async function openDocument(rec: HealthRecord) {
    setSigning(true)
    setSignedUrl(null)
    const { data, error } = await supabase.storage
      .from('health-records')
      .createSignedUrl(rec.storage_path, 60)
    setSigning(false)
    if (error) {
      setMsgTone('warning')
      const isStorageIssue = /bucket|storage|not found|permission/i.test(error.message)
      setMsg(
        isStorageIssue
          ? tr(
              `Viewing document requires configured document storage. (${error.message})`,
              `दस्तावेज़ देखने के लिए कॉन्फ़िगर किया गया दस्तावेज़ स्टोरेज आवश्यक है। (${error.message})`,
            )
          : error.message,
      )
      return
    }
    setSignedUrl(data.signedUrl)
  }

  const counts = useMemo(() => {
    const c = { ALL: records.length, UNVERIFIED: 0, VERIFIED: 0, REJECTED: 0 }
    for (const r of records) c[r.verification_status] = (c[r.verification_status] ?? 0) + 1
    return c
  }, [records])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter((r) => {
      if (filter !== 'ALL' && r.verification_status !== filter) return false
      if (!q) return true
      const label = (typeLabels[r.record_type]?.[hi ? 1 : 0] ?? r.record_type).toLowerCase()
      return (
        r.original_filename.toLowerCase().includes(q) ||
        r.record_type.toLowerCase().includes(q) ||
        label.includes(q)
      )
    })
  }, [records, filter, query, hi])

  function verificationLabel(r: HealthRecord) {
    if (r.verification_status === 'VERIFIED')
      return tr('Verified by a provider', 'प्रदाता द्वारा जाँचा गया')
    if (r.verification_status === 'REJECTED')
      return tr('Rejected — correction needed', 'अस्वीकृत — सुधार आवश्यक')
    return tr('Uploaded — not clinically verified', 'अपलोड हुआ — क्लिनिकल रूप से जाँचा नहीं')
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {tr('Health Records', 'स्वास्थ्य रिकॉर्ड')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            'Upload real PDF or image documents. Files are private and nothing is pre-filled.',
            'असली PDF या चित्र दस्तावेज़ अपलोड करें। फ़ाइलें निजी हैं और कुछ भी पहले से नहीं भरा जाता।',
          )}
        </p>
      </header>

      <AlertBanner tone="warning" title={tr('Uploaded is not the same as verified', 'अपलोड का मतलब जाँचा हुआ नहीं')}>
        {tr(
          'A document you upload is marked “Patient supplied / Unverified”. It only becomes clinically verified after an authorised provider reviews it. Upload status never claims clinical accuracy.',
          'आपके द्वारा अपलोड दस्तावेज़ “रोगी द्वारा दिया / बिना जाँच” रहता है। यह केवल अधिकृत प्रदाता की जाँच के बाद ही क्लिनिकल रूप से सत्यापित होता है।',
        )}
      </AlertBanner>

      {/* UPLOAD */}
      <Card>
        <div className="flex items-center gap-2">
          <FileUp className="size-5 text-primary" />
          <h2 className="font-semibold">{tr('Upload health record', 'स्वास्थ्य रिकॉर्ड अपलोड करें')}</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="label-xs">{tr('Document type', 'दस्तावेज़ प्रकार')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]?.[hi ? 1 : 0] ?? t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label-xs">{tr('Record date (optional)', 'रिकॉर्ड तारीख (वैकल्पिक)')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label-xs">{tr('File (PDF or image)', 'फ़ाइल (PDF या चित्र)')}</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={!file || busy || !patientId} loading={busy} onClick={() => void upload()}>
            {tr('Upload securely', 'सुरक्षित अपलोड करें')}
          </Button>
          {file ? (
            <span className="text-xs text-muted-foreground">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
          ) : null}
        </div>
        {msg ? (
          <p
            role="status"
            className={`mt-3 text-sm ${msgTone === 'success' ? 'text-success' : 'text-muted-foreground'}`}
          >
            {msg}
          </p>
        ) : null}
      </Card>

      {/* FILTERS + LIST */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: 'ALL', label: tr('All', 'सभी'), count: counts.ALL },
              { id: 'UNVERIFIED', label: tr('Unverified', 'बिना जाँच'), count: counts.UNVERIFIED },
              { id: 'VERIFIED', label: tr('Verified', 'जाँचे हुए'), count: counts.VERIFIED },
              { id: 'REJECTED', label: tr('Rejected', 'अस्वीकृत'), count: counts.REJECTED },
            ]}
          />
          <SearchInput
            className="lg:w-72"
            value={query}
            onChange={setQuery}
            placeholder={tr('Search records…', 'रिकॉर्ड खोजें…')}
          />
        </div>

        {loadError ? (
          <AlertBanner
            tone="emergency"
            title={tr('Could not load records', 'रिकॉर्ड लोड नहीं हो सके')}
            action={<Button size="sm" variant="outline" onClick={() => void load()}>{tr('Retry', 'पुनः प्रयास')}</Button>}
          >
            {loadError}
          </AlertBanner>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : records.length === 0 ? (
          <TruthfulEmptyState
            icon={<FileText className="size-6" />}
            title={tr('No health records yet', 'अभी कोई स्वास्थ्य रिकॉर्ड नहीं')}
            description={tr(
              'Records you upload or that an authorised provider shares with your consent will appear here.',
              'आपके अपलोड किए गए या आपकी अनुमति से प्रदाता द्वारा साझा किए गए रिकॉर्ड यहाँ दिखेंगे।',
            )}
          />
        ) : visible.length === 0 ? (
          <TruthfulEmptyState
            title={tr('No records match this filter', 'इस फ़िल्टर से कोई रिकॉर्ड मेल नहीं खाता')}
            description={tr('Try a different status or clear the search.', 'कोई अन्य स्थिति चुनें या खोज हटाएँ।')}
            action={<Button variant="outline" size="sm" onClick={() => { setFilter('ALL'); setQuery('') }}>{tr('Clear filters', 'फ़िल्टर हटाएँ')}</Button>}
          />
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <FileText className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.original_filename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {typeLabels[r.record_type]?.[hi ? 1 : 0] ?? r.record_type}
                      {' · '}
                      {r.record_date ?? tr('date not supplied', 'तारीख नहीं दी गई')}
                      {' · '}
                      {sourceLabels[r.source_type]?.[hi ? 1 : 0] ?? r.source_type}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.verification_status} />
                      <span className="text-[11px] text-muted-foreground">{verificationLabel(r)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setDetail(r); void loadExtractionJob(r.id); }}>
                    {tr('Details', 'विवरण')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void openDocument(r)}>
                    <Download className="size-4" />
                    {tr('Original', 'मूल दस्तावेज़')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Disclaimer>
        {tr(
          'Verification status reflects an authorised provider review recorded in the backend. This page never marks a document as clinically verified on its own.',
          'सत्यापन स्थिति बैकएंड में दर्ज अधिकृत प्रदाता समीक्षा को दर्शाती है। यह पेज स्वयं किसी दस्तावेज़ को क्लिनिकल रूप से सत्यापित नहीं करता।',
        )}
      </Disclaimer>

      {/* DETAIL MODAL */}
      <Modal
        open={Boolean(detail)}
        onClose={() => { setDetail(null); setSignedUrl(null); setExtractionJob(null); setExtractionActionMsg('') }}
        title={detail?.original_filename ?? tr('Record detail', 'रिकॉर्ड विवरण')}
      >
        {detail ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="label-xs">{tr('Type', 'प्रकार')}</dt>
                <dd className="mt-0.5 font-medium">{typeLabels[detail.record_type]?.[hi ? 1 : 0] ?? detail.record_type}</dd>
              </div>
              <div>
                <dt className="label-xs">{tr('Source', 'स्रोत')}</dt>
                <dd className="mt-0.5 font-medium">{sourceLabels[detail.source_type]?.[hi ? 1 : 0] ?? detail.source_type}</dd>
              </div>
              <div>
                <dt className="label-xs">{tr('Record date', 'रिकॉर्ड तारीख')}</dt>
                <dd className="mt-0.5 font-medium">{detail.record_date ?? '—'}</dd>
              </div>
              <div>
                <dt className="label-xs">{tr('Uploaded', 'अपलोड तारीख')}</dt>
                <dd className="mt-0.5 font-medium">{new Date(detail.created_at).toLocaleString()}</dd>
              </div>
              <div className="col-span-2">
                <dt className="label-xs">{tr('Verification', 'सत्यापन')}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <StatusBadge status={detail.verification_status} />
                  <span className="text-xs text-muted-foreground">{verificationLabel(detail)}</span>
                </dd>
              </div>
            </dl>

            {/* 027 DOCUMENT INTELLIGENCE / OCR PIPELINE */}
            <div className="rounded-lg border border-border bg-surface-subtle p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <ScanLine className="size-4 text-primary" />
                  {tr('Document Intelligence & Extraction (027 / q1_*)', 'दस्तावेज़ निष्कर्षण व OCR (027 / q1_*)')}
                </p>
                {extractionJob?.job?.state && (
                  <StatusBadge status={extractionJob.job.state} />
                )}
              </div>

              {extractionActionMsg && (
                <p className="text-xs text-primary font-medium">{extractionActionMsg}</p>
              )}

              {extractionLoading ? (
                <p className="text-xs text-muted-foreground italic">{tr('Checking extraction status…', 'एक्सट्रैक्शन स्थिति जाँची जा रही है…')}</p>
              ) : extractionJob?.job ? (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{tr('Job State:', 'कार्य स्थिति:')} <strong className="text-foreground">{extractionJob.job.state}</strong></span>
                    {extractionJob.job.authorization_until && (
                      <span>{tr('Auth until:', 'अनुमति समाप्ति:')} {new Date(extractionJob.job.authorization_until).toLocaleTimeString()}</span>
                    )}
                  </div>

                  {extractionJob.draft && (
                    <div className="rounded border border-border bg-card p-2.5 space-y-1.5">
                      <p className="font-semibold text-foreground">{tr('Draft Extracted Fields:', 'ड्राफ्ट निकाले गए फ़ील्ड्स:')}</p>
                      <pre className="text-[11px] font-mono bg-background p-2 rounded overflow-x-auto max-h-40">
                        {JSON.stringify(extractionJob.draft.extracted_fields, null, 2)}
                      </pre>
                    </div>
                  )}

                  {extractionJob.reviews && extractionJob.reviews.length > 0 && (
                    <div className="rounded border border-border bg-card p-2.5 space-y-1">
                      <p className="font-semibold text-foreground">{tr('Human Reviews:', 'मानव समीक्षा:')}</p>
                      {extractionJob.reviews.map((rev: any, idx: number) => (
                        <div key={idx} className="border-t border-border pt-1 text-[11px]">
                          <p><strong>v{rev.version}</strong> — {rev.review_state}: <em>{rev.review_note}</em></p>
                        </div>
                      ))}
                    </div>
                  )}

                  {extractionJob.notice && (
                    <p className="text-[11px] text-muted-foreground italic">{extractionJob.notice}</p>
                  )}

                  {['CONFIGURATION_REQUIRED', 'PROCESSING'].includes(extractionJob.job.state) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelExtraction(extractionJob.job.id, detail.id)}
                    >
                      {tr('Revoke Extraction Authorization', 'एक्सट्रैक्शन अनुमति रद्द करें')}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      'Automated extraction creates a draft OCR transcription with source quotes. It requires patient authorization and subsequent human clinical review.',
                      'स्वचालित एक्सट्रैक्शन स्रोत उद्धरणों के साथ एक ड्राफ्ट OCR ट्रांसक्रिप्शन बनाता है। इसके लिए रोगी की सहमति और बाद में क्लिनिकल समीक्षा आवश्यक है।'
                    )}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void requestExtraction(detail.id)}
                  >
                    <ScanLine className="size-3.5 mr-1" />
                    {tr('Authorize Document Extraction (q1_request)', 'दस्तावेज़ एक्सट्रैक्शन अधिकृत करें (q1_request)')}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-subtle p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ScanLine className="size-4 text-muted-foreground" />
                {tr('Extraction / OCR status', 'एक्सट्रैक्शन / OCR स्थिति')}
              </p>
              <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {tr(
                  'Automated extraction and human-verification drafting are not yet backed for this record type. The original document is always available; structured values are never inferred on the frontend.',
                  'इस रिकॉर्ड के लिए स्वचालित एक्सट्रैक्शन और मानव-सत्यापन ड्राफ्ट अभी बैकएंड में नहीं हैं। मूल दस्तावेज़ हमेशा उपलब्ध है; मान फ्रंटएंड पर कभी नहीं बनाए जाते।',
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={signing}
                onClick={() => void openDocument(detail)}
              >
                <Download className="size-4" />
                {tr('Open original document', 'मूल दस्तावेज़ खोलें')}
              </Button>
              {signedUrl ? (
                <a href={signedUrl} target="_blank" rel="noreferrer">
                  <Button variant="success">{tr('Open signed link', 'साइन किया लिंक खोलें')}</Button>
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {signedUrl && !detail ? (
        <AlertBanner tone="success" title={tr('Signed link ready', 'साइन किया लिंक तैयार')}>
          <a className="underline" href={signedUrl} target="_blank" rel="noreferrer">{tr('Open original document', 'मूल दस्तावेज़ खोलें')}</a>
        </AlertBanner>
      ) : null}
    </div>
  )
}
