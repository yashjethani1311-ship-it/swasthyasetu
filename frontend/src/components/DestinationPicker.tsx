import { useRef, useState } from "react";
import { Button, Card } from "@/components/kit";
import { useLanguage } from "@/lib/i18n";
import { errorText, rpc } from "@/lib/diagnostics/service";
export type Destination = {
  destination_id: string;
  provider_id: string | null;
  name: string;
  kind: "CENTRE" | "LAB";
  address: string;
  distance_km: number | null;
  capability: "SUPPORTED" | "UNKNOWN";
};
export function DestinationPicker({
  testId,
  onSelect,
  labsOnly = false,
}: {
  testId: string;
  onSelect: (item: Destination) => Promise<void>;
  labsOnly?: boolean;
}) {
  const { language } = useLanguage();
  const hi = language === "Hindi";
  const [kind, setKind] = useState<"CENTRE" | "LAB">(
    labsOnly ? "LAB" : "CENTRE",
  );
  const [mode, setMode] = useState<"SEARCH" | "NEARBY">("SEARCH");
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [items, setItems] = useState<Destination[]>([]);
  const [offset, setOffset] = useState(0);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const tr = (en: string, h: string) => (hi ? h : en);
  async function search(start = 0, point = coords) {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setSearched(false);
    setItems([]);
    try {
      const rows = await rpc<Destination[]>("p0_discover", {
        p_test: testId,
        p_kind: kind,
        p_search: mode === "SEARCH" ? query.trim() : "",
        p_lat: mode === "NEARBY" ? (point?.lat ?? null) : null,
        p_lon: mode === "NEARBY" ? (point?.lon ?? null) : null,
        p_offset: start,
      });
      if (id === request.current) {
        setItems(rows);
        setOffset(start);
        setSearched(true);
      }
    } catch (e) {
      if (id === request.current) setError(errorText(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        tr(
          "Location is unavailable. Use Search.",
          "लोकेशन उपलब्ध नहीं है। नाम या पता डालकर खोजें।",
        ),
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lon: p.coords.longitude };
        setCoords(c);
        void search(0, c);
      },
      () => {
        setBusy(false);
        setError(
          tr(
            "Location permission was denied or unavailable. Use Search by name or address.",
            "लोकेशन नहीं मिली। नाम या पता डालकर खोजें।",
          ),
        );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  function reset() {
    request.current++;
    setItems([]);
    setSearched(false);
    setError("");
    setOffset(0);
  }
  return (
    <Card className="space-y-4">
      <h3 className="font-semibold">
        {labsOnly ? tr("Choose processing laboratory", "जाँच करने वाली लैब चुनें") : tr("Choose a sample collection point", "नमूना देने की जगह चुनें")}
      </h3>
      <div className="flex flex-wrap gap-2">
        {!labsOnly &&
          (["CENTRE", "LAB"] as const).map((k) => (
            <Button
              key={k}
              disabled={busy}
              variant={kind === k ? "primary" : "outline"}
              onClick={() => {
                setKind(k);
                reset();
              }}
            >
              {k === "CENTRE"
                ? tr("Collection centres", "नमूना देने के केंद्र")
                : tr("Diagnostic labs", "जाँच की लैब")}
            </Button>
          ))}
      </div>
      <div className="flex gap-2">
        {(["SEARCH", "NEARBY"] as const).map((m) => (
          <Button
            key={m}
            disabled={busy}
            variant={mode === m ? "primary" : "outline"}
            onClick={() => {
              setMode(m);
              reset();
            }}
          >
            {m === "SEARCH" ? tr("Search", "खोजें") : tr("Nearby", "आस-पास")}
          </Button>
        ))}
      </div>
      {mode === "SEARCH" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="block text-sm">
              {tr(
                "Name, village, city, district, state or postal code",
                "नाम, गाँव, शहर, जिला, राज्य या पिन कोड",
              )}
            </span>
            <input
              className="w-full rounded border p-3"
              disabled={busy}
              maxLength={150}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
            />
          </label>
          <Button disabled={busy}>{tr("Search", "खोजें")}</Button>
        </form>
      ) : (
        <Button disabled={busy} onClick={locate}>
          {tr("Use My Location", "मेरी लोकेशन से खोजें")}
        </Button>
      )}
      {busy && <p role="status">{tr("Please wait…", "कृपया रुकें…")}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {searched && !items.length && (
        <p>
          {tr(
            "No registered options found. Try another area.",
            "कोई केंद्र नहीं मिला। किसी दूसरे इलाके में खोजें।",
          )}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.destination_id}
            className="rounded-xl border p-4 space-y-2"
          >
            <h4 className="font-semibold">{item.name}</h4>
            <p className="text-sm">
              {item.address || tr("Address not entered", "पता दर्ज नहीं है")}
            </p>
            {item.distance_km !== null && (
              <p className="text-sm">
                {tr("Approx. straight-line distance", "सीधी दूरी लगभग")}{" "}
                {item.distance_km.toFixed(1)} km
              </p>
            )}
            <p className="text-sm">
              {item.capability === "SUPPORTED"
                ? tr(
                    "Configured to handle this test",
                    "यहाँ इस जाँच के लिए नमूना दे सकते हैं",
                  )
                : tr(
                    "Test capability unknown — selection unavailable",
                    "इस जाँच की सुविधा की जानकारी नहीं है — अभी नहीं चुन सकते",
                  )}
            </p>
            <Button
              disabled={busy || item.capability !== "SUPPORTED"}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onSelect(item);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("Choose this location", "यह जगह चुनें")}
            </Button>
          </article>
        ))}
      </div>
      {searched && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={busy || offset === 0}
            onClick={() => void search(Math.max(0, offset - 20))}
          >
            {tr("Previous", "पिछले")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || items.length < 20}
            onClick={() => void search(offset + 20)}
          >
            {tr("Next", "अगले")}
          </Button>
        </div>
      )}
    </Card>
  );
}
