import { useEffect, useState } from "react";
import { Pill, Search, Check, Sparkles, Filter, Database, AlertTriangle, Info } from "lucide-react";
import { Badge, Card, Button } from "@/components/kit";
import { supabase } from "@/lib/supabase";

export interface MasterMedicine {
  id?: string;
  medicine_name: string;
  generic_composition: string;
  brand_name?: string;
  strength: string;
  dosage_form: string;
  route: string;
  common_frequencies?: string[];
  schedule_class?: string;
  source_name?: string;
  source_version?: string;
  assurance?: string;
}

// Demo seed catalog — not a complete national medicine database
export const INDIAN_MEDICINE_MASTER: MasterMedicine[] = [
  {
    medicine_name: "Paracetamol",
    generic_composition: "Paracetamol",
    brand_name: "Crocin / Dolo",
    strength: "650 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["TDS (Three times daily)", "SOS (As needed)", "BD (Twice daily)"],
    schedule_class: "OTC"
  },
  {
    medicine_name: "Paracetamol",
    generic_composition: "Paracetamol",
    brand_name: "Calpol",
    strength: "500 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["TDS (Three times daily)", "SOS (As needed)"],
    schedule_class: "OTC"
  },
  {
    medicine_name: "Amoxicillin and Potassium Clavulanate",
    generic_composition: "Amoxicillin (500mg) + Clavulanic Acid (125mg)",
    brand_name: "Augmentin / Clavam",
    strength: "625 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["BD (Twice daily for 5 days)", "TDS (Three times daily)"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Azithromycin",
    generic_composition: "Azithromycin",
    brand_name: "Azee / Azithral",
    strength: "500 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD (Once daily for 3-5 days)"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Metformin",
    generic_composition: "Metformin Hydrochloride",
    brand_name: "Glycomet",
    strength: "500 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD after breakfast", "BD after meals"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Amlodipine",
    generic_composition: "Amlodipine Besylate",
    brand_name: "Amlong / Stamlo",
    strength: "5 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD morning"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Telmisartan",
    generic_composition: "Telmisartan",
    brand_name: "Telma",
    strength: "40 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD morning"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Pantoprazole",
    generic_composition: "Pantoprazole Sodium",
    brand_name: "Pan 40 / Pantocid",
    strength: "40 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD empty stomach (before breakfast)"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Omeprazole",
    generic_composition: "Omeprazole",
    brand_name: "Omez",
    strength: "20 mg",
    dosage_form: "CAPSULE",
    route: "ORAL",
    common_frequencies: ["OD empty stomach"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Cetirizine",
    generic_composition: "Cetirizine Dihydrochloride",
    brand_name: "Cetzine / Alerid",
    strength: "10 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD at bedtime"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Montelukast and Levocetirizine",
    generic_composition: "Montelukast (10mg) + Levocetirizine (5mg)",
    brand_name: "Montek-LC / Telekast-L",
    strength: "10 mg + 5 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD at bedtime"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Ibuprofen and Paracetamol",
    generic_composition: "Ibuprofen (400mg) + Paracetamol (325mg)",
    brand_name: "Combiflam",
    strength: "400 mg + 325 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["BD after food", "SOS for pain"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "ORS (Oral Rehydration Salts)",
    generic_composition: "Sodium Chloride, Potassium Chloride, Sodium Citrate, Dextrose",
    brand_name: "Electral",
    strength: "21.8 g sachet in 1L water",
    dosage_form: "POWDER_FOR_SOLUTION",
    route: "ORAL",
    common_frequencies: ["Freely as replacement for fluid loss"],
    schedule_class: "OTC"
  },
  {
    medicine_name: "Salbutamol Inhaler",
    generic_composition: "Salbutamol Sulfate",
    brand_name: "Asthalin",
    strength: "100 mcg/puff",
    dosage_form: "INHALER",
    route: "INHALATION",
    common_frequencies: ["2 puffs SOS during acute wheezing / breathlessness"],
    schedule_class: "SCHEDULE_H"
  },
  {
    medicine_name: "Atorvastatin",
    generic_composition: "Atorvastatin Calcium",
    brand_name: "Atorva / Storvas",
    strength: "10 mg",
    dosage_form: "TABLET",
    route: "ORAL",
    common_frequencies: ["OD at bedtime"],
    schedule_class: "SCHEDULE_H"
  }
];

export interface MedicineMasterPickerProps {
  onSelect: (medicine: MasterMedicine) => void;
  disabled?: boolean;
  compact?: boolean;
  demoMode?: boolean;
}

export function MedicineMasterPicker({
  onSelect,
  disabled,
  compact = false,
  demoMode = false
}: MedicineMasterPickerProps) {
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState<string>("ALL");
  const [results, setResults] = useState<MasterMedicine[]>([]);
  const [searching, setSearching] = useState(false);
  const [isDemoActive, setIsDemoActive] = useState(demoMode);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const q = query.trim();
    setSearching(true);
    setCatalogUnavailable(false);

    const timer = setTimeout(async () => {
      // 1. Explicit Demo Mode: Inspect local seed catalog only
      if (isDemoActive) {
        let filtered = INDIAN_MEDICINE_MASTER;
        if (formFilter !== "ALL") {
          filtered = filtered.filter((m) => m.dosage_form === formFilter);
        }
        if (q) {
          const lowerQ = q.toLowerCase();
          filtered = filtered.filter(
            (m) =>
              m.medicine_name.toLowerCase().includes(lowerQ) ||
              m.generic_composition.toLowerCase().includes(lowerQ) ||
              (m.brand_name && m.brand_name.toLowerCase().includes(lowerQ))
          );
        }
        setResults(filtered);
        setSearching(false);
        return;
      }

      // 2. Normal / Live Mode: Query 045 k1_medicines backend RPC
      try {
        const params: Record<string, any> = {
          p_query: q,
          p_include_demo: false,
          p_limit: 30
        };

        if (formFilter !== "ALL") {
          params.p_form = formFilter;
        }

        const { data, error: rpcErr } = await supabase.rpc("k1_medicines", params);

        if (rpcErr) {
          // Medicine Master (045 k1_medicines) is strictly decoupled from pharmacy inventory (p2_search_medicines)
          // When the master catalog is unavailable, display truthful unavailable state; never silent fallback to demo seed or local pharmacy inventory.
          setCatalogUnavailable(true);
          setResults([]);
          setSearching(false);
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        setNotice(data?.notice || "");

        const mapped: MasterMedicine[] = items.map((row: any) => ({
          id: row.id,
          medicine_name: row.generic_name,
          generic_composition: row.composition || row.generic_name,
          brand_name: row.brand_name || undefined,
          strength: row.strength || "Standard",
          dosage_form: row.dosage_form || "TABLET",
          route: row.route || "ORAL",
          schedule_class: row.regulatory_classification || undefined,
          source_name: row.source_name,
          source_version: row.source_version,
          assurance: row.assurance
        }));

        setResults(mapped);
      } catch (err) {
        // Never silently fall back to demo seed in normal/live mode!
        setCatalogUnavailable(true);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, formFilter, isDemoActive]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder="Search Medicine Catalog (Generic composition, Brand name e.g. Paracetamol, Augmentin)…"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-1 text-xs">
          <Filter className="size-3.5 text-muted-foreground" />
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
          >
            <option value="ALL">All Forms</option>
            <option value="TABLET">Tablet</option>
            <option value="SYRUP">Syrup</option>
            <option value="INHALER">Inhaler</option>
            <option value="POWDER_FOR_SOLUTION">Powder / ORS</option>
          </select>
        </div>

        <Button
          size="sm"
          variant={isDemoActive ? "subtle" : "outline"}
          onClick={() => setIsDemoActive(!isDemoActive)}
          className="text-xs"
        >
          {isDemoActive ? "Exit Demo Seed" : "Demo Seed Mode"}
        </Button>
      </div>

      {catalogUnavailable && !isDemoActive && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span>Medicine catalog is currently unavailable.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsDemoActive(true)}
            className="text-[11px] h-7"
          >
            Switch to Demo Seed
          </Button>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-surface-subtle/30">
        {searching ? (
          <p className="p-3 text-center text-xs text-muted-foreground">Searching medicine catalog (045 k1_medicines)…</p>
        ) : catalogUnavailable && !isDemoActive ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Medicine catalog is currently unavailable.</p>
            <p className="mt-1">You can type medicine details manually or toggle Demo Seed Mode for testing.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            <p className="font-medium text-foreground">No catalog match found</p>
            <p className="mt-1">You can type the medicine details manually in the prescription form.</p>
          </div>
        ) : (
          results.map((m, idx) => (
            <button
              key={`${m.medicine_name}-${m.strength}-${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(m)}
              className="w-full text-left p-2.5 hover:bg-primary/5 transition flex items-center justify-between gap-3 group"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-xs text-foreground">{m.medicine_name}</span>
                  <Badge tone="outline" className="text-[10px] py-0 px-1.5">
                    {m.strength}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">[{m.dosage_form}]</span>
                  {m.schedule_class && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                      {m.schedule_class}
                    </span>
                  )}
                  {m.source_name && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground">
                      {m.source_name} {m.source_version ? `v${m.source_version}` : ""}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  <span className="font-medium text-foreground/80">Generic:</span> {m.generic_composition}
                  {m.brand_name && (
                    <> · <span className="font-medium text-foreground/80">Brands:</span> {m.brand_name}</>
                  )}
                </p>
              </div>

              <div className="shrink-0 flex items-center text-primary opacity-0 group-hover:opacity-100 transition text-xs font-semibold">
                <span>Select</span>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
        <span className="flex items-center gap-1">
          <Pill className="size-3 text-primary" />
          {isDemoActive ? (
            <span className="text-warning-foreground font-semibold">Demo seed catalog — not a complete national medicine database</span>
          ) : (
            <span className="text-teal-700 font-medium">Live Database Catalog (045 k1_medicines)</span>
          )}
        </span>
        <span>Medicine Master != Pharmacy Inventory (stock &amp; batches resolved at pharmacy)</span>
      </div>
    </div>
  );
}
