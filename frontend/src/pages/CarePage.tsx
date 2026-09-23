import { ConsentPanel } from "@/components/ConsentPanel";
import { workflowLabel } from "@/lib/care-language";
import { useEffect, useState, useRef } from "react";
import { Button, Card, Badge } from "@/components/kit";
import { AlertCircle } from "lucide-react";
import { ProviderPicker } from "@/components/ProviderPicker";
import { useAuth } from "@/lib/auth";
import { navigate } from "@/lib/route";
import { useLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { speakText } from "@/lib/voice";
import { safeFormatDate } from "@/lib/utils";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import {
  errorText,
  rpc,
  observationsOf,
  type Result,
} from "@/lib/diagnostics/service";
type Gap = {
  id: string;
  gap_type: string;
  severity: string;
  status: string;
  due_at: string | null;
};
type Task = {
  id: string;
  care_gap_id: string;
  status: string;
  outcome: string | null;
  verified_at: string | null;
};
type Context = {
  patient_id: string;
  scope: string;
  allergies: string;
  encounters: {
    id: string;
    started_at: string;
    diagnosis: string | null;
    clinical_notes: string | null;
    chief_complaint: string | null;
    status: string;
  }[];
  prescriptions: {
    id: string;
    issued_at: string;
    status: string;
    items: {
      id: string;
      medicine_name: string;
      strength: string;
      dose: string;
      frequency: string;
      duration: string;
      instructions: string;
      quantity_prescribed: number | null;
    }[];
    fulfilment: { status: string } | null;
  }[];
  diagnostics: {
    id: string;
    test_name: string;
    ordered_at: string;
    status: string;
    result: Result | null;
  }[];
  health_records: {
    id: string;
    original_filename: string;
    record_date: string | null;
    verification_status: string;
  }[];
  care_gaps: Gap[];
  events: {
    id: string;
    event_type: string;
    created_at: string;
    source_table: string;
    source_id: string;
    metadata: Record<string, unknown>;
  }[];
  follow_ups: Task[];
};
type Snapshot = {
  answer?: { text: string };
  outcome?: string;
  items: { source_id: string; date: string; text: string; kind: string; display_text?: string }[];
  snapshot_sections?: { title: string; items: { source_id: string; date: string; text: string; kind: string; display_text?: string }[] }[];
  generated_at?: string;
  notice?: string;
};

export function CarePage() {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const doctor = profile?.role === "DOCTOR";
  const [patient, setPatient] = useState("");
  const [rows, setRows] = useState<
    { id: string; full_name: string; patient_code: string }[]
  >([]);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        void (async () => {
          try {
            if (active) setError("");
            if (doctor) {
              const r = await rpc<typeof rows>("c1_patient_directory", {
                p_search: query,
                p_offset: offset,
              });
              if (active) setRows(r);
            } else {
              const r = await supabase
                .from("patient_profiles")
                .select("id")
                .eq("user_id", profile!.id)
                .single();
              if (r.error) throw r.error;
              if (active) setPatient(r.data.id);
            }
          } catch (e) {
            if (active) {
              setRows([]);
              setError(errorText(e));
            }
          }
        })(),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile?.id, doctor, query, offset]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {hi ? "इलाज की जानकारी" : "Care history"}
      </h1>
      {profile?.role === "PATIENT" && <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate('/replay')}>Care Replay</Button>
        <Button variant="outline" onClick={() => navigate('/twin')}>Care Twin</Button>
      </div>}
      {error && (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 text-warning-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">
                {error.includes("PATIENT_ACCESS_REQUIRED")
                  ? (hi ? "सहमति या सक्रिय संबंध आवश्यक" : "Authorization or Consent Required")
                  : (hi ? "सूचना" : "Notice")}
              </p>
              <p className="mt-1 text-muted-foreground leading-relaxed">
                {error.includes("PATIENT_ACCESS_REQUIRED")
                  ? (hi
                      ? "यह मरीज स्वास्थ्य नेटवर्क में पंजीकृत है, लेकिन आपके क्लिनिक के साथ कोई सक्रिय संबंध, अपॉइंटमेंट, रेफरल या सहमति दर्ज नहीं है। रिकॉर्ड देखने के लिए स्पष्ट सहमति या रेफरल आवश्यक है।"
                      : "This patient is registered in the health network, but has no active clinical relationship, appointment, referral, or consent with your practice. Explicit patient consent or clinical referral is required before accessing their records.")
                  : error}
              </p>
            </div>
          </div>
        </div>
      )}
      {doctor && (
        <Card className="space-y-3">
          <label className="block">
            Find a patient in your care
            <input
              className="w-full rounded border p-3"
              value={query}
              maxLength={100}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <select
            className="w-full rounded border p-3"
            aria-label="Patient"
            value={patient}
            onChange={(e) => setPatient(e.target.value)}
          >
            <option value="">Choose patient</option>
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} · {p.patient_code}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={rows.length < 20}
              onClick={() => setOffset(offset + 20)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      {patient && (
        <div className="space-y-5">
          {doctor && <ConsentPanel patientId={patient} doctor={true} />}
          <CareHistory key={patient} patientId={patient} doctor={doctor} />
        </div>
      )}
    </div>
  );
}
function CareHistory({
  patientId,
  doctor,
}: {
  patientId: string;
  doctor: boolean;
}) {
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const tr = (en: string, h: string) => (hi ? h : en);
  const [context, setContext] = useState<Context | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const accessRevision = useRef(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [aiError, setAiError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setSnapshot(null);
    void rpc<Context>("c1_care_context", {
      p_patient: patientId,
      p_offset: historyOffset,
    })
      .then((r) => {
        if (active) setContext(r);
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
  }, [patientId, version, historyOffset]);
  useEffect(() => {
    const clear = () => {
      accessRevision.current++;
      setContext(null);
      setSnapshot(null);
      setVersion((v) => v + 1);
    };
    const hidden = () => {
      if (document.hidden) {
        accessRevision.current++;
        setContext(null);
        setSnapshot(null);
      } else clear();
    };
    window.addEventListener("care-access-changed", clear);
    window.addEventListener("focus", clear);
    document.addEventListener("visibilitychange", hidden);
    const timer = window.setInterval(clear, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("care-access-changed", clear);
      window.removeEventListener("focus", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [patientId]);
  async function generate() {
    if (aiBusy) return;
    const revision = accessRevision.current;
    setAiBusy(true);
    setAiError("");
    setSnapshot(null);
    try {
      const r = await supabase.functions.invoke("role-ai", {
        body: {
          tool: "get_patient_snapshot",
          scope: { patient_id: patientId },
          question,
          language,

        },
      });
      if (r.error) throw r.error;
      if (r.data?.error) throw new Error(r.data.error);
      if (revision === accessRevision.current) setSnapshot(r.data);
    } catch {
      setAiError(
        tr(
          "SwasthyaSnapshot is unavailable. The service may not be configured. Your source records remain available below.",
          "SwasthyaSnapshot अभी उपलब्ध नहीं है। नीचे अपनी दर्ज जानकारी देख सकते हैं।",
        ),
      );
    } finally {
      setAiBusy(false);
    }
  }
  if (busy)
    return (
      <p role="status">
        {tr("Loading care history…", "इलाज की जानकारी आ रही है…")}
      </p>
    );
  if (error)
    return (
      <Card>
        <p role="alert">{error}</p>
        <Button onClick={() => setVersion((v) => v + 1)}>
          {tr("Retry", "फिर कोशिश करें")}
        </Button>
      </Card>
    );
  if (!context) return null;
  const hasMore = [
    context.encounters,
    context.prescriptions,
    context.diagnostics,
    context.health_records,
    context.care_gaps,
    context.events,
    context.follow_ups,
  ].some((rows) => rows.length === 50);
  const pending = context.care_gaps.filter((g) => g.status === "OPEN");
  const labels: Record<string, [string, string]> = {
    LAB_REPORT_REVIEW_PENDING: [
      "Doctor report review pending",
      "डॉक्टर को रिपोर्ट देखनी है",
    ],
    MEDICINE_COLLECTION_PENDING: [
      "Collect prescribed medicines",
      "लिखी हुई दवाइयाँ लेनी हैं",
    ],
    FOLLOW_UP_PENDING: ["Follow-up pending", "दोबारा हाल जानना बाकी है"],
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!historyOffset}
          onClick={() => setHistoryOffset(Math.max(0, historyOffset - 50))}
        >
          {tr("Newer records", "नई जानकारी")}
        </Button>
        <span>
          {tr("History page", "जानकारी का पेज")} {historyOffset / 50 + 1}
        </span>
        <Button
          disabled={!hasMore}
          onClick={() => setHistoryOffset(historyOffset + 50)}
        >
          {tr("Older records", "पुरानी जानकारी")}
        </Button>
      </div>
      {historyOffset > 0 && (
        <p>
          {tr(
            "This page shows older history. Return to page 1 for recent care actions.",
            "यह पुरानी जानकारी है। हाल के काम देखने के लिए पहले पेज पर जाएँ।",
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
          {tr("Refresh", "नई जानकारी देखें")}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            speakText(
              pending.length
                ? pending
                    .map((g) => labels[g.gap_type]?.[hi ? 1 : 0] ?? g.gap_type)
                    .join(". ")
                : tr(
                    "No pending care actions are recorded.",
                    "अभी कोई बाकी काम दर्ज नहीं है।",
                  ),
              language,
            )
          }
        >
          {tr("Listen to next steps", "अब क्या करना है — सुनें")}
        </Button>
      </div>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">
          {tr("Next steps", "अब आपको क्या करना है")}
        </h2>
        {pending.length ? (
          pending.map((g) => (
            <div
              id={`source-${g.id}`}
              key={g.id}
              className="rounded border p-3 space-y-2"
            >
              <p className="font-semibold">
                {labels[g.gap_type]?.[hi ? 1 : 0] ?? g.gap_type}
              </p>
              <Badge>{workflowLabel(g.severity, language)}</Badge>
              {g.due_at && (
                <p>
                  {tr("Due", "तारीख")}:{" "}
                  {new Date(g.due_at).toLocaleDateString()}
                </p>
              )}
              {doctor &&
                g.gap_type === "FOLLOW_UP_PENDING" &&
                !context.follow_ups.some((t) => t.care_gap_id === g.id) && (
                  <AssignWorker
                    gap={g.id}
                    refresh={() => setVersion((v) => v + 1)}
                  />
                )}
            </div>
          ))
        ) : (
          <p>
            {tr(
              "No pending care actions are recorded.",
              "अभी कोई बाकी काम दर्ज नहीं है।",
            )}
          </p>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">SwasthyaSnapshot</h2>
        <p className="text-sm">
          {tr(
            "Create an AI-assisted selection of important source records. It does not diagnose or change treatment.",
            "दर्ज जानकारी से जरूरी बातें चुनकर देखें। यह बीमारी तय नहीं करता और इलाज नहीं बदलता।",
          )}
        </p>
        <label className="block">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">
              {tr(
                "Question about these records (optional)",
                "दर्ज जानकारी के बारे में सवाल (वैकल्पिक)",
              )}
            </span>
            <VoiceInputButton
              currentValue={question}
              onTranscript={setQuestion}
              language={language}
              size="sm"
              disabled={aiBusy}
            />
          </div>
          <textarea
            className="w-full rounded border p-3 text-sm"
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <Button disabled={aiBusy} onClick={() => void generate()}>
          {aiBusy
            ? tr("Preparing…", "तैयार हो रहा है…")
            : tr("Generate snapshot", "जरूरी जानकारी देखें")}
        </Button>
        {aiError && (
          <p role="alert">
            {tr(
              "SwasthyaSnapshot is unavailable. Your source records remain available below.",
              "SwasthyaSnapshot अभी उपलब्ध नहीं है। नीचे अपनी दर्ज जानकारी देख सकते हैं।",
            )}
          </p>
        )}
        {snapshot && (
          <>
            <p className="text-sm font-semibold">
              {tr(
                "Clinical snapshot — verify against the original record",
                "AI ने दर्ज जानकारी से ये बातें चुनी हैं — मूल रिपोर्ट से जाँच लें",
              )}
            </p>
            {snapshot.snapshot_sections && snapshot.snapshot_sections.length > 0 ? (
              <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
                <div className="font-bold text-sm tracking-wide text-foreground">CLINICAL SNAPSHOT</div>
                {snapshot.snapshot_sections.map((sec, idx) => (
                  <div key={idx} className="space-y-1">
                    <h3 className="font-semibold text-foreground uppercase tracking-wide text-[11px] text-muted-foreground">{sec.title}</h3>
                    {sec.items.length > 0 ? (
                      <ul className="space-y-1">
                        {sec.items.map((it, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-1.5 text-foreground">
                            <span className="text-primary font-bold">•</span>
                            <span>{it.display_text || it.text}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground italic">
                        • {sec.title.includes('diagnos') ? tr('No confirmed diagnosis documented.', 'कोई पुष्ट निदान दर्ज नहीं है।') : tr('No records documented.', 'कोई विवरण दर्ज नहीं है।')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : snapshot.answer?.text ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs whitespace-pre-wrap leading-relaxed text-foreground font-sans">
                {snapshot.answer.text}
              </div>
            ) : null}
            {!snapshot.answer?.text && !snapshot.snapshot_sections?.length && snapshot.items.length === 0 && (
              <p>
                {snapshot.outcome === "UNSUPPORTED_REQUEST"
                  ? tr(
                      "This request needs an authorized clinician. No treatment recommendation was generated.",
                      "इस सवाल के लिए डॉक्टर से बात करें। इलाज की कोई सलाह नहीं बनाई गई।",
                    )
                  : tr(
                      "No supporting record was selected from the permitted history.",
                      "अनुमति वाली जानकारी में इस सवाल का आधार नहीं मिला।",
                    )}
              </p>
            )}
            {snapshot.items.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground py-1 select-none">
                  {tr("View source verification links", "मूल साक्ष्य लिंक देखें")} ({snapshot.items.length})
                </summary>
                <div className="space-y-2 pt-2">
                  {snapshot.items.map((s, i) => (
                    <article
                      key={`${s.source_id}-${i}`}
                      className="rounded border bg-card p-3 text-xs"
                    >
                      <p className="whitespace-pre-wrap">{s.display_text || tr("See original record", "मूल रिकॉर्ड देखें")}</p>
                      <a
                        className="text-sm text-primary underline mt-1 inline-block"
                        href={`#source-${s.source_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document
                            .getElementById(`source-${s.source_id}`)
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        {s.kind} · {safeFormatDate(s.date)}
                      </a>
                    </article>
                  ))}
                </div>
              </details>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                speakText(
                  snapshot.answer?.text || "",
                  language,
                )
              }
            >
              {tr("Listen to snapshot", "यह जानकारी सुनें")}
            </Button>
          </>
        )}
      </Card>
      <p className="text-sm text-muted-foreground">
        {tr(
          "Records are paged by date (up to 50 per section). Allergy history: not documented; this does not mean no allergies.",
          "हर पेज पर हर हिस्से की 50 तक प्रविष्टियाँ दिखती हैं। एलर्जी की जानकारी दर्ज नहीं है; इसका मतलब यह नहीं कि एलर्जी नहीं है।",
        )}
      </p>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          {tr("Consultations", "डॉक्टर से मुलाकातें")}
        </h2>
        {context.encounters.length ? (
          context.encounters.map((e) => (
            <article
              id={`source-${e.id}`}
              key={e.id}
              className="space-y-2 border-t py-3"
            >
              <p>
                {new Date(e.started_at).toLocaleDateString()} ·{" "}
                {workflowLabel(e.status, language)}
              </p>
              {e.chief_complaint && <p>{e.chief_complaint}</p>}
              {e.diagnosis && (
                <p>
                  <strong>
                    {tr("Recorded diagnosis", "डॉक्टर ने लिखा")}:{" "}
                  </strong>
                  {e.diagnosis}
                </p>
              )}
              {e.clinical_notes && (
                <p className="whitespace-pre-wrap">{e.clinical_notes}</p>
              )}
            </article>
          ))
        ) : (
          <p>{tr("No consultations recorded.", "कोई मुलाकात दर्ज नहीं है।")}</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          {tr("Prescriptions", "डॉक्टर की पर्ची")}
        </h2>
        {context.prescriptions.length ? (
          context.prescriptions.map((p) => (
            <article
              id={`source-${p.id}`}
              key={p.id}
              className="space-y-2 border-t py-3"
            >
              <p>
                {new Date(p.issued_at).toLocaleDateString()} ·{" "}
                {workflowLabel(p.status, language)} ·{" "}
                {tr("Medicine collection", "दवाइयाँ मिलना")}:{" "}
                {p.fulfilment?.status ??
                  tr("Not sent to pharmacy", "दुकान को नहीं भेजी गई")}
              </p>
              {(p.items ?? []).map((i) => (
                <p key={i.id}>
                  {i.medicine_name} {i.strength} — {i.dose} · {i.frequency} ·{" "}
                  {i.duration} {i.instructions}
                </p>
              ))}
            </article>
          ))
        ) : (
          <p>{tr("No prescriptions recorded.", "कोई पर्ची दर्ज नहीं है।")}</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          {tr("Investigations", "जाँच की जानकारी")}
        </h2>
        {context.diagnostics.length ? (
          context.diagnostics.map((d) => (
            <article
              id={`source-${d.id}`}
              key={d.id}
              className="space-y-2 border-t py-3"
            >
              <p className="font-semibold">{d.test_name}</p>
              <p>
                {new Date(d.ordered_at).toLocaleDateString()} · {d.status}
              </p>
              {d.result && (
                <div id={`source-${d.result.id}`}>
                  {observationsOf(d.result).map((o, i) => (
                    <p key={i}>
                      {o.parameter_name}: {o.raw_value} {o.unit} · {o.flag}
                    </p>
                  ))}
                  <p>
                    {d.result.doctor_reviewed_at
                      ? tr("Doctor reviewed", "डॉक्टर ने देख लिया है")
                      : tr("Doctor review pending", "डॉक्टर को देखना बाकी है")}
                  </p>
                </div>
              )}
            </article>
          ))
        ) : (
          <p>{tr("No tests recorded.", "कोई जाँच दर्ज नहीं है।")}</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          {tr("Medical records", "मेरी मेडिकल रिपोर्ट")}
        </h2>
        {context.health_records.length ? (
          context.health_records.map((r) => (
            <p id={`source-${r.id}`} key={r.id}>
              {r.original_filename} · {r.record_date} · {r.verification_status}
            </p>
          ))
        ) : (
          <p>
            {tr("No uploaded records.", "कोई रिपोर्ट अपलोड नहीं की गई है।")}
          </p>
        )}
      </Card>
      {context.follow_ups.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">
            {tr("Follow-ups", "दोबारा हाल जानना")}
          </h2>
          {context.follow_ups.map((t) => (
            <article
              id={`source-${t.id}`}
              key={t.id}
              className="space-y-2 border-t py-3"
            >
              <Badge>{workflowLabel(t.status, language)}</Badge>
              {t.outcome && <p>{t.outcome}</p>}
              {doctor && t.status === "AWAITING_VERIFICATION" && (
                <Button
                  onClick={async () => {
                    try {
                      await rpc("c1_verify_followup", { p_task: t.id });
                      setVersion((v) => v + 1);
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  I verified this outcome — close follow-up
                </Button>
              )}
            </article>
          ))}
        </Card>
      )}
      <Card>
        <h2 className="mb-3 text-lg font-semibold">
          {tr("Care timeline", "इलाज का सफर")}
        </h2>
        {context.events.length ? (
          <ol className="space-y-3">
            {context.events.map((e) => (
              <li
                id={`source-${e.id}`}
                key={e.id}
                className="border-l-2 border-primary pl-3"
              >
                <p className="text-sm">
                  {new Date(e.created_at).toLocaleString()}
                </p>
                <p>{eventLabel(e.event_type, hi)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p>{tr("No care events recorded.", "अभी कोई काम दर्ज नहीं है।")}</p>
        )}
      </Card>
    </div>
  );
}
function AssignWorker({ gap, refresh }: { gap: string; refresh: () => void }) {
  const [worker, setWorker] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <ProviderPicker
        type="WORKER"
        contextId={gap}
        value={worker}
        onChange={setWorker}
        label="Find approved worker"
      />
      <Button
        disabled={!worker || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await rpc("c1_assign_followup", { p_gap: gap, p_worker: worker });
            refresh();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Assign follow-up
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function eventLabel(type: string, hi: boolean) {
  const names: Record<string, [string, string]> = {
    CONSULTATION_COMPLETED: [
      "Consultation completed",
      "डॉक्टर से मुलाकात पूरी हुई",
    ],
    PRESCRIPTION_ISSUED: ["Prescription issued", "डॉक्टर की पर्ची बनी"],
    PRESCRIPTION_ROUTED: [
      "Prescription sent to pharmacy",
      "पर्ची दवा की दुकान को भेजी गई",
    ],
    MEDICINE_DISPENSED: ["Medicines dispensed", "दवाइयाँ दी गईं"],
    LAB_ORDERED: ["Test ordered", "जाँच लिखी गई"],
    LAB_REPORT_COMPLETED: ["Report published", "जाँच की रिपोर्ट तैयार हुई"],
    LAB_REPORT_REVIEWED: ["Doctor reviewed report", "डॉक्टर ने रिपोर्ट देखी"],
    LAB_RESULTS_VERIFIED: ["Lab verified results", "लैब ने नतीजे जाँचे"],
    DIAGNOSTIC_DESTINATION_SELECTED: [
      "Collection location selected",
      "नमूना देने की जगह चुनी गई",
    ],
    FOLLOW_UP_ASSIGNED: [
      "Worker assigned for follow-up",
      "हाल जानने के लिए कार्यकर्ता तय हुआ",
    ],
    FOLLOW_UP_CONTACTED: [
      "Follow-up contact recorded",
      "हाल जानने के लिए संपर्क किया गया",
    ],
    FOLLOW_UP_VISITED: ["Follow-up visit recorded", "कार्यकर्ता मिलने आया"],
    FOLLOW_UP_ESCALATED: [
      "Follow-up needs doctor attention",
      "डॉक्टर को ध्यान देना है",
    ],
    FOLLOW_UP_AWAITING_VERIFICATION: [
      "Follow-up outcome awaiting verification",
      "दोबारा संपर्क का नतीजा डॉक्टर को जाँचना है",
    ],
    FOLLOW_UP_VERIFIED: [
      "Follow-up completion verified",
      "डॉक्टर ने दोबारा संपर्क का काम पूरा माना",
    ],
  };
  return names[type]?.[hi ? 1 : 0] ?? type.replaceAll("_", " ");
}
