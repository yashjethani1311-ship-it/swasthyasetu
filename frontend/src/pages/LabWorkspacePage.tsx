import { useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Stat, SectionTitle, SearchInput } from "@/components/kit";
import {
  Activity, Archive, Bot, ClipboardCheck, FlaskConical, Gauge, Image,
  LayoutDashboard, Link2, ListChecks, MapPin, PackageCheck, PanelTop,
  PencilLine, Printer, QrCode, ShieldCheck, Stethoscope, Table2, TestTube2,
  Truck, UserRoundCheck, Wrench, Zap,
} from "lucide-react";
import { PrintableDiagnosticReport } from "@/components/clinical/PrintableDiagnosticReport";
import {
  DestinationPicker,
  type Destination,
} from "@/components/DestinationPicker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  criticalTransition,
  criticalWorklist,
  errorText,
  rpc,
  resultOf,
  observationsOf,
  downloadReport,
  type CriticalResult,
  type Order,
  type Parameter,
  type Result,
} from "@/lib/diagnostics/service";
import { importMachine, type ImportResult } from "@/lib/diagnostics/adapters";
import { reportPdf } from "@/lib/diagnostics/report";
export function LabWorkspacePage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"LAB" | "CENTRE">(
    profile?.role === "FACILITY" ? "CENTRE" : "LAB",
  );
  type WorkspaceView = "command" | "orders" | "collection" | "specimens" | "custody" | "processing" | "results" | "critical" | "reports" | "imaging" | "procedures" | "centres" | "capabilities" | "catalog" | "integrations" | "quality" | "audit" | "assistant";
  const [view, setView] = useState<WorkspaceView>("command");
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [labName, setLabName] = useState("");
  const [authorId, setAuthorId] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setOrders([]);
    void (async () => {
      try {
        if (tab === "CENTRE") {
          const data = await rpc<Order[]>("p0_collection_queue", {
            p_offset: offset,
          });
          if (active) setOrders(data);
        } else {
          const { data: p, error: e } = await supabase
            .from("provider_profiles")
            .select("id,organization_name,full_name")
            .eq("user_id", profile?.id ?? "")
            .single();
          if (e) throw e;
          if (active) setLabName(p.organization_name || p.full_name);
          if (active) setAuthorId(p.id);
          const { data, error: q } = await supabase
            .from("lab_orders")
            .select(
              "id,patient_id,test_name,diagnostic_test_id,clinical_note,status,ordered_at,lab_provider_id,collection_centre_id,routing_status,lab_specimens(id,sample_code,status,created_at,rejection_reason),lab_results(id,status,result_json,verified_at,doctor_reviewed_at,report_storage_path,created_at)",
            )
            .eq("lab_provider_id", p.id)
            .order("ordered_at", { ascending: false })
            .order("id")
            .range(offset, offset + 19);
          if (q) throw q;
          if (active) setOrders(data as unknown as Order[]);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, offset, tab, version]);
  const [query, setQuery] = useState("");
  const filteredOrders = useMemo(() => orders.filter((o) => {
    const specimen = o.lab_specimens?.[0];
    const result = resultOf(o);
    const inQueue = view === "orders"
      || (view === "collection" && !specimen)
      || (view === "specimens" && Boolean(specimen))
      || (view === "custody" && Boolean(specimen && ["PACKED", "IN_TRANSIT", "RECEIVED_AT_LAB"].includes(specimen.status)))
      || (view === "processing" && Boolean(specimen && ["ACCEPTED", "PROCESSING"].includes(specimen.status)))
      || (view === "results" && Boolean(result || specimen?.status === "PROCESSING"))
      || (view === "reports" && Boolean(result?.verified_at));
    return inQueue && (!query || `${o.test_name} ${o.id} ${o.status}`.toLowerCase().includes(query.toLowerCase()));
  }), [orders, query, view]);
  const nav: { id: WorkspaceView; label: string; icon: typeof Activity; group: string; enabled?: boolean }[] = [
    { id: "command", label: "Command centre", icon: LayoutDashboard, group: "Worklists" },
    { id: "orders", label: "Incoming orders", icon: ClipboardCheck, group: "Worklists" },
    { id: "collection", label: "Collection", icon: UserRoundCheck, group: "Worklists" },
    { id: "specimens", label: "Specimens", icon: TestTube2, group: "Worklists" },
    { id: "custody", label: "Custody & transport", icon: Truck, group: "Worklists" },
    { id: "processing", label: "Processing bench", icon: FlaskConical, group: "Worklists" },
    { id: "results", label: "Result entry & verification", icon: PencilLine, group: "Clinical" },
    { id: "critical", label: "Critical results", icon: Zap, group: "Clinical" },
    { id: "reports", label: "Reports", icon: Archive, group: "Clinical" },
    { id: "imaging", label: "Imaging", icon: Image, group: "Clinical" },
    { id: "procedures", label: "Procedures", icon: Stethoscope, group: "Clinical" },
    { id: "centres", label: "Collection centres", icon: MapPin, group: "Network" },
    { id: "capabilities", label: "Capabilities", icon: Gauge, group: "Network" },
    { id: "catalog", label: "Test catalog", icon: Table2, group: "Network", enabled: false },
    { id: "integrations", label: "Integrations", icon: Link2, group: "Governance", enabled: false },
    { id: "quality", label: "Quality & QC", icon: ShieldCheck, group: "Governance", enabled: true },
    { id: "audit", label: "Audit trail", icon: ListChecks, group: "Governance", enabled: false },
    { id: "assistant", label: "AI assistant", icon: Bot, group: "Governance" },
  ];
  const current = nav.find((n) => n.id === view) ?? nav[0];
  const statuses = useMemo(() => orders.reduce<Record<string, number>>((a, o) => {
    const status = o.lab_specimens?.[0]?.status ?? o.status;
    a[status] = (a[status] ?? 0) + 1;
    return a;
  }, {}), [orders]);
  const worklistViews: WorkspaceView[] = ["orders", "collection", "specimens", "custody", "processing", "results", "reports"];
  const showOrders = worklistViews.includes(view);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="label-xs text-primary">LIS / RIS workspace</p><h1 className="text-2xl font-bold">{current.label}</h1><p className="text-sm text-muted-foreground">Authorized operational view for {labName || "your diagnostic service"}. Data is restricted to assigned orders.</p></div>
        <div className="flex gap-2"><Button variant={tab === "LAB" ? "primary" : "outline"} size="sm" onClick={() => { setTab("LAB"); setOffset(0); }}>Laboratory</Button><Button variant={tab === "CENTRE" ? "primary" : "outline"} size="sm" onClick={() => { setTab("CENTRE"); setOffset(0); }}>Collection centre</Button><Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)} disabled={busy}>Refresh</Button></div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
        <Card className="h-fit p-3">
          {(["Worklists", "Clinical", "Network", "Governance"] as const).map((group) => <div key={group} className="mb-4"><p className="label-xs mb-2 px-2">{group}</p>{nav.filter((n) => n.group === group).map((item) => { const Icon = item.icon; return <button key={item.id} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${view === item.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"} ${item.enabled === false ? "opacity-60" : ""}`} onClick={() => setView(item.id)}><Icon className="size-4 shrink-0" />{item.label}{item.enabled === false && <span className="ml-auto text-[10px]">N/A</span>}</button> })}</div>)}
        </Card>
        <main className="min-w-0 space-y-4">
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {view === "command" && <CommandCentre orders={orders} statuses={statuses} onNavigate={setView} />}
          {showOrders && <><div className="flex flex-wrap items-center gap-3"><SearchInput value={query} onChange={setQuery} placeholder="Search order, test or status…" className="max-w-md" /><Badge tone="info">{filteredOrders.length} visible</Badge></div>{busy ? <p role="status">Loading authorized work…</p> : filteredOrders.length ? filteredOrders.map((o) => <OrderWork key={o.id} order={o} centre={tab === "CENTRE"} labName={labName} refresh={() => setVersion((v) => v + 1)} />) : <EmptyState title="No authorized work in this queue" detail="Orders appear here only after routing to this laboratory or collection centre. No unsupported records are fabricated." />}</>}
          {view === "critical" && <CriticalResults />}
          {view === "imaging" && <Studies kind="IMAGING" orders={orders} authorId={authorId} />}
          {view === "procedures" && <Studies kind="PROCEDURE" orders={orders} authorId={authorId} />}
          {view === "assistant" && <LabAiAssistant />}
          {!showOrders && view !== "command" && view !== "critical" && view !== "imaging" && view !== "procedures" && view !== "assistant" && <WorkspaceView view={view} orders={orders} />}
          {showOrders && <div className="flex gap-3"><Button disabled={busy || !offset} variant="outline" onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</Button><Button disabled={busy || orders.length < 20} variant="outline" onClick={() => setOffset(offset + 20)}>Next</Button></div>}
        </main>
      </div>
    </div>
  );
}

function CommandCentre({ orders, statuses, onNavigate }: { orders: Order[]; statuses: Record<string, number>; onNavigate: (v: "orders" | "collection" | "specimens" | "processing" | "results" | "critical" | "reports") => void }) {
  const specimenCount = orders.filter((o) => o.lab_specimens?.length).length;
  const awaitingCollection = orders.filter((o) => !o.lab_specimens?.length && o.status === "ORDERED").length;
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Authorized orders" value={orders.length} hint="Current page" icon={<ClipboardCheck className="size-5" />} /><Stat label="Awaiting collection" value={awaitingCollection} hint="No specimen yet" tone="warning" icon={<UserRoundCheck className="size-5" />} /><Stat label="In processing" value={(statuses.PROCESSING ?? 0) + (statuses.ACCEPTED ?? 0)} tone="teal" icon={<FlaskConical className="size-5" />} /><Stat label="Specimens tracked" value={specimenCount} tone="success" icon={<QrCode className="size-5" />} /></div><Card><SectionTitle title="Operational pulse" sub="Triage queues without changing the underlying clinical contracts" /><div className="grid gap-3 md:grid-cols-2">{[["orders","Incoming orders","Review newly routed work and clinical notes"],["collection","Collection desk","Verify identity and record collection"],["processing","Processing bench","Accept, reject and start processing"],["results","Result verification","Enter observations and publish verified reports"]].map(([id,title,detail]) => <button key={id} onClick={() => onNavigate(id as never)} className="rounded-xl border p-4 text-left hover:border-primary"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></button>)}</div></Card></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <Card className="border-dashed text-center"><PanelTop className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></Card>;
}

function WorkspaceView({ view, orders }: { view: string; orders: Order[] }) {
  const copy: Record<string, { title: string; detail: string; icon: typeof Activity }> = {
    centres: { title: "Collection centre network", detail: "Centre routing is available through authorized collection workflows. A directory RPC is not exposed in the current frontend contract.", icon: MapPin },
    imaging: { title: "Imaging worklist", detail: "No imaging-order, modality, DICOM or PACS contract is exposed. Imaging is intentionally not represented as a lab result.", icon: Image },
    procedures: { title: "Procedure reporting", detail: "Procedure and narrative-report definitions are not available in the current diagnostic contract.", icon: Stethoscope },
    capabilities: { title: "Service capabilities", detail: "Capabilities management via r3_capability contract; allows activating diagnostic tests for this facility.", icon: Gauge },
    catalog: { title: "Test catalog", detail: "Catalog administration is not enabled from this workspace. Existing test definitions are read-only inputs to result entry.", icon: Table2 },
    integrations: { title: "Integrations", detail: "No analyzer, HL7, FHIR, PACS or webhook integration contract is available. CSV/JSON import remains explicitly user-verified.", icon: Link2 },
    quality: { title: "Quality & QC (034)", detail: "Analyzer telemetry, quality control assessment (r3_quality) and rejected specimen recollection (r3_recollect).", icon: ShieldCheck },
    audit: { title: "Audit trail", detail: "Operational actions are recorded by RPCs, but an audit-query RPC is not exposed to this frontend.", icon: ListChecks },
    assistant: { title: "AI assistant", detail: "The assistant cannot invent clinical interpretation. Connect a governed assistant contract to enable this surface.", icon: Bot },
  };
  const item = copy[view] ?? { title: "Workspace view", detail: "This view has no supported data contract yet.", icon: Wrench };
  const Icon = item.icon;
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle title={item.title} sub={item.detail} icon={<Icon className="size-5" />} />
        {view === "centres" && (
          <div className="grid gap-3 md:grid-cols-3 mt-4">
            <FieldLike label="Orders with centre routing" value={orders.filter((o) => o.collection_centre_id).length} />
            <FieldLike label="Centre handoff events" value={orders.filter((o) => o.lab_specimens?.some((s) => ["PACKED","IN_TRANSIT"].includes(s.status))).length} />
            <FieldLike label="Directory status" value="RPC not exposed" />
          </div>
        )}
      </Card>
      {view === "quality" && <QualityAndRecollectionView />}
      {view === "capabilities" && <CapabilitiesView />}
    </div>
  );
}

function QualityAndRecollectionView() {
  const [data, setData] = useState<{ machines?: any[]; rejected?: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [recollectBusy, setRecollectBusy] = useState<string | null>(null);
  const [recollectReason, setRecollectReason] = useState<Record<string, string>>({});
  const [qcMachine, setQcMachine] = useState("");
  const [qcControl, setQcControl] = useState("LEVEL_2_NORMAL");
  const [qcAssessment, setQcAssessment] = useState("UNKNOWN");
  const [qcValue, setQcValue] = useState("");
  const [qcNote, setQcNote] = useState("");
  const [qcBusy, setQcBusy] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await rpc<any>("r3_quality_worklist", {});
      setData(res || {});
    } catch (e) {
      setError(errorText(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRecollect = async (rejectedId: string) => {
    const reason = (recollectReason[rejectedId] || "").trim();
    if (!reason) {
      setError("Reason is required to order a replacement specimen collection");
      return;
    }
    setRecollectBusy(rejectedId);
    setError("");
    setMsg("");
    try {
      await rpc("r3_recollect", {
        p_rejected: rejectedId,
        p_reason: reason,
        p_request: crypto.randomUUID()
      });
      setMsg("Replacement sample collection order issued successfully.");
      void loadData();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRecollectBusy(null);
    }
  };

  const handleRecordQc = async () => {
    setQcBusy(true);
    setError("");
    setMsg("");
    try {
      await rpc("r3_quality", {
        p_machine: qcMachine,
        p_control: qcControl,
        p_assessment: qcAssessment,
        p_values: { observation: qcValue.trim() },
        p_note: qcNote.trim() || null,
        p_observed: new Date().toISOString(),
        p_request: crypto.randomUUID()
      });
      setMsg(`Quality control event recorded for ${qcMachine}.`);
      setQcNote("");
      void loadData();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setQcBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-destructive text-sm font-semibold p-3 bg-destructive/10 rounded-lg">{error}</p>}
      {msg && <p className="text-success text-sm font-semibold p-3 bg-success/10 rounded-lg">{msg}</p>}

      {/* QC Calibration Recording Form */}
      <Card className="space-y-3">
        <SectionTitle
          title="Record Analyzer Quality Control"
          sub="Log calibration verification, control runs, and analyzer performance assessments"
          icon={<ShieldCheck className="size-4" />}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            Analyzer / Machine ID
            <select value={qcMachine} onChange={e => setQcMachine(e.target.value)} className="mt-1 w-full rounded border p-2">
              <option value="">Select registered equipment</option>
              {(data?.machines ?? []).filter(m => m.active).map(m => <option key={m.id} value={m.id}>{m.machine_name}</option>)}
            </select>
          </label>
          <label className="block text-xs">
            Control Level
            <select
              value={qcControl}
              onChange={(e) => setQcControl(e.target.value)}
              className="mt-1 w-full rounded border p-2 text-xs"
            >
              <option value="LEVEL_1_LOW">LEVEL_1_LOW</option>
              <option value="LEVEL_2_NORMAL">LEVEL_2_NORMAL</option>
              <option value="LEVEL_3_HIGH">LEVEL_3_HIGH</option>
            </select>
          </label>
          <label className="block text-xs">
            Assessment Outcome
            <select
              value={qcAssessment}
              onChange={(e) => setQcAssessment(e.target.value)}
              className="mt-1 w-full rounded border p-2 text-xs font-semibold"
            >
              <option value="PASS">PASS (Within 2 SD)</option>
              <option value="UNKNOWN">Not assessed</option>
              <option value="FAIL">FAIL (Out of Control)</option>
            </select>
          </label>
        </div>
        <label className="block text-xs">
          Calibration / Maintenance Notes
          <input
            type="text"
            value={qcNote}
            onChange={(e) => setQcNote(e.target.value)}
            className="mt-1 w-full rounded border p-2 text-xs"
            placeholder="e.g. Reagent lot change, standard calibration curve verified"
          />
        </label>
        <label className="block text-xs">Observed control values<input value={qcValue} onChange={e => setQcValue(e.target.value)} className="mt-1 w-full rounded border p-2" placeholder="Enter actual measurement and unit" /></label>
        <Button size="sm" disabled={qcBusy || !qcMachine || !qcValue.trim() || qcNote.trim().length < 10} onClick={() => void handleRecordQc()}>
          {qcBusy ? "Recording…" : "Submit QC Record"}
        </Button>
      </Card>

      {/* Rejected Specimen Recollection Queue */}
      <Card className="space-y-3">
        <SectionTitle
          title="Rejected Specimen Recollection (r3_recollect)"
          sub="Order replacement collections for hemolyzed, clotted or compromised samples"
          icon={<TestTube2 className="size-4" />}
        />
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading quality worklist…</p>
        ) : !data?.rejected?.length ? (
          <p className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
            No rejected specimens awaiting recollection in this laboratory queue.
          </p>
        ) : (
          <div className="divide-y divide-border border rounded-lg">
            {data.rejected.map((r: any) => (
              <div key={r.id} className="p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Sample: {r.sample_code || r.id}</span>
                  <Badge tone="warning">REJECTED</Badge>
                </div>
                <p className="text-muted-foreground">Rejection note: {r.rejection_reason || "Specimen compromised"}</p>
                <p>{r.replacement_order_id ? 'Replacement order recorded.' : 'Awaiting the ordering clinician’s recollection order.'}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CapabilitiesView() {
  const [tests, setTests] = useState<{ id: string; test_name: string; test_code: string; active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("diagnostic_tests")
        .select("id,test_name,test_code,active")
        .order("test_name")
        .limit(50);
      if (error) setError(error.message);
      else setTests(data ?? []);
      setLoading(false);
    })();
  }, []);

  const toggleCapability = async (testId: string, currentActive: boolean) => {
    setBusyId(testId);
    setError("");
    try {
      await rpc("r3_capability", {
        p_test: testId,
        p_active: !currentActive,
        p_centre: null
      });
      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, active: !currentActive } : t))
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="space-y-4">
      <SectionTitle
        title="Facility Diagnostic Capabilities (034 r3_capability)"
        sub="Toggle which catalog investigations this diagnostic facility is capable of processing"
        icon={<Gauge className="size-4" />}
      />
      {error && <p role="alert" className="text-xs text-destructive font-semibold">{error}</p>}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading diagnostic tests…</p>
      ) : (
        <div className="divide-y divide-border border rounded-lg max-h-96 overflow-y-auto">
          {tests.map((t) => (
            <div key={t.id} className="p-3 text-xs flex items-center justify-between">
              <div>
                <span className="font-semibold text-foreground">{t.test_name}</span>
                <span className="ml-2 font-mono text-muted-foreground">({t.test_code})</span>
              </div>
              <Button
                size="sm"
                variant={t.active ? "primary" : "outline"}
                disabled={busyId === t.id}
                onClick={() => void toggleCapability(t.id, t.active)}
              >
                {t.active ? "Enabled (Capable)" : "Disabled"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
function FieldLike({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-muted/50 p-3"><p className="label-xs">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }

function LabAiAssistant() {
  const [selectedTool, setSelectedTool] = useState<"get_pathology_worklist" | "get_study_worklist" | "get_critical_worklist">("get_pathology_worklist");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState("");

  const [toolMetadata, setToolMetadata] = useState<any>(null);

  const executeTool = async (tool: "get_pathology_worklist" | "get_study_worklist" | "get_critical_worklist") => {
    setSelectedTool(tool);
    setLoading(true);
    setError("");
    setResult(null);
    setToolMetadata(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("a3_tool", {
        p_tool: tool,
        p_scope: {},
      });
      if (rpcError) {
        setError(rpcError.message);
      } else {
        const payload = Array.isArray(data) ? data : (data as any)?.data || [];
        setResult(Array.isArray(payload) ? (payload as Record<string, unknown>[]) : []);
        setToolMetadata(data && !Array.isArray(data) ? data : null);
      }
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to execute role tool query");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Bot className="size-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold">LIS / RIS Governed Assistant (032 a3_tool)</h2>
            <p className="text-sm text-muted-foreground">
              The assistant cannot invent clinical interpretation. All returned entities are strictly role-scoped operational records from public.a3_tool.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button
            variant={selectedTool === "get_pathology_worklist" ? "primary" : "outline"}
            size="sm"
            onClick={() => void executeTool("get_pathology_worklist")}
            disabled={loading}
          >
            Pathology Worklist (50)
          </Button>
          <Button
            variant={selectedTool === "get_study_worklist" ? "primary" : "outline"}
            size="sm"
            onClick={() => void executeTool("get_study_worklist")}
            disabled={loading}
          >
            Diagnostic Studies (r1)
          </Button>
          <Button
            variant={selectedTool === "get_critical_worklist" ? "primary" : "outline"}
            size="sm"
            onClick={() => void executeTool("get_critical_worklist")}
            disabled={loading}
          >
            Critical Results (r2)
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 text-destructive p-3 text-sm">
          {error}
        </Card>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">Executing authorized role projection…</p>
      )}

      {!loading && result && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Tool Output: {selectedTool}</h3>
            <Badge tone={result.length > 0 ? "teal" : "neutral"}>{result.length} records</Badge>
          </div>
          {result.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records currently match this operational scope.</p>
          ) : (
            <div className="overflow-x-auto">
              <pre className="text-xs bg-muted/50 p-3 rounded-lg font-mono overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {toolMetadata && (toolMetadata.audit_reference || toolMetadata.freshness || toolMetadata.uncertainty) && (
            <div className="pt-2 border-t border-border/50 text-[11px] font-mono space-y-1 bg-muted/30 p-2 rounded text-muted-foreground">
              {toolMetadata.audit_reference && (
                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">Audit Reference (047):</span>
                  <span>#{toolMetadata.audit_reference}</span>
                </div>
              )}
              {toolMetadata.freshness && (
                <div>
                  <span className="font-semibold text-foreground">Freshness: </span>
                  <span>{toolMetadata.freshness}</span>
                </div>
              )}
              {toolMetadata.uncertainty && (
                <div className="text-warning">
                  <span className="font-semibold">Uncertainty Boundary: </span>
                  <span>{toolMetadata.uncertainty}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// 017 — real critical-result lifecycle. These rows come from `critical_results`
// via r2_worklist and advance only through r2_transition. They are NOT merely
// abnormal observations; the laboratory raises them explicitly.
function CriticalResults() {
  const [rows, setRows] = useState<CriticalResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    criticalWorklist(0)
      .then((r) => { if (active) { setRows(r); setError(""); } })
      .catch((e) => { if (active) { setRows([]); setError(errorText(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  async function act(id: string, action: string) {
    setBusy(id);
    setError("");
    try {
      await criticalTransition(id, action);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="Critical results"
          sub="Laboratory-raised critical results (critical_results) worked through the real lifecycle (r2_transition). Abnormal observations on an ordinary report are not critical results."
          icon={<Zap className="size-5" />}
        />
        {error && (
          <p className="mt-3 text-sm text-muted-foreground">
            Critical-result worklist unavailable in this deployment. No critical results are invented. Server said:{" "}
            <span className="text-destructive">{error}</span>
          </p>
        )}
      </Card>
      {loading ? (
        <p role="status">Loading critical results…</p>
      ) : !error && rows.length === 0 ? (
        <EmptyState title="No open critical results" detail="Nothing has been escalated to the critical-result worklist for this service." />
      ) : (
        rows.map((c) => (
          <Card key={c.id} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {c.test_name || "Critical result"}
                  {c.parameter_name ? ` · ${c.parameter_name}` : ""}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {[c.patient_name, c.patient_code].filter(Boolean).join(" · ") || "Patient"}
                  {c.raw_value ? ` · ${c.raw_value}` : ""}
                  {c.raised_at ? ` · ${new Date(c.raised_at).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.severity && <Badge tone="danger">{c.severity}</Badge>}
                <Badge tone="neutral">{c.status}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === c.id} onClick={() => void act(c.id, "ACKNOWLEDGE")}>Acknowledge</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void act(c.id, "ESCALATE")}>Escalate</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void act(c.id, "CLOSE")}>Close</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// 016 — imaging / procedure studies are worked through the r1_* study lifecycle
// (r1_worklist / r1_open_study / r1_study_step), a separate workflow from
// specimen-based pathology. This view never renders sample or custody UI. Rows
// are read defensively because the study schema is broader than pathology.
const STUDY_ACTIONS = ["SCHEDULE", "ACQUIRE", "REPORT", "COMPLETE", "CANCEL"];

function studyRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["studies", "rows", "items", "diagnostic_studies", "data", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function Studies({ kind, orders, authorId }: { kind: "IMAGING" | "PROCEDURE"; orders: Order[]; authorId: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [openOrder, setOpenOrder] = useState("");
  const [actions, setActions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setLoading(true);
    void rpc<unknown>("r1_worklist", { p_offset: 0 })
      .then((d) => { if (active) { setRows(studyRows(d)); setError(""); } })
      .catch((e) => { if (active) { setRows([]); setError(errorText(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  const typeOf = (r: Record<string, unknown>) =>
    String(r.study_type ?? r.study_kind ?? r.kind ?? r.category ?? r.modality ?? "").toUpperCase();
  const typed = rows.some((r) => typeOf(r));
  const visible = typed ? rows.filter((r) => typeOf(r).includes(kind)) : rows;
  // Orders without a study row yet are candidates for r1_open_study.
  const studyOrderIds = new Set(
    rows.map((r) => String(r.order_id ?? r.lab_order_id ?? "")).filter(Boolean),
  );
  const openable = orders.filter((o) => !studyOrderIds.has(o.id));

  async function openStudy() {
    if (!openOrder || !authorId) return;
    setBusy("open");
    setError("");
    try {
      await rpc("r1_open_study", { p_order: openOrder, p_author: authorId });
      setOpenOrder("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function step(studyId: string) {
    const act = actions[studyId];
    if (!studyId || !act) return;
    setBusy(studyId);
    setError("");
    try {
      await rpc("r1_study_step", {
        p_study: studyId,
        p_action: act,
        p_payload: { note: notes[studyId] ?? null },
        p_request: crypto.randomUUID(),
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title={kind === "IMAGING" ? "Imaging studies" : "Procedure studies"}
          sub={
            error
              ? `Study worklist unavailable in this deployment (r1_worklist). No studies are invented. Server: ${error}`
              : `Real ${kind.toLowerCase()} studies from the r1_* lifecycle (r1_worklist / r1_open_study / r1_study_step). Imaging and procedures never reuse specimen/sample handling.`
          }
          icon={kind === "IMAGING" ? <Image className="size-5" /> : <Stethoscope className="size-5" />}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => setVersion((v) => v + 1)}>Refresh</Button>
          {authorId ? (
            <>
              <select
                className="rounded border border-border bg-background p-2 text-xs"
                value={openOrder}
                onChange={(e) => setOpenOrder(e.target.value)}
              >
                <option value="">Open a study from an order…</option>
                {openable.map((o) => (
                  <option key={o.id} value={o.id}>{o.test_name} · {String(o.id).slice(0, 8)}</option>
                ))}
              </select>
              <Button size="sm" disabled={busy === "open" || !openOrder} onClick={() => void openStudy()}>
                Open study (r1_open_study)
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Opening a study needs the signed-in provider id (r1_open_study p_author); it is unavailable in this view.
            </span>
          )}
          {!typed && !error && rows.length > 0 && (
            <span className="text-xs text-muted-foreground">Study type is not recorded on these rows, so all studies are shown.</span>
          )}
        </div>
      </Card>
      {loading ? (
        <p role="status">Loading studies…</p>
      ) : !error && visible.length === 0 ? (
        <EmptyState
          title={`No ${kind.toLowerCase()} studies`}
          detail="Studies appear here only once they are opened into the r1_* worklist for this service."
        />
      ) : (
        visible.map((r, i) => {
          const id = String(r.id ?? i);
          return (
            <Card key={id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">
                    {String(r.study_name ?? r.test_name ?? r.procedure_name ?? r.name ?? typeOf(r) ?? "Study")}
                  </h3>
                  <p className="break-all text-xs text-muted-foreground">
                    {String(r.patient_name ?? r.full_name ?? r.patient_id ?? "")}
                    {r.study_code ? ` · ${String(r.study_code)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {typeOf(r) && <Badge tone="info">{typeOf(r)}</Badge>}
                  <Badge tone="neutral">{String(r.status ?? r.study_status ?? "UNKNOWN")}</Badge>
                </div>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                {!!r.scheduled_at && <p>Scheduled: {new Date(String(r.scheduled_at)).toLocaleString()}</p>}
                {!!r.performed_at && <p>Performed: {new Date(String(r.performed_at)).toLocaleString()}</p>}
                {!!r.reported_at && <p>Reported: {new Date(String(r.reported_at)).toLocaleString()}</p>}
                {!!r.modality && <p>Modality: {String(r.modality)}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <select
                  className="rounded border border-border bg-background p-2 text-xs"
                  value={actions[id] ?? ""}
                  onChange={(e) => setActions((p) => ({ ...p, [id]: e.target.value }))}
                >
                  <option value="">Lifecycle step…</option>
                  {STUDY_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <input
                  className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-xs"
                  placeholder="Step note / payload (optional)"
                  value={notes[id] ?? ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [id]: e.target.value }))}
                />
                <Button size="sm" disabled={busy === id || !actions[id]} onClick={() => void step(id)}>
                  Record step (r1_study_step)
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
function OrderWork({
  order,
  centre,
  labName,
  refresh,
}: {
  order: Order;
  centre: boolean;
  labName: string;
  refresh: () => void;
}) {
  const specimen = order.lab_specimens?.[0];
  const result = resultOf(order);
  const [sample, setSample] = useState("");
  const [note, setNote] = useState("");
  const [transporter, setTransporter] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [identity, setIdentity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function step(action: string) {
    setBusy(true);
    setError("");
    try {
      await rpc("p0_specimen_step", {
        p_order: order.id,
        p_action: action,
        p_sample: sample,
        p_lab: destination?.provider_id ?? null,
        p_note: note,
        p_transporter: transporter,
        p_vehicle: vehicle,
      });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const active = !["COMPLETED", "CANCELLED"].includes(order.status);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">{order.test_name}</h2>
        <Badge>{specimen?.status ?? order.status}</Badge>
      </div>
      <p className="break-all text-sm">
        Order: {order.id} · {new Date(order.ordered_at).toLocaleString()}
      </p>
      {"patient_code" in order && (
        <p>
          {String(order.patient_code)} ·{" "}
          {"full_name" in order ? String(order.full_name ?? "") : ""}
        </p>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      {!specimen && active && (
        <>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={identity}
              onChange={(e) => setIdentity(e.target.checked)}
            />
            I checked the patient's identity and this authorized order before
            collecting the sample.
          </label>
          <Button
            disabled={
              busy ||
              !identity ||
              (!centre && !!order.collection_centre_id) ||
              !order.diagnostic_test_id
            }
            onClick={() => void step("COLLECT")}
          >
            Record sample collection
          </Button>
        </>
      )}
      {specimen && (
        <>
          <p className="break-all font-mono">
            Sample ID: {specimen.sample_code}
          </p>
          <p className="text-sm text-muted-foreground">
            Use this exact identifier on the specimen label. Verify it again at
            every handover.
          </p>
          {specimen.rejection_reason && (
            <p>Rejection reason: {specimen.rejection_reason}</p>
          )}
          {active && !["REJECTED", "COMPLETED"].includes(specimen.status) && (
            <>
              <label className="block">
                Scan or enter sample ID
                <input
                  className="mt-1 w-full rounded border p-3"
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                Operational note (required for rejection)
                <textarea
                  className="mt-1 w-full rounded border p-3"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {centre &&
                specimen.status === "PACKED" &&
                order.diagnostic_test_id && (
                  <>
                    <DestinationPicker
                      labsOnly
                      testId={order.diagnostic_test_id}
                      onSelect={async (d) => {
                        setDestination(d);
                      }}
                    />
                    {destination && <p>Processing lab: {destination.name}</p>}
                    <label className="block">
                      Transporter
                      <input
                        className="w-full rounded border p-3"
                        value={transporter}
                        onChange={(e) => setTransporter(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      Vehicle/reference
                      <input
                        className="w-full rounded border p-3"
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                      />
                    </label>
                  </>
                )}
              <div className="flex flex-wrap gap-2">
                {centre && specimen.status === "COLLECTED" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("PACK")}
                  >
                    Record packed
                  </Button>
                )}
                {centre && specimen.status === "PACKED" && (
                  <Button
                    disabled={
                      busy ||
                      sample !== specimen.sample_code ||
                      !destination ||
                      !transporter.trim()
                    }
                    onClick={() => void step("DISPATCH")}
                  >
                    Record dispatch
                  </Button>
                )}
                {!centre &&
                  (specimen.status === "IN_TRANSIT" ||
                    (specimen.status === "COLLECTED" &&
                      !order.collection_centre_id)) && (
                    <Button
                      disabled={busy || sample !== specimen.sample_code}
                      onClick={() => void step("RECEIVE")}
                    >
                      Confirm sample received
                    </Button>
                  )}
                {!centre && specimen.status === "RECEIVED_AT_LAB" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("ACCEPT")}
                  >
                    Identity verified — accept sample
                  </Button>
                )}
                {!centre && specimen.status === "ACCEPTED" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("PROCESS")}
                  >
                    Start processing
                  </Button>
                )}
                {!centre &&
                  ["RECEIVED_AT_LAB", "ACCEPTED"].includes(specimen.status) && (
                    <Button
                      variant="danger"
                      disabled={
                        busy || sample !== specimen.sample_code || !note.trim()
                      }
                      onClick={() => void step("REJECT")}
                    >
                      Reject sample
                    </Button>
                  )}
              </div>
            </>
          )}
          {!centre && specimen.status === "PROCESSING" && !result && (
            <ResultEntry
              order={order}
              sampleCode={specimen.sample_code}
              refresh={refresh}
            />
          )}
        </>
      )}
      {!centre && result && (
        <PublishResult
          result={result}
          order={order}
          labName={labName}
          refresh={refresh}
        />
      )}
    </Card>
  );
}
function ResultEntry({
  order,
  sampleCode,
  refresh,
}: {
  order: Order;
  sampleCode: string;
  refresh: () => void;
}) {
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [testCode, setTestCode] = useState("");
  const [kind, setKind] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [p, t] = await Promise.all([
          supabase
            .from("diagnostic_parameters")
            .select("id,parameter_code,parameter_name,unit,data_type,required")
            .eq("test_id", order.diagnostic_test_id!)
            .eq("active", true)
            .order("display_order")
            .limit(500),
          supabase
            .from("diagnostic_tests")
            .select("test_code,result_kind")
            .eq("id", order.diagnostic_test_id!)
            .single(),
        ]);
        if (p.error) throw p.error;
        if (t.error) throw t.error;
        if (active) {
          setParameters(p.data);
          setTestCode(t.data.test_code);
          setKind(t.data.result_kind);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [order.diagnostic_test_id]);
  async function file(f: File | undefined) {
    if (!f) return;
    setError("");
    setConfirmed(false);
    try {
      const source = f.name.toLowerCase().endsWith(".csv")
        ? "CSV"
        : f.name.toLowerCase().endsWith(".json")
          ? "JSON"
          : null;
      if (!source) throw new Error("Choose CSV or JSON");
      if (f.size > 2097152) throw new Error("File exceeds 2 MB");
      const parsed = importMachine(
        await f.text(),
        source,
        sampleCode,
        testCode,
        parameters,
      );
      setValues(parsed.values);
      setImported(parsed);
    } catch (e) {
      setError(errorText(e));
      setImported(null);
      setValues({});
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await rpc("p0_verify_results", {
        p_order: order.id,
        p_sample: sampleCode,
        p_values: values,
        p_source: imported?.source ?? "MANUAL",
        p_raw: imported?.raw ?? null,
      });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Enter and verify actual results</h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!loaded ? (
        <p>Loading test definition…</p>
      ) : kind !== "PARAMETERS" || !parameters.length ? (
        <p>
          Test definition/configuration required. Document, imaging and ECG
          reporting require a dedicated report definition; no numeric panel is
          invented.
        </p>
      ) : (
        <>
          <label className="block">
            Import CSV / JSON (maximum 2 MB)
            <input
              className="block w-full p-3"
              type="file"
              accept=".csv,.json"
              disabled={busy}
              onChange={(e) => {
                void file(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-sm">
            No physical analyzer is connected. Imports must contain the exact
            sample ID, test code, parameter codes and units. Verify every
            imported value.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {parameters.map((p) => (
              <label className="block" key={p.id}>
                {p.parameter_name} {p.required ? "*" : ""} (
                {p.unit ?? "no unit"})
                <input
                  className="mt-1 w-full rounded border p-3"
                  value={values[p.id] ?? ""}
                  inputMode={p.data_type === "NUMBER" ? "decimal" : "text"}
                  disabled={busy}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [p.id]: e.target.value }));
                    setConfirmed(false);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="text-sm">
            Reference ranges and flags are calculated on verification using the
            laboratory, method, patient age and sex. Missing or ambiguous ranges
            remain UNKNOWN.
          </p>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I verified specimen identity and all entered/imported observations
            against the source.
          </label>
          <Button disabled={busy || !confirmed} onClick={() => void verify()}>
            Verify observations
          </Button>
        </>
      )}
    </section>
  );
}
function PublishResult({
  result,
  order,
  labName,
  refresh,
}: {
  result: Result;
  order: Order;
  labName: string;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const path = await rpc<string>("p0_report_path", { p_result: result.id });
      if (!path) throw new Error("Report not authorized");
      const blob = await reportPdf(result, order.test_name, order.id, labName);
      const { error: uploadError } = await supabase.storage
        .from("lab-reports")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      // An earlier upload can succeed before publication fails. Retry publication without overwriting it.
      if (
        uploadError &&
        uploadError.message !== "The resource already exists" &&
        uploadError.message !== "Resource already exists"
      )
        throw uploadError;
      await rpc("p0_publish_report", { p_result: result.id });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-3">
      <h3 className="font-semibold">Verified observations</h3>
      {observationsOf(result).map((o, i) => (
        <p key={i}>
          {o.parameter_name}: {o.raw_value} {o.unit} ·{" "}
          {o.reference_range ?? "Reference range not configured"} · {o.flag}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {result.status === "VERIFIED" ? (
          <Button disabled={busy} onClick={() => void publish()}>
            Generate and publish verified PDF
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadReport(result);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Download report
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setShowPrintModal(true)}
        >
          <Printer className="size-4 mr-1 inline" />
          Print A4 Report
        </Button>
      </div>

      {showPrintModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex justify-center items-start">
          <div className="relative w-full max-w-4xl my-8">
            <PrintableDiagnosticReport
              report={{
                id: result.id,
                test_name: order.test_name,
                category: "PATHOLOGY",
                status: result.status,
                ordered_at: order.ordered_at,
                verified_at: result.verified_at,
                doctor_reviewed_at: result.doctor_reviewed_at,
                facility: {
                  name: labName || "Diagnostic Laboratory"
                },
                specimen: order.lab_specimens?.[0] ? {
                  code: order.lab_specimens[0].sample_code,
                  type: "Specimen",
                  collected_at: order.lab_specimens[0].created_at
                } : undefined,
                observations: observationsOf(result).map((o) => ({
                  parameter_name: o.parameter_name,
                  parameter_code: o.parameter_code,
                  observed_value: o.raw_value,
                  unit: o.unit,
                  reference_interval: o.reference_range ?? undefined,
                  flag: o.flag as any
                })),
                pathologist_verification: {
                  name: labName || "Authorized Pathologist"
                }
              }}
              patient={{
                id: order.patient_id,
                patient_code: "patient_code" in order ? String(order.patient_code) : undefined,
                full_name: "full_name" in order ? String(order.full_name) : "Patient"
              }}
              onClose={() => setShowPrintModal(false)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
