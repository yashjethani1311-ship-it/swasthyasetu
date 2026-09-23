import {speakText} from '@/lib/voice'
import { useEffect, useState } from "react";
import { Button, Card } from "./kit";
import { supabase } from "@/lib/supabase";
import { rpc, errorText } from "@/lib/diagnostics/service";
import { useCareLanguage } from "@/lib/care-language";
const categories = [
  "ENCOUNTERS",
  "PRESCRIPTIONS",
  "DIAGNOSTICS",
  "DOCUMENTS",
  "TIMELINE",
  "FOLLOW_UPS",
] as const;
const names: Record<string, [string, string]> = {
  ENCOUNTERS: ["Consultations", "डॉक्टर से मुलाकातें"],
  PRESCRIPTIONS: ["Prescriptions", "डॉक्टर की पर्चियाँ"],
  DIAGNOSTICS: ["Tests and reports", "जाँच और रिपोर्ट"],
  DOCUMENTS: ["Uploaded records", "अपलोड की गई रिपोर्ट"],
  TIMELINE: ["Care events and pending actions", "इलाज के काम और बाकी काम"],
  FOLLOW_UPS: ["Follow-up outcomes", "दोबारा संपर्क के नतीजे"],
};
export function ConsentPanel({
  patientId,
  doctor,
}: {
  patientId: string;
  doctor: boolean;
}) {
  const { tr, language } = useCareLanguage();
  const [rows, setRows] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [purpose, setPurpose] = useState("TREATMENT");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState("7");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const r = await supabase
          .from("patient_consents")
          .select(
            "*,requester:provider_profiles!requester_provider_id(full_name)",
          )
          .eq("patient_id", patientId)
          .order("requested_at", { ascending: false })
          .limit(50);
        if (r.error) throw r.error;
        const a = doctor
          ? []
          : await rpc<any[]>("a1_access_history", {
              p_patient: patientId,
              p_offset: 0,
            });
        if (active) {
          setRows(r.data ?? []);
          setAudit(a);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId, version]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setVersion((v) => v + 1);
      window.dispatchEvent(new Event("care-access-changed"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">
        {tr("Consent & access", "जानकारी साझा करने की अनुमति")}
      </h2>
      <p className="text-sm">
        {tr(
          "Sharing older records is optional. Your current care can continue without granting access to your full history. AI use requires a separate purpose.",
          "पुरानी जानकारी साझा करना आपकी इच्छा है। पूरी जानकारी साझा किए बिना भी मौजूदा इलाज चल सकता है। AI के लिए अलग अनुमति चाहिए।",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="outline"
        disabled={loading || busy}
        onClick={() => setVersion((v) => v + 1)}
      >
        {tr("Refresh access", "अनुमति की जानकारी देखें")}
      </Button>
      {doctor && (
        <details>
          <summary>{tr("Request access", "अनुमति माँगें")}</summary>
          <div className="mt-3 space-y-3">
            <label className="block">
              {tr("Purpose", "मकसद")}
              <select
                className="w-full rounded border p-2"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="TREATMENT">
                  {tr(
                    "Review history for treatment",
                    "इलाज के लिए पुरानी जानकारी देखना",
                  )}
                </option>
                <option value="AI_ASSISTANCE">
                  {tr(
                    "AI-assisted history explanation",
                    "AI की मदद से जानकारी समझना",
                  )}
                </option>
              </select>
            </label>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend>{tr("Record categories", "कौन सी जानकारी")}</legend>
              {categories.map((c) => (
                <label key={c} className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(c)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked ? [...v, c] : v.filter((x) => x !== c),
                      )
                    }
                  />
                  {names[c][language === "Hindi" ? 1 : 0]}
                </label>
              ))}
            </fieldset>
            <label className="block">
              {tr("Why is this needed?", "यह जानकारी क्यों चाहिए?")}
              <textarea
                className="w-full rounded border p-2"
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="block">
              {tr("Access duration in days", "कितने दिन के लिए")}
              <input
                className="w-full rounded border p-2"
                type="number"
                min="1"
                max="365"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {tr("Records from (optional)", "इस तारीख से (वैकल्पिक)")}
                <input
                  className="w-full border p-2"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                {tr("Records until (optional)", "इस तारीख तक (वैकल्पिक)")}
                <input
                  className="w-full border p-2"
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
            </div>
            <Button
              disabled={
                busy ||
                !selected.length ||
                reason.trim().length < 3 ||
                !Number.isInteger(Number(days)) ||
                Number(days) < 1 ||
                Number(days) > 365
              }
              onClick={() =>
                void act(() =>
                  rpc("a1_request_consent", {
                    p_patient: patientId,
                    p_purpose: purpose,
                    p_categories: selected,
                    p_reason: reason,
                    p_valid_from: new Date().toISOString(),
                    p_expires: new Date(
                      Date.now() + Number(days) * 86400000,
                    ).toISOString(),
                    p_records_from: from ? `${from}T00:00:00Z` : null,
                    p_records_until: until ? `${until}T23:59:59.999Z` : null,
                  }),
                )
              }
            >
              {tr("Send request", "अनुरोध भेजें")}
            </Button>
          </div>
        </details>
      )}
      {loading ? (
        <p role="status">
          {tr("Loading access requests…", "अनुरोध आ रहे हैं…")}
        </p>
      ) : !error && !rows.length ? (
        <p>{tr("No access requests.", "कोई अनुरोध नहीं है।")}</p>
      ) : (
        rows.map((r) => {
          const expired = ["REQUESTED","GRANTED"].includes(r.status) && new Date(r.expires_at).getTime() <= Date.now();
          return (
            <article key={r.id} className="space-y-2 border-t pt-3">
              <h3 className="font-semibold">
                {r.requester?.full_name ??
                  tr("Requesting clinician", "अनुमति माँगने वाले डॉक्टर")}
              </h3>
              <p>{r.reason}</p><Button variant="ghost" onClick={()=>speakText([r.requester?.full_name,r.reason,r.categories.map((c:string)=>names[c]?.[language==='Hindi'?1:0]??c).join(', '),tr('Valid until','अनुमति की अंतिम तारीख'),new Date(r.expires_at).toLocaleString()].join('. '),language)}>{tr('Listen to this request','यह अनुरोध सुनें')}</Button>
              <p>
                {r.purpose === "AI_ASSISTANCE"
                  ? tr("AI assistance", "AI की मदद")
                  : tr("Treatment history review", "इलाज के लिए जानकारी")}{" "}
                · {expired ? tr("Expired", "अवधि पूरी हुई") : ({REQUESTED:tr("Awaiting your decision","आपका फैसला बाकी है"),GRANTED:tr("Granted","अनुमति दी गई"),DENIED:tr("Denied","मना किया गया"),REVOKED:tr("Revoked","अनुमति वापस ली गई")}[r.status as string]??r.status)}
              </p>
              <p>
                {r.categories
                  .map(
                    (c: string) =>
                      names[c]?.[language === "Hindi" ? 1 : 0] ?? c,
                  )
                  .join(", ")}
              </p>
              <p className="text-sm">
                {new Date(r.valid_from).toLocaleString()} —{" "}
                {new Date(r.expires_at).toLocaleString()}
              </p>
              <p className="text-sm">
                {tr("Record dates", "जानकारी की तारीखें")}:{" "}
                {r.records_from ?? tr("Any start date", "शुरू की कोई भी तारीख")}{" "}
                — {r.records_until ?? tr("Any end date", "अंत की कोई भी तारीख")}
              </p>
              {!doctor && !expired && (
                <div className="flex flex-wrap gap-2">
                  {(r.status === "REQUESTED"
                    ? ["GRANTED", "DENIED"]
                    : r.status === "GRANTED"
                      ? ["REVOKED"]
                      : []
                  ).map((d) => (
                    <Button
                      key={d}
                      disabled={busy}
                      variant={d === "GRANTED" ? "primary" : "outline"}
                      onClick={() =>
                        void act(() =>
                          rpc("a1_decide_consent", {
                            p_consent: r.id,
                            p_decision: d,
                          }),
                        )
                      }
                    >
                      {d === "GRANTED"
                        ? tr("Grant this scope", "इतनी जानकारी की अनुमति दें")
                        : d === "DENIED"
                          ? tr("Deny", "मना करें")
                          : tr("Revoke access", "अनुमति वापस लें")}
                    </Button>
                  ))}
                </div>
              )}
            </article>
          );
        })
      )}
      <details>
        <summary>
          {tr("Recent access activity", "हाल में जानकारी का इस्तेमाल")}
        </summary>
        {audit.map((a) => (
          <p key={a.id} className="border-t py-2 text-sm">
            {new Date(a.created_at).toLocaleString()} · {a.actor_name} ·{" "}
            {a.action.replaceAll("_", " ")} · {a.purpose}
          </p>
        ))}
      </details>
    </Card>
  );
}
