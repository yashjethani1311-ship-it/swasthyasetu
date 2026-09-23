import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/diagnostics/service";
import { Button } from "@/components/kit";

export function ProviderPicker({
  type,
  value,
  onChange,
  label,
  contextId,
}: {
  type: "PHARMACY" | "WORKER";
  value: string;
  onChange: (id: string) => void;
  label: string;
  contextId: string;
}) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    {
      id: string;
      name: string;
      detail: string;
    }[]
  >([]);
  const [error, setError] = useState("");
  const limit = 10;

  useEffect(() => {
    let active = true;
    setRows([]);
    setCount(0);
    setError("");
    if (!contextId) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const r = await supabase.rpc(type === "WORKER" ? "d2_gap_workers" : "d2_rx_pharmacies", {
            ...(type === "WORKER" ? { p_gap: contextId } : { p_rx: contextId }),
            p_search: search.trim(), p_offset: offset,
          });
          if (r.error) throw r.error;
          if (active) { setRows(r.data ?? []); setCount((r.data ?? []).length); }
        } catch (e) {
          if (active) { setError(errorText(e)); setRows([]); setCount(0); }
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, type, offset, contextId]);

  const hasFilter = Boolean(contextId);

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        {label}
        <input
          className="mt-1 w-full rounded border p-2.5 text-sm"
          value={search}
          maxLength={100}
          placeholder={type === "PHARMACY" ? "Filter pharmacies in your recorded city" : "Filter workers authorized for this care gap"}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
            onChange("");
          }}
        />
      </label>

      <select
        aria-label={label}
        className="w-full rounded border p-2.5 text-sm"
        value={value}
        disabled={loading || (!rows.length && !value)}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? "Searching…" : rows.length ? "— Select a provider —" : "— No providers loaded —"}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · {r.detail}
          </option>
        ))}
      </select>

      {!hasFilter && (
        <p className="text-xs text-muted-foreground">
          {type === "PHARMACY"
            ? "A prescription with recorded patient city and state is required."
            : "An authorized care gap is required."}
        </p>
      )}

      {hasFilter && !rows.length && !loading && !error && (
        <p className="text-xs text-muted-foreground">No eligible provider found in this care context.</p>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {hasFilter && (rows.length > 0 || offset > 0) && (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - limit));
              onChange("");
            }}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {Math.floor(offset / limit) + 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || count < limit || offset >= 10000}
            onClick={() => {
              setOffset(offset + limit);
              onChange("");
            }}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
