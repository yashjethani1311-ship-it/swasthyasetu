import { supabase } from "@/lib/supabase";
export type Observation = {
  parameter_code: string;
  parameter_name: string;
  raw_value: string;
  unit: string | null;
  reference_range: string | null;
  flag: string;
};
export type Result = {
  id: string;
  status: string;
  verified_at: string | null;
  doctor_reviewed_at: string | null;
  doctor_reviewed_by: string | null;
  report_storage_path: string | null;
  result_json: {
    source?: string;
    sample_code?: string;
    observations?: Record<string, unknown>[];
  };
  created_at: string;
};
export type Specimen = {
  id: string;
  sample_code: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  sample_custody_events?: {
    id: string;
    event_type: string;
    occurred_at: string;
    notes: string | null;
  }[];
};
export type Order = {
  id: string;
  test_name: string;
  diagnostic_test_id: string | null;
  patient_id: string;
  clinical_note: string | null;
  status: string;
  ordered_at: string;
  lab_provider_id: string | null;
  collection_centre_id: string | null;
  routing_status: string | null;
  doctor?: { full_name: string } | null;
  centre?: { centre_name: string } | null;
  lab?: { full_name: string; organization_name: string | null } | null;
  lab_results: Result | Result[] | null;
  lab_specimens: Specimen[];
};
export type Parameter = {
  id: string;
  parameter_code: string;
  parameter_name: string;
  unit: string | null;
  data_type: string;
  required: boolean;
};
export function errorText(e: unknown) {
  return e && typeof e === "object" && "message" in e
    ? String(e.message)
    : "Unable to complete this action.";
}
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export function resultOf(order: Order) {
  return Array.isArray(order.lab_results)
    ? order.lab_results[0]
    : order.lab_results;
}
export function observationsOf(result: Result): Observation[] {
  return (result.result_json?.observations ?? []).map((o) => ({
    parameter_code: String(o.parameter_code ?? o.code ?? ""),
    parameter_name: String(
      o.parameter_name ?? o.name ?? o.parameter_code ?? o.code ?? "",
    ),
    raw_value: String(
      o.raw_value ?? o.value ?? o.numeric_value ?? o.text_value ?? "",
    ),
    unit: o.unit == null ? null : String(o.unit),
    reference_range:
      o.reference_range == null ? null : String(o.reference_range),
    flag: String(o.flag ?? "UNKNOWN"),
  }));
}
// Abnormal observations (a value outside its configured reference range) are
// NOT the same thing as a critical result. `abnormalOf` only reports flagged
// observations on a verified report so the UI can highlight them; it never
// implies a critical-result lifecycle event.
export const ABNORMAL_FLAGS = ["HIGH", "LOW", "ABNORMAL", "CRITICAL"];
export function abnormalOf(result: Result): Observation[] {
  return observationsOf(result).filter((o) =>
    ABNORMAL_FLAGS.includes(String(o.flag ?? "").toUpperCase()),
  );
}
// Ordinary report review: the ordering doctor has looked at a published report.
// Recorded via p0_review_report. This is a review acknowledgement only.
export function awaitingDoctorReview(order: Order): boolean {
  const r = resultOf(order);
  return !!r && r.status === "COMPLETED" && !!r.verified_at && !r.doctor_reviewed_at;
}

// ── 017 Critical results ──────────────────────────────────────────────────────
// Critical results are raised by the laboratory into `critical_results` and
// worked through `critical_result_actions`. They are a distinct lifecycle from
// ordinary report review: r2_worklist lists them, r2_transition advances them.
export type CriticalResult = {
  id: string;
  status: string;
  severity: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_code: string | null;
  order_id: string | null;
  result_id: string | null;
  test_name: string | null;
  parameter_name: string | null;
  raw_value: string | null;
  raised_at: string | null;
  [key: string]: unknown;
};

function asRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "rows", "results", "critical_results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

const str = (v: unknown) => (v == null ? null : String(v));

export async function criticalWorklist(offset = 0): Promise<CriticalResult[]> {
  const data = await rpc<unknown>("r2_worklist", { p_offset: offset });
  return asRows(data).map((r) => ({
    ...(r as CriticalResult),
    id: String(r.id ?? ""),
    status: String(r.status ?? "OPEN"),
    severity: str(r.severity),
    patient_id: str(r.patient_id),
    patient_name: str(r.patient_name ?? r.full_name),
    patient_code: str(r.patient_code),
    order_id: str(r.order_id ?? r.lab_order_id),
    result_id: str(r.result_id ?? r.lab_result_id),
    test_name: str(r.test_name),
    parameter_name: str(r.parameter_name),
    raw_value: str(r.raw_value ?? r.value),
    raised_at: str(r.raised_at ?? r.created_at),
  }));
}

// Advance a critical result through its real lifecycle (e.g. ACKNOWLEDGE,
// ESCALATE, CLOSE). Backend-enforced; the exact allowed transitions come from
// r2_transition, so any invalid action surfaces the server error verbatim.
// Exact 017 signature:
//   r2_transition(p_critical uuid, p_action text, p_channel text, p_note text,
//                 p_request uuid)
// p_channel records how the critical result was communicated/worked; the doctor
// and lab worklists act in-app, so it defaults to IN_APP. p_request is a fresh
// idempotency key per attempt.
export async function criticalTransition(
  id: string,
  action: string,
  note?: string | null,
  channel = "IN_APP",
) {
  return rpc("r2_transition", {
    p_critical: id,
    p_action: action,
    p_channel: channel,
    p_note: note ?? null,
    p_request: crypto.randomUUID(),
  });
}
export function nextAction(order: Order, hindi: boolean) {
  const result = resultOf(order);
  const s = order.lab_specimens?.at(-1);
  const pick = (en: string, hi: string) => (hindi ? hi : en);
  if (order.status === "CANCELLED")
    return pick("This test order was cancelled.", "यह जाँच रद्द कर दी गई है।");
  if (result?.doctor_reviewed_at)
    return pick(
      "Your doctor reviewed this report.",
      "डॉक्टर ने आपकी रिपोर्ट देख ली है।",
    );
  if (result?.status === "COMPLETED" && result.verified_at)
    return pick(
      "Your report is ready. Your doctor has not reviewed it yet.",
      "आपकी रिपोर्ट तैयार है। डॉक्टर ने अभी इसे नहीं देखा है।",
    );
  if (s?.status === "REJECTED")
    return pick(
      "The laboratory could not accept your sample. Contact the collection point about the recorded reason.",
      "लैब ने नमूना स्वीकार नहीं किया। वजह जानने के लिए नमूना देने की जगह से संपर्क करें।",
    );
  if (s?.status === "PROCESSING")
    return pick(
      "Your test is being processed.",
      "आपके नमूने की जाँच हो रही है।",
    );
  if (["RECEIVED_AT_LAB", "ACCEPTED"].includes(s?.status ?? ""))
    return pick(
      "Your sample has reached the laboratory.",
      "आपका नमूना लैब पहुँच गया है।",
    );
  if (s?.status === "IN_TRANSIT")
    return pick(
      "Your sample is on the way to the processing laboratory.",
      "आपका नमूना जाँच करने वाली लैब में भेजा जा रहा है।",
    );
  if (s)
    return pick(
      "Your sample has been collected.",
      "आपका नमूना ले लिया गया है।",
    );
  if (order.lab_provider_id || order.collection_centre_id)
    return pick(
      "Visit your selected collection point with this order.",
      "यह जाँच का आदेश लेकर चुनी हुई जगह पर नमूना दें।",
    );
  if (!order.diagnostic_test_id)
    return pick(
      "The test definition needs configuration. Contact the ordering doctor.",
      "इस जाँच की जानकारी पूरी करनी है। जाँच लिखने वाले डॉक्टर से संपर्क करें।",
    );
  return pick(
    "Choose where you want to give your sample.",
    "चुनें कि आप अपना नमूना कहाँ देना चाहते हैं।",
  );
}
export async function downloadReport(result: Result) {
  if (
    !result.report_storage_path ||
    result.status !== "COMPLETED" ||
    !result.verified_at
  )
    throw new Error("Verified report is not ready.");
  const { data, error } = await supabase.storage
    .from("lab-reports")
    .download(result.report_storage_path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${result.id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function reportLink(result: Result) {
  if (
    !result.report_storage_path ||
    result.status !== "COMPLETED" ||
    !result.verified_at
  )
    throw new Error("Verified report is not ready.");
  const { data, error } = await supabase.storage
    .from("lab-reports")
    .createSignedUrl(result.report_storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}
