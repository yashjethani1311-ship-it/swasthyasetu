import { useEffect, useState } from "react";
import {
  FlaskConical,
  Image as ImageIcon,
  Stethoscope,
  Search,
  Info,
  AlertCircle,
  AlertTriangle
} from "lucide-react";
import { Badge, Card, Button } from "@/components/kit";
import { supabase } from "@/lib/supabase";

export interface MasterDiagnosticTest {
  id?: string;
  test_name: string;
  test_code: string;
  category: "PATHOLOGY" | "IMAGING" | "PROCEDURE";
  specimen_type?: string;
  container_type?: string;
  fasting_required?: boolean;
  preparation_instructions?: string;
  turnaround_time?: string;
  methodology?: string;
  unit?: string;
  reference_rule?: string;
  source_name?: string;
  source_version?: string;
}

export const MASTER_DIAGNOSTIC_CATALOG: MasterDiagnosticTest[] = [
  // PATHOLOGY
  {
    test_name: "Complete Blood Count (CBC) with ESR",
    test_code: "PATH-CBC-01",
    category: "PATHOLOGY",
    specimen_type: "Whole Blood (2 mL)",
    container_type: "EDTA Tube (Lavender Top)",
    fasting_required: false,
    preparation_instructions: "No fasting required. Avoid strenuous exercise prior to collection.",
    turnaround_time: "4-6 Hours"
  },
  {
    test_name: "Fasting Blood Sugar (FBS)",
    test_code: "PATH-GLU-01",
    category: "PATHOLOGY",
    specimen_type: "Fluoride Plasma (2 mL)",
    container_type: "Sodium Fluoride Tube (Grey Top)",
    fasting_required: true,
    preparation_instructions: "Strict overnight fasting of 8-10 hours. Only plain water permitted.",
    turnaround_time: "2-4 Hours"
  },
  {
    test_name: "Post Prandial Blood Sugar (PPBS)",
    test_code: "PATH-GLU-02",
    category: "PATHOLOGY",
    specimen_type: "Fluoride Plasma (2 mL)",
    container_type: "Sodium Fluoride Tube (Grey Top)",
    fasting_required: false,
    preparation_instructions: "Sample collected exactly 2 hours after completion of meal.",
    turnaround_time: "2-4 Hours"
  },
  {
    test_name: "HbA1c (Glycated Hemoglobin)",
    test_code: "PATH-HBA1C-01",
    category: "PATHOLOGY",
    specimen_type: "Whole Blood (2 mL)",
    container_type: "EDTA Tube (Lavender Top)",
    fasting_required: false,
    preparation_instructions: "No fasting required. Measured by HPLC methodology.",
    turnaround_time: "6 Hours"
  },
  {
    test_name: "Lipid Profile Comprehensive",
    test_code: "PATH-LIPID-01",
    category: "PATHOLOGY",
    specimen_type: "Serum (3 mL)",
    container_type: "SST Gel / Plain Clot Activator (Yellow / Red Top)",
    fasting_required: true,
    preparation_instructions: "Strict 10-12 hours overnight fasting required. Avoid alcohol for 24 hours.",
    turnaround_time: "6-8 Hours"
  },
  {
    test_name: "Liver Function Tests (LFT)",
    test_code: "PATH-LFT-01",
    category: "PATHOLOGY",
    specimen_type: "Serum (3 mL)",
    container_type: "SST Gel Tube (Yellow Top)",
    fasting_required: true,
    preparation_instructions: "Overnight fasting of 8 hours recommended.",
    turnaround_time: "6-8 Hours"
  },
  {
    test_name: "Kidney Function Tests (KFT / RFT with Electrolytes)",
    test_code: "PATH-KFT-01",
    category: "PATHOLOGY",
    specimen_type: "Serum (3 mL)",
    container_type: "SST Gel Tube (Yellow Top)",
    fasting_required: false,
    preparation_instructions: "Adequate hydration recommended. Document any concurrent diuretic use.",
    turnaround_time: "6-8 Hours"
  },
  {
    test_name: "Thyroid Stimulating Hormone (TSH, Ultrasensitive)",
    test_code: "PATH-TSH-01",
    category: "PATHOLOGY",
    specimen_type: "Serum (2 mL)",
    container_type: "SST Gel Tube (Yellow Top)",
    fasting_required: false,
    preparation_instructions: "Early morning fasting sample preferred for baseline consistency.",
    turnaround_time: "6-12 Hours"
  },
  {
    test_name: "Urine Routine and Microscopic Examination",
    test_code: "PATH-URN-01",
    category: "PATHOLOGY",
    specimen_type: "Clean-Catch Midstream Urine (20 mL)",
    container_type: "Sterile Urine Container",
    fasting_required: false,
    preparation_instructions: "First morning midstream sample preferred. Proper perineal cleansing prior to voiding.",
    turnaround_time: "2-4 Hours"
  },
  {
    test_name: "Serum Creatinine",
    test_code: "PATH-CREAT-01",
    category: "PATHOLOGY",
    specimen_type: "Serum (2 mL)",
    container_type: "SST Gel Tube (Yellow Top)",
    fasting_required: false,
    preparation_instructions: "Avoid heavy meat intake or creatine supplements for 24 hours.",
    turnaround_time: "2-4 Hours"
  },

  // IMAGING
  {
    test_name: "Chest Radiograph (X-Ray Chest PA View)",
    test_code: "IMG-XR-CHEST-PA",
    category: "IMAGING",
    specimen_type: "None (Diagnostic Radiography)",
    container_type: "Digital Radiography / Computed Radiography",
    fasting_required: false,
    preparation_instructions: "Remove all metallic objects, necklaces, and jewelry prior to examination. Pregnancy check mandatory for female patients of reproductive age.",
    turnaround_time: "1-2 Hours"
  },
  {
    test_name: "Ultrasound Whole Abdomen (USG Abdomen & Pelvis)",
    test_code: "IMG-USG-ABD-PELV",
    category: "IMAGING",
    specimen_type: "None (Ultrasonography)",
    container_type: "High-Resolution Ultrasound Transducer",
    fasting_required: true,
    preparation_instructions: "Fasting for 6-8 hours for gallbladder evaluation. Full urinary bladder required for pelvis evaluation (drink 1L water 1 hour prior and avoid voiding).",
    turnaround_time: "2-4 Hours"
  },
  {
    test_name: "Computed Tomography Brain (CT Brain Plain)",
    test_code: "IMG-CT-BRAIN-NC",
    category: "IMAGING",
    specimen_type: "None (Computed Tomography)",
    container_type: "Multi-Slice CT Scanner",
    fasting_required: false,
    preparation_instructions: "Remove metallic hairpins, hearing aids, and dental prostheses. Fasting of 4 hours required only if contrast enhancement might be requested.",
    turnaround_time: "2-4 Hours"
  },
  {
    test_name: "Magnetic Resonance Imaging Lumbar Spine (MRI L-Spine)",
    test_code: "IMG-MRI-LSPINE",
    category: "IMAGING",
    specimen_type: "None (Magnetic Resonance)",
    container_type: "1.5T / 3T MRI System",
    fasting_required: false,
    preparation_instructions: "Strict screening for ferromagnetic implants, cardiac pacemakers, or metallic foreign bodies. Inform technologist of claustrophobia.",
    turnaround_time: "4-6 Hours"
  },

  // PROCEDURE
  {
    test_name: "12-Lead Electrocardiogram (ECG / EKG)",
    test_code: "PROC-ECG-12L",
    category: "PROCEDURE",
    specimen_type: "None (Physiological Signal)",
    container_type: "Diagnostic 12-Lead Electrocardiograph",
    fasting_required: false,
    preparation_instructions: "Rest quietly for 5 minutes prior to recording. Avoid applying oily lotions to chest on the morning of test.",
    turnaround_time: "Immediate / 30 Minutes"
  },
  {
    test_name: "Echocardiography (2D Echo with Doppler)",
    test_code: "PROC-ECHO-2D",
    category: "PROCEDURE",
    specimen_type: "None (Cardiovascular Ultrasound)",
    container_type: "Echocardiography Ultrasound System",
    fasting_required: false,
    preparation_instructions: "No special dietary restrictions. Wear comfortable loose two-piece clothing.",
    turnaround_time: "1-2 Hours"
  },
  {
    test_name: "Spirometry / Pulmonary Function Test (PFT)",
    test_code: "PROC-PFT-SPIRO",
    category: "PROCEDURE",
    specimen_type: "None (Physiological Expiratory Flow)",
    container_type: "Computerized Diagnostic Spirometer",
    fasting_required: false,
    preparation_instructions: "Withhold short-acting bronchodilators for 6 hours if instructed by physician. Avoid smoking or heavy meals for 2 hours prior to test.",
    turnaround_time: "1-2 Hours"
  }
];

export interface DiagnosticMasterPickerProps {
  onSelect: (test: MasterDiagnosticTest) => void;
  selectedCategory?: "PATHOLOGY" | "IMAGING" | "PROCEDURE";
  disabled?: boolean;
  compact?: boolean;
  demoMode?: boolean;
}

export function DiagnosticMasterPicker({
  onSelect,
  selectedCategory,
  disabled,
  compact = false,
  demoMode = false
}: DiagnosticMasterPickerProps) {
  const [category, setCategory] = useState<"PATHOLOGY" | "IMAGING" | "PROCEDURE">(
    selectedCategory || "PATHOLOGY"
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MasterDiagnosticTest[]>([]);
  const [isDemoActive, setIsDemoActive] = useState(demoMode);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (selectedCategory) {
      setCategory(selectedCategory);
    }
  }, [selectedCategory]);

  useEffect(() => {
    const q = query.trim();
    setSearching(true);
    setCatalogUnavailable(false);

    const timer = setTimeout(async () => {
      // 1. Explicit Demo Mode: Inspect local seed catalog only
      if (isDemoActive) {
        let filtered = MASTER_DIAGNOSTIC_CATALOG.filter((t) => t.category === category);
        if (q) {
          const lowerQ = q.toLowerCase();
          filtered = filtered.filter(
            (t) =>
              t.test_name.toLowerCase().includes(lowerQ) ||
              t.test_code.toLowerCase().includes(lowerQ) ||
              (t.specimen_type && t.specimen_type.toLowerCase().includes(lowerQ))
          );
        }
        setResults(filtered);
        setSearching(false);
        return;
      }

      // 2. Normal / Live Mode: Query 046 k2_diagnostics backend RPC
      try {
        const { data, error: rpcErr } = await supabase.rpc("k2_diagnostics", {
          p_query: q,
          p_category: category,
          p_include_demo: false,
          p_limit: 30
        });

        if (rpcErr) {
          setCatalogUnavailable(true);
          setResults([]);
          setSearching(false);
          return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        setNotice(data?.notice || "");

        const mapped: MasterDiagnosticTest[] = items.map((row: any) => ({
          id: row.id,
          test_name: row.name,
          test_code: row.source_code,
          category: row.category,
          specimen_type: row.specimen_type || undefined,
          container_type: row.container || undefined,
          fasting_required: Boolean(row.preparation && row.preparation.toLowerCase().includes("fasting")),
          preparation_instructions: row.preparation || undefined,
          turnaround_time: row.turnaround || undefined,
          methodology: row.methodology || undefined,
          unit: row.unit || undefined,
          reference_rule: row.reference_rule || undefined,
          source_name: row.source_name,
          source_version: row.source_version
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
  }, [category, query, isDemoActive]);

  return (
    <div className="space-y-3">
      {/* Category Tabs & Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex rounded-lg bg-secondary/60 p-1 border border-border">
          <button
            type="button"
            onClick={() => setCategory("PATHOLOGY")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              category === "PATHOLOGY" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FlaskConical className="size-3.5 text-amber-500" />
            Pathology (Lab)
          </button>
          <button
            type="button"
            onClick={() => setCategory("IMAGING")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              category === "IMAGING" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ImageIcon className="size-3.5 text-blue-500" />
            Imaging (Radiology)
          </button>
          <button
            type="button"
            onClick={() => setCategory("PROCEDURE")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              category === "PROCEDURE" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Stethoscope className="size-3.5 text-teal-500" />
            Procedures / ECG
          </button>
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

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="Search investigation by name, code or specimen (e.g. CBC, USG, ECG, Fasting)…"
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs focus:border-primary focus:outline-hidden disabled:opacity-60"
        />
      </div>

      {catalogUnavailable && !isDemoActive && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 shrink-0" />
            <span>Diagnostic catalog is currently unavailable.</span>
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

      {/* Catalog items list */}
      <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-lg border border-border bg-surface-subtle/20">
        {searching ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Searching diagnostic catalog (046 k2_diagnostics)…</p>
        ) : catalogUnavailable && !isDemoActive ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Diagnostic catalog is currently unavailable.</p>
            <p className="mt-1">You can enter test details manually or toggle Demo Seed Mode for testing.</p>
          </div>
        ) : results.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">No investigation matching search criteria.</p>
        ) : (
          results.map((t) => (
            <button
              key={t.test_code}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(t)}
              className="w-full text-left p-3 hover:bg-primary/5 transition flex items-start justify-between gap-3 group"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs text-foreground">{t.test_name}</span>
                  <Badge tone="outline" className="font-mono text-[10px] py-0">
                    {t.test_code}
                  </Badge>
                  <Badge
                    tone={t.category === "PATHOLOGY" ? "warning" : t.category === "IMAGING" ? "info" : "success"}
                    className="text-[9px] py-0"
                  >
                    {t.category}
                  </Badge>
                  {t.fasting_required && (
                    <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded font-semibold">
                      Fasting Required
                    </span>
                  )}
                  {t.source_name && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
                      {t.source_name}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  {t.category === "PATHOLOGY" ? (
                    <p>
                      <strong>Specimen:</strong> {t.specimen_type || "Standard"} · <strong>Container:</strong> {t.container_type || "Standard Tube"}
                    </p>
                  ) : (
                    <p>
                      <strong>Equipment / Modality:</strong> {t.container_type || t.category}
                    </p>
                  )}
                  {t.preparation_instructions && (
                    <p className="line-clamp-1 italic text-[10px]">
                      Prep: {t.preparation_instructions}
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-primary opacity-0 group-hover:opacity-100 transition text-xs font-semibold self-center">
                Select
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
        <span>
          {isDemoActive
            ? "Demo diagnostic catalog · Sample seed test directory (Not a complete national master)"
            : "Live Database Catalog (046 k2_diagnostics)"}
        </span>
        <span>Diagnostic Master != Lab Capability (governed by facility r3_capability)</span>
      </div>
    </div>
  );
}
