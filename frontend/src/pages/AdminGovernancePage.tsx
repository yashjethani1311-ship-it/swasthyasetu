import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  Database,
  Fingerprint,
  GitBranch,
  Link2,
  Mail,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Unlink,
} from 'lucide-react'
import { Badge, Button, Card, StatusBadge } from '@/components/kit'
import { supabase } from '@/lib/supabase'

type TabKey = 'providers' | 'pathways' | 'models' | 'learning' | 'comms' | 'incidents' | 'identity' | 'integrations'

type ProviderRow = {
  id: string
  full_name: string | null
  organization_name: string | null
  provider_type: string | null
  verification_status: string | null
  identity_source: string | null
  registry_verified: boolean | null
}

export function AdminGovernancePage() {
  const [tab, setTab] = useState<TabKey>('providers')

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Governance Console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review provider identity, governed care pathways, model evaluations, owned-learning datasets, consented communications, identity aliasing, and integration health.
            </p>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {[
          { key: 'providers' as const, label: 'Provider Verification', icon: ShieldCheck },
          { key: 'pathways' as const, label: 'Care Pathways (022)', icon: GitBranch },
          { key: 'models' as const, label: 'Model Registry (029)', icon: Cpu },
          { key: 'learning' as const, label: 'Model Learning (030)', icon: BrainCircuit },
          { key: 'comms' as const, label: 'Comms Lifecycle (031)', icon: Mail },
          { key: 'incidents' as const, label: 'Incidents & Audit (037)', icon: ShieldAlert },
          { key: 'identity' as const, label: 'Identity Linking (038)', icon: Fingerprint },
          { key: 'integrations' as const, label: 'Integration Health (039)', icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary',
            ].join(' ')}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'providers' && <ProviderVerificationTab />}
      {tab === 'pathways' && <CarePathwaysTab />}
      {tab === 'models' && <ModelRegistryTab />}
      {tab === 'learning' && <ModelLearningTab />}
      {tab === 'comms' && <CommsLifecycleTab />}
      {tab === 'incidents' && <IncidentsTab />}
      {tab === 'identity' && <IdentityResolutionTab />}
      {tab === 'integrations' && <IntegrationRegistryTab />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Provider Verification Queue
// ─────────────────────────────────────────────────────────────────────────────

function ProviderVerificationTab() {
  const [rows, setRows] = useState<ProviderRow[]>([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = () => {
    setLoading(true)
    setError('')
    void supabase
      .from('provider_profiles')
      .select('id,full_name,organization_name,provider_type,verification_status,identity_source,registry_verified')
      .order('verification_status')
      .limit(100)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message)
        setRows((data ?? []) as ProviderRow[])
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
  }, [])

  const visible = filter === 'ALL' ? rows : rows.filter(row => row.verification_status === filter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Provider Identity & Registry Verification</h2>
          <p className="text-xs text-muted-foreground">Review provider identity and operational approval state without claiming government verification.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {['ALL', 'PENDING', 'APPROVED', 'SUSPENDED'].map(status => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-xl border p-3 text-left ${filter === status ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
          >
            <p className="text-2xl font-bold font-tabular">
              {status === 'ALL' ? rows.length : rows.filter(row => row.verification_status === status).length}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</p>
          </button>
        ))}
      </div>

      {rows.length >= 100 && (
        <p className="text-xs text-muted-foreground">
          Showing the first 100 provider records. Counts reflect this loaded set only; a paginated governance queue requires its backend contract.
        </p>
      )}

      <Card className="flex items-start gap-3 border-warning/30 bg-warning/5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          Approve, reject, suspend, and revoke actions require an administrator-only backend workflow. This console does not show or fabricate success for unavailable mutations.
        </p>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Loading provider verification queue…</p>}
      {!loading && !error && visible.length === 0 && (
        <Card className="text-sm text-muted-foreground">No provider records match this queue. Audit and incident feeds require their backend contracts.</Card>
      )}

      <div className="space-y-3">
        {visible.map(row => (
          <Card key={row.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{row.full_name || row.organization_name || 'Unnamed provider'}</h2>
                <p className="text-xs text-muted-foreground">{row.provider_type || 'Provider'} · {row.id}</p>
              </div>
              <StatusBadge status={row.verification_status || 'UNKNOWN'} />
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p><span className="text-muted-foreground">Identity source:</span> {row.identity_source || 'Unknown'}</p>
              <p><span className="text-muted-foreground">Registry state:</span> {row.registry_verified ? 'Verified' : 'Not verified'}</p>
              <p><span className="text-muted-foreground">Operational state:</span> <Badge tone="neutral">{row.verification_status || 'UNKNOWN'}</Badge></p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3 pt-4">
        {[
          [ClipboardCheck, 'Audit trail', 'Requires governance audit event feed.'],
          [Database, 'Master data & pathways', 'Requires versioned master-data contract.'],
          [AlertTriangle, 'Incidents & integrations', 'Requires incident and integration health endpoints.']
        ].map(([Icon, title, text]) => {
          const Glyph = Icon as typeof ClipboardCheck
          return <Card key={title as string} className="space-y-2"><Glyph className="size-5 text-primary" /><h2 className="font-semibold">{title as string}</h2><p className="text-sm text-muted-foreground">{text as string}</p></Card>
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Care Pathways Tab (022)
// ─────────────────────────────────────────────────────────────────────────────

function CarePathwaysTab() {
  const [pathways, setPathways] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('c2_versions', { p_offset: 0 })
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setPathways(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch care pathways')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handlePublish = async (versionId: string) => {
    setPublishing(versionId)
    setError('')
    try {
      const { error: pubErr } = await supabase.rpc('c2_publish', { p_version: versionId })
      if (pubErr) throw pubErr
      await loadData()
    } catch (e: any) {
      setError(e?.message || 'Publishing requires a clinically reviewed version')
    } finally {
      setPublishing(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Governed Care Pathways (022 c2_versions)</h2>
          <p className="text-xs text-muted-foreground">
            Immutable, versioned care pathways with clinician review and administrative publication gating.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-primary/20 bg-primary/5 text-xs text-muted-foreground">
        <GitBranch className="size-5 text-primary shrink-0 mt-0.5" />
        <p>
          Pathways are formally drafted via <code>c2_define</code>, clinically reviewed by an approved doctor via <code>c2_review</code>, and published by governance via <code>c2_publish</code>. Activations require explicit clinician entry-criteria attestation.
        </p>
      </Card>

      {error && <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}
      {loading && <p className="text-sm text-muted-foreground">Loading care pathway versions…</p>}

      {!loading && pathways.length === 0 && !error && (
        <Card className="text-center py-6 text-sm text-muted-foreground">
          No care pathway definitions found in this deployment. Draft pathways using <code>c2_define</code>.
        </Card>
      )}

      <div className="space-y-3">
        {pathways.map((p) => (
          <Card key={p.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base">{p.title || p.code}</span>
                  <Badge tone="info">v{p.version}</Badge>
                  <Badge tone={p.status === 'APPROVED' ? 'teal' : p.status === 'CLINICALLY_REVIEWED' ? 'warning' : 'neutral'}>
                    {p.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Code: {p.code} · ID: {p.id}</p>
              </div>
              {p.status === 'CLINICALLY_REVIEWED' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void handlePublish(p.id)}
                  disabled={publishing === p.id}
                >
                  <CheckCircle2 className="size-4 mr-1" />
                  {publishing === p.id ? 'Publishing…' : 'Publish Version'}
                </Button>
              )}
            </div>

            {p.review_note && (
              <div className="rounded bg-muted/50 p-2.5 text-xs">
                <span className="font-semibold text-muted-foreground">Clinical Review Note:</span> {p.review_note}
              </div>
            )}

            {p.specification?.steps && Array.isArray(p.specification.steps) && (
              <div className="text-xs space-y-1 pt-1">
                <span className="font-semibold text-muted-foreground">Protocol Steps ({p.specification.steps.length}):</span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {p.specification.steps.map((s: any, idx: number) => (
                    <span key={idx} className="rounded bg-background px-2 py-0.5 border text-[11px]">
                      {s.label || s.key} ({s.actor || s.category})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI Model Registry Tab (029)
// ─────────────────────────────────────────────────────────────────────────────

function ModelRegistryTab() {
  const [data, setData] = useState<{ models: any[]; routes: any[] }>({ models: [], routes: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res, error: rpcErr } = await supabase.rpc('m1_registry')
      if (rpcErr) {
        setError(rpcErr.message)
      } else if (res && typeof res === 'object') {
        setData({
          models: Array.isArray((res as any).models) ? (res as any).models : [],
          routes: Array.isArray((res as any).routes) ? (res as any).routes : [],
        })
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch AI model registry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Model Registry & Safe Routes (029 m1_registry)</h2>
          <p className="text-xs text-muted-foreground">
            Evaluation-gated deployment registry. No model can be routed without passing independent offline evaluation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-teal/30 bg-teal/5 text-xs text-muted-foreground">
        <Cpu className="size-5 text-teal shrink-0 mt-0.5" />
        <p>
          Model versions declare capabilities (<code>SOURCE_SELECTION</code>, <code>GROUNDED_ANSWER</code>, <code>DOCUMENT_EXTRACTION</code>, etc.) and languages. Deployments require an evaluation pass with zero unsupported claims, zero unsafe actions, and perfect citation accuracy.
        </p>
      </Card>

      {error && <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}
      {loading && <p className="text-sm text-muted-foreground">Loading model registry and active routes…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Active Routes */}
        <Card className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center justify-between">
            <span>Active Capability Routes</span>
            <Badge tone="teal">{data.routes.length} routed</Badge>
          </h3>
          {data.routes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No capability routes deployed. Register and evaluate models first.</p>
          ) : (
            <div className="space-y-2">
              {data.routes.map((r, i) => (
                <div key={i} className="rounded-lg border p-2.5 text-xs space-y-1 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">{r.capability}</span>
                    <Badge tone="neutral">{r.language}</Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Revision: {r.revision} · Fallback allowed: {r.allow_external_fallback ? 'Yes' : 'No'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Registered Models */}
        <Card className="space-y-3">
          <h3 className="font-semibold text-sm flex items-center justify-between">
            <span>Registered Model Versions</span>
            <Badge tone="info">{data.models.length} registered</Badge>
          </h3>
          {data.models.length === 0 ? (
            <p className="text-xs text-muted-foreground">No model versions registered in this environment.</p>
          ) : (
            <div className="space-y-2">
              {data.models.map((m) => (
                <div key={m.id} className="rounded-lg border p-2.5 text-xs space-y-1 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{m.model_name} <span className="font-normal text-muted-foreground">v{m.version}</span></span>
                    <Badge tone={m.provider_kind === 'OWN_MODEL' ? 'teal' : 'neutral'}>{m.provider_kind}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {m.capabilities?.map((c: string) => (
                      <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{c}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate pt-0.5">Config: {m.config_ref}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Model Learning Tab (030)
// ─────────────────────────────────────────────────────────────────────────────

function ModelLearningTab() {
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('m2_candidates', { p_limit: 30 })
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setCandidates(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch learning candidates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Owned-Model Learning & De-identification (030 m2_candidates)</h2>
          <p className="text-xs text-muted-foreground">
            Explicit opt-in feedback undergoing independent human review and de-identification before dataset compilation.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-warning/30 bg-warning/5 text-xs text-muted-foreground">
        <BrainCircuit className="size-5 text-warning shrink-0 mt-0.5" />
        <p>
          Training candidates originate ONLY from user feedback where <code>training_opt_in = true</code> and no withdrawal has occurred. An independent human reviewer must attest that all identifiers are removed before inclusion in an immutable dataset version via <code>m2_dataset</code>.
        </p>
      </Card>

      {error && <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}
      {loading && <p className="text-sm text-muted-foreground">Loading pending learning candidates…</p>}

      {!loading && candidates.length === 0 && !error && (
        <Card className="text-center py-6 text-sm text-muted-foreground">
          No pending opt-in feedback candidates awaiting de-identification review.
        </Card>
      )}

      <div className="space-y-3">
        {candidates.map((c) => (
          <Card key={c.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-semibold text-xs text-muted-foreground">Candidate ID: {c.id}</span>
                <p className="mt-1 text-sm">{c.feedback}</p>
              </div>
              <Badge tone="warning">{c.state}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Received: {new Date(c.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Communications Tab (031)
// ─────────────────────────────────────────────────────────────────────────────

function CommsLifecycleTab() {
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('c4_messages', { p_offset: 0 })
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setMessages(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch communication messages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Consented Communication Outbox (031 c4_messages)</h2>
          <p className="text-xs text-muted-foreground">
            Audited multi-channel notification lifecycle. Delivery receipts never fabricate clinical work completion.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-teal/20 bg-teal/5 text-xs text-muted-foreground">
        <Mail className="size-5 text-teal shrink-0 mt-0.5" />
        <p>
          Messages are dispatched via verified recipient channels (<code>SMS</code> or <code>EMAIL</code>) with strict 24-hour expiration. Receipt acknowledgement (<code>c4_acknowledge</code>) records communication verification only; clinical review remains an independent signed workflow.
        </p>
      </Card>

      {error && <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}
      {loading && <p className="text-sm text-muted-foreground">Loading communication lifecycle messages…</p>}

      {!loading && messages.length === 0 && !error && (
        <Card className="text-center py-6 text-sm text-muted-foreground">
          No communication records in your authorized outbox queue.
        </Card>
      )}

      <div className="space-y-3">
        {messages.map((m) => (
          <Card key={m.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs">Source: {m.source_kind}</span>
              <Badge tone={m.state === 'DELIVERED' || m.state === 'ACKNOWLEDGED' ? 'teal' : m.state === 'QUEUED' ? 'warning' : 'neutral'}>
                {m.state}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Message ID: {m.id} · Ref: {m.source_id}</p>
            <p className="text-[11px] text-muted-foreground">Created: {new Date(m.created_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Incidents Tab (037)
// ─────────────────────────────────────────────────────────────────────────────

function IncidentsTab() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('a4_incidents', { p_offset: 0 })
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setIncidents(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch governance incidents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Governance Incidents & Retention (037 a4_incidents)</h2>
          <p className="text-xs text-muted-foreground">
            Audited operational incidents, retention policy approvals, and pathway retirement records.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-destructive/20 bg-destructive/5 text-xs text-muted-foreground">
        <ShieldAlert className="size-5 text-destructive shrink-0 mt-0.5" />
        <p>
          Governance incidents record security, privacy, clinical workflow, and data quality issues. State transitions (<code>OPEN → TRIAGED → INVESTIGATING → RESOLVED → CLOSED</code>) enforce optimistic revision locking and required disposition notes.
        </p>
      </Card>

      {error && <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</Card>}
      {loading && <p className="text-sm text-muted-foreground">Loading governance incident records…</p>}

      {!loading && incidents.length === 0 && !error && (
        <Card className="text-center py-6 text-sm text-muted-foreground">
          No governance incidents recorded in the system.
        </Card>
      )}

      <div className="space-y-3">
        {incidents.map((inc) => (
          <Card key={inc.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-semibold text-sm">{inc.summary}</span>
                <p className="text-xs text-muted-foreground mt-0.5">Category: {inc.category} · Revision: {inc.revision}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {inc.severity && <Badge tone={inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'danger' : 'warning'}>{inc.severity}</Badge>}
                <Badge tone={inc.state === 'RESOLVED' || inc.state === 'CLOSED' ? 'teal' : 'neutral'}>{inc.state}</Badge>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Updated: {new Date(inc.updated_at).toLocaleString()}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Identity Linking & Duplicate Resolution Tab (038 x1_*)
// ─────────────────────────────────────────────────────────────────────────────

function IdentityResolutionTab() {
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Propose form state
  const [showPropose, setShowPropose] = useState(false)
  const [aliasId, setAliasId] = useState('')
  const [canonicalId, setCanonicalId] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [proposing, setProposing] = useState(false)

  // Link / Unlink action state
  const [reviewNote, setReviewNote] = useState('')
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null)
  const [actionKind, setActionKind] = useState<'link' | 'unlink' | null>(null)
  const [actionBusy, setActionBusy] = useState(false)

  // Inspection state
  const [inspectPatientId, setInspectPatientId] = useState('')
  const [identityResult, setIdentityResult] = useState<any>(null)
  const [inspecting, setInspecting] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('x1_candidates')
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setCandidates(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch identity candidates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aliasId.trim() || !canonicalId.trim() || evidenceRef.trim().length < 10) {
      setError('Alias ID, Canonical ID, and at least 10 characters evidence reference are required.')
      return
    }
    setProposing(true)
    setError('')
    setActionSuccess('')
    try {
      const reqKey = crypto.randomUUID()
      const { error: rpcErr } = await supabase.rpc('x1_propose', {
        p_alias: aliasId.trim(),
        p_canonical: canonicalId.trim(),
        p_evidence: evidenceRef.trim(),
        p_request: reqKey,
      })
      if (rpcErr) throw rpcErr
      setActionSuccess('Identity duplicate resolution proposed successfully. Dual-owner confirmation is required before linking.')
      setAliasId('')
      setCanonicalId('')
      setEvidenceRef('')
      setShowPropose(false)
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to propose identity link')
    } finally {
      setProposing(false)
    }
  }

  const handleLink = async (candidateId: string) => {
    if (reviewNote.trim().length < 10) {
      setError('Governance identity review note must be at least 10 characters long.')
      return
    }
    setActionBusy(true)
    setError('')
    setActionSuccess('')
    try {
      const { error: rpcErr } = await supabase.rpc('x1_link', {
        p_candidate: candidateId,
        p_note: reviewNote.trim(),
      })
      if (rpcErr) throw rpcErr
      setActionSuccess('Identities successfully linked under alias reference. No records or permissions were modified.')
      setActiveCandidateId(null)
      setActionKind(null)
      setReviewNote('')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to link identities (cycle or dual-consent check failed)')
    } finally {
      setActionBusy(false)
    }
  }

  const handleUnlink = async (candidateId: string) => {
    if (reviewNote.trim().length < 10) {
      setError('Governance unmerge reason must be at least 10 characters long.')
      return
    }
    setActionBusy(true)
    setError('')
    setActionSuccess('')
    try {
      const { error: rpcErr } = await supabase.rpc('x1_unlink', {
        p_candidate: candidateId,
        p_reason: reviewNote.trim(),
      })
      if (rpcErr) throw rpcErr
      setActionSuccess('Identity alias link deactivated. The source profiles remain completely autonomous.')
      setActiveCandidateId(null)
      setActionKind(null)
      setReviewNote('')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to unlink identity alias')
    } finally {
      setActionBusy(false)
    }
  }

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inspectPatientId.trim()) return
    setInspecting(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('x1_identity', {
        p_patient: inspectPatientId.trim(),
      })
      if (rpcErr) throw rpcErr
      setIdentityResult(data)
    } catch (err: any) {
      setError(err?.message || 'Failed to resolve identity')
      setIdentityResult(null)
    } finally {
      setInspecting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Identity Linking & Duplicate Resolution (038 x1_*)</h2>
          <p className="text-xs text-muted-foreground">
            Reversible, consented identity aliasing. Source rows and authorization identities never move.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPropose(!showPropose)}>
            <Fingerprint className="size-4 mr-1 text-primary" />
            {showPropose ? 'Close Form' : 'Propose Resolution'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="flex items-start gap-3 border-teal/25 bg-teal/5 text-xs text-muted-foreground">
        <Fingerprint className="size-5 text-teal shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-teal-800">
            Alias reference only. Source records, consent and access remain bound to original patient identity. No clinical history was moved or combined.
          </p>
          <p className="mt-1">
            <strong>Non-Destructive Link Semantics:</strong> This console provides identity alias management. It is <strong>never</strong> a destructive database merge. Source records, clinical provenance, consent, and authentication stay bound to each original identity. Linking requires <strong>explicit confirmation from both identity owners</strong> (<code>alias_confirmed</code> &amp; <code>canonical_confirmed</code>). Cycles and topological chains are prevented by database advisory locks.
          </p>
        </div>
      </Card>

      {actionSuccess && (
        <Card className="border-success/30 bg-success/5 p-3 text-sm text-success">
          {actionSuccess}
        </Card>
      )}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* Propose Form */}
      {showPropose && (
        <Card className="space-y-3 border-primary/30 bg-primary/5 p-4">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <Fingerprint className="size-4 text-primary" /> Propose Duplicate Resolution (x1_propose)
          </h3>
          <form onSubmit={handlePropose} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Alias Patient Profile UUID (Duplicate)
                </label>
                <input
                  type="text"
                  value={aliasId}
                  onChange={(e) => setAliasId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Canonical Patient Profile UUID (Primary Anchor)
                </label>
                <input
                  type="text"
                  value={canonicalId}
                  onChange={(e) => setCanonicalId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Evidence Reference &amp; Duplicate Provenance (min 10 chars)
              </label>
              <textarea
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder="e.g. Matched verified demographic attributes: DOB 1985-04-12, ABHA cross-reference, and verified phone number."
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowPropose(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={proposing}>
                {proposing ? 'Submitting…' : 'Submit Duplicate Proposal'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Identity Canonical Lookup Tester */}
      <Card className="space-y-3 p-3 bg-background">
        <h3 className="font-semibold text-xs flex items-center gap-1.5">
          <Link2 className="size-3.5 text-primary" /> Test Identity Resolution (x1_identity)
        </h3>
        <form onSubmit={handleInspect} className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={inspectPatientId}
            onChange={(e) => setInspectPatientId(e.target.value)}
            placeholder="Enter Patient UUID to resolve canonical anchor…"
            className="flex-1 min-w-[240px] rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono"
          />
          <Button type="submit" size="sm" variant="outline" disabled={inspecting || !inspectPatientId.trim()}>
            {inspecting ? 'Resolving…' : 'Resolve Identity'}
          </Button>
        </form>
        {identityResult && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source Identity:</span>
              <span className="font-mono">{identityResult.source_patient_id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Canonical Reference:</span>
              <span className="font-mono font-bold text-primary">{identityResult.canonical_reference}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Authorization Anchor:</span>
              <span className="font-mono">{identityResult.authorization_patient_id}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
              {identityResult.notice}
            </p>
          </div>
        )}
      </Card>

      {/* Candidates List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Identity Candidate Worklist</h3>
          <Badge tone={candidates.length > 0 ? 'teal' : 'neutral'}>{candidates.length} candidates</Badge>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading identity candidates…</p>}

        {!loading && candidates.length === 0 && !error && (
          <Card className="text-center py-6 text-sm text-muted-foreground">
            No identity link candidates proposed. Use the &ldquo;Propose Resolution&rdquo; action above to initiate a dual-consented resolution.
          </Card>
        )}

        {candidates.map((c) => (
          <Card key={c.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {c.alias_name || 'Alias'} ({c.alias_patient_code || c.alias_patient_id.slice(0, 8)})
                  </span>
                  <span className="text-muted-foreground text-xs">&rarr;</span>
                  <span className="font-semibold text-sm text-primary">
                    {c.canonical_name || 'Canonical Anchor'} ({c.canonical_patient_code || c.canonical_patient_id.slice(0, 8)})
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  Candidate ID: {c.id}
                </p>
              </div>
              <Badge tone={c.state === 'LINKED' ? 'teal' : c.state === 'PROPOSED' ? 'warning' : 'neutral'}>
                {c.state}
              </Badge>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-2 bg-muted/40 p-2.5 rounded-lg">
              <div>
                <p className="text-muted-foreground">Alias Owner Consent:</p>
                <p className="font-medium mt-0.5">
                  {c.alias_confirmed ? (
                    <span className="text-success flex items-center gap-1"><Check className="size-3" /> Confirmed</span>
                  ) : (
                    <span className="text-warning">Pending Owner Authorization</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Canonical Owner Consent:</p>
                <p className="font-medium mt-0.5">
                  {c.canonical_confirmed ? (
                    <span className="text-success flex items-center gap-1"><Check className="size-3" /> Confirmed</span>
                  ) : (
                    <span className="text-warning">Pending Owner Authorization</span>
                  )}
                </p>
              </div>
            </div>

            {c.evidence_reference && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Evidence:</span> {c.evidence_reference}
              </p>
            )}

            {/* Action Box */}
            <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Proposed: {new Date(c.created_at).toLocaleString()}
              </p>
              <div className="flex gap-2">
                {c.state === 'PROPOSED' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!c.alias_confirmed || !c.canonical_confirmed}
                      onClick={() => {
                        setActiveCandidateId(c.id)
                        setActionKind('link')
                      }}
                    >
                      <Link2 className="size-3.5 mr-1" /> Finalize Link (x1_link)
                    </Button>
                  </>
                )}
                {c.state === 'LINKED' && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setActiveCandidateId(c.id)
                      setActionKind('unlink')
                    }}
                  >
                    <Unlink className="size-3.5 mr-1" /> Unlink (x1_unlink)
                  </Button>
                )}
              </div>
            </div>

            {/* Link / Unlink Note Input Modal-like drawer */}
            {activeCandidateId === c.id && (
              <div className="p-3 bg-secondary/20 rounded-lg space-y-2 border border-border">
                <p className="text-xs font-semibold">
                  {actionKind === 'link' ? 'Provide Identity Review Note (x1_link)' : 'Provide Unmerge Reason (x1_unlink)'}
                </p>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder={actionKind === 'link' ? 'Attest that dual owner consents and source identity fingerprints have been verified...' : 'Reason for deactivating this identity link...'}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setActiveCandidateId(null); setActionKind(null); setReviewNote(''); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={actionKind === 'link' ? 'primary' : 'danger'}
                    disabled={actionBusy || reviewNote.trim().length < 10}
                    onClick={() => actionKind === 'link' ? handleLink(c.id) : handleUnlink(c.id)}
                  >
                    {actionBusy ? 'Processing…' : actionKind === 'link' ? 'Confirm Link' : 'Confirm Unlink'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Integration Registry & Health Tab (039 x2_*)
// ─────────────────────────────────────────────────────────────────────────────

function IntegrationRegistryTab() {
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Register Form State
  const [showRegister, setShowRegister] = useState(false)
  const [kind, setKind] = useState('ABDM_ABHA')
  const [providerName, setProviderName] = useState('')
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX')
  const [endpointOrigin, setEndpointOrigin] = useState('')
  const [configRef, setConfigRef] = useState('')
  const [registering, setRegistering] = useState(false)

  // Toggle state
  const [toggleIntegrationId, setToggleIntegrationId] = useState<string | null>(null)
  const [toggleReason, setToggleReason] = useState('')
  const [toggleBusy, setToggleBusy] = useState(false)

  // Sync state
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('x2_health')
      if (rpcErr) {
        setError(rpcErr.message)
      } else {
        setIntegrations(Array.isArray(data) ? data : [])
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch platform integrations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!providerName.trim() || !endpointOrigin.trim() || !configRef.trim()) {
      setError('Provider name, valid HTTPS origin, and config reference are required.')
      return
    }
    setRegistering(true)
    setError('')
    setSuccess('')
    try {
      const reqKey = crypto.randomUUID()
      const { error: rpcErr } = await supabase.rpc('x2_register', {
        p_kind: kind,
        p_provider: providerName.trim(),
        p_environment: environment,
        p_origin: endpointOrigin.trim(),
        p_config_ref: configRef.trim(),
        p_facility: null,
        p_request: reqKey,
      })
      if (rpcErr) throw rpcErr
      setSuccess('Platform integration registered successfully (default disabled).')
      setProviderName('')
      setEndpointOrigin('')
      setConfigRef('')
      setShowRegister(false)
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to register platform integration')
    } finally {
      setRegistering(false)
    }
  }

  const handleToggle = async (item: any) => {
    if (toggleReason.trim().length < 10) {
      setError('Governance decision reason must be at least 10 characters long.')
      return
    }
    setToggleBusy(true)
    setError('')
    setSuccess('')
    try {
      const { error: rpcErr } = await supabase.rpc('x2_enable', {
        p_integration: item.id,
        p_enabled: !item.enabled,
        p_expected: item.revision,
        p_reason: toggleReason.trim(),
      })
      if (rpcErr) throw rpcErr
      setSuccess(`Integration successfully ${!item.enabled ? 'enabled' : 'disabled'}.`)
      setToggleIntegrationId(null)
      setToggleReason('')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to update integration state (stale revision error)')
    } finally {
      setToggleBusy(false)
    }
  }

  const handleTriggerSync = async (item: any) => {
    setSyncingId(item.id)
    setError('')
    setSuccess('')
    try {
      const reqKey = crypto.randomUUID()
      const { error: rpcErr } = await supabase.rpc('x2_sync', {
        p_integration: item.id,
        p_request: reqKey,
      })
      if (rpcErr) throw rpcErr
      setSuccess('Integration sync run queued successfully.')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger sync run')
    } finally {
      setSyncingId(null)
    }
  }

  const [retryingId, setRetryingId] = useState<string | null>(null)

  const handleRetrySync = async (item: any) => {
    const failedRunId = item.latest_failure?.run_id
    if (!failedRunId) {
      setError('No failed sync run available for retry.')
      return
    }
    setRetryingId(item.id)
    setError('')
    setSuccess('')
    try {
      const reqKey = crypto.randomUUID()
      const { error: rpcErr } = await supabase.rpc('x2_retry', {
        p_failed_run: failedRunId,
        p_request: reqKey,
      })
      if (rpcErr) throw rpcErr
      setSuccess('Bounded retry queued successfully.')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Retry failed: terminal, exhausted or not yet eligible.')
    } finally {
      setRetryingId(null)
    }
  }

  const getHealthTone = (health: string) => {
    switch (health) {
      case 'OK': return 'success'
      case 'DEGRADED': return 'warning'
      case 'DOWN': return 'danger'
      case 'DISABLED': return 'outline'
      default: return 'neutral'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Platform Integration Registry &amp; System Health (039 x2_*)</h2>
          <p className="text-xs text-muted-foreground">
            Provider-independent integration metadata, evidenced observation receipts, and sync telemetry.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRegister(!showRegister)}>
            <Server className="size-4 mr-1 text-primary" />
            {showRegister ? 'Close Form' : 'Register Adapter'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`size-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card className="flex items-start gap-3 border-teal/25 bg-teal/5 text-xs text-muted-foreground">
        <Server className="size-5 text-teal shrink-0 mt-0.5" />
        <p>
          <strong>Evidenced Health &amp; Security:</strong> Integrations store HTTPS endpoint origins and secret-free configuration references. Health states (<code>OK</code>, <code>DEGRADED</code>, <code>DOWN</code>) are strictly derived from recent time-bounded observation receipts. Expired observations automatically degrade to <code>STATUS_UNKNOWN_CONFIRMATION_REQUIRED</code>.
        </p>
      </Card>

      {success && (
        <Card className="border-success/30 bg-success/5 p-3 text-sm text-success">
          {success}
        </Card>
      )}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* Register Adapter Form */}
      {showRegister && (
        <Card className="space-y-3 border-primary/30 bg-primary/5 p-4">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <Server className="size-4 text-primary" /> Register Platform Adapter (x2_register)
          </h3>
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Integration Kind</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <option value="ABDM_ABHA">ABDM / ABHA Bridge</option>
                  <option value="HPR_HFR">HPR / HFR Registry</option>
                  <option value="HIS_HMIS">HIS / HMIS Core</option>
                  <option value="LIS_RIS_PACS">LIS / RIS / PACS</option>
                  <option value="PHARMACY">Pharmacy / ERP</option>
                  <option value="PAYER">Insurance / Payer TPA</option>
                  <option value="EMERGENCY">Emergency Dispatch / 112</option>
                  <option value="VIDEO">Teleconsult Video Relay</option>
                  <option value="OCR">OCR / Document Intelligence</option>
                  <option value="AI">Grounded AI Gateway</option>
                  <option value="COMMUNICATION">SMS / Email Notification</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Provider / Adapter Name</label>
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="e.g. ABDM Sandbox Gateway"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Environment</label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as any)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <option value="SANDBOX">SANDBOX</option>
                  <option value="PRODUCTION">PRODUCTION</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">HTTPS Endpoint Origin</label>
                <input
                  type="text"
                  value={endpointOrigin}
                  onChange={(e) => setEndpointOrigin(e.target.value)}
                  placeholder="https://abdm-adapter.local:8443"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Configuration Reference (Key Name)</label>
                <input
                  type="text"
                  value={configRef}
                  onChange={(e) => setConfigRef(e.target.value)}
                  placeholder="ABDM_M2_SANDBOX_CONFIG"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono uppercase"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowRegister(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={registering}>
                {registering ? 'Registering…' : 'Register Integration'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Integration Registry List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Active Adapters &amp; Health State</h3>
          <Badge tone={integrations.length > 0 ? 'teal' : 'neutral'}>{integrations.length} registered</Badge>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading integration health…</p>}

        {!loading && integrations.length === 0 && !error && (
          <Card className="text-center py-6 text-sm text-muted-foreground">
            No platform adapters registered. Click &ldquo;Register Adapter&rdquo; to define integration metadata.
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {integrations.map((item) => (
            <Card key={item.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm">{item.provider_name}</span>
                    <Badge tone="info">{item.environment}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Kind: {item.kind} · Rev: {item.revision}</p>
                </div>
                <Badge tone={getHealthTone(item.health)}>
                  {item.health.replace(/_/g, ' ')}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs bg-muted/40 p-2.5 rounded-lg font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auth State:</span>
                  <span className="font-medium">{item.auth_state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Truth State (040):</span>
                  <span className={`font-semibold ${item.truth_state === 'HEALTHY' ? 'text-success' : item.truth_state === 'FAILED' ? 'text-destructive' : item.truth_state === 'STALE' ? 'text-warning' : 'text-muted-foreground'}`}>
                    {item.truth_state || 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enabled:</span>
                  <span className={item.enabled ? 'text-success font-semibold' : 'text-muted-foreground'}>
                    {item.enabled ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Successful Sync:</span>
                  <span>{item.last_successful_sync ? new Date(item.last_successful_sync).toLocaleString() : 'None'}</span>
                </div>
                {item.last_failed_sync && (
                  <div className="flex justify-between text-destructive">
                    <span className="text-muted-foreground">Last Failed Sync:</span>
                    <span>{new Date(item.last_failed_sync).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Latest Sync State:</span>
                  <span className="font-semibold">{item.latest_sync_state || 'IDLE'}</span>
                </div>
                {item.error_code && (
                  <div className="flex justify-between text-destructive">
                    <span>Error Code:</span>
                    <span>{item.error_code}</span>
                  </div>
                )}
                {item.latest_failure && (
                  <div className="mt-2 pt-2 border-t border-border/50 text-[11px] space-y-1 bg-destructive/5 p-2 rounded">
                    <div className="flex justify-between text-destructive font-semibold">
                      <span>Latest Failure:</span>
                      <span>{item.latest_failure.failure_class || 'UNKNOWN'}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Retry Attempts:</span>
                      <span>{item.latest_failure.retry_count ?? 0} / 3</span>
                    </div>
                    {item.latest_failure.next_retry_at && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Next Retry At:</span>
                        <span>{new Date(item.latest_failure.next_retry_at).toLocaleTimeString()}</span>
                      </div>
                    )}
                    {item.latest_failure.failure_class === 'TERMINAL' && (
                      <p className="text-[10px] text-destructive italic mt-1">
                        Terminal failure requires governance configuration review.
                      </p>
                    )}
                    {item.latest_failure.retry_count >= 3 && (
                      <p className="text-[10px] text-destructive italic mt-1">
                        Retries exhausted (3/3). Manual review required.
                      </p>
                    )}
                  </div>
                )}
                {item.valid_until && (
                  <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                    <span>Observation Valid Until:</span>
                    <span>{new Date(item.valid_until).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!item.enabled || syncingId === item.id || (item.latest_failure && item.latest_sync_state === 'FAILED')}
                    onClick={() => handleTriggerSync(item)}
                    title={item.latest_failure && item.latest_sync_state === 'FAILED' ? 'Failed run must use bounded retry' : 'Trigger full sync'}
                  >
                    <RefreshCw className={`size-3.5 mr-1 ${syncingId === item.id ? 'animate-spin' : ''}`} />
                    {syncingId === item.id ? 'Queuing…' : 'Trigger Sync'}
                  </Button>

                  {item.latest_failure?.retryable && item.enabled && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-warning/50 text-warning hover:bg-warning/10"
                      disabled={retryingId === item.id}
                      onClick={() => handleRetrySync(item)}
                    >
                      <RefreshCw className={`size-3.5 mr-1 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                      {retryingId === item.id ? 'Retrying…' : 'Bounded Retry (040)'}
                    </Button>
                  )}
                </div>

                <Button
                  size="sm"
                  variant={item.enabled ? 'danger' : 'primary'}
                  onClick={() => setToggleIntegrationId(item.id)}
                >
                  {item.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>

              {/* Decision Note Drawer */}
              {toggleIntegrationId === item.id && (
                <div className="p-3 bg-secondary/20 rounded-lg space-y-2 border border-border">
                  <p className="text-xs font-semibold">
                    Governance Decision Reason (min 10 chars)
                  </p>
                  <textarea
                    value={toggleReason}
                    onChange={(e) => setToggleReason(e.target.value)}
                    placeholder="Provide reason for enabling or disabling this integration adapter..."
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setToggleIntegrationId(null); setToggleReason(''); }}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant={item.enabled ? 'danger' : 'primary'}
                      disabled={toggleBusy || toggleReason.trim().length < 10}
                      onClick={() => handleToggle(item)}
                    >
                      {toggleBusy ? 'Updating…' : item.enabled ? 'Confirm Disable' : 'Confirm Enable'}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

