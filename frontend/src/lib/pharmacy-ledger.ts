export type StockMovement = {
  id: string;
  inventoryId: string | null;
  delta: number | null;
  balance: number | null;
  kind: string;
  recordedAt: string | null;
};

// p2_ledger returns stock movements, not sales or payments.
export function normalizeStockLedger(data: unknown): StockMovement[] {
  if (!Array.isArray(data)) return [];
  const number = (v: unknown) => v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  return data.map((r) => ({
    id: String(r.id ?? ''),
    inventoryId: r.inventory_id ?? null,
    delta: number(r.quantity_delta),
    balance: number(r.quantity_after),
    kind: r.source_kind ?? 'UNKNOWN',
    recordedAt: r.recorded_at ?? null,
  }));
}
