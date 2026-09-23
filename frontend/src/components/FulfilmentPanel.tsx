import { useEffect, useState } from "react";
import { Button } from "@/components/kit";
import { ProviderPicker } from "@/components/ProviderPicker";
import { supabase } from "@/lib/supabase";
import { errorText, rpc } from "@/lib/diagnostics/service";
import { useLanguage } from "@/lib/i18n";
export function FulfilmentPanel({
  prescriptionId,
  active,
}: {
  prescriptionId: string;
  active: boolean;
}) {
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const [pharmacy, setPharmacy] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      const r = await supabase
        .from("prescription_fulfilments")
        .select("status")
        .eq("prescription_id", prescriptionId)
        .maybeSingle();
      if (alive) {
        setLoading(false);
        if (r.error) setError(errorText(r.error));
        else setState(r.data?.status ?? null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [prescriptionId, version]);
  async function choose() {
    setBusy(true);
    setError("");
    try {
      await rpc("c1_choose_pharmacy", {
        p_rx: prescriptionId,
        p_pharmacy: pharmacy,
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">
        {hi ? "दवाइयाँ लेना" : "Medicine collection"}
      </h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">{hi ? "जानकारी आ रही है…" : "Loading fulfilment…"}</p>
      ) : error ? (
        <Button onClick={() => setVersion((v) => v + 1)}>
          {hi ? "फिर कोशिश करें" : "Retry"}
        </Button>
      ) : state ? (
        <p>
          {state === "DISPENSED"
            ? hi
              ? "लिखी हुई पूरी मात्रा दे दी गई है। दवा डॉक्टर के बताए तरीके से लें।"
              : "All prescribed units have been dispensed. Follow the doctor’s instructions."
            : state === "PARTIAL"
              ? hi
                ? "कुछ दवाइयाँ दे दी गई हैं। बाकी के लिए दवा की दुकान से बात करें।"
                : "Partially dispensed. Contact the pharmacy about remaining units."
              : hi
                ? "पर्ची दवा की दुकान पर भेज दी गई है। अभी दवाइयाँ देना बाकी है।"
                : "Prescription sent to the pharmacy. Dispensing is still pending."}
        </p>
      ) : active ? (
        <>
          <ProviderPicker
            type="PHARMACY"
        contextId={prescriptionId}
            value={pharmacy}
            onChange={setPharmacy}
            label={hi ? "दवा की दुकान का नाम खोजें" : "Search pharmacy name"}
          />
          <Button disabled={busy || !pharmacy} onClick={() => void choose()}>
            {hi
              ? "इस दुकान को पर्ची भेजें"
              : "Send prescription to this pharmacy"}
          </Button>
        </>
      ) : (
        <p>
          {hi
            ? "यह पर्ची अभी चालू नहीं है।"
            : "This prescription is not active."}
        </p>
      )}
    </section>
  );
}
