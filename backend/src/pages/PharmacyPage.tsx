import { useCareLanguage } from "@/lib/care-language";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Badge } from "@/components/kit";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { errorText, rpc } from "@/lib/diagnostics/service";
type Item = {
  id: string;
  medicine_name: string;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  quantity_prescribed: number | null;
  dispensed: number;
};
type Fulfilment = {
  id: string;
  status: string;
  patient_code: string;
  full_name: string;
  items: Item[];
};
type Stock = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  selling_price: number;
  medicine_name: string;
  strength: string | null;
};
export function PharmacyPage() {
  const { tr, label } = useCareLanguage();
  const [rows, setRows] = useState<Fulfilment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    void rpc<Fulfilment[]>("c1_pharmacy_queue", { p_offset: offset })
      .then((r) => {
        if (active) {
          setRows(r);
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
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {tr("Pharmacy workspace", "दवाइयाँ देना")}
      </h1>
      <StockEntry refresh={() => setVersion((v) => v + 1)} />
      {error && <p role="alert">{error}</p>}
      <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
        {tr("Refresh", "नई जानकारी देखें")}
      </Button>
      {busy ? (
        <p>
          {tr(
            "Loading authorized prescriptions…",
            "भेजी गई पर्चियाँ आ रही हैं…",
          )}
        </p>
      ) : error ? null : !rows.length ? (
        <Card>
          {tr(
            "No prescriptions have been sent to this pharmacy.",
            "अभी इस दुकान को कोई पर्ची नहीं भेजी गई है।",
          )}
        </Card>
      ) : (
        rows.map((f) => (
          <Card key={f.id} className="space-y-4">
            <div className="flex flex-wrap gap-3 justify-between">
              <h2 className="text-lg font-semibold">
                {f.full_name} · {f.patient_code}
              </h2>
              <Badge>{label(f.status)}</Badge>
            </div>
            {(f.items ?? []).map((i) => (
              <DispenseLine
                key={i.id}
                item={i}
                fulfilment={f.id}
                refresh={() => setVersion((v) => v + 1)}
                version={version}
              />
            ))}
          </Card>
        ))
      )}
      <div className="flex gap-2">
        <Button
          disabled={!offset || busy}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          {tr("Previous", "पिछला")}
        </Button>
        <Button
          disabled={rows.length < 20 || busy}
          onClick={() => setOffset(offset + 20)}
        >
          {tr("Next", "अगला")}
        </Button>
      </div>
    </div>
  );
}
function StockEntry({ refresh }: { refresh: () => void }) {
  const { tr } = useCareLanguage();
  const [form, setForm] = useState({
    name: "",
    strength: "",
    batch: "",
    expiry: "",
    quantity: "",
    price: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const receiptAttempt = useRef<{ signature: string; key: string } | null>(
    null,
  );
  async function add() {
    const signature = JSON.stringify(form);
    if (receiptAttempt.current?.signature !== signature)
      receiptAttempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    try {
      await rpc("c1_add_stock", {
        p_request: receiptAttempt.current.key,
        p_name: form.name,
        p_strength: form.strength,
        p_batch: form.batch,
        p_expiry: form.expiry || null,
        p_quantity: Number(form.quantity),
        p_price: form.price.trim() ? Number(form.price) : null,
      });
      receiptAttempt.current = null;
      setMessage(tr("Stock receipt recorded.", "दवाइयाँ दर्ज हो गईं।"));
      setForm({
        name: "",
        strength: "",
        batch: "",
        expiry: "",
        quantity: "",
        price: "",
      });
      refresh();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <details>
        <summary className="cursor-pointer font-semibold">
          {tr("Record received inventory", "मिली हुई दवाइयाँ दर्ज करें")}
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              "name",
              "strength",
              "batch",
              "expiry",
              "quantity",
              "price",
            ] as const
          ).map((key) => (
            <label key={key} className="block capitalize">
              {key === "price"
                ? tr(
                    "Actual selling price per dispensing unit (INR)",
                    "एक इकाई का वास्तविक बिक्री मूल्य (रुपये)",
                  )
                : key === "quantity"
                  ? tr("Received dispensing units", "मिली हुई मात्रा (इकाइयाँ)")
                  : tr(
                      key,
                      {
                        name: "दवा का नाम",
                        strength: "ताकत",
                        batch: "बैच",
                        expiry: "अंतिम तारीख",
                        quantity: "मात्रा",
                        price: "मूल्य",
                      }[key],
                    )}
              <input
                className="mt-1 w-full rounded border p-3"
                type={key === "expiry" ? "date" : "text"}
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <p className="my-3 text-sm">
          Record actual received stock, with quantity in the same dispensing
          units as the prescription. No medicine substitution is permitted.
        </p>
        <Button disabled={busy} onClick={() => void add()}>
          {tr("Record stock", "दवाइयाँ दर्ज करें")}
        </Button>
        <p role="status">{message}</p>
      </details>
    </Card>
  );
}
function DispenseLine({
  item,
  fulfilment,
  refresh,
  version,
}: {
  item: Item;
  fulfilment: string;
  refresh: () => void;
  version: number;
}) {
  const { tr } = useCareLanguage();
  const { profile } = useAuth();
  const [stock, setStock] = useState<Stock[]>([]);
  const [inventory, setInventory] = useState("");
  const [qty, setQty] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const p = await supabase
          .from("provider_profiles")
          .select("id")
          .eq("user_id", profile!.id)
          .single();
        if (p.error) throw p.error;
        const r = await supabase
          .from("pharmacy_inventory")
          .select(
            "id,batch_number,expiry_date,quantity,selling_price,medicine_name,strength",
          )
          .eq("pharmacy_provider_id", p.data.id)
          .eq("medicine_name", item.medicine_name)
          .gt("quantity", 0)
          .gte("expiry_date", new Date().toISOString().slice(0, 10))
          .order("expiry_date")
          .limit(50);
        if (r.error) throw r.error;
        if (active)
          setStock(
            (r.data ?? []).filter(
              (s) => (s.strength ?? "") === (item.strength ?? ""),
            ),
          );
      } catch (e) {
        if (active) setError(errorText(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [item.id, version]);
  async function dispense() {
    setBusy(true);
    setError("");
    const signature = JSON.stringify([inventory, qty]);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      await rpc("c1_dispense", {
        p_fulfilment: fulfilment,
        p_item: item.id,
        p_inventory: inventory,
        p_quantity: Number(qty),
        p_request: attempt.current.key,
      });
      setQty("");
      setChecked(false);
      attempt.current = null;
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">
        {item.medicine_name} {item.strength}
      </h3>
      <p>
        {item.dose} · {item.frequency} · {item.duration}
      </p>
      {item.instructions && <p>{item.instructions}</p>}
      <p>
        {tr("Prescribed units", "लिखी गई मात्रा")}:{" "}
        {item.quantity_prescribed ??
          "Not recorded — doctor confirmation needed"}{" "}
        · {tr("Dispensed", "दी गई मात्रा")}: {item.dispensed}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {item.quantity_prescribed !== null &&
        item.dispensed < item.quantity_prescribed && (
          <>
            <label className="block">
              {tr("Batch", "बैच")}
              <select
                className="mt-1 w-full rounded border p-3"
                value={inventory}
                onChange={(e) => {
                  setInventory(e.target.value);
                  setChecked(false);
                }}
              >
                <option value="">
                  {tr("Choose matching stock", "पर्ची से मिलती दवा चुनें")}
                </option>
                {stock.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.batch_number} · Expiry {s.expiry_date} · {s.quantity}{" "}
                    units · ₹{s.selling_price}/unit
                  </option>
                ))}
              </select>
            </label>
            {!stock.length && (
              <p>
                {tr(
                  "No matching unexpired stock is recorded.",
                  "पर्ची से मिलती और सही तारीख वाली दवा दर्ज नहीं है।",
                )}
              </p>
            )}
            <label className="block">
              {tr("Units to dispense", "दी जाने वाली मात्रा")}
              <input
                className="mt-1 w-full rounded border p-3"
                type="number"
                min={1}
                max={item.quantity_prescribed - item.dispensed}
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setChecked(false);
                }}
              />
            </label>
            <label className="flex gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              {tr(
                "I checked this prescription, medicine, strength, batch, expiry and actual units handed over.",
                "मैंने पर्ची, दवा, ताकत, बैच, अंतिम तारीख और दी गई मात्रा जाँच ली है।",
              )}
            </label>
            <Button
              disabled={busy || !inventory || !qty || !checked}
              onClick={() => void dispense()}
            >
              {tr("Confirm dispense", "दवा देना दर्ज करें")}
            </Button>
          </>
        )}
    </section>
  );
}
