import { loadWorkerNotes, saveWorkerNotes, acknowledged } from '@/lib/worker-offline';
/**
 * WorkerPage — Full mobile-first rural field-care system.
 *
 * Features:
 *  - Offline sync status bar
 *  - Stats summary bar (today / overdue / completed / pending verification)
 *  - Today's Priority Work Panel (tasks due today or overdue)
 *  - Task cards: patient info, click-to-call, due date relative time,
 *    status badge, last outcome, action section (c1_worker_outcome RPC),
 *    safety disclaimer in Hindi + English
 *  - Completed tasks show green check with completion timestamp
 *  - Assisted Patient Mode with audit warning banner, patient search
 *    (delegation-scoped w1_patient_directory RPC only — no c1 fallback), and
 *    selected-patient display
 *  - Offline queue synced via w1_sync (REPORT_OUTCOME) driven by a structurally
 *    parsed w1_package (task_id, patient_id, version, active delegation)
 *  - Pagination (c1_worker_queue with p_offset)
 *  - SwasthyaCopilot (WORKER_FIELD workflow, no patient context)
 *
 * Bilingual: useCareLanguage() / tr() pattern throughout.
 */

import { useCareLanguage } from "@/lib/care-language";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  Disclaimer,
  SearchInput,
  SkeletonCard,
} from "@/components/kit";
import { errorText, rpc } from "@/lib/diagnostics/service";
import { useAuth } from "@/lib/auth";
import { SwasthyaCopilot } from "@/components/SwasthyaCopilot";
import {
  AlertTriangle,
  CheckCircle2,
  Phone,
  RefreshCw,
  Users,
  WifiOff,
  Wifi,
  ClipboardList,
  UserCheck,
  CalendarDays,
  MapPinned,
  TestTube2,
  Pill,
  HeartPulse,
  Mic,
  ClipboardCheck,
  Cloud,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type WorkerTask = {
  id: string;
  patient_id: string | null;
  patient_code: string;
  full_name: string;
  phone: string | null;
  status: string;
  outcome: string | null;
  due_at: string | null;
  completed_at?: string | null;
  priority?: string | null;
};

type PatientDirectoryRow = {
  id: string;
  patient_code: string;
  full_name: string;
  phone: string | null;
};

// ─── Utility helpers ─────────────────────────────────────────────────────────

/** Returns a human-readable relative time string. */
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const past = diff > 0;

  if (abs < 60_000) return past ? "just now" : "in a moment";
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000);
    return past ? `${m} min ago` : `in ${m} min`;
  }
  if (abs < 86_400_000) {
    const h = Math.round(abs / 3_600_000);
    return past ? `${h} hr ago` : `in ${h} hr`;
  }
  const d = Math.round(abs / 86_400_000);
  return past ? `${d} day${d === 1 ? "" : "s"} ago` : `in ${d} day${d === 1 ? "" : "s"}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DueBand = "OVERDUE" | "DUE_TODAY" | "UPCOMING";

function dueBand(dueAt: string | null): DueBand {
  if (!dueAt) return "UPCOMING";
  const due = new Date(dueAt);
  const now = new Date();
  if (due < now) return "OVERDUE";
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (due <= endOfToday) return "DUE_TODAY";
  return "UPCOMING";
}

// ─── Offline Status Bar ──────────────────────────────────────────────────────

function OfflineSyncBar({ tr }: { tr: (en: string, hi: string) => string }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showOnlineBanner, setShowOnlineBanner] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      setShowOnlineBanner(true);
      dismissTimer.current = setTimeout(() => setShowOnlineBanner(false), 3000);
    }
    function handleOffline() {
      setOnline(false);
      setShowOnlineBanner(false);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!online) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/15 px-4 py-2.5 text-sm text-warning-foreground">
        <WifiOff className="size-4 shrink-0" />
        <div>
          <p className="font-semibold">
            {tr("You are offline.", "आप ऑफलाइन हैं।")}
          </p>
          <p className="text-xs opacity-80">
            {tr(
              "Saved notes remain pending until you explicitly sync and the server acknowledges them.",
              "कनेक्शन आने पर बदलाव सिंक होंगे।",
            )}
          </p>
          <p className="mt-1 text-[11px] opacity-60">
            {tr(
              "New notes can be saved on this device and are clearly marked pending until a connected server confirms them.",
              "नए नोट इस डिवाइस पर सुरक्षित होंगे और सर्वर की पुष्टि तक लंबित दिखेंगे।",
            )}
          </p>
        </div>
      </div>
    );
  }

  if (showOnlineBanner) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
        <Wifi className="size-4 shrink-0" />
        <span className="font-semibold">
          {tr("Connected", "कनेक्ट हो गए")}
        </span>
      </div>
    );
  }

  return null;
}

type OfflineNote = {
    id: string;
    text: string;
    createdAt: string;
    purpose: string;
    // w1_sync is task-scoped and package-driven: it requires the task's
    // w1_package (task_id, patient_id, version and an active delegation). A note
    // is only syncable when it was captured against an assigned task.
    taskId: string | null;
    patientId: string | null;
    outcomeStatus: string;
    request?: Record<string, unknown>;
  };

// w1_package(p_task) returns the delegated care package. It is parsed
// structurally — never stored as an opaque blob — because w1_sync must use the
// package's authoritative task_id, patient_id, version and a real delegation_id.
type WorkerDelegation = {
  delegation_id: string;
  actions: string[];
  valid_until: string | null;
};

type WorkerPackage = {
  task_id: string;
  patient_id: string | null;
  version: number | null;
  delegations: WorkerDelegation[];
};

// The only w1_sync actions this frontend ever sends. VISIT_NOTE is not allowed.
const WORKER_SYNC_ACTIONS = ["BOOK_APPOINTMENT", "REPORT_OUTCOME"] as const;

function parsePackage(data: unknown): WorkerPackage | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const taskId = o.task_id ?? o.task ?? o.id;
  if (taskId == null) return null;
  const rawDelegations = Array.isArray(o.delegations)
    ? (o.delegations as Record<string, unknown>[])
    : [];
  return {
    task_id: String(taskId),
    patient_id: o.patient_id == null ? null : String(o.patient_id),
    version: o.version == null ? null : Number(o.version),
    delegations: rawDelegations
      .map((d) => ({
        delegation_id: String(d.delegation_id ?? d.id ?? ""),
        actions: Array.isArray(d.actions)
          ? (d.actions as unknown[]).map((a) => String(a))
          : typeof d.actions === "string"
            ? [d.actions]
            : [],
        valid_until: d.valid_until == null ? null : String(d.valid_until),
      }))
      .filter((d) => d.delegation_id),
  };
}

// An active delegation for an action: it lists the action and is not expired.
// Returns null when the worker holds no valid delegation, so sync is disabled
// with a truthful "Explicit patient delegation required" state (never a null
// delegation and never a fabricated one).
function activeDelegation(pkg: WorkerPackage, action: string): WorkerDelegation | null {
  const now = Date.now();
  return (
    pkg.delegations.find((d) => {
      if (!d.actions.includes(action)) return false;
      if (!d.valid_until) return true;
      const t = Date.parse(d.valid_until);
      return Number.isNaN(t) || t >= now;
    }) ?? null
  );
}


  function FieldCareOverview({
    tr,
    online,
    profileName,
    tasks,
    onVoice,
  }: {
    tr: (en: string, hi: string) => string;
    online: boolean;
    profileName: string;
    tasks: WorkerTask[];
    onVoice: () => void;
  }) {
    const open = tasks.filter((t) => t.status !== "COMPLETED");
    const dueToday = open.filter((t) => dueBand(t.due_at) === "DUE_TODAY").length;
    const overdue = open.filter((t) => dueBand(t.due_at) === "OVERDUE").length;
    const awaiting = tasks.filter((t) => t.status === "AWAITING_VERIFICATION").length;
    const highPriority = open.filter((t) =>
      ["HIGH", "URGENT", "EMERGENCY", "IMMEDIATE"].includes(
        (t.priority ?? "").toUpperCase(),
      ),
    ).length;
    const patients = new Set(tasks.map((t) => t.patient_code)).size;

    const stats = [
      { value: patients, label: tr("Assigned patients", "सौंपे मरीज़"), tone: "text-primary" },
      { value: open.length, label: tr("Open tasks", "खुले काम"), tone: "text-foreground" },
      { value: dueToday, label: tr("Due today", "आज देय"), tone: "text-primary" },
      { value: overdue, label: tr("Overdue", "विलंबित"), tone: "text-destructive" },
      { value: highPriority, label: tr("High priority", "उच्च प्राथमिकता"), tone: "text-warning-foreground" },
      { value: awaiting, label: tr("Awaiting verification", "सत्यापन बाकी"), tone: "text-success" },
    ];

    return (
      <section className="space-y-3">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-teal/10 p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                {tr("Field care today", "आज की फील्ड केयर")}
              </p>
              <h1 className="mt-1 text-2xl font-bold">{tr("Good morning", "सुप्रभात")}{profileName ? `, ${profileName}` : ""}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Your plan is local-first. Every count below comes only from your assigned follow-up tasks — nothing is estimated or invented.", "आपकी योजना लोकल-फर्स्ट है। नीचे की हर गिनती केवल आपके सौंपे गए फॉलो-अप कामों से आती है — कुछ भी अनुमानित या काल्पनिक नहीं है।")}
              </p>
            </div>
            <button type="button" onClick={onVoice} className="flex min-h-12 items-center gap-2 rounded-xl border border-primary/30 bg-card px-3 text-sm font-bold text-primary shadow-sm">
              <Mic className="size-5" /> {tr("Voice", "आवाज़")}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-card/80 p-2"><p className="text-xl font-bold font-tabular text-primary">{dueToday}</p><p className="text-[11px] text-muted-foreground">{tr("Due today", "आज देय")}</p></div>
            <div className="rounded-xl bg-card/80 p-2"><p className="text-xl font-bold font-tabular text-destructive">{overdue}</p><p className="text-[11px] text-muted-foreground">{tr("Overdue", "विलंबित")}</p></div>
            <div className="rounded-xl bg-card/80 p-2"><p className="text-xl font-bold font-tabular text-success">{awaiting}</p><p className="text-[11px] text-muted-foreground">{tr("Awaiting verification", "सत्यापन बाकी")}</p></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            {online ? <Cloud className="size-4 text-success" /> : <WifiOff className="size-4 text-warning-foreground" />}
            <span>{online ? tr("Connected · server actions available", "कनेक्टेड · सर्वर काम उपलब्ध") : tr("Offline · local queue only, no server confirmation", "ऑफलाइन · केवल लोकल कतार, सर्वर पुष्टि नहीं")}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="min-h-24 rounded-xl border border-border bg-card p-3 shadow-sm">
              <p className={`text-2xl font-bold font-tabular ${s.tone}`}>{s.value}</p>
              <p className="mt-1 text-sm font-bold">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {tr(
            "Village coverage, sample collection, medicine refills and appointment counts are not part of the worker follow-up task contract, so they are never shown as invented numbers.",
            "गाँव कवरेज, नमूना संग्रह, दवा रिफिल और अपॉइंटमेंट की गिनती वर्कर फॉलो-अप टास्क कॉन्ट्रैक्ट का हिस्सा नहीं हैं, इसलिए इन्हें काल्पनिक संख्याओं के रूप में कभी नहीं दिखाया जाता।",
          )}
        </p>
      </section>
    );
  }

  function OfflineQueuePanel({
    tr,
    notes,
    online,
    tasks,
    onAdd,
    onSync,
    syncNotice,
  }: {
    tr: (en: string, hi: string) => string;
    notes: OfflineNote[];
    online: boolean;
    tasks: WorkerTask[];
    onAdd: (text: string, task: WorkerTask | null, status: string) => Promise<void>;
    onSync: () => void;
    syncNotice: string;
  }) {
    const [text, setText] = useState("");
    const [taskId, setTaskId] = useState("");
    const [outcomeStatus, setOutcomeStatus] = useState("");
    const selected = tasks.find((t) => t.id === taskId) ?? null;
    const syncable = notes.filter((n) => n.taskId);
    return (
      <Card tinted className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /><h2 className="font-bold">{tr("Offline queue & sync", "ऑफलाइन कतार और सिंक")}</h2></div>
          <Badge tone={notes.length ? "warning" : "success"}>{notes.length ? tr(`${notes.length} pending`, `${notes.length} लंबित`) : tr("Empty", "खाली")}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{tr("Purpose: capture a visit note when connectivity is unreliable. A note is only sent to the care team once it is linked to an assigned task and the server confirms sync (w1_sync).", "उद्देश्य: कनेक्शन कमजोर होने पर मुलाकात का नोट रखें। नोट केवल तभी टीम को जाता है जब वह किसी सौंपे काम से जुड़ा हो और सर्वर सिंक (w1_sync) की पुष्टि करे।")}</p>
        <label className="block text-xs">
          <span className="mb-1 block font-semibold">{tr("Link note to an assigned task", "नोट को सौंपे गए काम से जोड़ें")}</span>
          <select
            className="w-full rounded-xl border border-border bg-background p-2.5 text-sm"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">{tr("Choose a task…", "काम चुनें…")}</option>
            {tasks.filter((t) => t.status !== "COMPLETED").map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name} · {t.patient_code}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">Recorded outcome<select value={outcomeStatus} onChange={e => setOutcomeStatus(e.target.value)} className="w-full rounded border p-2"><option value="">Choose the outcome you observed</option>{['CONTACTED','VISITED','ESCALATED','AWAITING_VERIFICATION'].map(status => <option key={status}>{status}</option>)}</select></label>
        <textarea maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={tr("Example: BP checked; review needed tomorrow…", "उदाहरण: बीपी जाँचा; कल समीक्षा चाहिए…")} />
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 flex-1" disabled={!text.trim() || !selected || !outcomeStatus} onClick={() => { void onAdd(text.trim(), selected, outcomeStatus).then(() => setText("")).catch(() => {}); }}>{tr("Save on device", "डिवाइस पर सुरक्षित करें")}</Button>
          <Button variant="outline" className="min-h-11" disabled={!online || !syncable.length} onClick={onSync}>{tr("Sync when online", "ऑनलाइन सिंक करें")}</Button>
        </div>
        {!selected && text.trim() && (
          <p className="text-[11px] text-muted-foreground">{tr("Saving without a task keeps the note on this device only; it cannot be synced until linked to a task.", "काम चुने बिना सहेजने पर नोट केवल इस डिवाइस पर रहेगा; काम से जुड़ने तक सिंक नहीं होगा।")}</p>
        )}
        {notes.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground">{notes.slice(-3).map((note) => <li key={note.id} className="rounded-lg bg-background px-3 py-2"><span className="font-semibold">{note.taskId ? tr("Pending", "लंबित") : tr("Device only", "केवल डिवाइस")} · </span>{note.text}</li>)}</ul>}
        {syncNotice && <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">{syncNotice}</p>}
      </Card>
    );
  }

// ─── Stats Summary Bar ───────────────────────────────────────────────────────

function StatsSummaryBar({
  tasks,
  tr,
}: {
  tasks: WorkerTask[];
  tr: (en: string, hi: string) => string;
}) {
  const today = tasks.filter(
    (t) => dueBand(t.due_at) === "DUE_TODAY" && t.status !== "COMPLETED",
  ).length;
  const overdue = tasks.filter(
    (t) => dueBand(t.due_at) === "OVERDUE" && t.status !== "COMPLETED",
  ).length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pendingVerification = tasks.filter(
    (t) => t.status === "AWAITING_VERIFICATION",
  ).length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
        <p className="text-2xl font-bold font-tabular text-primary">{today}</p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {tr("Today's Tasks", "आज के काम")}
        </p>
      </div>
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-center">
        <p className="text-2xl font-bold font-tabular text-destructive">
          {overdue}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive/70">
          {tr("Overdue", "बाकी बचे (विलंबित)")}
        </p>
      </div>
      <div className="rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-center">
        <p className="text-2xl font-bold font-tabular text-success">
          {completed}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-success/70">
          {tr("Completed", "पूरे हुए")}
        </p>
      </div>
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-center">
        <p className="text-2xl font-bold font-tabular text-warning-foreground">
          {pendingVerification}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-foreground/70">
          {tr("Pending Verification", "सत्यापन बाकी")}
        </p>
      </div>
    </div>
  );
}

// ─── Due Band Badge ──────────────────────────────────────────────────────────

function DueBandBadge({
  band,
  tr,
}: {
  band: DueBand;
  tr: (en: string, hi: string) => string;
}) {
  if (band === "OVERDUE") {
    return (
      <Badge tone="danger">
        {tr("OVERDUE", "विलंबित")}
      </Badge>
    );
  }
  if (band === "DUE_TODAY") {
    return (
      <Badge tone="warning">
        {tr("DUE TODAY", "आज देय")}
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      {tr("UPCOMING", "आगामी")}
    </Badge>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

const OUTCOME_STATUSES = [
  "CONTACTED",
  "VISITED",
  "ESCALATED",
  "AWAITING_VERIFICATION",
] as const;

type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

function TaskCard({
  task,
  refresh,
  assistedPatientCode,
  tr,
  label,
}: {
  task: WorkerTask;
  refresh: () => void;
  assistedPatientCode: string | null;
  tr: (en: string, hi: string) => string;
  label: (v: string) => string;
}) {
  const [status, setStatus] = useState<OutcomeStatus>("CONTACTED");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 020 — w1_package(p_task) returns the delegated care package for this task.
  // It is parsed STRUCTURALLY (task_id, patient_id, version, delegations[]) —
  // never stored as an opaque blob — so the delegated actions and the active
  // REPORT_OUTCOME delegation are visible and drive w1_sync.
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgError, setPkgError] = useState("");
  const [pkg, setPkg] = useState<WorkerPackage | null>(null);

  // 036 Community assistance request state (w2_assist)
  const [showAssist, setShowAssist] = useState(false);
  const [assistKind, setAssistKind] = useState<"TEST_ASSISTANCE" | "SAMPLE_LOGISTICS" | "MEDICINE_REFILL_REQUEST" | "ESCALATION">("TEST_ASSISTANCE");
  const [assistNote, setAssistNote] = useState("");
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistSuccess, setAssistSuccess] = useState("");
  const [assistError, setAssistError] = useState("");

  const isCompleted = task.status === "COMPLETED";
  const band = dueBand(task.due_at);

  async function handleAssist() {
    if (!assistNote.trim()) {
      setAssistError("Note is required for community assistance request");
      return;
    }
    setAssistBusy(true);
    setAssistError("");
    setAssistSuccess("");
    try {
      const del = pkg ? activeDelegation(pkg, "REPORT_OUTCOME") : null;
      await rpc("w2_assist", {
        p_task: task.id,
        p_delegation: del?.delegation_id ?? null,
        p_kind: assistKind,
        p_source: "COMMUNITY",
        p_note: assistNote.trim(),
        p_version: pkg?.version ?? 1,
        p_request: crypto.randomUUID(),
      });
      setAssistSuccess("Community assistance request registered successfully.");
      setAssistNote("");
      refresh();
    } catch (e) {
      setAssistError(errorText(e));
    } finally {
      setAssistBusy(false);
    }
  }

  async function loadPackage() {
    setPkgBusy(true);
    setPkgError("");
    try {
      const parsed = parsePackage(await rpc<unknown>("w1_package", { p_task: task.id }));
      if (!parsed) {
        setPkg(null);
        setPkgError(
          tr(
            "w1_package returned no task_id, so the package could not be parsed.",
            "w1_package ने task_id नहीं लौटाया, इसलिए पैकेज पार्स नहीं हो सका।",
          ),
        );
        return;
      }
      setPkg(parsed);
    } catch (e) {
      setPkg(null);
      setPkgError(errorText(e));
    } finally {
      setPkgBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      // Prepend assisted-mode audit note to outcome text
      const finalOutcome =
        assistedPatientCode !== null
          ? `[ASSISTED MODE — recorded on behalf of ${assistedPatientCode}] ${outcome}`
          : outcome;

      await rpc("c1_worker_outcome", {
        p_task: task.id,
        p_status: status,
        p_outcome: finalOutcome,
      });
      setOutcome("");
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="article"
      className={
        isCompleted
          ? "border-success/30 bg-success/5"
          : band === "OVERDUE"
            ? "border-destructive/20"
            : "border-border"
      }
    >
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-foreground">
            {task.full_name}
          </h3>
          <p className="text-xs text-muted-foreground font-tabular">
            {task.patient_code}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <Badge tone="neutral">{label(task.status)}</Badge>
          {!isCompleted && <DueBandBadge band={band} tr={tr} />}
        </div>
      </div>

      {/* Phone */}
      <div className="mt-3 flex items-center gap-2 text-sm">
        <Phone className="size-4 text-muted-foreground shrink-0" />
        {task.phone ? (
          <a
            href={`tel:${task.phone}`}
            className="font-medium text-primary hover:underline font-tabular"
          >
            {task.phone}
          </a>
        ) : (
          <span className="text-muted-foreground italic">
            {tr("No phone recorded", "फोन नंबर दर्ज नहीं")}
          </span>
        )}
      </div>

      {/* Due date */}
      <div className="mt-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">
          {tr("Due:", "देय तिथि:")}
        </span>{" "}
        {formatDateTime(task.due_at)}{" "}
        <span className="text-xs opacity-70">({relativeTime(task.due_at)})</span>
      </div>

      {/* Last outcome */}
      {task.outcome && (
        <div className="mt-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-foreground">
          <span className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
            {tr("Last recorded outcome", "पिछली बार क्या हुआ")}
          </span>
          <p className="mt-0.5 leading-relaxed">{task.outcome}</p>
        </div>
      )}

      {/* Completed state */}
      {isCompleted ? (
        <div className="mt-3 flex items-center gap-2 text-success text-sm font-semibold">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>
            {tr("Completed", "पूरा हुआ")}
            {task.completed_at
              ? ` — ${formatDateTime(task.completed_at)} (${relativeTime(task.completed_at)})`
              : ""}
          </span>
        </div>
      ) : (
        /* Action section */
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr("Record Outcome / नतीजा दर्ज करें", "नतीजा दर्ज करें")}
          </p>

          {/* 020 — delegated care package (w1_package) */}
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {tr("Delegated care package", "सौंपा गया देखभाल पैकेज")}
              </span>
              <Button variant="outline" size="sm" loading={pkgBusy} disabled={pkgBusy} onClick={() => void loadPackage()}>
                {pkg === null ? tr("Load (w1_package)", "लोड करें (w1_package)") : tr("Reload", "फिर लोड करें")}
              </Button>
            </div>
            {pkgError && <p className="mt-1 text-xs text-destructive">{pkgError}</p>}
            {pkg && (
              <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-foreground">
                <p>
                  <span className="font-semibold">task_id:</span> <span className="font-mono">{pkg.task_id.slice(0, 8)}</span>
                  {" · "}
                  <span className="font-semibold">patient_id:</span>{" "}
                  <span className="font-mono">{pkg.patient_id ? pkg.patient_id.slice(0, 8) : tr("none", "कोई नहीं")}</span>
                  {" · "}
                  <span className="font-semibold">version:</span> <span className="font-mono">{pkg.version ?? "—"}</span>
                </p>
                {pkg.delegations.length === 0 ? (
                  <p className="text-warning-foreground">
                    {tr("No delegations — Explicit patient delegation required to sync.", "कोई प्रतिनिधित्व नहीं — सिंक हेतु Explicit patient delegation required।")}
                  </p>
                ) : (
                  pkg.delegations.map((d) => {
                    const active = d === activeDelegation(pkg, "REPORT_OUTCOME");
                    const allowed = d.actions.filter((a) => (WORKER_SYNC_ACTIONS as readonly string[]).includes(a));
                    return (
                      <p key={d.delegation_id} className="rounded bg-background px-2 py-1">
                        <span className="font-mono">{d.delegation_id.slice(0, 8)}</span>
                        {" · "}
                        {tr("actions", "क्रियाएँ")}: {d.actions.join(", ") || "—"}
                        {" · "}
                        {tr("valid until", "मान्य تا")}: {d.valid_until ?? "—"}
                        {active && <span className="ml-1 font-semibold text-success">✓ {tr("active for REPORT_OUTCOME", "REPORT_OUTCOME हेतु सक्रिय")}</span>}
                        {allowed.length === 0 && (
                          <span className="ml-1 text-muted-foreground">{tr("(no allowed sync actions)", "(कोई अनुमत सिंक क्रिया नहीं)")}</span>
                        )}
                      </p>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Status selector */}
          <label className="block">
            <span className="label-xs">
              {tr("Update Status", "स्थिति बदलें")}
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus:border-primary focus:outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value as OutcomeStatus)}
            >
              <option value="CONTACTED">
                {tr("Contacted", "संपर्क किया गया")}
              </option>
              <option value="VISITED">
                {tr("Visited", "मुलाकात हुई")}
              </option>
              <option value="ESCALATED">
                {tr("Escalate to Doctor", "डॉक्टर को ध्यान देने के लिए भेजें")}
              </option>
              <option value="AWAITING_VERIFICATION">
                {tr(
                  "Submit for Doctor Verification",
                  "डॉक्टर को जाँचने के लिए भेजें",
                )}
              </option>
            </select>
          </label>

          {/* Outcome textarea */}
          <label className="block">
            <span className="label-xs">
              {tr("Actual Outcome / Observation", "वास्तव में क्या हुआ")}
            </span>
            <textarea
              className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              rows={3}
              maxLength={2000}
              placeholder={tr(
                "Describe what happened during contact or visit…",
                "संपर्क या मुलाकात में क्या हुआ, यहाँ लिखें…",
              )}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="text-xs text-destructive font-medium">
              {error}
            </p>
          )}

          <Button
            disabled={busy || !outcome.trim()}
            loading={busy}
            onClick={() => void save()}
            className="min-h-12 w-full"
          >
            {tr("Record Outcome", "नतीजा दर्ज करें")}
          </Button>

          {/* 036 Community Assistance Request (w2_assist) */}
          <div className="pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => setShowAssist(v => !v)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              {showAssist ? "✕ Close Assistance Form" : "+ Request Community Assistance (036 w2_assist)"}
            </button>

            {showAssist && (
              <div className="mt-2 p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2 text-xs">
                <p className="font-semibold text-foreground">Community Assistance / Escalation</p>
                <select
                  value={assistKind}
                  onChange={(e) => setAssistKind(e.target.value as any)}
                  className="w-full rounded border border-border p-2 bg-background font-semibold"
                >
                  <option value="TEST_ASSISTANCE">TEST_ASSISTANCE (Lab/Diagnostic Assistance)</option>
                  <option value="SAMPLE_LOGISTICS">SAMPLE_LOGISTICS (Specimen Pickup)</option>
                  <option value="MEDICINE_REFILL_REQUEST">MEDICINE_REFILL_REQUEST (Drug Refill Due)</option>
                  <option value="ESCALATION">ESCALATION (Urgent Clinical Escalation)</option>
                </select>
                <input
                  type="text"
                  value={assistNote}
                  onChange={(e) => setAssistNote(e.target.value)}
                  placeholder="Clinical need, patient condition or logistics reason…"
                  className="w-full rounded border border-border p-2 bg-background"
                />
                {assistError && <p className="text-destructive font-medium">{assistError}</p>}
                {assistSuccess && <p className="text-success font-medium">{assistSuccess}</p>}
                <Button
                  size="sm"
                  disabled={assistBusy || !assistNote.trim()}
                  onClick={() => void handleAssist()}
                >
                  {assistBusy ? "Submitting…" : "Submit w2_assist Request"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <p><span className="font-semibold text-foreground">{tr("Performed by:", "किसने किया:")}</span> {tr("signed-in community health worker", "साइन-इन सामुदायिक स्वास्थ्य कार्यकर्ता")}</p>
            <p><span className="font-semibold text-foreground">{tr("On behalf of:", "किसकी तरफ से:")}</span> {assistedPatientCode ?? tr("assigned patient", "सौंपा गया मरीज़")}</p>
            <p><span className="font-semibold text-foreground">{tr("Purpose:", "उद्देश्य:")}</span> {tr("follow-up documentation for care-team review", "देखभाल टीम की समीक्षा के लिए फॉलो-अप दर्ज करना")}</p>
          </div>

          {/* Safety disclaimer */}
          <Disclaimer>
            <span className="block">
              {tr(
                "Contact or a visit does not close the follow-up. The assigned doctor verifies and marks completion.",
                "संपर्क या मुलाकात से काम पूरा नहीं माना जाता।",
              )}
            </span>
            <span className="block mt-0.5 opacity-80">
              जिम्मेदार डॉक्टर नतीजा जाँचकर इसे पूरा मानते हैं।
            </span>
          </Disclaimer>
        </div>
      )}
    </Card>
  );
}

// ─── Priority Work Panel ─────────────────────────────────────────────────────

function PriorityPanel({
  tasks,
  busy,
  refresh,
  assistedPatientCode,
  tr,
  label,
}: {
  tasks: WorkerTask[];
  busy: boolean;
  refresh: () => void;
  assistedPatientCode: string | null;
  tr: (en: string, hi: string) => string;
  label: (v: string) => string;
}) {
  const priority = tasks
    .filter(
      (t) =>
        t.status !== "COMPLETED" &&
        (dueBand(t.due_at) === "OVERDUE" || dueBand(t.due_at) === "DUE_TODAY"),
    )
    .sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return da - db;
    });

  if (busy) return null;
  if (!priority.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-5 text-warning-foreground" />
        <h2 className="text-base font-bold text-foreground">
          {tr("Today's Priority Work", "आज के प्राथमिकता कार्य")}
        </h2>
        <Badge tone="warning">{priority.length}</Badge>
      </div>
      <div className="space-y-3">
        {priority.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            refresh={refresh}
            assistedPatientCode={assistedPatientCode}
            tr={tr}
            label={label}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Assisted Patient Mode ───────────────────────────────────────────────────

function AssistedModePanel({
  tr,
  onPatientSelected,
  selectedPatient,
  onExit,
}: {
  tr: (en: string, hi: string) => string;
  onPatientSelected: (p: PatientDirectoryRow) => void;
  selectedPatient: PatientDirectoryRow | null;
  onExit: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientDirectoryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        setSearchError("");
        try {
          // 020 — worker_delegations scope the directory to patients this worker
          // may act for. Assisted mode uses ONLY the delegation-scoped
          // w1_patient_directory; it never falls back to c1_patient_directory,
          // which would surface patients outside the worker's delegation. If the
          // contract is unavailable the search degrades to a truthful error.
          const data = await rpc<{patient_id: string; patient_name: string; patient_code: string}[]>("w1_patient_directory", {
            p_search: q.trim(),
            p_offset: 0,
          });
          setResults((data ?? []).map(row => ({ id: row.patient_id, full_name: row.patient_name, patient_code: row.patient_code, phone: null })));
        } catch (e) {
          setResults([]);
          setSearchError(errorText(e));
        } finally {
          setSearching(false);
        }
      }, 400);
    },
    [],
  );

  useEffect(() => {
    search(query);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  return (
    <Card tinted className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserCheck className="size-5 text-primary" />
          <h2 className="font-bold text-foreground">
            {tr(
              "Assisted Patient Mode",
              "सहायता मोड — मरीज़ की तरफ से काम करें",
            )}
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={onExit}>
          {tr("Exit Assisted Mode", "सहायता मोड बंद करें")}
        </Button>
      </div>

      {/* Audit warning banner */}
      <AlertBanner tone="emergency" title={tr("ASSISTED MODE ACTIVE", "सहायता मोड चालू है")}>
        {tr(
          "Actions taken below are recorded as performed by you on behalf of the patient. This is audited.",
          "नीचे किए गए सभी काम आपके नाम से मरीज़ की तरफ से दर्ज होंगे। यह ऑडिट किया जाता है।",
        )}
      </AlertBanner>

      {selectedPatient ? (
        /* Selected patient display */
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tr("Selected Patient", "चुने हुए मरीज़")}
          </p>
          <p className="mt-1 font-bold text-foreground">
            {selectedPatient.full_name}
          </p>
          <p className="text-xs text-muted-foreground font-tabular">
            {selectedPatient.patient_code}
            {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => onPatientSelected({ ...selectedPatient, id: "" })}
          >
            {tr("Change Patient", "दूसरा मरीज़ चुनें")}
          </Button>
        </div>
      ) : (
        /* Patient search */
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {tr(
              "Search for the patient you are acting on behalf of:",
              "जिस मरीज़ की तरफ से काम करना है उसे खोजें:",
            )}
          </p>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={tr(
              "Search assigned patient by name or code…",
              "नाम, कोड या फोन से खोजें…",
            )}
          />
          {searching && (
            <p className="text-xs text-muted-foreground animate-pulse">
              {tr("Searching…", "खोजा जा रहा है…")}
            </p>
          )}
          {searchError && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="font-semibold text-foreground">
                {searchError.includes("PATIENT_DELEGATION_REQUIRED") || searchError.includes("PATIENT_ACCESS_REQUIRED")
                  ? tr("Patient Delegation or Assignment Required", "मरीज़ की सहमति या कार्य सौंपना आवश्यक")
                  : tr("Notice", "सूचना")}
              </p>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                {searchError.includes("PATIENT_DELEGATION_REQUIRED") || searchError.includes("PATIENT_ACCESS_REQUIRED")
                  ? tr(
                      "This patient is registered in the health network, but has no active delegation, follow-up task, or catchment assignment linked to your worker account. Explicit patient delegation is required before acting on their behalf.",
                      "यह मरीज़ स्वास्थ्य नेटवर्क में पंजीकृत है, लेकिन आपके कार्यकर्ता खाते से कोई सक्रिय सहमति, फॉलो-अप कार्य या क्षेत्र संबद्धता नहीं है। उनकी तरफ से काम करने के लिए स्पष्ट सहमति आवश्यक है।"
                    )
                  : searchError}
              </p>
            </div>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
                    onClick={() => {
                      onPatientSelected(p);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {p.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground font-tabular">
                        {p.patient_code}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </p>
                    </div>
                    <Users className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && query.trim() && results.length === 0 && !searchError && (
            <p className="text-xs text-muted-foreground">
              {tr(
                "No patients found matching your search.",
                "आपकी खोज से कोई मरीज़ नहीं मिला।",
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main WorkerPage ─────────────────────────────────────────────────────────

export function WorkerPage() {
  const { tr, label } = useCareLanguage();
  const { profile } = useAuth();

  // Queue state
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);

  // Assisted mode state
  const [assistedMode, setAssistedMode] = useState(false);
  const [selectedPatient, setSelectedPatient] =
    useState<PatientDirectoryRow | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineNotes, setOfflineNotes] = useState<OfflineNote[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const syncing = useRef(false);
  const [syncNotice, setSyncNotice] = useState("");

  useEffect(() => {
    const setConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", setConnection);
    window.addEventListener("offline", setConnection);
    return () => {
      window.removeEventListener("online", setConnection);
      window.removeEventListener("offline", setConnection);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setQueueReady(false); setOfflineNotes([]);
    // The legacy shared plaintext queue cannot be safely attributed to an account.
    localStorage.removeItem("swasthya-worker-offline-notes");
    if (profile?.id) void loadWorkerNotes<OfflineNote>(profile.id).then(notes => {
      if (alive) { setOfflineNotes(notes); setQueueReady(true); }
    }).catch(() => { if (alive) setSyncNotice("Device storage could not be opened. Notes have not been saved."); });
    return () => { alive = false; };
  }, [profile?.id]);
  async function addOfflineNote(text: string, task: WorkerTask | null, outcomeStatus: string) {
    if (!queueReady || !profile?.id || !task || syncing.current) return;
    const next = [...offlineNotes, {id: crypto.randomUUID(), text, createdAt: new Date().toISOString(), purpose: "REPORT_OUTCOME", taskId: task.id, patientId: task.patient_id, outcomeStatus}];
    try {
      await saveWorkerNotes(profile.id, next);
      setOfflineNotes(next); setSyncNotice("Saved locally. Awaiting explicit sync and server acknowledgement.");
    } catch { setSyncNotice("Device storage failed. This note was NOT saved; please keep your text and retry."); throw new Error("Device storage failed"); }
  }

  // 020 — real offline sync via w1_sync(p_task,p_patient,p_delegation,p_action,
  // p_payload,p_version,p_request), driven ONLY by the task's w1_package:
  //   p_task/p_patient/p_version come from the package; p_delegation is a real
  //   active delegation_id that contains REPORT_OUTCOME; p_action is never
  //   VISIT_NOTE and p_delegation is never null; p_version is the package
  //   version, never a timestamp. If the worker holds no valid delegation the
  //   note stays pending with an "Explicit patient delegation required" state and
  //   is never reported as synced.
  async function syncOfflineNotes() {
    if (!online || !queueReady || !profile?.id || syncing.current) return;
    const syncable = offlineNotes.filter((n) => n.taskId);
    if (!syncable.length) {
      setSyncNotice(
        tr(
          "No offline note is linked to an assigned task, so there is nothing to sync.",
          "कोई ऑफलाइन नोट किसी सौंपे काम से नहीं जुड़ा, इसलिए सिंक करने को कुछ नहीं है।",
        ),
      );
      return;
    }
    syncing.current = true;
    setSyncNotice(tr("Syncing…", "सिंक हो रहा है…"));
    const synced: string[] = [];
    const failures: string[] = [];
    let needsDelegation = 0;
    for (const note of syncable) {
      try {
        const pkg = parsePackage(await rpc<unknown>("w1_package", { p_task: note.taskId }));
        if (!pkg || pkg.version == null) {
          failures.push(
            tr("w1_package returned no usable version for task ", "w1_package ने काम के लिए उपयोगी संस्करण नहीं लौटाया ") +
              String(note.taskId).slice(0, 8),
          );
          continue;
        }
        const del = activeDelegation(pkg, "REPORT_OUTCOME");
        if (!del) {
          needsDelegation += 1;
          continue;
        }
        if (!note.request) {
          if (note.patientId && note.patientId !== pkg.patient_id) throw new Error("Assigned patient changed; review this note before syncing");
          note.request = {
          p_task: pkg.task_id,
          p_patient: pkg.patient_id,
          p_delegation: del.delegation_id,
          p_action: "REPORT_OUTCOME",
          p_payload: {
            status: note.outcomeStatus,
            note_id: note.id,
            outcome: note.text,
            purpose: note.purpose,
            captured_at: note.createdAt,
          },
          p_version: pkg.version,
          p_request: note.id,
          };
          await saveWorkerNotes(profile.id, offlineNotes);
        }
        const receipt = await rpc<{status: string; receipt_id?: string}>("w1_sync", note.request);
        if (!acknowledged(receipt)) throw new Error(`Server did not acknowledge the note: ${receipt?.status ?? "UNKNOWN"}`);
        synced.push(note.id);
      } catch (e) {
        failures.push(errorText(e));
      }
    }
    if (synced.length) {
      const remaining = offlineNotes.filter((n) => !synced.includes(n.id));
      setOfflineNotes(remaining);
      try { await saveWorkerNotes(profile.id, remaining); } catch { failures.push("Acknowledged by server, but local cleanup failed. Retrying uses the same request."); }
      refresh();
    }
    const parts: string[] = [];
    if (synced.length) {
      parts.push(
        tr(
          `${synced.length} note(s) synced and confirmed by the server.`,
          `${synced.length} नोट सिंक हुए और सर्वर ने पुष्टि की।`,
        ),
      );
    }
    if (needsDelegation) {
      parts.push(
        tr(
          `${needsDelegation} note(s) held: Explicit patient delegation required (no active REPORT_OUTCOME delegation in w1_package). They were NOT reported as synced.`,
          `${needsDelegation} नोट रोके गए: Explicit patient delegation required (w1_package में कोई सक्रिय REPORT_OUTCOME प्रतिनिधित्व नहीं)। इन्हें सिंक सफल नहीं बताया गया।`,
        ),
      );
    }
    if (failures.length) {
      parts.push(
        tr(
          `${failures.length} note(s) remain pending and were NOT reported as synced. Server said: `,
          `${failures.length} नोट लंबित हैं और सिंक सफल नहीं बताए गए। सर्वर ने कहा: `,
        ) + failures[0],
      );
    }
    syncing.current = false;
    setSyncNotice(parts.join(" "));
  }

  // Load worker queue
  useEffect(() => {
    let active = true;
    setBusy(true);
    void rpc<WorkerTask[]>("c1_worker_queue", { p_offset: offset })
      .then((r) => {
        if (active) {
          setTasks(r ?? []);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [offset, version]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  const assistedPatientCode = selectedPatient?.patient_code ?? null;

  // Split tasks: priority (overdue + today) sorted first, then rest
  const priorityTasks = tasks
    .filter(
      (t) =>
        t.status !== "COMPLETED" &&
        (dueBand(t.due_at) === "OVERDUE" || dueBand(t.due_at) === "DUE_TODAY"),
    )
    .sort((a, b) => {
      const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return da - db;
    });

  const allTasks = [...tasks].sort((a, b) => {
    const da = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const db = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return da - db;
  });

  return (
    <div className="space-y-5 pb-12">
      <FieldCareOverview
        tr={tr}
        online={online}
        profileName={profile?.full_name?.split(" ")[0] ?? ""}
        tasks={tasks}
        onVoice={() => window.dispatchEvent(new CustomEvent("swasthya:voice-help"))}
      />
      <OfflineQueuePanel
        tr={tr}
        notes={offlineNotes}
        online={online}
        tasks={tasks}
        onAdd={addOfflineNote}
        onSync={syncOfflineNotes}
        syncNotice={syncNotice}
      />
      {/* Page title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {tr("Follow-up Workspace", "फॉलो-अप कार्यक्षेत्र")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr(
              "Manage your assigned follow-up tasks",
              "आपको सौंपे गए फॉलो-अप काम यहाँ हैं",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={busy}
          loading={busy}
        >
          <RefreshCw className="size-3.5" />
          {tr("Refresh", "नई जानकारी देखें")}
        </Button>
      </div>

      {/* Offline sync bar */}
      <OfflineSyncBar tr={tr} />

      {/* Error */}
      {error && (
        <AlertBanner tone="emergency" title={tr("Error loading tasks", "काम लोड नहीं हुआ")}>
          {error}
        </AlertBanner>
      )}

      {/* Stats */}
      {!busy && !error && <StatsSummaryBar tasks={tasks} tr={tr} />}

      {/* Assisted Patient Mode toggle */}
      {!assistedMode ? (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left transition hover:border-primary/60 hover:bg-primary/10"
          onClick={() => setAssistedMode(true)}
        >
          <UserCheck className="size-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary">
              {tr(
                "Perform action on behalf of patient (Assisted Mode)",
                "मरीज़ की तरफ से काम करें (सहायता मोड)",
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {tr(
                "All assisted actions are audited.",
                "सभी सहायता क्रियाएँ ऑडिट की जाती हैं।",
              )}
            </p>
          </div>
        </button>
      ) : (
        <AssistedModePanel
          tr={tr}
          onPatientSelected={(p) => {
            // If p.id is empty it means user clicked "Change Patient"
            if (!p.id) {
              setSelectedPatient(null);
            } else {
              setSelectedPatient(p);
            }
          }}
          selectedPatient={selectedPatient}
          onExit={() => {
            setAssistedMode(false);
            setSelectedPatient(null);
          }}
        />
      )}

      {/* Assisted mode global warning (when mode is active & task cards shown) */}
      {assistedMode && selectedPatient && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm font-semibold text-destructive">
            {tr(
              `ASSISTED MODE ACTIVE — Recording outcomes on behalf of ${selectedPatient.full_name} (${selectedPatient.patient_code}). This is audited.`,
              `सहायता मोड चालू है — ${selectedPatient.full_name} (${selectedPatient.patient_code}) की तरफ से नतीजे दर्ज किए जा रहे हैं। यह ऑडिट किया जाता है।`,
            )}
          </p>
        </div>
      )}

      {/* Loading skeletons */}
      {busy && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Priority panel */}
      {!busy && !error && priorityTasks.length > 0 && (
        <PriorityPanel
          tasks={tasks}
          busy={busy}
          refresh={refresh}
          assistedPatientCode={assistedPatientCode}
          tr={tr}
          label={label}
        />
      )}

      {/* All tasks */}
      {!busy && !error && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="size-5 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground">
              {tr("All Assigned Tasks", "सभी सौंपे गए काम")}
            </h2>
            {allTasks.length > 0 && (
              <Badge tone="neutral">{allTasks.length}</Badge>
            )}
          </div>

          {allTasks.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-muted-foreground py-4">
                {tr(
                  "No follow-up tasks have been assigned to you.",
                  "अभी आपको कोई फॉलो-अप काम नहीं दिया गया है।",
                )}
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {allTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  refresh={refresh}
                  assistedPatientCode={assistedPatientCode}
                  tr={tr}
                  label={label}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Pagination */}
      {!busy && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={offset === 0 || busy}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            {tr("← Previous", "← पिछला")}
          </Button>
          <span className="text-xs text-muted-foreground font-tabular">
            {tr(`Page ${Math.floor(offset / 20) + 1}`, `पृष्ठ ${Math.floor(offset / 20) + 1}`)}
          </span>
          <Button
            variant="outline"
            disabled={tasks.length < 20 || busy}
            onClick={() => setOffset(offset + 20)}
          >
            {tr("Next →", "अगला →")}
          </Button>
        </div>
      )}

      {/* SwasthyaCopilot — field care assistant */}
      <SwasthyaCopilot
        patientId={null}
        workflow="WORKER_FIELD"
        title={tr(
          "Field Care Assistant / फील्ड केयर सहायक",
          "फील्ड केयर सहायक",
        )}
        suggestions={[
          tr("List my tasks for today", "आज मेरे कितने काम हैं?"),
          tr(
            "Which patients need urgent follow-up?",
            "किन मरीज़ों को तुरंत फॉलो-अप चाहिए?",
          ),
          "मेरे आज के सबसे जरूरी काम कौन से हैं?",
        ]}
      />
    </div>
  );
}
