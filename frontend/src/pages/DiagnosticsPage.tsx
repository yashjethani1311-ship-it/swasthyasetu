import { TestCatalogPicker } from "@/components/TestCatalogPicker";
import { useEffect, useState } from "react";
import { Volume2, AlertTriangle, ClipboardCheck, Printer, Siren } from "lucide-react";
import { Badge, Button, Card } from "@/components/kit";
import { PrintableDiagnosticReport } from "@/components/clinical/PrintableDiagnosticReport";
import { DestinationPicker } from "@/components/DestinationPicker";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { speakText } from "@/lib/voice";
import { supabase } from "@/lib/supabase";
import {
  abnormalOf,
  awaitingDoctorReview,
  criticalTransition,
  criticalWorklist,
  downloadReport,
  errorText,
  nextAction,
  observationsOf,
  reportLink,
  resultOf,
  rpc,
  type CriticalResult,
  type Order,
  type Result,
} from "@/lib/diagnostics/service";
export function DiagnosticsPage() {
  const { profile } = useAuth();
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const doctor = profile?.role === "DOCTOR";
  const tr = (en: string, h: string) => (hi ? h : en);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [legacyTests, setLegacyTests] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [selectedPrintReport, setSelectedPrintReport] = useState<{
    order: Order;
    result: Result;
  } | null>(null);
  // Real critical-result worklist (017). Distinct from ordinary report review:
  // these rows come from `critical_results` via r2_worklist, and only
  // r2_transition advances them. Absent/unavailable RPC => truthful fallback.
  const [critical, setCritical] = useState<CriticalResult[]>([]);
  const [criticalError, setCriticalError] = useState("");
  const [criticalLoading, setCriticalLoading] = useState(false);
  const [criticalBusy, setCriticalBusy] = useState<string | null>(null);
  const [criticalVersion, setCriticalVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setOrders([]);
    setError("");
    void (async () => {
      try {
        const table = doctor ? "provider_profiles" : "patient_profiles";
        const { data: owner, error: e } = await supabase
          .from(table)
          .select("id")
          .eq("user_id", profile?.id ?? "")
          .single();
        if (e) throw e;
        const { data, error: queryError } = await supabase
          .from("lab_orders")
          .select(
            `id,patient_id,test_name,diagnostic_test_id,clinical_note,status,ordered_at,lab_provider_id,collection_centre_id,routing_status,
   doctor:provider_profiles!lab_orders_doctor_provider_id_fkey(full_name),lab:provider_profiles!lab_orders_lab_provider_id_fkey(full_name,organization_name),centre:collection_centres(centre_name),
   lab_results(id,result_json,report_storage_path,status,created_at,verified_at,doctor_reviewed_at,doctor_reviewed_by),lab_specimens(id,sample_code,status,created_at,rejection_reason,sample_custody_events(id,event_type,occurred_at,notes))`,
          )
          .eq(doctor ? "doctor_provider_id" : "patient_id", owner.id)
          .order("ordered_at", { ascending: false })
          .order("id")
          .range(offset, offset + 19);
        if (queryError) throw queryError;
        if (active) setOrders((data ?? []) as unknown as Order[]);
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, doctor, offset, version]);
  useEffect(() => {
    if (!doctor) return;
    let active = true;
    setCriticalLoading(true);
    setCriticalError("");
    void criticalWorklist(0)
      .then((rows) => {
        if (active) setCritical(rows);
      })
      .catch((e) => {
        // r2_worklist may be unavailable in this deployment; keep a truthful
        // fallback rather than inventing critical results.
        if (active) {
          setCritical([]);
          setCriticalError(errorText(e));
        }
      })
      .finally(() => {
        if (active) setCriticalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doctor, criticalVersion]);
  async function criticalAct(id: string, action: string, note?: string) {
    setCriticalBusy(id);
    setCriticalError("");
    try {
      await criticalTransition(id, action, note);
      setCriticalVersion((v) => v + 1);
    } catch (e) {
      setCriticalError(errorText(e));
    } finally {
      setCriticalBusy(null);
    }
  }
  async function act(id: string, fn: () => Promise<void>, reload = false) {
    setBusy(id);
    setError("");
    try {
      await fn();
      if (reload) setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }
  async function view(r: Result) {
    const url = await reportLink(r);
    setLink({ id: r.id, url });
  }
  const events: Record<string, string> = {
    COLLECTED: "नमूना लिया गया",
    PACKED: "नमूना पैक किया गया",
    DISPATCHED: "नमूना भेज दिया गया",
    RECEIVED: "नमूना लैब पहुँचा",
    ACCEPTED: "नमूना स्वीकार हुआ",
    REJECTED: "नमूना स्वीकार नहीं हुआ",
    PROCESSING_STARTED: "जाँच शुरू हुई",
    PROCESSING_COMPLETED: "जाँच पूरी हुई",
  };
  const pendingReview = doctor
    ? orders.filter((o) => awaitingDoctorReview(o))
    : [];
  const abnormalPending = pendingReview.filter((o) => {
    const r = resultOf(o);
    return r ? abnormalOf(r).length > 0 : false;
  });
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {doctor
              ? tr("Diagnostic report review", "जाँच की रिपोर्ट देखें")
              : tr("Diagnostics", "जाँच / टेस्ट")}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {tr(
              "Follow each test from sample collection to doctor review.",
              "नमूना देने से लेकर डॉक्टर की समीक्षा तक की जानकारी।",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            speakText(
              orders
                .map((o) => `${o.test_name}. ${nextAction(o, hi)}`)
                .join(" "),
              language,
            )
          }
          disabled={!orders.length}
        >
          <Volume2 className="size-4" />
          {tr("Listen", "सुनें")}
        </Button>
      </header>
      {doctor && !loading && (
        <Card className="space-y-3 border-border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" />
              <h2 className="font-semibold">
                {tr("Reports awaiting your review", "आपकी समीक्षा के लिए लंबित रिपोर्ट")}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{pendingReview.length}</Badge>
              {abnormalPending.length > 0 && (
                <Badge tone="warning">
                  <AlertTriangle className="size-3 mr-1" />
                  {abnormalPending.length}{" "}
                  {tr("with abnormal values", "असामान्य मानों वाली")}
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr(
              "Counts reflect the orders currently loaded on this page. Marking a report reviewed records ordinary doctor review (p0_review_report) and closes the linked review gap. An abnormal value is not by itself a critical result — laboratory-raised critical results are worked separately below.",
              "यह गिनती इस पेज पर लोड किए गए आदेशों की है। रिपोर्ट को 'देख लिया' चिह्नित करना सामान्य डॉक्टर समीक्षा (p0_review_report) दर्ज करता है और जुड़ा हुआ समीक्षा-गैप बंद करता है। केवल असामान्य मान अपने आप में गंभीर नतीजा नहीं है — लैब द्वारा बढ़ाए गए गंभीर नतीजे नीचे अलग से देखे जाते हैं।",
            )}
          </p>
          {pendingReview.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {tr(
                "No published reports are awaiting your review in the loaded set.",
                "लोड किए गए सेट में आपकी समीक्षा के लिए कोई प्रकाशित रिपोर्ट लंबित नहीं है।",
              )}
            </p>
          )}
        </Card>
      )}
      {doctor && (
        <Card className="space-y-3 border-destructive/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Siren className="size-4 text-destructive" />
              <h2 className="font-semibold">
                {tr("Critical result worklist", "गंभीर नतीजा कार्यसूची")}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="danger">{critical.length}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={criticalLoading}
                onClick={() => setCriticalVersion((v) => v + 1)}
              >
                {tr("Refresh", "नई जानकारी")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr(
              "These are critical results the laboratory explicitly raised (critical_results), not merely abnormal observations. Advancing them uses the real critical-result lifecycle (r2_transition); ordinary report review is separate.",
              "ये वे गंभीर नतीजे हैं जिन्हें लैब ने स्पष्ट रूप से बढ़ाया है (critical_results), केवल असामान्य अवलोकन नहीं। इन्हें आगे बढ़ाना वास्तविक गंभीर-नतीजा जीवनचक्र (r2_transition) उपयोग करता है; सामान्य रिपोर्ट समीक्षा अलग है।",
            )}
          </p>
          {criticalError && (
            <p className="text-xs text-muted-foreground">
              {tr(
                "Critical-result worklist is unavailable in this deployment. No critical results are invented. Server said: ",
                "इस परिनियोजन में गंभीर-नतीजा कार्यसूची उपलब्ध नहीं है। कोई गंभीर नतीजा कल्पित नहीं किया गया। सर्वर ने कहा: ",
              )}
              <span className="text-destructive">{criticalError}</span>
            </p>
          )}
          {criticalLoading && (
            <p role="status" className="text-xs text-muted-foreground">
              {tr("Loading critical results…", "गंभीर नतीजे आ रहे हैं…")}
            </p>
          )}
          {!criticalLoading && !criticalError && critical.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              {tr(
                "No open critical results for your patients.",
                "आपके मरीजों के लिए कोई खुला गंभीर नतीजा नहीं।",
              )}
            </p>
          )}
          {critical.map((c) => (
            <div
              key={c.id}
              className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.test_name || tr("Critical result", "गंभीर नतीजा")}
                    {c.parameter_name ? ` · ${c.parameter_name}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[c.patient_name, c.patient_code]
                      .filter(Boolean)
                      .join(" · ") || tr("Patient", "मरीज")}
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
                <Button
                  size="sm"
                  disabled={criticalBusy === c.id}
                  onClick={() => void criticalAct(c.id, "ACKNOWLEDGE")}
                >
                  {tr("Acknowledge", "स्वीकार करें")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={criticalBusy === c.id}
                  onClick={() => void criticalAct(c.id, "CLOSE")}
                >
                  {tr("Close", "बंद करें")}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {error && (
        <Card>
          <p role="alert" className="text-destructive">
            {error}
          </p>
          <Button onClick={() => setVersion((v) => v + 1)}>
            {tr("Retry", "फिर कोशिश करें")}
          </Button>
        </Card>
      )}
      {loading ? (
        <p role="status">
          {tr("Loading orders…", "जाँच की जानकारी आ रही है…")}
        </p>
      ) : !orders.length && !error ? (
        <Card>
          {tr("No diagnostic orders yet.", "अभी कोई जाँच नहीं लिखी गई है।")}
        </Card>
      ) : (
        orders.map((order) => {
          const result = resultOf(order);
          const published =
            result?.status === "COMPLETED" && result.verified_at;
          const obs = published ? observationsOf(result) : [];
          const abn = published && result ? abnormalOf(result) : [];
          const needsAck = doctor && published && !!result && !result.doctor_reviewed_at;
          return (
            <Card key={order.id} className="space-y-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{order.test_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {order.doctor?.full_name} ·{" "}
                    {new Date(order.ordered_at).toLocaleString(
                      hi ? "hi-IN" : "en-IN",
                    )}
                  </p>
                </div>
                <Badge>
                  {published
                    ? tr("Report ready", "रिपोर्ट तैयार")
                    : tr("Test journey", "जाँच की स्थिति")}
                </Badge>
              </div>
              <div className="rounded-lg bg-accent p-4">
                <h3 className="font-semibold">
                  {tr("Next step", "अब आपको क्या करना है")}
                </h3>
                <p className="mt-1">{nextAction(order, hi)}</p>
              </div>
              {doctor &&
                !order.diagnostic_test_id &&
                order.status === "ORDERED" &&
                !order.lab_specimens?.length &&
                !result && (
                  <section className="space-y-2">
                    <p>
                      {tr(
                        "This legacy order needs a catalog definition. Select the exact ordered test.",
                        "इस पुराने आदेश को सही जाँच से जोड़ें।",
                      )}
                    </p>
                    <TestCatalogPicker
                      value={legacyTests[order.id] ?? ""}
                      onChange={(v) =>
                        setLegacyTests((p) => ({ ...p, [order.id]: v }))
                      }
                    />
                    <Button
                      disabled={!legacyTests[order.id] || busy === order.id}
                      onClick={() =>
                        void act(
                          order.id,
                          async () => {
                            await rpc("p0_link_order_test", {
                              p_order: order.id,
                              p_test: legacyTests[order.id],
                            });
                          },
                          true,
                        )
                      }
                    >
                      {tr("Confirm catalog test", "सही जाँच से जोड़ें")}
                    </Button>
                  </section>
                )}
              {order.clinical_note && (
                <p className="whitespace-pre-wrap text-sm">
                  <strong>{tr("Doctor’s note", "डॉक्टर की लिखी बात")}: </strong>
                  {order.clinical_note}
                </p>
              )}
              {(order.centre || order.lab) && (
                <p>
                  {tr("Selected location", "चुनी हुई जगह")}:{" "}
                  {order.centre?.centre_name ??
                    order.lab?.organization_name ??
                    order.lab?.full_name}
                </p>
              )}
              {!doctor &&
                !order.collection_centre_id &&
                !order.lab_provider_id &&
                order.diagnostic_test_id &&
                order.status === "ORDERED" && (
                  <DestinationPicker
                    testId={order.diagnostic_test_id}
                    onSelect={async (item) => {
                      await rpc("p0_select_destination", {
                        p_order: order.id,
                        p_kind: item.kind,
                        p_destination: item.destination_id,
                      });
                      setVersion((v) => v + 1);
                    }}
                  />
                )}
              {(order.lab_specimens ?? []).map((s) => (
                <section key={s.id} className="rounded-lg border p-3">
                  <p className="break-all font-semibold">
                    {tr("Sample ID", "नमूने का नंबर")}: {s.sample_code}
                  </p>
                  {s.rejection_reason && (
                    <p className="text-destructive">{s.rejection_reason}</p>
                  )}
                  <ol className="mt-3 space-y-2">
                    {[...(s.sample_custody_events ?? [])]
                      .sort((a, b) =>
                        a.occurred_at.localeCompare(b.occurred_at),
                      )
                      .map((e) => (
                        <li key={e.id} className="text-sm">
                          {hi
                            ? (events[e.event_type] ?? e.event_type)
                            : e.event_type.replaceAll("_", " ")}{" "}
                          ·{" "}
                          {new Date(e.occurred_at).toLocaleString(
                            hi ? "hi-IN" : "en-IN",
                          )}
                          {e.notes && <p>{e.notes}</p>}
                        </li>
                      ))}
                  </ol>
                </section>
              ))}
              {published && result && (
                <section className="space-y-3">
                  <h3 className="font-semibold">
                    {tr("Verified report", "लैब से जाँची हुई रिपोर्ट")}
                  </h3>
                  {abn.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                      <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
                      <div>
                        <p className="font-semibold text-destructive">
                          {tr(
                            `${abn.length} value${abn.length !== 1 ? "s" : ""} outside the configured reference range`,
                            `${abn.length} मान संदर्भ सीमा से बाहर`,
                          )}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {abn.map((o, i) => (
                            <li key={`${o.parameter_code}-${i}`}>
                              <span className="font-medium text-foreground">{o.parameter_name}</span>{" "}
                              <span className="font-tabular">{o.raw_value}{o.unit ? ` ${o.unit}` : ""}</span>{" "}
                              <span className="font-semibold text-destructive">[{o.flag}]</span>{" "}
                              {o.reference_range && <span>({o.reference_range})</span>}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {tr(
                            "Flags come from the laboratory’s verified observations. SwasthyaSetu does not interpret results or assign a diagnosis.",
                            "ये निशान लैब के सत्यापित अवलोकन से आते हैं। स्वास्थसेतु नतीजों की व्याख्या या निदान नहीं करता।",
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-sm">
                    {tr("Verified at", "लैब में जाँची गई")}:{" "}
                    {new Date(result.verified_at!).toLocaleString()} ·{" "}
                    {tr("Source", "जानकारी का स्रोत")}:{" "}
                    {result.result_json?.source ??
                      tr("Not recorded", "दर्ज नहीं")}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            tr("Parameter", "जाँच"),
                            tr("Result", "नतीजा"),
                            tr("Reference range", "तुलना की सीमा"),
                            tr("Flag", "निशान"),
                          ].map((h) => (
                            <th className="p-2" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {obs.map((o, i) => (
                          <tr
                            className="border-t"
                            key={`${o.parameter_code}-${i}`}
                          >
                            <td className="p-2">{o.parameter_name}</td>
                            <td className="p-2">
                              {o.raw_value} {o.unit}
                            </td>
                            <td className="p-2">
                              {o.reference_range ??
                                tr(
                                  "Reference range not configured",
                                  "तुलना की सीमा दर्ज नहीं है",
                                )}
                            </td>
                            <td className="p-2">{o.flag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy === result.id}
                      onClick={() => void act(result.id, () => view(result))}
                    >
                      {tr("View report", "रिपोर्ट देखें")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy === result.id}
                      onClick={() =>
                        void act(result.id, () => downloadReport(result))
                      }
                    >
                      {tr("Download PDF", "PDF डाउनलोड करें")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPrintReport({ order, result })}
                    >
                      <Printer className="size-4 mr-1 inline" />
                      {tr("Print A4 Report", "A4 रिपोर्ट प्रिंट करें")}
                    </Button>
                    {needsAck && result && (
                      <Button
                        variant="outline"
                        disabled={busy === result.id}
                        onClick={() =>
                          void act(
                            result.id,
                            async () => {
                              await rpc("p0_review_report", {
                                p_result: result.id,
                              });
                            },
                            true,
                          )
                        }
                      >
                        {tr("Mark reviewed", "रिपोर्ट देख ली है")}
                      </Button>
                    )}
                    {needsAck && abn.length > 0 && (
                      <span className="self-center text-[11px] text-muted-foreground">
                        {tr(
                          "Abnormal values are highlighted above. Marking reviewed records ordinary doctor review; it is not a critical-result acknowledgement.",
                          "असामान्य मान ऊपर दर्शाए गए हैं। 'देख लिया' चिह्नित करना सामान्य डॉक्टर समीक्षा दर्ज करता है; यह गंभीर-नतीजा स्वीकृति नहीं है।",
                        )}
                      </span>
                    )}
                  </div>
                  {link?.id === result.id && (
                    <a
                      className="text-primary underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={link.url}
                    >
                      {tr(
                        "Open secure report (link expires in 60 seconds)",
                        "रिपोर्ट खोलें (लिंक 60 सेकंड में बंद हो जाएगा)",
                      )}
                    </a>
                  )}
                  {result.doctor_reviewed_at && (
                    <p>
                      {tr("Doctor reviewed at", "डॉक्टर ने रिपोर्ट देखी")}:{" "}
                      {new Date(result.doctor_reviewed_at).toLocaleString()}
                    </p>
                  )}
                </section>
              )}
            </Card>
          );
        })
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {tr("Previous", "पिछले")}
        </Button>
        <Button
          variant="outline"
          disabled={loading || orders.length < 20}
          onClick={() => setOffset(offset + 20)}
        >
          {tr("Next", "अगले")}
        </Button>
      </div>

      {selectedPrintReport && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs p-4 flex justify-center items-start">
          <div className="relative w-full max-w-4xl my-8">
            <PrintableDiagnosticReport
              report={{
                id: selectedPrintReport.result.id,
                test_name: selectedPrintReport.order.test_name,
                category: "PATHOLOGY",
                status: selectedPrintReport.result.status,
                ordered_at: selectedPrintReport.order.ordered_at,
                verified_at: selectedPrintReport.result.verified_at,
                doctor_reviewed_at: selectedPrintReport.result.doctor_reviewed_at,
                ordering_doctor: selectedPrintReport.order.doctor ? {
                  name: selectedPrintReport.order.doctor.full_name
                } : undefined,
                facility: {
                  name: selectedPrintReport.order.lab?.organization_name ||
                    selectedPrintReport.order.lab?.full_name ||
                    selectedPrintReport.order.centre?.centre_name ||
                    "Diagnostic Service"
                },
                specimen: selectedPrintReport.order.lab_specimens?.[0] ? {
                  code: selectedPrintReport.order.lab_specimens[0].sample_code,
                  type: "Specimen",
                  collected_at: selectedPrintReport.order.lab_specimens[0].created_at
                } : undefined,
                observations: observationsOf(selectedPrintReport.result).map((o) => ({
                  parameter_name: o.parameter_name,
                  parameter_code: o.parameter_code,
                  observed_value: o.raw_value,
                  unit: o.unit,
                  reference_interval: o.reference_range ?? undefined,
                  flag: o.flag as any
                })),
                pathologist_verification: {
                  name: selectedPrintReport.order.lab?.full_name || "Authorized Pathologist"
                }
              }}
              patient={{
                id: selectedPrintReport.order.patient_id,
                full_name: "Patient"
              }}
              onClose={() => setSelectedPrintReport(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
