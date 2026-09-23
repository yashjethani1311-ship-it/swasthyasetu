import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/diagnostics/service";
import { useLanguage } from "@/lib/i18n";
export function TestCatalogPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<
    { id: string; test_name: string; test_code: string }[]
  >([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void (async () => {
        try {
          let q = supabase
            .from("diagnostic_tests")
            .select("id,test_name,test_code")
            .eq("active", true)
            .order("test_name")
            .order("id")
            .limit(30);
          if (query.trim())
            q = q.ilike(
              "test_name",
              `%${query.replaceAll("%", "").replaceAll("_", "")}%`,
            );
          const result = await q;
          if (result.error) throw result.error;
          if (active) setRows(result.data ?? []);
        } catch (e) {
          if (active) setError(errorText(e));
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <label className="block text-sm">
        {hi ? "जाँच का नाम खोजें" : "Search catalog test"}
        <input
          className="mt-1 w-full rounded border p-3"
          value={query}
          disabled={disabled}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("");
          }}
        />
      </label>
      <select
        aria-label={hi ? "जाँच चुनें" : "Choose test"}
        className="w-full rounded border p-3"
        value={value}
        disabled={disabled || loading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{hi ? "जाँच चुनें" : "Choose test"}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.test_name} ({r.test_code})
          </option>
        ))}
      </select>
      {loading && <p>{hi ? "खोज रहे हैं…" : "Searching…"}</p>}
      {!loading && !rows.length && !error && (
        <p>{hi ? "कोई जाँच नहीं मिली।" : "No configured tests found."}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
