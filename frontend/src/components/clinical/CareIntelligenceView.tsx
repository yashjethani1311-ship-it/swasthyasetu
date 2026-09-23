import { useEffect, useState } from "react";
import {
  Activity,
  History,
  GitBranch,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Pill,
  FlaskConical,
  Stethoscope,
  ShieldCheck,
  TrendingUp,
  MapPin,
  RefreshCw,
  FileText,
  Lock,
  ChevronRight,
  ExternalLink,
  Info
} from "lucide-react";
import { Badge, Button, Card, Stat, SectionTitle } from "@/components/kit";
import { supabase } from "@/lib/supabase";
import { rpc, errorText } from "@/lib/diagnostics/service";

export interface CareIntelligenceViewProps {
  patientId?: string;
  facilityId?: string;
  episodeId?: string;
  initialMode?: "REPLAY" | "TWIN" | "PULSE";
}

export function CareIntelligenceView({
  patientId,
  facilityId,
  episodeId,
  initialMode = "REPLAY"
}: CareIntelligenceViewProps) {
  const [mode, setMode] = useState<"REPLAY" | "TWIN" | "PULSE">(initialMode);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            Care Intelligence System
          </h2>
          <p className="text-xs text-muted-foreground">
            Longitudinal care replay (041), operational twin state (042), and governed district health telemetry (043/050)
          </p>
        </div>

        <div className="flex rounded-lg bg-secondary/50 p-1 border border-border">
          <button
            type="button"
            onClick={() => setMode("REPLAY")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              mode === "REPLAY" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="size-3.5" />
            Care Replay
          </button>
          <button
            type="button"
            onClick={() => setMode("TWIN")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              mode === "TWIN" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <GitBranch className="size-3.5" />
            Care Twin
          </button>
          <button
            type="button"
            onClick={() => setMode("PULSE")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              mode === "PULSE" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-3.5" />
            District Pulse
          </button>
        </div>
      </div>

      {mode === "REPLAY" && <CareReplay patientId={patientId} episodeId={episodeId} />}
      {mode === "TWIN" && <CareTwin patientId={patientId} episodeId={episodeId} />}
      {mode === "PULSE" && <DistrictPulse facilityId={facilityId} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. CARE REPLAY (Migration 041 t1_replay Backend Wiring)
// ─────────────────────────────────────────────────────────────────────────────

interface ReplayEvent {
  event_key: string;
  patient_id: string;
  episode_id: string | null;
  recorded_at: string;
  occurred_at: string;
  actor_user_id: string | null;
  facility_id: string | null;
  source_entity: string;
  source_id: string;
  event_type: string;
  previous_state: string | null;
  resulting_state: string | null;
  verification_state: string;
  safe_metadata: {
    revision?: number;
    capture_kind?: string;
    closure_outcome?: string | null;
    actor_role_at_event?: string | null;
    [key: string]: any;
  };
  provenance: string;
}

function CareReplay({ patientId, episodeId }: { patientId?: string; episodeId?: string }) {
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<{ recorded_at: string; event_key: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchReplay = async (isMore = false) => {
    if (!patientId) {
      setEvents([]);
      return;
    }

    if (isMore) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }

    try {
      const { data, error: rpcErr } = await supabase.rpc("t1_replay", {
        p_patient: patientId,
        p_purpose: "TREATMENT",
        p_episode: episodeId || null,
        p_limit: 30,
        ...(isMore && nextCursor
          ? {
              p_before: nextCursor.recorded_at,
              p_before_key: nextCursor.event_key
            }
          : {})
      });

      if (rpcErr) {
        throw rpcErr;
      }

      const items = Array.isArray(data?.items) ? data.items : [];
      setNotice(data?.notice || "");
      setNextCursor(data?.next_cursor || null);

      if (isMore) {
        setEvents((prev) => [...prev, ...items]);
      } else {
        setEvents(items);
      }
    } catch (e: any) {
      const msg = errorText(e);
      if (msg.toLowerCase().includes("consent") || msg.toLowerCase().includes("authorized")) {
        setError("Care Replay access is unauthorized or consent has been revoked.");
      } else {
        setError(msg || "Care Replay backend contract (041 t1_replay) unavailable.");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void fetchReplay(false);
  }, [patientId, episodeId]);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle
          title="Chronological Care Replay (041 t1_replay)"
          sub="Consent-governed immutable operational provenance reconstructed from backend transactions"
          icon={<History className="size-4" />}
        />
        {events.length > 0 && (
          <Badge tone="teal" className="text-[10px] font-mono">
            IMMUTABLE_SOURCE_EVIDENCE
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className="rounded-lg border border-border bg-surface-subtle/40 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="size-3.5 text-primary shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {!patientId ? (
        <div className="p-8 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
          Select or load a patient record to view longitudinal Care Replay events.
        </div>
      ) : loading ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Querying 041 t1_replay consent-scoped evidence stream…
        </p>
      ) : events.length === 0 && !error ? (
        <div className="p-6 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
          No persisted operational evidence recorded for this patient under active consent.
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="relative border-l border-border/80 ml-3 space-y-4 pt-2">
            {events.map((e) => (
              <li key={e.event_key} className="ml-6 space-y-1.5">
                <span className="absolute -left-2 mt-1 size-4 rounded-full border-2 border-background bg-primary grid place-items-center text-white" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground font-mono">{e.event_type}</span>
                    <Badge tone="outline" className="text-[10px] py-0 px-1.5 font-mono">
                      {e.verification_state}
                    </Badge>
                    {e.safe_metadata?.actor_role_at_event && (
                      <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded font-medium text-foreground">
                        {e.safe_metadata.actor_role_at_event}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-tabular flex items-center gap-2">
                    <span>Observed: {new Date(e.recorded_at).toLocaleString("en-IN")}</span>
                    {e.occurred_at && e.occurred_at !== e.recorded_at && (
                      <span className="italic">(Occurred: {new Date(e.occurred_at).toLocaleDateString("en-IN")})</span>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-surface-subtle/50 p-2.5 text-xs text-muted-foreground space-y-1 border border-border/40">
                  <div className="flex flex-wrap items-center justify-between text-[11px] gap-2">
                    <span>
                      <strong className="text-foreground/80">Entity:</strong> {e.source_entity} · ID:{" "}
                      <code className="font-mono text-[10px]">{e.source_id.slice(0, 8)}</code>
                    </span>
                    {e.episode_id && (
                      <span>
                        <strong className="text-foreground/80">Episode:</strong>{" "}
                        <code className="font-mono text-[10px]">{e.episode_id.slice(0, 8)}</code>
                      </span>
                    )}
                  </div>

                  {(e.previous_state || e.resulting_state) && (
                    <div className="text-[11px] pt-1 border-t border-border/30 flex items-center gap-1.5">
                      <strong className="text-foreground/80">State Transition:</strong>
                      <span className="line-through text-muted-foreground">{e.previous_state || "START"}</span>
                      <ChevronRight className="size-3 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{e.resulting_state}</span>
                    </div>
                  )}

                  {e.safe_metadata?.closure_outcome && (
                    <p className="text-[11px] text-teal-800">
                      <strong>Outcome:</strong> {e.safe_metadata.closure_outcome}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {nextCursor && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchReplay(true)}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading older evidence…" : "Load Older Evidence"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CARE TWIN (Migration 042 t2_twin Operational State Projection)
// ─────────────────────────────────────────────────────────────────────────────

interface TwinData {
  episode: {
    id: string;
    patient_id: string;
    encounter_id: string | null;
    status: string;
    closure_outcome: string | null;
    source_at: string;
    closed_at: string | null;
  };
  nodes: any[];
  care_gaps: any[];
  next_steps: any[];
  pathways: any[];
  appointments: any[];
  diagnostics: any[];
  prescriptions: any[];
  referrals: any[];
  follow_ups: any[];
  payer_cases: any[];
  emergencies: any[];
  critical_results: any[];
  external_claims: any[];
  as_of: string;
  provenance: string;
  notice: string;
}

function CareTwin({ patientId, episodeId: propEpisodeId }: { patientId?: string; episodeId?: string }) {
  const [twin, setTwin] = useState<TwinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(propEpisodeId || null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!patientId) {
        setTwin(null);
        return;
      }

      setLoading(true);
      setError("");

      try {
        let epId = propEpisodeId;

        // If no episodeId passed, query latest active episode for this patient
        if (!epId) {
          const { data: epData, error: epErr } = await supabase
            .from("care_episodes")
            .select("id, status, source_at")
            .eq("patient_id", patientId)
            .order("source_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (epErr) throw epErr;
          if (epData?.id) {
            epId = epData.id;
            if (active) setActiveEpisodeId(epId ?? null);
          }
        }

        if (!epId) {
          if (active) {
            setTwin(null);
            setLoading(false);
          }
          return;
        }

        const { data, error: rpcErr } = await supabase.rpc("t2_twin", {
          p_episode: epId,
          p_purpose: "TREATMENT"
        });

        if (rpcErr) throw rpcErr;
        if (active) setTwin(data);
      } catch (e: any) {
        if (active) setError(errorText(e) || "Care Twin operational projection (042 t2_twin) unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [patientId, propEpisodeId]);

  const renderFreshnessBadge = (item: any) => {
    const f = item.freshness;
    if (!f || f === "UNKNOWN") return <Badge tone="neutral">UNKNOWN</Badge>;
    if (f === "RECENTLY_RECORDED") return <Badge tone="success">RECENT</Badge>;
    if (f === "HISTORICAL_SOURCE") return <Badge tone="neutral">HISTORICAL</Badge>;
    if (f === "STATUS_UNKNOWN_CONFIRMATION_REQUIRED") return <Badge tone="warning">CONFIRMATION REQUIRED</Badge>;
    return <Badge tone="neutral">{f}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle
            title="Care Twin: Operational Continuity Model (042 t2_twin)"
            sub="Current operational state: NextSteps, open CareGaps, pending reviews, and verified fulfilment"
            icon={<GitBranch className="size-4" />}
          />
          {twin && (
            <Badge tone="teal" className="text-[10px] font-mono">
              {twin.provenance || "CURRENT_AUTHORIZED_SOURCE_PROJECTION"}
            </Badge>
          )}
        </div>

        {twin?.notice && (
          <div className="rounded-lg border border-border bg-surface-subtle/50 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <span>{twin.notice}</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive font-semibold">
            {error}
          </div>
        )}

        {!patientId ? (
          <div className="p-8 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
            Select a patient to evaluate open care gaps and digital twin state.
          </div>
        ) : loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Evaluating 042 t2_twin operational state projection…
          </p>
        ) : !twin ? (
          <div className="p-6 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
            No active care episode found for this patient to project a digital twin.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Operational Summary Stats */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat
                label="Episode State"
                value={twin.episode?.status || "UNKNOWN"}
                hint={twin.episode?.closure_outcome || "In progress"}
              />
              <Stat
                label="Ready Next Steps"
                value={twin.next_steps?.length || 0}
                tone={twin.next_steps?.length > 0 ? "teal" : "neutral"}
                hint="Prerequisites completed"
              />
              <Stat
                label="Open Care Gaps"
                value={twin.care_gaps?.filter((g) => g.status === "OPEN").length || 0}
                tone={twin.care_gaps?.some((g) => g.status === "OPEN") ? "warning" : "success"}
                hint="Action required"
              />
              <Stat
                label="Prescriptions / Orders"
                value={(twin.prescriptions?.length || 0) + (twin.diagnostics?.length || 0)}
                hint="Bounded domain records"
              />
            </div>

            {/* Ready Next Steps */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-teal" />
                Ready Next Steps (Prerequisites Completed)
              </h4>
              {twin.next_steps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-2">No unblocked next steps ready at this time.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {twin.next_steps.map((ns) => (
                    <div key={ns.id} className="p-3 rounded-lg border border-border bg-surface-subtle/40 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{ns.kind || ns.category}</span>
                        {renderFreshnessBadge(ns)}
                      </div>
                      <p className="text-muted-foreground text-[11px]">Responsible: {ns.responsible_role}</p>
                      {ns.due_at && (
                        <p className="text-[10px] text-muted-foreground">Due: {new Date(ns.due_at).toLocaleString()}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Care Gaps */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-warning" />
                Open Care Gaps &amp; Clinical Obligations
              </h4>
              {twin.care_gaps.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-2">No open care gaps recorded for this episode.</p>
              ) : (
                <div className="divide-y divide-border border rounded-lg">
                  {twin.care_gaps.map((g) => (
                    <div key={g.id} className="p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{g.gap_type}</span>
                          <Badge tone={g.status === "OPEN" ? "warning" : "success"}>{g.status}</Badge>
                          {g.severity && <Badge tone="outline">{g.severity}</Badge>}
                          {renderFreshnessBadge(g)}
                        </div>
                        {g.blocked_reason && (
                          <p className="text-destructive font-mono text-[10px]">Blocked: {g.blocked_reason}</p>
                        )}
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        {g.due_at && <p>Due: {new Date(g.due_at).toLocaleDateString()}</p>}
                        {g.closed_at && <p className="text-success">Closed: {new Date(g.closed_at).toLocaleDateString()}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Diagnostics & Fulfilment State */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Diagnostics state */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <FlaskConical className="size-3.5 text-primary" />
                  Diagnostics Operational State
                </h4>
                {twin.diagnostics.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No lab or imaging orders in this episode.</p>
                ) : (
                  <div className="space-y-1.5">
                    {twin.diagnostics.map((d) => (
                      <div key={d.id} className="p-2.5 rounded border border-border text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">{d.test_name}</span>
                          <div className="flex items-center gap-1">
                            <Badge tone="outline">{d.status}</Badge>
                            {renderFreshnessBadge(d)}
                          </div>
                        </div>
                        {d.result && (
                          <div className="text-[11px] text-muted-foreground">
                            <span>Result: {d.result.status}</span>
                            {d.result.pending_review && (
                              <span className="ml-2 text-warning font-semibold">Doctor Review Pending</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prescriptions & Deliveries */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Pill className="size-3.5 text-primary" />
                  Prescriptions &amp; Deliveries
                </h4>
                {twin.prescriptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No prescription orders in this episode.</p>
                ) : (
                  <div className="space-y-1.5">
                    {twin.prescriptions.map((p) => (
                      <div key={p.id} className="p-2.5 rounded border border-border text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold">Rx: {p.id.slice(0, 8)}</span>
                          <Badge tone="outline">{p.status}</Badge>
                        </div>
                        {p.fulfilment && (
                          <p className="text-[11px] text-muted-foreground">Fulfilment: {p.fulfilment.status}</p>
                        )}
                        {p.receipt && (
                          <p className="text-[11px] text-muted-foreground">Delivery Mode: {p.receipt.mode} ({p.receipt.state})</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* External Completion Claims (Notice: Claims != Clinical Closure) */}
            {twin.external_claims.length > 0 && (
              <div className="rounded-lg border border-border bg-slate-50 p-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <FileText className="size-3.5 text-teal" />
                  <span>External Document Evidence Claims</span>
                </div>
                <div className="space-y-1">
                  {twin.external_claims.map((c) => (
                    <div key={c.id} className="flex justify-between text-[11px] text-slate-600">
                      <span>Gap: {c.gap_id.slice(0, 8)} · Doc: {c.record_id.slice(0, 8)}</span>
                      <span className="font-mono text-warning font-semibold">{c.state}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. DISTRICT PULSE (Migration 043/050 t3_pulse Aggregate Wiring)
// ─────────────────────────────────────────────────────────────────────────────

interface PulseData {
  scope: {
    state: string;
    district: string;
    facility_id: string | null;
  };
  window_start: string;
  window_end_exclusive: string;
  last_refreshed: string;
  data_freshness: string;
  minimum_cell_size: number;
  metrics: Array<{
    metric: string;
    numerator: number | null;
    denominator: number | null;
    suppression_state: "RELEASED" | "SUPPRESSED_MINIMUM_CELL_SIZE" | string;
  }>;
  current_operations?: {
    observed_at: string;
    time_basis: string;
    metrics: Array<{
      metric: string;
      numerator: number | null;
      denominator: number | null;
      suppression_state: string;
    }>;
    limitations: string;
  };
  provenance: string;
  limitations: string;
}

function DistrictPulse({ facilityId }: { facilityId?: string }) {
  const [stateName, setStateName] = useState("Bihar");
  const [districtName, setDistrictName] = useState("Patna");

  // Fixed completed calendar month within 2 years (e.g. 1st of previous month)
  const defaultMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  };

  const [monthDate, setMonthDate] = useState(defaultMonth());
  const [pulse, setPulse] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDemo, setShowDemo] = useState(false);

  const queryPulse = async () => {
    setLoading(true);
    setError("");
    setPulse(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc("t3_pulse", {
        p_state: stateName.trim(),
        p_district: districtName.trim(),
        p_month: monthDate,
        p_facility: facilityId || null
      });

      if (rpcErr) throw rpcErr;
      setPulse(data);
    } catch (e: any) {
      const msg = errorText(e);
      if (msg.includes("governance") || msg.includes("manager required")) {
        setError("District Pulse aggregate access requires an authorized Admin or Facility Manager role.");
      } else {
        setError(msg || "District Pulse backend not available.");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatMetricName = (name: string) => {
    return name
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle
            title="District Health Pulse (043/050 t3_pulse)"
            sub="De-identified aggregate operational telemetry with minimum-cell-size privacy suppression"
            icon={<BarChart3 className="size-4" />}
          />
          {pulse ? (
            <Badge tone="success" className="font-mono">
              Live Backend Connected
            </Badge>
          ) : (
            <Badge tone="neutral" className="font-mono">
              District Pulse backend not available
            </Badge>
          )}
        </div>

        {/* Query Controls */}
        <div className="grid gap-3 sm:grid-cols-4 p-3 rounded-lg bg-surface-subtle/50 border border-border text-xs">
          <div>
            <label className="block text-muted-foreground font-semibold mb-1">State</label>
            <input
              type="text"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
            />
          </div>
          <div>
            <label className="block text-muted-foreground font-semibold mb-1">District</label>
            <input
              type="text"
              value={districtName}
              onChange={(e) => setDistrictName(e.target.value)}
              className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
            />
          </div>
          <div>
            <label className="block text-muted-foreground font-semibold mb-1">Completed Month</label>
            <input
              type="date"
              value={monthDate}
              onChange={(e) => setMonthDate(e.target.value)}
              className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={() => void queryPulse()}
            >
              <RefreshCw className={`size-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Querying…" : "Query Telemetry"}
            </Button>
          </div>
        </div>

        {/* Error / Unauthorized notice */}
        {error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="size-4 text-amber-600 shrink-0" />
              <span>Telemetry Contract Notice</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              {error}
            </p>
            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDemo(!showDemo)}
              >
                {showDemo ? "Hide Demo Schema" : "Inspect Demo Telemetry Schema"}
              </Button>
            </div>
          </div>
        )}

        {/* Demo schema inspection fallback */}
        {showDemo && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Illustrative Telemetry Model
              </span>
              <Badge tone="warning" className="font-bold tracking-wide">
                DEMO DATA — NOT REAL OPERATIONAL TELEMETRY
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 opacity-75">
              <Stat
                label="OPD Encounters [Demo]"
                value="—"
                hint="Requires daily census contract"
                icon={<Stethoscope className="size-4" />}
              />
              <Stat
                label="Turnaround [Demo]"
                value="—"
                hint="Requires lab TAT contract"
                tone="teal"
                icon={<FlaskConical className="size-4" />}
              />
              <Stat
                label="Drug Stock Index [Demo]"
                value="—"
                hint="Requires pharmacy aggregation"
                tone="success"
                icon={<Pill className="size-4" />}
              />
              <Stat
                label="Follow-up Adherence [Demo]"
                value="—"
                hint="Requires CHW outcome audit"
                tone="primary"
                icon={<TrendingUp className="size-4" />}
              />
            </div>
          </div>
        )}

        {/* Live Pulse Results */}
        {pulse && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-foreground">
                  {pulse.scope.district}, {pulse.scope.state}
                </span>
                <span className="text-muted-foreground ml-2">
                  (Cohort Window: {new Date(pulse.window_start).toLocaleDateString()} -{" "}
                  {new Date(pulse.window_end_exclusive).toLocaleDateString()})
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                Min Cell Size: {pulse.minimum_cell_size} · Refreshed:{" "}
                {new Date(pulse.last_refreshed).toLocaleTimeString()}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pulse.metrics.map((m) => {
                const isSuppressed = m.suppression_state === "SUPPRESSED_MINIMUM_CELL_SIZE";
                const pct =
                  !isSuppressed && m.numerator !== null && m.denominator && m.denominator > 0
                    ? ((m.numerator / m.denominator) * 100).toFixed(1) + "%"
                    : null;

                return (
                  <div
                    key={m.metric}
                    className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-xs font-semibold text-foreground leading-tight">
                        {formatMetricName(m.metric)}
                      </span>
                      {isSuppressed ? (
                        <Badge tone="warning" className="text-[9px]">
                          SUPPRESSED (&lt;10)
                        </Badge>
                      ) : (
                        <Badge tone="success" className="text-[9px]">
                          RELEASED
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      {isSuppressed ? (
                        <span className="text-sm font-mono text-muted-foreground italic">
                          Suppressed for privacy
                        </span>
                      ) : (
                        <div>
                          <span className="text-xl font-bold font-tabular text-foreground">
                            {m.numerator}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            / {m.denominator} patients {pct && `(${pct})`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Current Operations (050 capability & stock metrics) */}
            {pulse.current_operations?.metrics && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Activity className="size-3.5 text-primary" />
                  Current Sourced Operations Telemetry (050)
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pulse.current_operations.metrics.map((m) => {
                    const isSuppressed = m.suppression_state === "SUPPRESSED_MINIMUM_CELL_SIZE";
                    return (
                      <div key={m.metric} className="p-3 rounded-lg border border-border bg-surface-subtle/30 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold">{formatMetricName(m.metric)}</span>
                          {isSuppressed ? (
                            <Badge tone="warning">SUPPRESSED</Badge>
                          ) : (
                            <Badge tone="success">RELEASED</Badge>
                          )}
                        </div>
                        {isSuppressed ? (
                          <span className="text-muted-foreground italic text-[11px]">Cell size &lt; 10 suppressed</span>
                        ) : (
                          <span className="text-lg font-bold">
                            {m.numerator} / {m.denominator} facilities
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notes & Governance Limitations */}
            <div className="rounded-lg border border-border bg-surface-subtle/30 p-3 space-y-1.5 text-[11px] text-muted-foreground">
              <p>
                <strong className="text-foreground/80">Provenance:</strong> {pulse.provenance}
              </p>
              <p>
                <strong className="text-foreground/80">Limitations:</strong> {pulse.limitations}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface-subtle/30 p-3.5 space-y-2">
          <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" />
            Privacy &amp; De-identification Policy
          </h4>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            District Pulse metrics are computed solely from anonymized, privacy-preserving aggregate telemetry. No individual patient identifiers, ABHA numbers, or confidential clinical notes are accessible or exposed through public health surveillance dashboards. Minimum cell sizes under 10 are strictly suppressed.
          </p>
        </div>
      </Card>
    </div>
  );
}
