/**
 * PharmacyPage – Full Pharmacy ERP / POS
 *
 * Tabs:
 *  1. Prescription Queue  – c1_pharmacy_queue → c1_dispense
 *  2. OTC / Walk-in Sale  – pharmacy_inventory search + basket (OTC recording: TruthfulEmptyState)
 *  3. Stock Receipt       – c1_add_stock + live inventory list
 *  4. Inventory Status    – per-medicine aggregated view
 *  5. Copilot Assistant   – SwasthyaCopilot
 */
import { normalizeStockLedger as normalizeLedger, type StockMovement } from "@/lib/pharmacy-ledger";
import { useCareLanguage } from "@/lib/care-language";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Badge, TruthfulEmptyState } from "@/components/kit";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { errorText, rpc } from "@/lib/diagnostics/service";
import { SwasthyaCopilot } from "@/components/SwasthyaCopilot";
import {
  ShoppingCart,
  Pill,
  PackageOpen,
  BarChart3,
  Bot,
  Trash2,
  AlertTriangle,
  RefreshCw,
  ClipboardList,
  ScanLine,
  ShoppingBag,
  Truck,
  FileBarChart,
  UsersRound,
  ReceiptText,
  ShieldCheck,
  Boxes,
  FileText,
} from "lucide-react";

// ─── Shared types ──────────────────────────────────────────────────────────────

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

type InventoryRow = {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  selling_price: number | null;
  medicine_name: string;
  strength: string | null;
  created_at: string;
  pharmacy_provider_id: string;
};

// ─── Tab list ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "command", icon: <ActivityIcon />, en: "Command Centre", hi: "कमांड सेंटर" },
  { id: "lookup", icon: <ScanLine className="size-4" />, en: "Prescription Lookup", hi: "पर्ची खोजें" },
  { id: "pos", icon: <ShoppingBag className="size-4" />, en: "POS / New Sale", hi: "POS / नई बिक्री" },
  { id: "queue", icon: <Pill className="size-4" />, en: "Prescription Queue", hi: "पर्ची कतार" },
  { id: "otc", icon: <ShoppingCart className="size-4" />, en: "OTC", hi: "काउंटर बिक्री" },
  { id: "orders", icon: <Truck className="size-4" />, en: "Orders & Fulfilment", hi: "ऑर्डर और डिलीवरी" },
  { id: "stock", icon: <PackageOpen className="size-4" />, en: "Stock Receipt", hi: "माल दर्ज" },
  { id: "inventory", icon: <Boxes className="size-4" />, en: "Inventory / Batches", hi: "भण्डार / बैच" },
  { id: "purchasing", icon: <ClipboardList className="size-4" />, en: "Purchasing & Suppliers", hi: "खरीद और सप्लायर" },
  { id: "insights", icon: <FileBarChart className="size-4" />, en: "Reports & Audit", hi: "रिपोर्ट और ऑडिट" },
  { id: "assistant", icon: <Bot className="size-4" />, en: "Assistant", hi: "सहायक" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ActivityIcon() {
  return <BarChart3 className="size-4" />;
}

// ─── Root page ─────────────────────────────────────────────────────────────────

export function PharmacyPage() {
  const { tr } = useCareLanguage();
  const [tab, setTab] = useState<TabId>("queue");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {tr("Pharmacy ERP / POS", "फार्मेसी ERP / POS")}
      </h1>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary",
            ].join(" ")}
          >
            {t.icon}
            <span>
              {tr(t.en, t.hi)}
            </span>
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "command" && <CommandCentre onNavigate={setTab} />}
      {tab === "lookup" && <PrescriptionLookup />}
      {tab === "pos" && <PosTab />}
      {tab === "queue" && <QueueTab />}
      {tab === "otc" && <OtcTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "stock" && <StockTab />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "purchasing" && <PurchasingTab />}
      {tab === "insights" && <InsightsTab />}
      {tab === "assistant" && <AssistantTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 – Prescription Queue
// ═══════════════════════════════════════════════════════════════════════════════

function CommandCentre({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const { tr } = useCareLanguage();
  const cards = [
    ["Open prescriptions", "Queue", "Review and dispense assigned prescriptions", "queue", "primary"],
    ["Stock attention", "Inventory", "Expiry and low-stock checks", "inventory", "warning"],
    ["Today's sales", "POS", "Walk-in and prescription sales", "pos", "success"],
    ["Online orders", "Fulfilment", "Delivery and pickup workbench", "orders", "teal"],
  ] as const;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{tr("Pharmacy command centre", "फार्मेसी कमांड सेंटर")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("A single worklist for safe dispensing, stock control and fulfilment.", "डिस्पेंसिंग, स्टॉक और ऑर्डर की एक कार्यसूची।")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, eyebrow, hint, tab, tone]) => (
          <button key={label} onClick={() => onNavigate(tab as TabId)} className="text-left">
            <Card className="h-full transition hover:border-primary/50 hover:shadow-sm">
              <p className="label-xs text-muted-foreground">{eyebrow}</p>
              <p className="mt-2 text-xl font-bold">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
              <Badge tone={tone}>{tr("Open workspace", "वर्कस्पेस खोलें")}</Badge>
            </Card>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold">{tr("Safety checklist", "सुरक्षा जाँच")}</h3>
          <div className="mt-3 space-y-2 text-sm">
            {["Verify medicine, strength, dose and quantity", "Use FEFO for unexpired batches", "Record payment before handover", "Protect patient identity at the counter"].map((x) => (
              <p key={x} className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" />{tr(x, x)}</p>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold">{tr("Live contract status", "लाइव कॉन्ट्रैक्ट स्थिति")}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("Queue, inventory, counter sales, recorded payments and purchasing use live scoped operations. Recorded payments do not confirm an external payment gateway settlement.", "कतार और भण्डार मौजूदा कॉन्ट्रैक्ट से आते हैं। बिक्री, सप्लायर, भुगतान और ऑडिट लिखने का कॉन्ट्रैक्ट उपलब्ध नहीं है।")}
          </p>
          <Badge className="mt-3" tone="info">{tr("Read-only where unavailable", "जहाँ उपलब्ध नहीं वहाँ केवल पढ़ने योग्य")}</Badge>
        </Card>
      </div>
    </div>
  );
}

function PrescriptionLookup() {
  const { tr } = useCareLanguage();
  const [mode, setMode] = useState<"walkin" | "paper" | "qr">("walkin");
  const [value, setValue] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");

  const handleLookup = () => {
    if (!value.trim()) return;
    setLookupNotice(
      tr(
        `Prescription lookup for "${value.trim()}": Backend 050 exposes the pharmacy queue directly. Please review the Dispensing Queue below to dispense queued prescriptions.`,
        `पर्ची खोज "${value.trim()}": बैकएंड 050 फार्मेसी कतार सीधे देता है। कृपया कतारबद्ध पर्चियों के लिए नीचे डिस्पेंसिंग कतार देखें।`
      )
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">{tr("Find a prescription safely", "पर्ची सुरक्षित तरीके से खोजें")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{tr("Search by a prescription code or scan a QR. Do not use name or phone number at the counter.", "पर्ची कोड या QR से खोजें। काउंटर पर नाम या फोन नंबर का उपयोग न करें।")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["walkin", "paper", "qr"] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? "primary" : "outline"} onClick={() => setMode(m)}>
              {m === "walkin" ? tr("Walk-in code", "वॉक-इन कोड") : m === "paper" ? tr("Paper prescription", "कागज़ी पर्ची") : tr("Scan QR", "QR स्कैन")}
            </Button>
          ))}
        </div>
        {mode === "qr" ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center">
            <ScanLine className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{tr("Camera scanning is unavailable in this browser shell.", "इस ब्राउज़र शेल में कैमरा स्कैन उपलब्ध नहीं है।")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tr("Enter the printed code instead; no scan result is stored.", "छपा हुआ कोड दर्ज करें; स्कैन परिणाम संग्रहित नहीं होता।")}</p>
          </div>
        ) : (
          <div className="mt-4 flex gap-2">
            <input className="min-w-0 flex-1 rounded-lg border border-border bg-background p-2.5 text-sm" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "paper" ? "RX-2026-…" : "Prescription code"} />
            <Button variant="outline" disabled={!value.trim()} onClick={handleLookup}>{tr("Look up", "खोजें")}</Button>
          </div>
        )}
        {lookupNotice && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary leading-relaxed">
            {lookupNotice}
          </div>
        )}
      </Card>
      <TruthfulEmptyState icon={<FileText className="size-5" />} title={tr("No lookup result yet", "अभी कोई परिणाम नहीं")} description={tr("The current backend exposes the pharmacy queue but not a standalone paper/QR lookup endpoint. A matching result will appear here when that contract is available.", "मौजूदा बैकएंड कतार देता है, लेकिन अलग कागज़ी/QR खोज endpoint नहीं देता। कॉन्ट्रैक्ट उपलब्ध होने पर परिणाम यहाँ दिखेगा।")} />
    </div>
  );
}

// A real pharmacy_inventory row usable as a counter-sale line. p2_otc_sale needs
// the inventory_id (a specific batch), NOT a catalog id, so the POS basket is
// built from inventory rather than from p2_search_medicines catalog results.
type InvSaleItem = {
  id: string;
  name: string;
  strength: string | null;
  batch_number: string;
  expiry_date: string;
  available: number;
  selling_price: number | null;
};


const cstr = (v: unknown) => (v == null ? null : String(v));
const cnum = (v: unknown) => (v == null ? 0 : Number(v));

function rowsOf(data: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}


type SaleItem = {
  id: string;
  name: string | null;
  quantity: number;
  returned: number;
};

// p2_sale (LOOKUP) returns a sale detail; extract its line items so p2_return
// can be called at the item level.
function normalizeSaleItems(data: unknown): SaleItem[] {
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rows = rowsOf(obj.items ?? obj.sale_items ?? obj.lines ?? data, [
    "items",
    "sale_items",
    "lines",
    "rows",
    "data",
  ]);
  return rows.map((r) => ({
    id: String(r.id ?? r.item_id ?? r.sale_item_id ?? ""),
    name: cstr(r.medicine_name ?? r.name ?? r.description ?? r.item_name),
    quantity: cnum(r.quantity ?? r.qty ?? r.quantity_sold),
    returned: cnum(r.returned_quantity ?? r.quantity_returned ?? r.returned),
  })).filter((r) => r.id);
}

function PosTab() {
  const { tr } = useCareLanguage();
  const { profile } = useAuth();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<InvSaleItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [basket, setBasket] = useState<{ item: InvSaleItem; qty: number }[]>([]);
  const [payMode, setPayMode] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; total: number } | null>(null);

  const [ledger, setLedger] = useState<StockMovement[]>([]);
  const [ledgerError, setLedgerError] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [returnFor, setReturnFor] = useState<{ id: string } | null>(null);
  const [returnSaleId, setReturnSaleId] = useState("");
  const [returnItems, setReturnItems] = useState<SaleItem[]>([]);
  const [returnItemId, setReturnItemId] = useState("");
  const [returnQty, setReturnQty] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!profile) return;
    void supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", profile.id)
      .single()
      .then(({ data }) => { if (data) setProviderId(data.id); });
  }, [profile]);

  // A counter sale decrements a specific stock batch, so the basket is built
  // from real pharmacy_inventory rows (which carry the inventory_id p2_otc_sale
  // requires) rather than from catalog search results.
  useEffect(() => {
    if (!search.trim() || !providerId) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      const today = new Date().toISOString().slice(0, 10);
      const { data, error: e } = await supabase
        .from("pharmacy_inventory")
        .select("id,medicine_name,strength,batch_number,expiry_date,quantity,selling_price")
        .ilike("medicine_name", `%${search}%`)
        .eq("pharmacy_provider_id", providerId)
        .gt("quantity", 0)
        .gte("expiry_date", today)
        .order("expiry_date")
        .limit(30);
      setSearching(false);
      if (e) { setResults([]); setSearchError(errorText(e)); return; }
      setResults(
        (data ?? []).map((r) => ({
          id: String(r.id),
          name: String(r.medicine_name),
          strength: r.strength ?? null,
          batch_number: String(r.batch_number ?? ""),
          expiry_date: String(r.expiry_date ?? ""),
          available: Number(r.quantity ?? 0),
          selling_price: r.selling_price == null ? null : Number(r.selling_price),
        })),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [search, providerId]);

  // 018 — stock movement ledger (p2_ledger). p_before is a bigint cursor (null = latest).
  useEffect(() => {
    let active = true;
    setLedgerLoading(true);
    setLedgerError("");
    void rpc<unknown>("p2_ledger", { p_before: null })
      .then((d) => { if (active) setLedger(normalizeLedger(d)); })
      .catch((e) => { if (active) { setLedger([]); setLedgerError(errorText(e)); } })
      .finally(() => { if (active) setLedgerLoading(false); });
    return () => { active = false; };
  }, [version]);

  const total = basket.reduce((s, b) => s + (b.item.selling_price ?? 0) * b.qty, 0);

  function add(item: InvSaleItem) {
    setBasket((prev) =>
      prev.some((b) => b.item.id === item.id) ? prev : [...prev, { item, qty: 1 }],
    );
  }

  async function completeSale() {
    if (basket.length === 0) return;
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      // p2_otc_sale items are EXACTLY { inventory_id, quantity }. No catalog_id,
      // medicine_id or unit_price is sent — the server prices from the batch.
      const items = basket.map((b) => ({
        inventory_id: b.item.id,
        quantity: b.qty,
      }));
      // p2_sale is LOOKUP only; counter sales are created via p2_otc_sale.
      const sale = await rpc<unknown>("p2_otc_sale", {
        p_items: items,
        p_request: crypto.randomUUID(),
      });
      const saleId =
        typeof sale === "string"
          ? sale
          : sale && typeof sale === "object"
            ? String((sale as Record<string, unknown>).id ?? (sale as Record<string, unknown>).sale_id ?? "")
            : "";
      if (saleId) {
        await rpc("p2_payment", {
          p_sale: saleId,
          p_method: payMode,
          p_reference: payReference.trim() || null,
          p_request: crypto.randomUUID(),
        });
      }
      setReceipt({ id: saleId || "recorded", total });
      setBasket([]);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(tr("Sale not recorded — server said: ", "बिक्री दर्ज नहीं हुई — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function recordReturn() {
    // p2_return is ITEM-LEVEL: it needs a sale item id + quantity, not a sale id.
    if (!returnFor || !returnItemId || !(Number(returnQty) > 0)) {
      setError(
        tr(
          "Choose a sale item and a quantity above zero to return.",
          "रिटर्न के लिए एक बिक्री-वस्तु और शून्य से अधिक मात्रा चुनें।",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await rpc("p2_return", {
        p_item: returnItemId,
        p_quantity: Number(returnQty),
        p_reason: returnReason.trim() || null,
        p_request: crypto.randomUUID(),
      });
      setReturnFor(null);
      setReturnReason("");
      setReturnItemId("");
      setReturnQty("");
      setReturnItems([]);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(tr("Return not recorded — server said: ", "रिटर्न दर्ज नहीं हुआ — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Open the return panel for a sale: p2_sale is a LOOKUP that returns the
  // sale detail including its line items, which p2_return requires.
  async function openReturn(sale: { id: string }) {
    setBusy(true);
    setError("");
    setReturnItems([]);
    setReturnItemId("");
    setReturnQty("");
    setReturnReason("");
    try {
      const detail = await rpc<unknown>("p2_sale", { p_sale: sale.id });
      setReturnFor(sale);
      setReturnItems(normalizeSaleItems(detail));
    } catch (e) {
      // Keep the panel open against the sale even if the detail lookup fails so
      // the operator sees the truthful server error rather than a silent no-op.
      setReturnFor(sale);
      setError(tr("Sale detail unavailable — server said: ", "बिक्री विवरण उपलब्ध नहीं — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">{tr("New counter sale", "नई काउंटर बिक्री")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            "Search in-stock batches, build a basket and record the sale. Prescription dispensing stays on the Prescription Queue (c1_dispense); this counter creates sales via p2_otc_sale (items are { inventory_id, quantity }) and records payment via p2_payment.",
            "स्टॉक में मौजूद बैच खोजें, टोकरी बनाएँ और बिक्री दर्ज करें। पर्ची डिस्पेंसिंग 'पर्ची कतार' (c1_dispense) पर रहती है; यह काउंटर p2_otc_sale (आइटम { inventory_id, quantity }) से बिक्री बनाता है और p2_payment से भुगतान दर्ज करता है।",
          )}
        </p>
        <input
          className="mt-3 w-full rounded border border-border bg-background p-2.5 text-sm"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr("Search in-stock medicines…", "स्टॉक में दवा खोजें…")}
        />
        {searching && <p className="mt-2 text-xs text-muted-foreground">{tr("Searching…", "खोज रहे हैं…")}</p>}
        {searchError && <p className="mt-2 text-xs text-destructive">{searchError}</p>}
        {results.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {results.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-semibold">{m.name}{m.strength ? ` · ${m.strength}` : ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr("Batch", "बैच")}: {m.batch_number} · {tr("Exp", "एक्सप")}: {m.expiry_date}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tr("Available", "उपलब्ध")}: {m.available} · {m.selling_price != null ? `₹${m.selling_price}` : tr("Price not set", "मूल्य निर्धारित नहीं")}
                  </p>
                </div>
                <Button size="sm" variant="outline" disabled={basket.some((b) => b.item.id === m.id)} onClick={() => add(m)}>
                  {basket.some((b) => b.item.id === m.id) ? tr("Added", "जुड़ा") : tr("Add", "जोड़ें")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {basket.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold">{tr("Basket", "टोकरी")}</h3>
          <div className="space-y-2">
            {basket.map((b) => (
              <div key={b.item.id} className="flex items-center gap-3 rounded-lg bg-secondary/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr("Batch", "बैच")}: {b.item.batch_number}
                    {b.item.selling_price != null ? ` · ₹${(b.item.selling_price * b.qty).toFixed(2)}` : ""}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={b.item.available}
                  className="w-16 rounded border border-border bg-background p-1.5 text-center text-sm"
                  value={b.qty}
                  onChange={(e) =>
                    setBasket((prev) => prev.map((x) => (x.item.id === b.item.id ? { ...x, qty: Math.max(1, Math.min(Number(e.target.value), x.item.available)) } : x)))
                  }
                />
                <button aria-label="Remove" className="text-muted-foreground transition-colors hover:text-destructive" onClick={() => setBasket((prev) => prev.filter((x) => x.item.id !== b.item.id))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="font-semibold">{tr("Total", "कुल")}: ₹{total.toFixed(2)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded border border-border bg-background p-2 text-sm"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder={tr("Reference (optional)", "संदर्भ (वैकल्पिक)")}
              />
              <select className="rounded border border-border bg-background p-2 text-sm" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                {["CASH", "CARD", "UPI", "OTHER"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <Button variant="primary" disabled={busy} onClick={() => void completeSale()}>
                {busy ? tr("Recording…", "दर्ज हो रहा है…") : tr("Complete sale", "बिक्री पूरी करें")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {receipt && (
        <Card className="border-success/30 bg-success/5">
          <p className="font-semibold">{tr("Sale recorded", "बिक्री दर्ज हुई")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr("Reference", "संदर्भ")}: <span className="font-mono">{receipt.id}</span> · ₹{receipt.total.toFixed(2)}
          </p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{tr("Stock movement ledger", "स्टॉक परिवर्तन खाता")}</h3>
          <Button size="sm" variant="outline" disabled={ledgerLoading} onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw className="size-3.5 mr-1" />{tr("Refresh", "नई जानकारी")}
          </Button>
        </div>
        {ledgerError ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("Stock ledger unavailable. Server: ", "बिक्री खाता उपलब्ध नहीं (p2_ledger)। कोई बिक्री कल्पित नहीं। सर्वर: ")}
            <span className="text-destructive">{ledgerError}</span>
          </p>
        ) : ledgerLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr("Loading ledger…", "खाता आ रहा है…")}</p>
        ) : ledger.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr("No recorded sales yet.", "अभी कोई दर्ज बिक्री नहीं।")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-3">
                <p className="font-mono text-sm font-semibold">{s.kind} · #{s.id}</p>
                <p className="text-xs text-muted-foreground">
                  {tr("Quantity change", "मात्रा परिवर्तन")}: {s.delta ?? "—"} · {tr("Balance after", "शेष मात्रा")}: {s.balance ?? "—"}
                  {s.recordedAt ? " · " + new Date(s.recordedAt).toLocaleString() : ""}
                </p>
                <p className="text-xs text-muted-foreground">{tr("Inventory batch", "भण्डार बैच")}: {s.inventoryId ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold">{tr("Look up sale for return", "रिटर्न के लिए बिक्री खोजें")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Enter the sale ID from the receipt. Stock movement IDs cannot be used for returns.", "रसीद से बिक्री ID दर्ज करें। स्टॉक परिवर्तन ID रिटर्न के लिए उपयोग नहीं होती।")}</p>
        <input aria-label="Sale ID for return" className="mt-2 w-full rounded border border-border bg-background p-2.5 text-sm" value={returnSaleId} onChange={(e) => setReturnSaleId(e.target.value)} />
        <Button className="mt-2" disabled={busy || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(returnSaleId.trim())} onClick={() => void openReturn({ id: returnSaleId.trim() })}>{tr("Look up sale", "बिक्री खोजें")}</Button>
      </Card>
      {returnFor && (
        <Card className="border-warning/30">
          <h3 className="font-semibold">{tr("Record return", "रिटर्न दर्ज करें")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(
              "Item-level return via p2_return(p_item,p_quantity,p_reason,p_request). Sale items are looked up with p2_sale.",
              "p2_return(p_item,p_quantity,p_reason,p_request) द्वारा वस्तु-स्तरीय रिटर्न। बिक्री-वस्तुएँ p2_sale से देखी जाती हैं।",
            )}
          </p>
          {returnItems.length > 0 ? (
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Sale item", "बिक्री वस्तु")}</span>
                <select
                  className="w-full rounded border border-border bg-background p-2.5 text-sm"
                  value={returnItemId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setReturnItemId(id);
                    const it = returnItems.find((x) => x.id === id);
                    setReturnQty(it ? String(Math.max(1, it.quantity - it.returned)) : "");
                  }}
                >
                  <option value="">{tr("Choose an item…", "वस्तु चुनें…")}</option>
                  {returnItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name ?? it.id.slice(0, 8)} · {tr("qty", "मात्रा")} {it.quantity}
                      {it.returned ? ` · ${tr("returned", "लौटाई")} ${it.returned}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Quantity to return", "लौटाने की मात्रा")}</span>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded border border-border bg-background p-2.5 text-sm"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {tr(
                "No line items were returned by p2_sale for this sale, so an item-level return cannot be recorded.",
                "इस बिक्री के लिए p2_sale ने कोई लाइन-वस्तु नहीं लौटाई, इसलिए वस्तु-स्तरीय रिटर्न दर्ज नहीं किया जा सकता।",
              )}
            </p>
          )}
          <input
            className="mt-2 w-full rounded border border-border bg-background p-2.5 text-sm"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder={tr("Reason (optional)", "कारण (वैकल्पिक)")}
          />
          <div className="mt-3 flex gap-2">
            <Button disabled={busy || !returnItemId || !(Number(returnQty) > 0)} onClick={() => void recordReturn()}>
              {tr("Confirm return", "रिटर्न की पुष्टि करें")}
            </Button>
            <Button variant="outline" onClick={() => { setReturnFor(null); setReturnItems([]); setReturnItemId(""); setReturnQty(""); }}>{tr("Cancel", "रद्द करें")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function OrdersTab() {
  const { tr } = useCareLanguage();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [version, setVersion] = useState(0);

  // New delivery request modal state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [fulfilmentId, setFulfilmentId] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"PICKUP" | "DELIVERY">("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void rpc<any>("p4_deliveries", { p_offset: 0 })
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data)
          ? data
          : data?.deliveries || data?.items || [];
        setDeliveries(list);
      })
      .catch((e) => {
        if (!active) return;
        setError(errorText(e));
        setDeliveries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [version]);

  const handleTransition = async (deliveryId: string, action: string, note?: string) => {
    setBusyId(deliveryId);
    setError("");
    setActionNotice("");
    try {
      await rpc("p4_transition", {
        p_delivery: deliveryId,
        p_action: action,
        p_evidence: { timestamp: new Date().toISOString(), note: note || `Action: ${action}` },
        p_request: crypto.randomUUID()
      });
      setActionNotice(`Delivery updated: ${action}. (Note: Returns never automatically restock.)`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleRequestDelivery = async () => {
    if (!fulfilmentId.trim()) {
      setError("Fulfilment UUID is required");
      return;
    }
    setRequestBusy(true);
    setError("");
    setActionNotice("");
    try {
      await rpc("p4_request", {
        p_fulfilment: fulfilmentId.trim(),
        p_mode: deliveryMode,
        p_address: deliveryAddress.trim() || null,
        p_request: crypto.randomUUID()
      });
      setActionNotice("Delivery request recorded successfully.");
      setShowRequestForm(false);
      setFulfilmentId("");
      setDeliveryAddress("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRequestBusy(false);
    }
  };

  const counts = {
    all: deliveries.length,
    requested: deliveries.filter((d) => ["REQUESTED", "NEW", "PENDING"].includes(d.status)).length,
    preparing: deliveries.filter((d) => ["ACCEPTED", "PREPARING", "PREPARE"].includes(d.status)).length,
    ready: deliveries.filter((d) => ["READY", "READY_FOR_PICKUP"].includes(d.status)).length,
    delivered: deliveries.filter((d) => ["DELIVERED", "CONFIRMED_RECEIPT", "CONFIRMED_BY_PATIENT"].includes(d.status)).length,
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">{tr("Orders & Fulfilment (035 p4_deliveries)", "ऑनलाइन ऑर्डर और डिलीवरी")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr(
                "Manage pickup and home delivery pipelines. Return never automatically restocks. Care gap closes on patient confirmation.",
                "पिकअप और डिलीवरी प्रक्रिया। रिटर्न कभी स्वतः स्टॉक में नहीं जुड़ता। मरीज की पुष्टि पर केयर गैप बंद होता है।"
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setVersion((v) => v + 1)} disabled={loading}>
              <RefreshCw className="size-3.5 mr-1" />
              {tr("Refresh", "ताज़ा करें")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setShowRequestForm((v) => !v)}>
              <Truck className="size-3.5 mr-1" />
              {showRequestForm ? "Cancel Request" : "New Delivery Request (p4_request)"}
            </Button>
          </div>
        </div>

        {/* Pipeline Summary Cards */}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-secondary/50 p-3.5">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Requested / New</p>
            <p className="mt-1 text-2xl font-bold">{loading ? "—" : counts.requested}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3.5">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Preparing / Packing</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{loading ? "—" : counts.preparing}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3.5">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Ready for Handover</p>
            <p className="mt-1 text-2xl font-bold text-primary">{loading ? "—" : counts.ready}</p>
          </div>
          <div className="rounded-xl bg-secondary/50 p-3.5">
            <p className="text-xs text-muted-foreground uppercase font-semibold">Confirmed Delivered</p>
            <p className="mt-1 text-2xl font-bold text-success">{loading ? "—" : counts.delivered}</p>
          </div>
        </div>

        {actionNotice && (
          <div className="mt-3 p-3 rounded-lg border border-success/30 bg-success/10 text-xs font-semibold text-success">
            {actionNotice}
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}
      </Card>

      {/* Request Form Drawer */}
      {showRequestForm && (
        <Card className="border-primary/30 space-y-3">
          <h3 className="font-semibold text-sm">Request Pickup or Delivery (035 p4_request)</h3>
          <p className="text-xs text-muted-foreground">
            Bind an existing prescription fulfilment to local pharmacy pickup or verified last-mile delivery.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              Fulfilment UUID *
              <input
                type="text"
                value={fulfilmentId}
                onChange={(e) => setFulfilmentId(e.target.value)}
                placeholder="Prescription fulfilment UUID…"
                className="mt-1 w-full rounded border p-2 text-xs"
              />
            </label>
            <label className="block text-xs">
              Fulfilment Mode
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as any)}
                className="mt-1 w-full rounded border p-2 text-xs font-semibold"
              >
                <option value="DELIVERY">HOME DELIVERY</option>
                <option value="PICKUP">STORE PICKUP</option>
              </select>
            </label>
          </div>
          {deliveryMode === "DELIVERY" && (
            <label className="block text-xs">
              Delivery Address / Landmarks
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Patient verified delivery address…"
                className="mt-1 w-full rounded border p-2 text-xs"
              />
            </label>
          )}
          <Button size="sm" disabled={requestBusy || !fulfilmentId.trim()} onClick={() => void handleRequestDelivery()}>
            {requestBusy ? "Submitting…" : "Confirm Fulfilment Request"}
          </Button>
        </Card>
      )}

      {/* Deliveries Queue */}
      <Card className="space-y-3">
        <h3 className="font-semibold text-sm">Active Fulfilment Queue</h3>
        {loading ? (
          <p className="text-xs text-muted-foreground p-4 text-center">Loading delivery orders via p4_deliveries…</p>
        ) : deliveries.length === 0 ? (
          <div className="p-6 text-center border border-dashed rounded-lg space-y-1">
            <p className="text-xs font-semibold text-foreground">No active orders or deliveries found</p>
            <p className="text-[11px] text-muted-foreground">
              When prescriptions or OTC orders are flagged for delivery/pickup, they will appear in this queue.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border rounded-lg">
            {deliveries.map((d: any) => (
              <div key={d.id} className="p-3 text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{d.id.slice(0, 8)}…</span>
                    <Badge tone={d.mode === "PICKUP" ? "info" : "primary"}>{d.mode}</Badge>
                    <Badge tone="outline">{d.status}</Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {d.created_at ? new Date(d.created_at).toLocaleString() : ""}
                  </span>
                </div>

                {d.delivery_address && (
                  <p className="text-muted-foreground">
                    <strong>Address:</strong> {d.delivery_address}
                  </p>
                )}

                {/* State Machine Transition Actions (035 p4_transition) */}
                <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "ACCEPT")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "PREPARE")}
                  >
                    Prepare / Pack
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "READY")}
                  >
                    Mark Ready
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "DISPATCH")}
                  >
                    Dispatch
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "REPORT_DELIVERY")}
                  >
                    Report Delivered
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === d.id}
                    onClick={() => void handleTransition(d.id, "RETURN_TO_PHARMACY", "Customer returned / unreachable")}
                  >
                    Return to Pharmacy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

type PurchaseLine = {
  id: string;
  medicine_name: string | null;
  quantity_ordered: number;
  quantity_received: number;
};

type Purchase = {
  id: string;
  reference: string | null;
  supplier: string | null;
  status: string;
  total: number;
  created_at: string | null;
  lines: PurchaseLine[];
};

type Supplier = { id: string; name: string | null; reference: string | null };

function normalizePurchaseLines(data: unknown): PurchaseLine[] {
  return rowsOf(data, ["lines", "purchase_lines", "items", "rows"]).map((r) => ({
    id: String(r.id ?? r.line_id ?? ""),
    medicine_name: cstr(r.medicine_name ?? r.name ?? r.item ?? r.description),
    quantity_ordered: cnum(r.quantity ?? r.quantity_ordered ?? r.qty),
    quantity_received: cnum(r.quantity_received ?? r.received ?? r.received_quantity),
  })).filter((r) => r.id);
}

function PurchasingTab() {
  const { tr } = useCareLanguage();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [supplierName, setSupplierName] = useState("");
  const [supplierReference, setSupplierReference] = useState("");

  // p3_order takes a supplier UUID, so operators pick from the real supplier
  // IDs returned by authorized purchase and supplier RPCs.
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const suppliersError = "";
  const [orderSupplier, setOrderSupplier] = useState("");
  const [orderReference, setOrderReference] = useState("");
  // p3_order lines need a real medicine_catalog_id, so the operator searches the
  // medicine catalog (p2_search_medicines) and selects a catalog entry — never a
  // free-text medicine name.
  const [orderMedSearch, setOrderMedSearch] = useState("");
  const [orderMedResults, setOrderMedResults] = useState<{ id: string; name: string }[]>([]);
  const [orderMedSearching, setOrderMedSearching] = useState(false);
  const [orderCatalogId, setOrderCatalogId] = useState("");
  const [orderCatalogLabel, setOrderCatalogLabel] = useState("");
  const [orderQty, setOrderQty] = useState("");
  const [orderPrice, setOrderPrice] = useState("");

  // Line-level receiving (p3_receive needs a purchase line id + batch/expiry/price).
  const [receiveFor, setReceiveFor] = useState<Purchase | null>(null);
  const [receiveLine, setReceiveLine] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveBatch, setReceiveBatch] = useState("");
  const [receiveExpiry, setReceiveExpiry] = useState("");
  const [receivePrice, setReceivePrice] = useState("");
  const [receiveReceipt, setReceiveReceipt] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError("");
    void rpc<unknown>("p3_purchases", { p_offset: 0 })
      .then((d) => {
        if (!active) return;
        const purchaseRows = rowsOf(d, ["purchases", "rows", "items", "pharmacy_purchases", "data"]);
        setSuppliers((previous) => {
          const owned = new Map(previous.map((row) => [row.id, row]));
          for (const row of purchaseRows) if (typeof row.supplier_id === "string" && !owned.has(row.supplier_id)) owned.set(row.supplier_id, { id: row.supplier_id, name: null, reference: null });
          return [...owned.values()];
        });
        setPurchases(
          rowsOf(d, ["purchases", "rows", "items", "pharmacy_purchases", "data"]).map((r) => ({
            id: String(r.id ?? ""),
            reference: cstr(r.supplier_order_reference),
            supplier: cstr(r.supplier_id),
            status: String(r.status ?? "UNKNOWN").toUpperCase(),
            total: Array.isArray(r.lines) ? r.lines.reduce((sum, line) => sum + Number(line.quantity_ordered) * Number(line.unit_cost), 0) : 0,
            created_at: cstr(r.created_at ?? r.ordered_at),
            lines: normalizePurchaseLines(r.lines ?? r.purchase_lines ?? r.items),
          })),
        );
      })
      .catch((e) => { if (active) { setPurchases([]); setListError(errorText(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 7000);
  }

  // Debounced medicine-catalog search (p2_search_medicines) so a purchase-order
  // line can carry a real medicine_catalog_id.
  useEffect(() => {
    if (!orderMedSearch.trim()) {
      setOrderMedResults([]);
      return;
    }
    const t = setTimeout(() => {
      setOrderMedSearching(true);
      void rpc<unknown>("p2_search_medicines", { p_search: orderMedSearch, p_offset: 0 })
        .then((d) =>
          setOrderMedResults(
            rowsOf(d, ["medicines", "items", "rows", "medicine_catalog", "data", "results"]).map((r) => ({
              id: String(r.id ?? ""),
              name: String(r.medicine_name ?? r.name ?? r.generic_name ?? r.id ?? ""),
            })).filter((r) => r.id),
          ),
        )
        .catch(() => setOrderMedResults([]))
        .finally(() => setOrderMedSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [orderMedSearch]);

  async function addSupplier() {
    // p3_supplier requires a NON-EMPTY p_reference.
    if (!supplierName.trim() || !supplierReference.trim()) {
      flash(tr("Supplier name and a non-empty reference are both required.", "सप्लायर का नाम और एक गैर-रिक्त संदर्भ दोनों आवश्यक हैं।"));
      return;
    }
    setBusy(true);
    try {
      const supplierId = await rpc<string>("p3_supplier", {
        p_name: supplierName.trim(),
        p_reference: supplierReference.trim(),
      });
      setSuppliers((previous) => [...previous.filter((row) => row.id !== supplierId), { id: supplierId, name: supplierName.trim(), reference: supplierReference.trim() }]);
      setOrderSupplier(supplierId);
      flash(tr("Supplier recorded.", "सप्लायर दर्ज हुआ।"));
      setSupplierName("");
      setSupplierReference("");
      setVersion((v) => v + 1);
    } catch (e) {
      flash(tr("Supplier not recorded — server said: ", "सप्लायर दर्ज नहीं हुआ — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function createOrder() {
    // p3_order requires: a supplier UUID, a NON-EMPTY p_reference, and lines of
    // { medicine_catalog_id, quantity, unit_cost }. unit_cost must be a number.
    if (
      !orderSupplier ||
      !orderReference.trim() ||
      !orderCatalogId ||
      !(Number(orderQty) > 0) ||
      orderPrice.trim() === "" ||
      !Number.isFinite(Number(orderPrice)) ||
      Number(orderPrice) < 0
    ) {
      flash(
        tr(
          "Choose a supplier, enter a non-empty order reference, pick a catalog medicine, and enter a quantity above zero and a unit cost.",
          "सप्लायर चुनें, गैर-रिक्त आदेश संदर्भ दर्ज करें, कैटलॉग दवा चुनें, और शून्य से अधिक मात्रा व इकाई लागत दर्ज करें।",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await rpc("p3_order", {
        p_supplier: orderSupplier,
        p_reference: orderReference.trim(),
        p_lines: [{ medicine_catalog_id: orderCatalogId, quantity: Number(orderQty), unit_cost: Number(orderPrice) }],
        p_request: crypto.randomUUID(),
      });
      flash(tr("Purchase order created.", "खरीद आदेश बना।"));
      setOrderMedSearch("");
      setOrderMedResults([]);
      setOrderCatalogId("");
      setOrderCatalogLabel("");
      setOrderQty("");
      setOrderPrice("");
      setOrderReference("");
      setVersion((v) => v + 1);
    } catch (e) {
      flash(tr("Purchase order failed — server said: ", "खरीद आदेश विफल — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function openReceive(p: Purchase) {
    setReceiveFor(p);
    setReceiveLine("");
    setReceiveQty("");
    setReceiveBatch("");
    setReceiveExpiry("");
    setReceivePrice("");
    setReceiveReceipt("");
  }

  async function receive() {
    if (!receiveFor || !receiveLine || !(Number(receiveQty) > 0)) {
      flash(tr("Choose a purchase line and enter a quantity above zero.", "खरीद-पंक्ति चुनें और शून्य से अधिक मात्रा दर्ज करें।"));
      return;
    }
    setBusy(true);
    try {
      await rpc("p3_receive", {
        p_line: receiveLine,
        p_quantity: Number(receiveQty),
        p_batch: receiveBatch.trim() || null,
        p_expiry: receiveExpiry || null,
        p_selling_price: receivePrice ? Number(receivePrice) : null,
        p_supplier_receipt: receiveReceipt.trim() || null,
        p_request: crypto.randomUUID(),
      });
      flash(tr("Receipt recorded against the purchase line.", "खरीद-पंक्ति पर प्राप्ति दर्ज हुई।"));
      setReceiveFor(null);
      setVersion((v) => v + 1);
    } catch (e) {
      flash(tr("Receive failed — server said: ", "प्राप्ति विफल — सर्वर ने कहा: ") + errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {notice && <Card className="border-info/30 bg-info/10 p-3 text-sm">{notice}</Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">{tr("Add supplier", "सप्लायर जोड़ें")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tr("Written to pharmacy_suppliers via p3_supplier(p_name,p_reference). A non-empty reference is required.", "p3_supplier(p_name,p_reference) द्वारा pharmacy_suppliers में दर्ज। गैर-रिक्त संदर्भ आवश्यक है।")}</p>
          <input className="mt-3 w-full rounded border border-border bg-background p-2.5 text-sm" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={tr("Supplier name", "सप्लायर का नाम")} />
          <input className="mt-2 w-full rounded border border-border bg-background p-2.5 text-sm" value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder={tr("Reference / phone / GST (required)", "संदर्भ / फोन / GST (आवश्यक)")} />
          <Button className="mt-3" disabled={busy || !supplierName.trim() || !supplierReference.trim()} onClick={() => void addSupplier()}>{tr("Save supplier", "सप्लायर सहेजें")}</Button>
        </Card>
        <Card>
          <h2 className="font-semibold">{tr("Create purchase order", "खरीद आदेश बनाएँ")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tr("Written via p3_order(p_supplier uuid,p_reference,p_lines,p_request).", "p3_order(p_supplier uuid,p_reference,p_lines,p_request) द्वारा दर्ज।")}</p>
          {suppliersError ? (
            <p className="mt-2 text-xs text-destructive">
              {tr("Supplier list unavailable, so ordering is disabled. Server: ", "सप्लायर सूची उपलब्ध नहीं, इसलिए आदेश निष्क्रिय है। सर्वर: ")}
              {suppliersError}
            </p>
          ) : (
            <select className="mt-3 w-full rounded border border-border bg-background p-2.5 text-sm" value={orderSupplier} onChange={(e) => setOrderSupplier(e.target.value)}>
              <option value="">{tr("Choose a supplier…", "सप्लायर चुनें…")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name ?? s.id.slice(0, 8)}{s.reference ? ` · ${s.reference}` : ""}</option>
              ))}
            </select>
          )}
          {suppliers.length === 0 && !suppliersError && (
            <p className="mt-1 text-xs text-muted-foreground">{tr("No suppliers loaded. Enter the supplier name and reference to add or reselect it.", "कोई सप्लायर लोड नहीं है। जोड़ने या फिर चुनने के लिए नाम और संदर्भ दर्ज करें।")}</p>
          )}
          <input className="mt-2 w-full rounded border border-border bg-background p-2.5 text-sm" value={orderReference} onChange={(e) => setOrderReference(e.target.value)} placeholder={tr("Order reference (required)", "आदेश संदर्भ (आवश्यक)")} />
          <div className="mt-2">
            {orderCatalogId ? (
              <div className="flex items-center justify-between gap-2 rounded border border-border bg-secondary/40 p-2.5 text-sm">
                <span className="truncate">{orderCatalogLabel} · <span className="font-mono text-xs text-muted-foreground">{orderCatalogId.slice(0, 8)}</span></span>
                <Button size="sm" variant="outline" onClick={() => { setOrderCatalogId(""); setOrderCatalogLabel(""); }}>{tr("Change", "बदलें")}</Button>
              </div>
            ) : (
              <>
                <input
                  className="w-full rounded border border-border bg-background p-2.5 text-sm"
                  type="search"
                  value={orderMedSearch}
                  onChange={(e) => setOrderMedSearch(e.target.value)}
                  placeholder={tr("Search medicine catalog…", "दवा कैटलॉग खोजें…")}
                />
                {orderMedSearching && <p className="mt-1 text-xs text-muted-foreground">{tr("Searching…", "खोज रहे हैं…")}</p>}
                {orderMedResults.length > 0 && (
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {orderMedResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded border border-border p-2 text-left text-sm hover:border-primary/50"
                        onClick={() => { setOrderCatalogId(m.id); setOrderCatalogLabel(m.name); setOrderMedSearch(""); setOrderMedResults([]); }}
                      >
                        <span className="truncate">{m.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{m.id.slice(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {orderMedSearch.trim() && !orderMedSearching && orderMedResults.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{tr("No catalog medicines matched.", "कोई कैटलॉग दवा नहीं मिली।")}</p>
                )}
              </>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input type="number" min={1} className="w-1/2 rounded border border-border bg-background p-2.5 text-sm" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} placeholder={tr("Quantity", "मात्रा")} />
            <input type="number" min={0} step="0.01" className="w-1/2 rounded border border-border bg-background p-2.5 text-sm" value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} placeholder={tr("Unit cost (₹)", "इकाई लागत (₹)")} />
          </div>
          <Button className="mt-3" disabled={busy || !orderSupplier || !orderReference.trim() || !orderCatalogId || !(Number(orderQty) > 0) || orderPrice.trim() === ""} onClick={() => void createOrder()}>{tr("Create order", "आदेश बनाएँ")}</Button>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{tr("Purchase orders", "खरीद आदेश")}</h2>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => setVersion((v) => v + 1)}>
            <RefreshCw className="size-3.5 mr-1" />{tr("Refresh", "नई जानकारी")}
          </Button>
        </div>
        {listError ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("Purchasing unavailable (p3_purchases). No orders are invented. Server: ", "खरीद उपलब्ध नहीं (p3_purchases)। कोई आदेश कल्पित नहीं। सर्वर: ")}
            <span className="text-destructive">{listError}</span>
          </p>
        ) : loading ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr("Loading purchase orders…", "खरीद आदेश आ रहे हैं…")}</p>
        ) : purchases.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr("No purchase orders yet.", "अभी कोई खरीद आदेश नहीं।")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{p.reference ?? p.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.supplier, p.total ? `₹${p.total.toFixed(2)}` : null, p.created_at ? new Date(p.created_at).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.status === "RECEIVED" || p.status === "COMPLETED" ? "success" : "neutral"}>{p.status}</Badge>
                  {p.status !== "RECEIVED" && p.status !== "COMPLETED" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => openReceive(p)}>
                      {tr("Receive stock", "माल प्राप्त करें")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {receiveFor && (
        <Card className="border-warning/30">
          <h3 className="font-semibold">{tr("Receive stock (line level)", "माल प्राप्त करें (पंक्ति स्तर)")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr(
              "p3_receive(p_line,p_quantity,p_batch,p_expiry,p_selling_price,p_supplier_receipt,p_request).",
              "p3_receive(p_line,p_quantity,p_batch,p_expiry,p_selling_price,p_supplier_receipt,p_request)।",
            )}
          </p>
          {receiveFor.lines.length > 0 ? (
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{tr("Purchase line", "खरीद पंक्ति")}</span>
                <select className="w-full rounded border border-border bg-background p-2.5 text-sm" value={receiveLine} onChange={(e) => setReceiveLine(e.target.value)}>
                  <option value="">{tr("Choose a line…", "पंक्ति चुनें…")}</option>
                  {receiveFor.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.medicine_name ?? l.id.slice(0, 8)} · {tr("ordered", "आदेशित")} {l.quantity_ordered}
                      {l.quantity_received ? ` · ${tr("received", "प्राप्त")} ${l.quantity_received}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="number" min={1} className="rounded border border-border bg-background p-2.5 text-sm" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} placeholder={tr("Quantity received", "प्राप्त मात्रा")} />
                <input className="rounded border border-border bg-background p-2.5 text-sm" value={receiveBatch} onChange={(e) => setReceiveBatch(e.target.value)} placeholder={tr("Batch number", "बैच नंबर")} />
                <input type="date" className="rounded border border-border bg-background p-2.5 text-sm" value={receiveExpiry} onChange={(e) => setReceiveExpiry(e.target.value)} />
                <input type="number" min={0} step="0.01" className="rounded border border-border bg-background p-2.5 text-sm" value={receivePrice} onChange={(e) => setReceivePrice(e.target.value)} placeholder={tr("Selling price (₹)", "बिक्री मूल्य (₹)")} />
              </div>
              <input className="w-full rounded border border-border bg-background p-2.5 text-sm" value={receiveReceipt} onChange={(e) => setReceiveReceipt(e.target.value)} placeholder={tr("Supplier receipt / challan (optional)", "सप्लायर रसीद / चालान (वैकल्पिक)")} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {tr(
                "p3_purchases returned no line ids for this order, so a line-level receipt cannot be recorded.",
                "इस आदेश के लिए p3_purchases ने कोई पंक्ति-आईडी नहीं लौटाई, इसलिए पंक्ति-स्तरीय प्राप्ति दर्ज नहीं की जा सकती।",
              )}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button disabled={busy || !receiveLine || !(Number(receiveQty) > 0)} onClick={() => void receive()}>{tr("Confirm receipt", "प्राप्ति की पुष्टि करें")}</Button>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>{tr("Cancel", "रद्द करें")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function InsightsTab() {
  const { tr } = useCareLanguage();
  const [ledger, setLedger] = useState<StockMovement[]>([]);
  const [ledgerError, setLedgerError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void rpc<unknown>("p2_ledger", { p_before: null })
      .then((d) => { if (active) { setLedger(normalizeLedger(d)); setLedgerError(""); } })
      .catch((e) => { if (active) { setLedger([]); setLedgerError(errorText(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const received = ledger.reduce((s, r) => s + Math.max(0, r.delta ?? 0), 0);
  const issued = ledger.reduce((s, r) => s + Math.max(0, -(r.delta ?? 0)), 0);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">{tr("Stock movement report", "स्टॉक परिवर्तन रिपोर्ट")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Recent stock movements only. This is not a sales or payment summary.", "केवल हाल के स्टॉक परिवर्तन। यह बिक्री या भुगतान का सारांश नहीं है।")}</p>
        {ledgerError ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("Stock ledger unavailable. Server: ", "बिक्री खाता उपलब्ध नहीं (p2_ledger)। कोई योग कल्पित नहीं। सर्वर: ")}
            <span className="text-destructive">{ledgerError}</span>
          </p>
        ) : loading ? (
          <p className="mt-2 text-sm text-muted-foreground">{tr("Loading report…", "रिपोर्ट आ रही है…")}</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-bold font-tabular">{ledger.length}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("Movements", "परिवर्तन")}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-bold font-tabular">{received}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("Units in", "आवक इकाइयाँ")}</p></div>
            <div className="rounded-xl border border-border p-4"><p className="text-2xl font-bold font-tabular text-success">{issued}</p><p className="text-xs uppercase tracking-wide text-muted-foreground">{tr("Units out", "जावक इकाइयाँ")}</p></div>
          </div>
        )}
      </Card>
      <TruthfulEmptyState title={tr("Stock valuation, expiry and audit reports", "स्टॉक मूल्यांकन, एक्सपायरी और ऑडिट रिपोर्ट")} description={tr("Invoice numbering, GST/tax breakdown, stock valuation and immutable audit events are not part of the exposed stock ledger contract, so they are not fabricated here.", "इनवॉइस नंबर, GST/टैक्स विवरण, स्टॉक मूल्यांकन और अपरिवर्तनीय ऑडिट इवेंट उजागर बिक्री-खाता कॉन्ट्रैक्ट का हिस्सा नहीं हैं, इसलिए इन्हें यहाँ कल्पित नहीं किया गया।")} />
    </div>
  );
}

function QueueTab() {
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
        if (active) { setRows(r); setError(""); }
      })
      .catch((e) => { if (active) setError(errorText(e)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [offset, version]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {tr("Prescription Queue / पर्ची कतार", "पर्ची कतार")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RefreshCw className="size-4" />
          {tr("Refresh", "नई जानकारी")}
        </Button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {busy ? (
        <p className="text-sm text-muted-foreground">{tr("Loading prescriptions…", "पर्चियाँ आ रही हैं…")}</p>
      ) : !rows.length ? (
        <Card>
          <p className="text-center text-muted-foreground text-sm">
            {tr(
              "No prescriptions have been sent to this pharmacy.",
              "अभी इस दुकान को कोई पर्ची नहीं भेजी गई है।",
            )}
          </p>
        </Card>
      ) : (
        rows.map((f) => (
          <Card key={f.id} className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <h2 className="text-base font-semibold">{f.full_name}</h2>
                <p className="text-xs text-muted-foreground">{f.patient_code}</p>
              </div>
              <StatusBadgeLocal status={f.status} label={label} />
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
        <Button variant="outline" disabled={!offset || busy} onClick={() => setOffset(Math.max(0, offset - 20))}>
          {tr("Previous", "पिछला")}
        </Button>
        <Button variant="outline" disabled={rows.length < 20 || busy} onClick={() => setOffset(offset + 20)}>
          {tr("Next", "अगला")}
        </Button>
      </div>
    </div>
  );
}

function StatusBadgeLocal({ status, label }: { status: string; label: (s: string) => string }) {
  const s = status.toUpperCase();
  let tone: "success" | "warning" | "danger" | "primary" | "neutral" = "neutral";
  if (["COMPLETED", "FULLY_DISPENSED", "FULLY DISPENSED"].includes(s)) tone = "success";
  else if (["PARTIAL", "PARTIALLY_DISPENSED", "IN_PROGRESS"].includes(s)) tone = "warning";
  else if (["CANCELLED", "REJECTED"].includes(s)) tone = "danger";
  else if (["PENDING", "OPEN"].includes(s)) tone = "primary";
  return <Badge tone={tone}>{label(status)}</Badge>;
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
  const [stock, setStock] = useState<InventoryRow[]>([]);
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

        const today = new Date().toISOString().slice(0, 10);
        const r = await supabase
          .from("pharmacy_inventory")
          .select("id,batch_number,expiry_date,quantity,selling_price,medicine_name,strength,created_at,pharmacy_provider_id")
          .eq("pharmacy_provider_id", p.data.id)
          .eq("medicine_name", item.medicine_name)
          .gt("quantity", 0)
          .gte("expiry_date", today)
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
    return () => { active = false; };
  }, [item.id, version, profile, item.medicine_name, item.strength]);

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

  const remaining =
    item.quantity_prescribed !== null
      ? item.quantity_prescribed - item.dispensed
      : null;

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      {/* Medicine header */}
      <div className="flex flex-wrap items-start gap-2 justify-between">
        <div>
          <h3 className="font-semibold">
            {item.medicine_name}
            {item.strength ? ` · ${item.strength}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground">
            {[item.dose, item.frequency, item.duration].filter(Boolean).join(" · ")}
          </p>
          {item.instructions && (
            <p className="mt-0.5 text-xs text-muted-foreground italic">{item.instructions}</p>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground space-y-0.5">
          <p>
            <span className="font-medium">{tr("Prescribed", "निर्धारित")}:</span>{" "}
            {item.quantity_prescribed ?? tr("Not recorded", "दर्ज नहीं")}
          </p>
          <p>
            <span className="font-medium">{tr("Dispensed", "दी गई")}:</span> {item.dispensed}
          </p>
          {remaining !== null && remaining > 0 && (
            <p className="text-warning-foreground font-medium">
              {tr("Remaining", "बाकी")}: {remaining}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive rounded bg-destructive/10 p-2">
          {error}
        </p>
      )}

      {/* Dispense controls */}
      {remaining !== null && remaining > 0 && (
        <div className="space-y-3 border-t border-border pt-3">
          <label className="block text-sm">
            {tr("Batch", "बैच")}
            <select
              className="mt-1 w-full rounded border border-border bg-background p-2.5 text-sm"
              value={inventory}
              onChange={(e) => { setInventory(e.target.value); setChecked(false); }}
            >
              <option value="">{tr("Choose matching stock", "पर्ची से मिलती दवा चुनें")}</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.batch_number} · Expiry {s.expiry_date} · {s.quantity} units
                  {s.selling_price != null ? ` · ₹${s.selling_price}/unit` : ""}
                </option>
              ))}
            </select>
          </label>

          {!stock.length && (
            <p className="text-xs text-muted-foreground">
              {tr(
                "No matching unexpired stock recorded. Add stock in the 'Stock Receipt' tab.",
                "पर्ची से मिलती और सही तारीख वाली दवा दर्ज नहीं है।",
              )}
            </p>
          )}

          <label className="block text-sm">
            {tr("Units to dispense", "दी जाने वाली मात्रा")}
            <input
              className="mt-1 w-full rounded border border-border bg-background p-2.5 text-sm"
              type="number"
              min={1}
              max={remaining}
              value={qty}
              onChange={(e) => { setQty(e.target.value); setChecked(false); }}
            />
          </label>

          <label className="flex gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5"
            />
            {tr(
              "I verified this prescription, medicine name, strength, batch, expiry date and the actual units being handed over.",
              "मैंने पर्ची, दवा, ताकत, बैच, अंतिम तारीख और दी गई मात्रा जाँच ली है।",
            )}
          </label>

          <Button
            size="sm"
            disabled={busy || !inventory || !qty || !checked}
            onClick={() => void dispense()}
          >
            {busy
              ? tr("Dispensing…", "दर्ज हो रहा है…")
              : tr("Confirm Dispense", "दवा देना दर्ज करें")}
          </Button>
        </div>
      )}

      {remaining === 0 && (
        <Badge tone="success">{tr("Fully dispensed", "पूरी तरह दी गई")}</Badge>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 – OTC / Walk-in Sale
// ═══════════════════════════════════════════════════════════════════════════════

type OtcProduct = {
  id: string;
  medicine_name: string;
  strength: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  selling_price: number | null;
};

type BasketItem = {
  product: OtcProduct;
  qty: number;
};

function OtcTab() {
  const { tr } = useCareLanguage();
  const { profile } = useAuth();

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<OtcProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [saleBusy, setSaleBusy] = useState(false);
  const [saleError, setSaleError] = useState("");
  const [payMode, setPayMode] = useState("CASH");
  const [payReference, setPayReference] = useState("");
  const [receipt, setReceipt] = useState<{ id: string; total: number; mode: string } | null>(null);

  // Fetch provider id once
  const [providerId, setProviderId] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    void supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", profile.id)
      .single()
      .then(({ data }) => { if (data) setProviderId(data.id); });
  }, [profile]);

  // Debounced search
  useEffect(() => {
    if (!search.trim() || !providerId) {
      setSearchResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("pharmacy_inventory")
        .select("id,medicine_name,strength,batch_number,expiry_date,quantity,selling_price")
        .ilike("medicine_name", `%${search}%`)
        .gt("quantity", 0)
        .gte("expiry_date", today)
        .eq("pharmacy_provider_id", providerId)
        .limit(20);
      setSearching(false);
      if (error) { setSearchError(errorText(error)); return; }
      setSearchResults((data ?? []) as OtcProduct[]);
    }, 400);
    return () => clearTimeout(id);
  }, [search, providerId]);

  function addToBasket(product: OtcProduct) {
    setBasket((prev) => {
      const existing = prev.find((b) => b.product.id === product.id);
      if (existing) return prev;
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeFromBasket(id: string) {
    setBasket((prev) => prev.filter((b) => b.product.id !== id));
  }

  function updateQty(id: string, qty: number) {
    setBasket((prev) =>
      prev.map((b) =>
        b.product.id === id
          ? { ...b, qty: Math.max(1, Math.min(qty, b.product.quantity)) }
          : b,
      ),
    );
  }

  const total = basket.reduce(
    (sum, b) => sum + (b.product.selling_price ?? 0) * b.qty,
    0,
  );

  // 018 — record a real OTC/counter sale (pharmacy_sales + pharmacy_sale_items)
  // and its receipt (pharmacy_sale_receipts) via p2_otc_sale + p2_payment.
  // Nothing is marked sold unless the backend confirms; errors are surfaced.
  async function completeSale() {
    if (basket.length === 0) return;
    setSaleBusy(true);
    setSaleError("");
    setReceipt(null);
    try {
      // p2_otc_sale items are EXACTLY { inventory_id, quantity }. The unit price
      // is taken from the inventory batch server-side; it is never sent here.
      const items = basket.map((b) => ({
        inventory_id: b.product.id,
        quantity: b.qty,
      }));
      const sale = await rpc<unknown>("p2_otc_sale", {
        p_items: items,
        p_request: crypto.randomUUID(),
      });
      const saleId =
        typeof sale === "string"
          ? sale
          : sale && typeof sale === "object"
            ? String((sale as Record<string, unknown>).id ?? (sale as Record<string, unknown>).sale_id ?? "")
            : "";
      if (saleId) {
        await rpc("p2_payment", {
          p_sale: saleId,
          p_method: payMode,
          p_reference: payReference.trim() || null,
          p_request: crypto.randomUUID(),
        });
      }
      setReceipt({ id: saleId || "recorded", total, mode: payMode });
      setBasket([]);
    } catch (e) {
      setSaleError(
        tr("Sale not recorded — server said: ", "बिक्री दर्ज नहीं हुई — सर्वर ने कहा: ") +
          errorText(e),
      );
    } finally {
      setSaleBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          {tr("Over-the-Counter Sale", "काउंटर पर बिक्री")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr(
            "OTC sales do not require a patient account or prescription.",
            "काउंटर बिक्री के लिए मरीज़ खाता या पर्ची ज़रूरी नहीं है।",
          )}
        </p>
      </div>

      {/* Product search */}
      <Card>
        <h3 className="mb-3 font-semibold text-sm">{tr("Search Medicines", "दवा खोजें")}</h3>
        <input
          className="w-full rounded border border-border bg-background p-2.5 text-sm"
          type="search"
          placeholder={tr("Type medicine name…", "दवा का नाम टाइप करें…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searching && (
          <p className="mt-2 text-xs text-muted-foreground">{tr("Searching…", "खोज रहे हैं…")}</p>
        )}
        {searchError && (
          <p className="mt-2 text-xs text-destructive">{searchError}</p>
        )}
        {searchResults.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {searchResults.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-border bg-background p-3 flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm">
                      {p.medicine_name}
                      {p.strength ? ` · ${p.strength}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tr("Batch", "बैच")}: {p.batch_number} · {tr("Exp", "एक्सप")}: {p.expiry_date}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tr("Available", "उपलब्ध")}: {p.quantity} units
                      {p.selling_price != null ? ` · ₹${p.selling_price}/unit` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addToBasket(p)}
                    disabled={basket.some((b) => b.product.id === p.id)}
                  >
                    {basket.some((b) => b.product.id === p.id)
                      ? tr("Added", "जुड़ा")
                      : tr("Add to Basket", "टोकरी में जोड़ें")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {search.trim() && !searching && searchResults.length === 0 && !searchError && (
          <p className="mt-3 text-sm text-muted-foreground">
            {tr("No matching in-stock medicines found.", "कोई उपलब्ध दवा नहीं मिली।")}
          </p>
        )}
      </Card>

      {/* Basket */}
      {basket.length > 0 && (
        <Card>
          <h3 className="mb-3 font-semibold text-sm">{tr("Basket / टोकरी", "टोकरी")}</h3>
          <div className="space-y-3">
            {basket.map((b) => (
              <div
                key={b.product.id}
                className="flex flex-wrap items-center gap-3 rounded-lg bg-secondary/40 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {b.product.medicine_name}
                    {b.product.strength ? ` · ${b.product.strength}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tr("Batch", "बैच")}: {b.product.batch_number}
                    {b.product.selling_price != null
                      ? ` · ₹${(b.product.selling_price * b.qty).toFixed(2)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="w-16 rounded border border-border bg-background p-1.5 text-center text-sm"
                    min={1}
                    max={b.product.quantity}
                    value={b.qty}
                    onChange={(e) => updateQty(b.product.id, Number(e.target.value))}
                  />
                  <button
                    onClick={() => removeFromBasket(b.product.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <p className="font-semibold">
              {tr("Total", "कुल")}: ₹{total.toFixed(2)}
            </p>
            <div className="flex items-center gap-2">
              <input
                className="rounded border border-border bg-background p-2 text-sm"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder={tr("Reference (optional)", "संदर्भ (वैकल्पिक)")}
                aria-label={tr("Payment reference", "भुगतान संदर्भ")}
              />
              <select
                className="rounded border border-border bg-background p-2 text-sm"
                value={payMode}
                onChange={(e) => setPayMode(e.target.value)}
                aria-label={tr("Payment mode", "भुगतान माध्यम")}
              >
                {["CASH", "CARD", "UPI", "OTHER"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <Button variant="primary" disabled={saleBusy} onClick={() => void completeSale()}>
                {saleBusy
                  ? tr("Recording…", "दर्ज हो रहा है…")
                  : tr("Complete Sale", "बिक्री पूरी करें")}
              </Button>
            </div>
          </div>

          {saleError && (
            <p role="alert" className="mt-3 text-sm text-destructive">{saleError}</p>
          )}
        </Card>
      )}

      {receipt && (
        <Card className="border-success/30 bg-success/5">
          <div className="flex items-start gap-2">
            <ReceiptText className="mt-0.5 size-5 shrink-0 text-success" />
            <div>
              <p className="font-semibold">
                {tr("Sale recorded", "बिक्री दर्ज हुई")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("Receipt", "रसीद")}: <span className="font-mono">{receipt.id}</span> · ₹
                {receipt.total.toFixed(2)} · {receipt.mode}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tr(
                  "Written to pharmacy_sales / pharmacy_sale_receipts via p2_otc_sale and p2_payment.",
                  "p2_otc_sale और p2_payment द्वारा pharmacy_sales / pharmacy_sale_receipts में दर्ज।",
                )}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Privacy note */}
      <p className="text-xs text-muted-foreground italic">
        {tr(
          "Privacy: OTC sales do not create or access any patient health record.",
          "गोपनीयता: काउंटर बिक्री किसी भी मरीज़ के स्वास्थ्य रिकॉर्ड को नहीं बनाती या एक्सेस नहीं करती।",
        )}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 – Stock Receipt
// ═══════════════════════════════════════════════════════════════════════════════

function StockTab() {
  const { tr } = useCareLanguage();
  const { profile } = useAuth();

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
  const [isError, setIsError] = useState(false);
  const receiptAttempt = useRef<{ signature: string; key: string } | null>(null);

  // Inventory list state
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [invBusy, setInvBusy] = useState(true);
  const [invError, setInvError] = useState("");
  const [invVersion, setInvVersion] = useState(0);

  const [providerId, setProviderId] = useState<string | null>(null);

  // Resolve provider id
  useEffect(() => {
    if (!profile) return;
    void supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", profile.id)
      .single()
      .then(({ data }) => { if (data) setProviderId(data.id); });
  }, [profile]);

  // Fetch inventory list
  useEffect(() => {
    if (!providerId) return;
    let active = true;
    setInvBusy(true);
    void supabase
      .from("pharmacy_inventory")
      .select("id,medicine_name,strength,batch_number,expiry_date,quantity,selling_price,created_at,pharmacy_provider_id")
      .eq("pharmacy_provider_id", providerId)
      .order("expiry_date", { ascending: true })
      .limit(200)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setInvError(errorText(error)); }
        else { setInventory((data ?? []) as InventoryRow[]); }
        setInvBusy(false);
      });
    return () => { active = false; };
  }, [providerId, invVersion]);

  async function add() {
    const signature = JSON.stringify(form);
    if (receiptAttempt.current?.signature !== signature)
      receiptAttempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setMessage("");
    setIsError(false);
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
      setForm({ name: "", strength: "", batch: "", expiry: "", quantity: "", price: "" });
      setInvVersion((v) => v + 1);
    } catch (e) {
      setIsError(true);
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const fieldLabels: Record<keyof typeof form, { en: string; hi: string }> = {
    name: { en: "Medicine Name", hi: "दवा का नाम" },
    strength: { en: "Strength", hi: "ताकत" },
    batch: { en: "Batch Number", hi: "बैच नंबर" },
    expiry: { en: "Expiry Date", hi: "अंतिम तारीख" },
    quantity: { en: "Received Dispensing Units", hi: "मिली हुई मात्रा (इकाइयाँ)" },
    price: { en: "Selling Price per Unit (₹)", hi: "एक इकाई का बिक्री मूल्य (₹)" },
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <Card>
        <h2 className="mb-4 font-semibold text-base">
          {tr("Record Received Inventory", "मिली हुई दवाइयाँ दर्ज करें")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(form) as Array<keyof typeof form>).map((key) => (
            <label key={key} className="block text-sm">
              {tr(fieldLabels[key].en, fieldLabels[key].hi)}
              <input
                className="mt-1 w-full rounded border border-border bg-background p-2.5 text-sm"
                type={key === "expiry" ? "date" : key === "quantity" || key === "price" ? "number" : "text"}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="my-3 text-xs text-muted-foreground">
          {tr(
            "Record actual received stock in the same dispensing units as the prescription. No medicine substitution is permitted.",
            "दवाइयाँ उसी इकाई में दर्ज करें जिसमें पर्ची लिखी है। कोई दवा बदलना मना है।",
          )}
        </p>
        <Button disabled={busy} onClick={() => void add()}>
          {busy ? tr("Recording…", "दर्ज हो रहा है…") : tr("Record Stock", "दवाइयाँ दर्ज करें")}
        </Button>
        {message && (
          <p role="status" className={`mt-2 text-sm ${isError ? "text-destructive" : "text-success"}`}>
            {message}
          </p>
        )}
      </Card>

      {/* Inventory table */}
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-base">
            {tr("Current Inventory", "वर्तमान भण्डार")}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setInvVersion((v) => v + 1)}>
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {invError && <p className="text-sm text-destructive">{invError}</p>}

        {invBusy ? (
          <p className="text-sm text-muted-foreground">{tr("Loading…", "आ रहा है…")}</p>
        ) : inventory.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("No stock recorded yet.", "अभी कोई भण्डार दर्ज नहीं है।")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">{tr("Medicine", "दवा")}</th>
                  <th className="pb-2 pr-3 font-medium">{tr("Strength", "ताकत")}</th>
                  <th className="pb-2 pr-3 font-medium">{tr("Batch", "बैच")}</th>
                  <th className="pb-2 pr-3 font-medium">{tr("Expiry", "अंतिम तारीख")}</th>
                  <th className="pb-2 pr-3 font-medium">{tr("Qty", "मात्रा")}</th>
                  <th className="pb-2 pr-3 font-medium">{tr("Price/Unit", "मूल्य/इकाई")}</th>
                  <th className="pb-2 font-medium">{tr("Status", "स्थिति")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.map((row) => {
                  const expired = row.expiry_date < today;
                  const expiringSoon = !expired && row.expiry_date <= thirtyDaysLater;
                  const lowStock = row.quantity < 10;
                  return (
                    <tr key={row.id} className={expired ? "bg-destructive/5" : ""}>
                      <td className="py-2 pr-3 font-medium">{row.medicine_name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.strength ?? "—"}</td>
                      <td className="py-2 pr-3">{row.batch_number}</td>
                      <td className="py-2 pr-3">{row.expiry_date}</td>
                      <td className="py-2 pr-3">{row.quantity}</td>
                      <td className="py-2 pr-3">
                        {row.selling_price != null ? `₹${row.selling_price}` : "—"}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {expired && <Badge tone="danger">EXPIRED</Badge>}
                          {expiringSoon && !expired && (
                            <Badge tone="warning">{tr("Expiring soon", "जल्द खत्म")}</Badge>
                          )}
                          {lowStock && !expired && (
                            <Badge tone="warning">{tr("Low stock", "कम स्टॉक")}</Badge>
                          )}
                          {!expired && !expiringSoon && !lowStock && (
                            <Badge tone="success">{tr("OK", "ठीक")}</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 – Inventory Status
// ═══════════════════════════════════════════════════════════════════════════════

type MedicineSummary = {
  medicine_name: string;
  strength: string | null;
  totalUnits: number;
  expiringBatches: number;
  expiredBatches: number;
  lowStockBatches: number;
};

function InventoryTab() {
  const { tr } = useCareLanguage();
  const { profile } = useAuth();

  const [summaries, setSummaries] = useState<MedicineSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Resolve provider id
  useEffect(() => {
    if (!profile) return;
    void supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", profile.id)
      .single()
      .then(({ data }) => { if (data) setProviderId(data.id); });
  }, [profile]);

  useEffect(() => {
    if (!providerId) return;
    let active = true;
    setBusy(true);

    void supabase
      .from("pharmacy_inventory")
      .select("medicine_name,strength,quantity,expiry_date")
      .eq("pharmacy_provider_id", providerId)
      .limit(500)
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) { setError(errorText(e)); setBusy(false); return; }

        const today = new Date().toISOString().slice(0, 10);
        const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        // Group by medicine_name + strength
        const map = new Map<string, MedicineSummary>();
        for (const row of data ?? []) {
          const key = `${row.medicine_name}||${row.strength ?? ""}`;
          if (!map.has(key)) {
            map.set(key, {
              medicine_name: row.medicine_name,
              strength: row.strength,
              totalUnits: 0,
              expiringBatches: 0,
              expiredBatches: 0,
              lowStockBatches: 0,
            });
          }
          const s = map.get(key)!;
          s.totalUnits += row.quantity;
          if (row.expiry_date < today) s.expiredBatches += 1;
          else if (row.expiry_date <= thirtyDaysLater) s.expiringBatches += 1;
          if (row.quantity < 10) s.lowStockBatches += 1;
        }

        // Sort: expired first, then expiring, then low stock, then rest
        const sorted = [...map.values()].sort((a, b) => {
          const scoreA = (a.expiredBatches > 0 ? 3 : 0) + (a.expiringBatches > 0 ? 2 : 0) + (a.lowStockBatches > 0 ? 1 : 0);
          const scoreB = (b.expiredBatches > 0 ? 3 : 0) + (b.expiringBatches > 0 ? 2 : 0) + (b.lowStockBatches > 0 ? 1 : 0);
          return scoreB - scoreA;
        });

        setSummaries(sorted);
        setBusy(false);
      });

    return () => { active = false; };
  }, [providerId, version]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{tr("Inventory Status", "भण्डार की स्थिति")}</h2>
        <Button variant="outline" size="sm" onClick={() => setVersion((v) => v + 1)}>
          <RefreshCw className="size-4" />
          {tr("Refresh", "नई जानकारी")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {busy ? (
        <p className="text-sm text-muted-foreground">{tr("Loading inventory…", "भण्डार आ रहा है…")}</p>
      ) : summaries.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-muted-foreground">
            {tr("No inventory recorded.", "कोई भण्डार दर्ज नहीं है।")}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => {
            const hasExpired = s.expiredBatches > 0;
            const hasExpiring = s.expiringBatches > 0;
            const hasLow = s.lowStockBatches > 0;
            return (
              <Card
                key={`${s.medicine_name}||${s.strength ?? ""}`}
                className={hasExpired ? "border-destructive/40" : ""}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{s.medicine_name}</p>
                      {s.strength && (
                        <p className="text-xs text-muted-foreground">{s.strength}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {hasExpired && <Badge tone="danger">EXPIRED</Badge>}
                      {hasExpiring && <Badge tone="warning">{tr("Expiring", "खत्म होने वाला")}</Badge>}
                      {hasLow && !hasExpired && <Badge tone="warning">{tr("Low", "कम")}</Badge>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{s.totalUnits}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {tr("Total Units", "कुल इकाइयाँ")}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${s.expiringBatches > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>
                        {s.expiringBatches}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {tr("Expiring", "खत्म होने वाले")}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className={`text-lg font-bold ${s.expiredBatches > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {s.expiredBatches}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {tr("Expired", "एक्सपायर्ड")}
                      </p>
                    </div>
                  </div>

                  {hasExpired && (
                    <div className="flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {tr("Remove expired batches from shelf immediately.", "एक्सपायर्ड बैच तुरंत हटाएँ।")}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reorder: TruthfulEmptyState */}
      <TruthfulEmptyState
        title={tr("Automated Reorder Not Available", "स्वचालित पुनः-ऑर्डर उपलब्ध नहीं")}
        description={tr(
          "Automated reorder is not configured.",
          "स्वचालित पुनः-ऑर्डर और खरीद एकीकरण के लिए बैकएंड टेबल अभी मौजूद नहीं है।",
        )}
        schemaContractNotice={
          "public.pharmacy_reorder_requests (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  pharmacy_provider_id uuid REFERENCES provider_profiles(id),\n  medicine_name text NOT NULL,\n  strength text,\n  requested_quantity int NOT NULL,\n  status text NOT NULL DEFAULT 'pending',\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n-- Not yet implemented."
        }
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5 – Copilot Assistant
// ═══════════════════════════════════════════════════════════════════════════════

function AssistantTab() {
  const { tr } = useCareLanguage();
  const [selectedTool, setSelectedTool] = useState<"get_low_stock" | "get_expiry" | "get_inventory" | "get_purchases" | "get_sales_summary" | null>(null);
  const [toolData, setToolData] = useState<Record<string, unknown>[] | null>(null);
  const [toolMetadata, setToolMetadata] = useState<any>(null);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolError, setToolError] = useState("");

  const runRoleTool = async (name: "get_low_stock" | "get_expiry" | "get_inventory" | "get_purchases" | "get_sales_summary") => {
    setSelectedTool(name);
    setToolLoading(true);
    setToolError("");
    setToolData(null);
    setToolMetadata(null);
    try {
      const { data, error: err } = await supabase.rpc("a3_tool", {
        p_tool: name,
        p_scope: {},
      });
      if (err) {
        setToolError(err.message);
      } else {
        const payload = Array.isArray(data) ? data : (data as any)?.data || [];
        setToolData(Array.isArray(payload) ? (payload as Record<string, unknown>[]) : []);
        setToolMetadata(data && !Array.isArray(data) ? data : null);
      }
    } catch (e: unknown) {
      setToolError((e as Error)?.message || "Failed to query operational tool");
    } finally {
      setToolLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {tr("Pharmacy Assistant", "फार्मेसी सहायक")}
      </h2>

      {/* Governed Operational Tool Queries (032 a3_tool) */}
      <Card className="space-y-3">
        <div className="flex items-start gap-2">
          <Bot className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">
              {tr("Pharmacy records assistant", "प्रशासित भूमिका सहायक (032 a3_tool)")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tr(
                "Bounded provider-scoped operational records. No figures are estimated.",
                "सीमित प्रदाता-स्तरीय परिचालन रिकॉर्ड। कोई आंकड़ा अनुमानित नहीं है।"
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button
            variant={selectedTool === "get_low_stock" ? "primary" : "outline"}
            size="sm"
            onClick={() => void runRoleTool("get_low_stock")}
            disabled={toolLoading}
          >
            {tr("Low Stock (0 Qty)", "स्टॉक समाप्त")}
          </Button>
          <Button
            variant={selectedTool === "get_expiry" ? "primary" : "outline"}
            size="sm"
            onClick={() => void runRoleTool("get_expiry")}
            disabled={toolLoading}
          >
            {tr("Expiring (30d / Unknown)", "जल्द समाप्त")}
          </Button>
          <Button
            variant={selectedTool === "get_inventory" ? "primary" : "outline"}
            size="sm"
            onClick={() => void runRoleTool("get_inventory")}
            disabled={toolLoading}
          >
            {tr("Inventory Snapshot", "भण्डार स्नैपशॉट")}
          </Button>
          <Button
            variant={selectedTool === "get_purchases" ? "primary" : "outline"}
            size="sm"
            onClick={() => void runRoleTool("get_purchases")}
            disabled={toolLoading}
          >
            {tr("Purchases (p3)", "खरीद रसीदें")}
          </Button>
          <Button
            variant={selectedTool === "get_sales_summary" ? "primary" : "outline"}
            size="sm"
            onClick={() => void runRoleTool("get_sales_summary")}
            disabled={toolLoading}
          >
            {tr("Sales Ledger (p2)", "बिक्री बहीखाता")}
          </Button>
        </div>

        {toolError && (
          <p role="alert" className="text-xs text-destructive">
            {toolError}
          </p>
        )}

        {toolLoading && (
          <p className="text-xs text-muted-foreground">
            {tr("Executing role tool query…", "टूल निष्पादित किया जा रहा है…")}
          </p>
        )}

        {!toolLoading && toolData && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{selectedTool}</span>
              <Badge tone={toolData.length > 0 ? "teal" : "neutral"}>
                {toolData.length} records
              </Badge>
            </div>
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {tr("No records returned for this scope.", "इस दायरे के लिए कोई रिकॉर्ड नहीं मिला।")}
              </p>
            ) : (
              <pre className="text-[11px] bg-muted/50 p-2.5 rounded font-mono overflow-auto max-h-60">
                {JSON.stringify(toolData, null, 2)}
              </pre>
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
                    <span className="font-semibold">Uncertainty: </span>
                    <span>{toolMetadata.uncertainty}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/*
        SwasthyaCopilot is designed for patient-scoped queries (patientId: string).
        For pharmacy/inventory queries, patientId is not applicable.
        We pass an empty string so the component renders; the edge function will
        handle the pharmacy workflow context.
        Workflow is constrained to existing union — 'CARE_HISTORY' is the closest
        general-purpose value. PHARMACY_INVENTORY is not yet a recognised workflow.
      */}
      <SwasthyaCopilot
        patientId=""
        workflow="CARE_HISTORY"
        title={tr("Pharmacy Assistant / फार्मेसी सहायक", "फार्मेसी सहायक")}
        subtitle={tr(
          "Ask about inventory, expiry, or dispensing patterns.",
          "भण्डार, अंतिम तारीख या वितरण के बारे में पूछें।",
        )}
        suggestions={[
          "Check expiring stock this month",
          "Which medicines are out of stock?",
          "इस महीने कौन सी दवाइयाँ खत्म होने वाली हैं?",
        ]}
      />
    </div>
  );
}
