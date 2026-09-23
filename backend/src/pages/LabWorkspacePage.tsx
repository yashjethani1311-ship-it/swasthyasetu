import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/kit";
import {
  DestinationPicker,
  type Destination,
} from "@/components/DestinationPicker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  errorText,
  rpc,
  resultOf,
  observationsOf,
  downloadReport,
  type Order,
  type Parameter,
  type Result,
} from "@/lib/diagnostics/service";
import { importMachine, type ImportResult } from "@/lib/diagnostics/adapters";
import { reportPdf } from "@/lib/diagnostics/report";
export function LabWorkspacePage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"LAB" | "CENTRE">(
    profile?.role === "FACILITY" ? "CENTRE" : "LAB",
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const [labName, setLabName] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setOrders([]);
    void (async () => {
      try {
        if (tab === "CENTRE") {
          const data = await rpc<Order[]>("p0_collection_queue", {
            p_offset: offset,
          });
          if (active) setOrders(data);
        } else {
          const { data: p, error: e } = await supabase
            .from("provider_profiles")
            .select("id,organization_name,full_name")
            .eq("user_id", profile?.id ?? "")
            .single();
          if (e) throw e;
          if (active) setLabName(p.organization_name || p.full_name);
          const { data, error: q } = await supabase
            .from("lab_orders")
            .select(
              "id,patient_id,test_name,diagnostic_test_id,clinical_note,status,ordered_at,lab_provider_id,collection_centre_id,routing_status,lab_specimens(id,sample_code,status,created_at,rejection_reason),lab_results(id,status,result_json,verified_at,doctor_reviewed_at,report_storage_path,created_at)",
            )
            .eq("lab_provider_id", p.id)
            .order("ordered_at", { ascending: false })
            .order("id")
            .range(offset, offset + 19);
          if (q) throw q;
          if (active) setOrders(data as unknown as Order[]);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id, offset, tab, version]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">
        {tab === "LAB" ? "Laboratory workspace" : "Sample collection workspace"}
      </h1>
      <p className="text-muted-foreground">
        Only work selected for your laboratory or authorized collection centre
        appears here.
      </p>
      {profile?.role === "LAB" && (
        <div className="flex gap-2">
          {(["LAB", "CENTRE"] as const).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "primary" : "outline"}
              onClick={() => {
                setTab(t);
                setOffset(0);
              }}
            >
              {t === "LAB" ? "Laboratory" : "Collection centres"}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        onClick={() => setVersion((v) => v + 1)}
        disabled={busy}
      >
        Refresh
      </Button>
      {busy ? (
        <p role="status">Loading authorized work…</p>
      ) : orders.length ? (
        orders.map((o) => (
          <OrderWork
            key={o.id}
            order={o}
            centre={tab === "CENTRE"}
            labName={labName}
            refresh={() => setVersion((v) => v + 1)}
          />
        ))
      ) : (
        !error && (
          <Card>
            No authorized orders found. Patients must select a destination
            first.
          </Card>
        )
      )}
      <div className="flex gap-3">
        <Button
          disabled={busy || !offset}
          variant="outline"
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous
        </Button>
        <Button
          disabled={busy || orders.length < 20}
          variant="outline"
          onClick={() => setOffset(offset + 20)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
function OrderWork({
  order,
  centre,
  labName,
  refresh,
}: {
  order: Order;
  centre: boolean;
  labName: string;
  refresh: () => void;
}) {
  const specimen = order.lab_specimens?.[0];
  const result = resultOf(order);
  const [sample, setSample] = useState("");
  const [note, setNote] = useState("");
  const [transporter, setTransporter] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [destination, setDestination] = useState<Destination | null>(null);
  const [identity, setIdentity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function step(action: string) {
    setBusy(true);
    setError("");
    try {
      await rpc("p0_specimen_step", {
        p_order: order.id,
        p_action: action,
        p_sample: sample,
        p_lab: destination?.provider_id ?? null,
        p_note: note,
        p_transporter: transporter,
        p_vehicle: vehicle,
      });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const active = !["COMPLETED", "CANCELLED"].includes(order.status);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="text-xl font-semibold">{order.test_name}</h2>
        <Badge>{specimen?.status ?? order.status}</Badge>
      </div>
      <p className="break-all text-sm">
        Order: {order.id} · {new Date(order.ordered_at).toLocaleString()}
      </p>
      {"patient_code" in order && (
        <p>
          {String(order.patient_code)} ·{" "}
          {"full_name" in order ? String(order.full_name ?? "") : ""}
        </p>
      )}
      {error && (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      )}
      {!specimen && active && (
        <>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={identity}
              onChange={(e) => setIdentity(e.target.checked)}
            />
            I checked the patient's identity and this authorized order before
            collecting the sample.
          </label>
          <Button
            disabled={
              busy ||
              !identity ||
              (!centre && !!order.collection_centre_id) ||
              !order.diagnostic_test_id
            }
            onClick={() => void step("COLLECT")}
          >
            Record sample collection
          </Button>
        </>
      )}
      {specimen && (
        <>
          <p className="break-all font-mono">
            Sample ID: {specimen.sample_code}
          </p>
          <p className="text-sm text-muted-foreground">
            Use this exact identifier on the specimen label. Verify it again at
            every handover.
          </p>
          {specimen.rejection_reason && (
            <p>Rejection reason: {specimen.rejection_reason}</p>
          )}
          {active && !["REJECTED", "COMPLETED"].includes(specimen.status) && (
            <>
              <label className="block">
                Scan or enter sample ID
                <input
                  className="mt-1 w-full rounded border p-3"
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="block">
                Operational note (required for rejection)
                <textarea
                  className="mt-1 w-full rounded border p-3"
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              {centre &&
                specimen.status === "PACKED" &&
                order.diagnostic_test_id && (
                  <>
                    <DestinationPicker
                      labsOnly
                      testId={order.diagnostic_test_id}
                      onSelect={async (d) => {
                        setDestination(d);
                      }}
                    />
                    {destination && <p>Processing lab: {destination.name}</p>}
                    <label className="block">
                      Transporter
                      <input
                        className="w-full rounded border p-3"
                        value={transporter}
                        onChange={(e) => setTransporter(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      Vehicle/reference
                      <input
                        className="w-full rounded border p-3"
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                      />
                    </label>
                  </>
                )}
              <div className="flex flex-wrap gap-2">
                {centre && specimen.status === "COLLECTED" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("PACK")}
                  >
                    Record packed
                  </Button>
                )}
                {centre && specimen.status === "PACKED" && (
                  <Button
                    disabled={
                      busy ||
                      sample !== specimen.sample_code ||
                      !destination ||
                      !transporter.trim()
                    }
                    onClick={() => void step("DISPATCH")}
                  >
                    Record dispatch
                  </Button>
                )}
                {!centre &&
                  (specimen.status === "IN_TRANSIT" ||
                    (specimen.status === "COLLECTED" &&
                      !order.collection_centre_id)) && (
                    <Button
                      disabled={busy || sample !== specimen.sample_code}
                      onClick={() => void step("RECEIVE")}
                    >
                      Confirm sample received
                    </Button>
                  )}
                {!centre && specimen.status === "RECEIVED_AT_LAB" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("ACCEPT")}
                  >
                    Identity verified — accept sample
                  </Button>
                )}
                {!centre && specimen.status === "ACCEPTED" && (
                  <Button
                    disabled={busy || sample !== specimen.sample_code}
                    onClick={() => void step("PROCESS")}
                  >
                    Start processing
                  </Button>
                )}
                {!centre &&
                  ["RECEIVED_AT_LAB", "ACCEPTED"].includes(specimen.status) && (
                    <Button
                      variant="danger"
                      disabled={
                        busy || sample !== specimen.sample_code || !note.trim()
                      }
                      onClick={() => void step("REJECT")}
                    >
                      Reject sample
                    </Button>
                  )}
              </div>
            </>
          )}
          {!centre && specimen.status === "PROCESSING" && !result && (
            <ResultEntry
              order={order}
              sampleCode={specimen.sample_code}
              refresh={refresh}
            />
          )}
        </>
      )}
      {!centre && result && (
        <PublishResult
          result={result}
          order={order}
          labName={labName}
          refresh={refresh}
        />
      )}
    </Card>
  );
}
function ResultEntry({
  order,
  sampleCode,
  refresh,
}: {
  order: Order;
  sampleCode: string;
  refresh: () => void;
}) {
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [testCode, setTestCode] = useState("");
  const [kind, setKind] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [p, t] = await Promise.all([
          supabase
            .from("diagnostic_parameters")
            .select("id,parameter_code,parameter_name,unit,data_type,required")
            .eq("test_id", order.diagnostic_test_id!)
            .eq("active", true)
            .order("display_order")
            .limit(500),
          supabase
            .from("diagnostic_tests")
            .select("test_code,result_kind")
            .eq("id", order.diagnostic_test_id!)
            .single(),
        ]);
        if (p.error) throw p.error;
        if (t.error) throw t.error;
        if (active) {
          setParameters(p.data);
          setTestCode(t.data.test_code);
          setKind(t.data.result_kind);
        }
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [order.diagnostic_test_id]);
  async function file(f: File | undefined) {
    if (!f) return;
    setError("");
    setConfirmed(false);
    try {
      const source = f.name.toLowerCase().endsWith(".csv")
        ? "CSV"
        : f.name.toLowerCase().endsWith(".json")
          ? "JSON"
          : null;
      if (!source) throw new Error("Choose CSV or JSON");
      if (f.size > 2097152) throw new Error("File exceeds 2 MB");
      const parsed = importMachine(
        await f.text(),
        source,
        sampleCode,
        testCode,
        parameters,
      );
      setValues(parsed.values);
      setImported(parsed);
    } catch (e) {
      setError(errorText(e));
      setImported(null);
      setValues({});
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await rpc("p0_verify_results", {
        p_order: order.id,
        p_sample: sampleCode,
        p_values: values,
        p_source: imported?.source ?? "MANUAL",
        p_raw: imported?.raw ?? null,
      });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Enter and verify actual results</h3>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!loaded ? (
        <p>Loading test definition…</p>
      ) : kind !== "PARAMETERS" || !parameters.length ? (
        <p>
          Test definition/configuration required. Document, imaging and ECG
          reporting require a dedicated report definition; no numeric panel is
          invented.
        </p>
      ) : (
        <>
          <label className="block">
            Import CSV / JSON (maximum 2 MB)
            <input
              className="block w-full p-3"
              type="file"
              accept=".csv,.json"
              disabled={busy}
              onChange={(e) => {
                void file(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-sm">
            No physical analyzer is connected. Imports must contain the exact
            sample ID, test code, parameter codes and units. Verify every
            imported value.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {parameters.map((p) => (
              <label className="block" key={p.id}>
                {p.parameter_name} {p.required ? "*" : ""} (
                {p.unit ?? "no unit"})
                <input
                  className="mt-1 w-full rounded border p-3"
                  value={values[p.id] ?? ""}
                  inputMode={p.data_type === "NUMBER" ? "decimal" : "text"}
                  disabled={busy}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [p.id]: e.target.value }));
                    setConfirmed(false);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="text-sm">
            Reference ranges and flags are calculated on verification using the
            laboratory, method, patient age and sex. Missing or ambiguous ranges
            remain UNKNOWN.
          </p>
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I verified specimen identity and all entered/imported observations
            against the source.
          </label>
          <Button disabled={busy || !confirmed} onClick={() => void verify()}>
            Verify observations
          </Button>
        </>
      )}
    </section>
  );
}
function PublishResult({
  result,
  order,
  labName,
  refresh,
}: {
  result: Result;
  order: Order;
  labName: string;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function publish() {
    setBusy(true);
    setError("");
    try {
      const path = await rpc<string>("p0_report_path", { p_result: result.id });
      if (!path) throw new Error("Report not authorized");
      const blob = await reportPdf(result, order.test_name, order.id, labName);
      const { error: uploadError } = await supabase.storage
        .from("lab-reports")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      // An earlier upload can succeed before publication fails. Retry publication without overwriting it.
      if (
        uploadError &&
        uploadError.message !== "The resource already exists" &&
        uploadError.message !== "Resource already exists"
      )
        throw uploadError;
      await rpc("p0_publish_report", { p_result: result.id });
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border-t pt-3">
      <h3 className="font-semibold">Verified observations</h3>
      {observationsOf(result).map((o, i) => (
        <p key={i}>
          {o.parameter_name}: {o.raw_value} {o.unit} ·{" "}
          {o.reference_range ?? "Reference range not configured"} · {o.flag}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {result.status === "VERIFIED" ? (
        <Button disabled={busy} onClick={() => void publish()}>
          Generate and publish verified PDF
        </Button>
      ) : (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadReport(result);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Download report
        </Button>
      )}
    </section>
  );
}
