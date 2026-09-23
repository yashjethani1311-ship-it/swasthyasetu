import { TestCatalogPicker } from "@/components/TestCatalogPicker";
import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/kit";
import { DestinationPicker } from "@/components/DestinationPicker";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { speakText } from "@/lib/voice";
import { supabase } from "@/lib/supabase";
import {
  downloadReport,
  errorText,
  nextAction,
  observationsOf,
  reportLink,
  resultOf,
  rpc,
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
                    {doctor && !result.doctor_reviewed_at && (
                      <Button
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
                        {tr("Review Report", "रिपोर्ट देख ली है")}
                      </Button>
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
    </div>
  );
}
