import { useEffect, useState } from 'react'
import {
  Stethoscope,
  FlaskConical,
  CheckCircle2,
  ClipboardCheck,
  Pill,
  ShoppingBag,
  Calendar,
  CheckCheck,
  Clock,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  GitFork,
  XCircle,
  ClockAlert
} from 'lucide-react'
import { Card, Badge, Button } from '@/components/kit'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/i18n'
import { navigate } from '@/lib/route'

/* ───────────────────────────── types ─────────────────────────────── */

export type CareNodeState =
  | 'REQUIRED'
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'TRANSFERRED'
  | 'UNABLE_TO_COMPLETE'
  | 'VERIFICATION_PENDING'
  | 'CANCELLED'

export interface EpisodeNode {
  id: string
  kind: string
  category: string
  state: CareNodeState
  responsible_role: string
  occurred_at: string | null
  due_at: string | null
  updated_at: string | null
  proof_kind: string | null
  proof_id: string | null
  ready?: boolean
}

export interface CareEpisodeSummary {
  id: string
  encounter_id: string
  patient_id: string
  doctor_provider_id: string
  status: 'ACTIVE' | 'COMPLETED'
  source_at: string
  created_at: string
  closed_at: string | null
  closure_outcome?: string | null
  nodes?: EpisodeNode[]
}

interface Props {
  patientId: string
}

function nodeIcon(kind: string) {
  switch (kind) {
    case 'APPOINTMENT':
      return Calendar
    case 'CONSULTATION':
    case 'ENCOUNTER':
      return Stethoscope
    case 'DIAGNOSTIC_ORDER':
    case 'LAB_ORDER':
      return FlaskConical
    case 'LAB_REPORT':
      return ClipboardCheck
    case 'DOCTOR_REVIEW':
    case 'DIAGNOSTIC_REVIEW':
      return CheckCircle2
    case 'PRESCRIPTION':
      return Pill
    case 'MEDICINE_FULFILMENT':
    case 'DISPENSE':
      return ShoppingBag
    case 'REFERRAL':
      return GitFork
    case 'FOLLOW_UP':
      return Clock
    case 'CLOSURE':
      return CheckCheck
    default:
      return Stethoscope
  }
}

function nodeLabel(kind: string, hindi: boolean): string {
  switch (kind) {
    case 'APPOINTMENT':
      return hindi ? 'अपॉइंटमेंट' : 'Appointment'
    case 'CONSULTATION':
    case 'ENCOUNTER':
      return hindi ? 'डॉक्टर परामर्श' : 'Consultation'
    case 'DIAGNOSTIC_ORDER':
    case 'LAB_ORDER':
      return hindi ? 'जाँच ऑर्डर' : 'Diagnostic Order'
    case 'LAB_REPORT':
      return hindi ? 'लैब रिपोर्ट' : 'Lab Report'
    case 'DOCTOR_REVIEW':
    case 'DIAGNOSTIC_REVIEW':
      return hindi ? 'डॉक्टर समीक्षा' : 'Doctor Review'
    case 'PRESCRIPTION':
      return hindi ? 'दवा पर्ची' : 'Prescription'
    case 'MEDICINE_FULFILMENT':
    case 'DISPENSE':
      return hindi ? 'दवा वितरण' : 'Pharmacy Fulfilment'
    case 'REFERRAL':
      return hindi ? 'रेफरल' : 'Referral'
    case 'FOLLOW_UP':
      return hindi ? 'फॉलो-अप' : 'Follow-up'
    case 'CLOSURE':
      return hindi ? 'इलाज समापन' : 'Episode Closure'
    default:
      return kind.replace(/_/g, ' ')
  }
}

function nodeActionRoute(kind: string): string | null {
  switch (kind) {
    case 'APPOINTMENT':
      return '/appointments'
    case 'CONSULTATION':
    case 'ENCOUNTER':
      return '/care'
    case 'DIAGNOSTIC_ORDER':
    case 'LAB_ORDER':
    case 'LAB_REPORT':
    case 'DOCTOR_REVIEW':
    case 'DIAGNOSTIC_REVIEW':
      return '/lab'
    case 'PRESCRIPTION':
      return '/prescriptions'
    case 'MEDICINE_FULFILMENT':
    case 'DISPENSE':
      return '/medicines'
    case 'FOLLOW_UP':
      return '/care'
    default:
      return null
  }
}

function stateBadgeTone(state: CareNodeState): 'success' | 'warning' | 'primary' | 'danger' | 'neutral' {
  switch (state) {
    case 'COMPLETED':
      return 'success'
    case 'IN_PROGRESS':
    case 'SCHEDULED':
      return 'primary'
    case 'PENDING':
    case 'REQUIRED':
    case 'VERIFICATION_PENDING':
      return 'warning'
    case 'BLOCKED':
    case 'DECLINED':
    case 'UNABLE_TO_COMPLETE':
    case 'CANCELLED':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function CareJourneyVisualizer({ patientId }: Props) {
  const { language } = useLanguage()
  const hindi = language === 'Hindi'

  const [episodes, setEpisodes] = useState<CareEpisodeSummary[]>([])
  const [selectedEpisode, setSelectedEpisode] = useState<CareEpisodeSummary | null>(null)
  const [nodes, setNodes] = useState<EpisodeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    async function loadEpisodes() {
      try {
        // Attempt to fetch real CareGraph episodes using g1_episodes or s1_snapshot_context
        const { data: epData, error: epErr } = await supabase.rpc('g1_episodes', {
          p_patient: patientId,
          p_offset: 0
        })

        if (epErr) {
          // Fallback to direct care_episodes table query if RPC is not permitted
          console.warn('g1_episodes RPC error, reading care_episodes:', epErr)
          const { data: directEps, error: directErr } = await supabase
            .from('care_episodes')
            .select('*')
            .eq('patient_id', patientId)
            .order('source_at', { ascending: false })
            .limit(10)

          if (directErr) throw directErr
          if (!active) return

          const eps = (directEps ?? []) as CareEpisodeSummary[]
          setEpisodes(eps)
          if (eps.length > 0) {
            setSelectedEpisode(eps[0])
            await loadNodesForEpisode(eps[0].id)
          }
        } else {
          if (!active) return
          const eps = (epData ?? []) as CareEpisodeSummary[]
          setEpisodes(eps)
          if (eps.length > 0) {
            setSelectedEpisode(eps[0])
            await loadNodesForEpisode(eps[0].id)
          }
        }
      } catch (err: unknown) {
        console.warn('Care journey load error:', err)
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    async function loadNodesForEpisode(episodeId: string) {
      const { data: nodeData, error: nodeErr } = await supabase
        .from('care_nodes')
        .select('*')
        .eq('episode_id', episodeId)
        .order('due_at', { ascending: true, nullsFirst: false })

      if (nodeErr) {
        console.warn('care_nodes query error:', nodeErr)
        return
      }

      setNodes((nodeData ?? []) as EpisodeNode[])
    }

    void loadEpisodes()

    return () => {
      active = false
    }
  }, [patientId])

  async function handleSelectEpisode(ep: CareEpisodeSummary) {
    setSelectedEpisode(ep)
    const { data: nodeData } = await supabase
      .from('care_nodes')
      .select('*')
      .eq('episode_id', ep.id)
      .order('due_at', { ascending: true, nullsFirst: false })

    setNodes((nodeData ?? []) as EpisodeNode[])
  }

  if (loading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground animate-pulse">
          {hindi ? 'इलाज का सफर (CareGraph) लोड हो रहा है…' : 'Loading linked CareGraph episode nodes…'}
        </p>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-4 border-destructive/20 bg-destructive/5 text-sm text-destructive flex items-center gap-2">
        <AlertCircle className="size-4 shrink-0" />
        <span>{error}</span>
      </Card>
    )
  }

  if (episodes.length === 0) {
    return (
      <Card className="p-6 text-center space-y-2 border-dashed">
        <GitFork className="size-8 mx-auto text-muted-foreground" />
        <h3 className="font-semibold text-foreground">
          {hindi ? 'कोई सक्रिय इलाज सफर (Care Episode) नहीं है' : 'No Linked Care Episodes Yet'}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {hindi
            ? 'डॉक्टर से परामर्श के बाद आपका इलाज चक्र और उससे जुड़े चरण (CareGraph) यहाँ स्वतः जुड़ जाते हैं।'
            : 'Care episodes and their linked diagnostic, prescription, and follow-up nodes are created upon completed consultation.'}
        </p>
      </Card>
    )
  }

  const activeNodes = nodes.filter(n => n.state !== 'COMPLETED' && n.state !== 'CANCELLED')
  const completedNodes = nodes.filter(n => n.state === 'COMPLETED')

  return (
    <Card className="space-y-5 p-5">
      {/* Header & Episode Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <GitFork className="size-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <span>{hindi ? 'सक्रिय इलाज सफर (CareGraph)' : 'Episode CareGraph'}</span>
              <Badge tone={selectedEpisode?.status === 'COMPLETED' ? 'success' : 'primary'}>
                {selectedEpisode?.status === 'COMPLETED'
                  ? (hindi ? 'समाप्त' : 'Completed')
                  : (hindi ? 'सक्रिय' : 'Active Episode')}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground font-tabular">
              {selectedEpisode?.source_at &&
                new Date(selectedEpisode.source_at).toLocaleDateString([], {
                  dateStyle: 'medium'
                })}
              {' · '}
              {nodes.length} {hindi ? 'जुड़े हुए चरण' : 'linked nodes'}
            </p>
          </div>
        </div>

        {episodes.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <span className="text-muted-foreground">{hindi ? 'सफर:' : 'Episode:'}</span>
            {episodes.map((ep, idx) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => handleSelectEpisode(ep)}
                className={`px-2 py-1 rounded-md border text-xs font-semibold ${
                  selectedEpisode?.id === ep.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                #{idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nodes Stepper / Timeline */}
      {nodes.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
          {hindi ? 'इस इलाज चक्र में अभी कोई चरण नहीं जुड़ा है।' : 'No nodes recorded for this care episode.'}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="label-xs text-muted-foreground uppercase tracking-wider">
            {hindi ? 'इलाज के वास्तविक चरण (सत्यापित डेटा)' : 'Linked Care Episode Timeline'}
          </p>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {nodes.map((node) => {
              const Icon = nodeIcon(node.kind)
              const route = nodeActionRoute(node.kind)
              const isCompleted = node.state === 'COMPLETED'

              return (
                <div key={node.id} className="relative flex items-start gap-3 text-xs">
                  {/* Step node icon circle */}
                  <div
                    className={`absolute -left-6 mt-0.5 grid size-5 place-items-center rounded-full border bg-card ${
                      isCompleted
                        ? 'border-success text-success'
                        : node.state === 'IN_PROGRESS'
                          ? 'border-primary text-primary animate-pulse'
                          : 'border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="size-3.5" /> : <div className="size-2 rounded-full bg-current" />}
                  </div>

                  <div className="flex-1 rounded-xl border border-border/70 p-3 bg-secondary/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5 text-primary shrink-0" />
                        <span className="font-bold text-foreground text-xs">
                          {nodeLabel(node.kind, hindi)}
                        </span>
                        <Badge tone={stateBadgeTone(node.state)}>
                          {node.state.replace(/_/g, ' ')}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        {hindi ? 'जिम्मेदार भूमिका:' : 'Responsible:'}{' '}
                        <span className="font-semibold text-foreground">{node.responsible_role}</span>
                        {node.due_at && (
                          <span className="ml-2 font-tabular">
                            {hindi ? 'अंतिम तिथि:' : 'Due:'} {new Date(node.due_at).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>

                    {route && !isCompleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="self-start sm:self-center shrink-0 text-xs"
                        onClick={() => navigate(route)}
                      >
                        <span>{hindi ? 'देखें' : 'Action'}</span>
                        <ArrowRight className="size-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}
