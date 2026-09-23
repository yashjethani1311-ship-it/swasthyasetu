export function localServiceDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Exact h1_queue contract: queue_id and state are authoritative.
export function normalizeReceptionQueue(data: unknown) {
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
  const text = (v: unknown) => v == null ? null : String(v)
  return rows.map(r => ({
    id: String(r.queue_id ?? ''), token: null,
    token_number: text(r.token_number), status: String(r.state ?? 'UNKNOWN'),
    patient_id: text(r.patient_id), patient_name: text(r.patient_name),
    patient_code: null, department: text(r.department_id), position: null,
    checked_in_at: text(r.checked_in_at),
  }))
}
