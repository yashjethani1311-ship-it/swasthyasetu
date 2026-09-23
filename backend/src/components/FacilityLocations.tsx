import { useEffect, useState } from "react";
import { Button, Card } from "@/components/kit";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { errorText, rpc } from "@/lib/diagnostics/service";
type Location = {
  id: string;
  kind: "FACILITY" | "CENTRE";
  name: string;
  address: string;
  village: string;
  city: string;
  district: string;
  state: string;
  postal: string;
  lat: string;
  lon: string;
};
export function FacilityLocations() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const f = await supabase
          .from("facilities")
          .select(
            "id,name,address_text,village,city,district,state,postal_code,latitude,longitude",
          )
          .eq("owner_user_id", profile!.id)
          .order("id")
          .limit(100);
        if (f.error) throw f.error;
        const ids = f.data.map((x) => x.id);
        const c = ids.length
          ? await supabase
              .from("collection_centres")
              .select(
                "id,centre_name,address_line,village,city,district,state,postal_code,latitude,longitude",
              )
              .in("facility_id", ids)
              .order("id")
              .limit(100)
          : { data: [], error: null };
        if (c.error) throw c.error;
        const locations: Location[] = [
          ...f.data.map((x) => ({
            ...x,
            kind: "FACILITY" as const,
            address: x.address_text,
          })),
          ...(c.data ?? []).map((x) => ({
            ...x,
            kind: "CENTRE" as const,
            name: x.centre_name,
            address: x.address_line,
          })),
        ].map((x) => ({
          id: x.id,
          kind: x.kind,
          name: x.name,
          address: x.address ?? "",
          village: x.village ?? "",
          city: x.city ?? "",
          district: x.district ?? "",
          state: x.state ?? "",
          postal: x.postal_code ?? "",
          lat: x.latitude == null ? "" : String(x.latitude),
          lon: x.longitude == null ? "" : String(x.longitude),
        }));
        if (active) setItems(locations);
      } catch (e) {
        if (active) setError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profile?.id]);
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">
        Facility and collection locations
      </h2>
      {loading && <p>Loading locations…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !items.length && (
        <p>
          No facility is linked to this account. Ask the administrator to link
          the registered facility.
        </p>
      )}
      {items.map((item) => (
        <LocationForm key={item.id} item={item} />
      ))}
    </section>
  );
}
function LocationForm({ item }: { item: Location }) {
  const [form, setForm] = useState(item);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location unavailable; enter coordinates manually.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm((f) => ({
          ...f,
          lat: String(p.coords.latitude),
          lon: String(p.coords.longitude),
        }));
        setBusy(false);
      },
      () => {
        setError(
          "Location unavailable; enter address and coordinates manually.",
        );
        setBusy(false);
      },
      { timeout: 10000 },
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const lat = form.lat.trim() ? Number(form.lat) : null;
      const lon = form.lon.trim() ? Number(form.lon) : null;
      if (
        (lat !== null && !Number.isFinite(lat)) ||
        (lon !== null && !Number.isFinite(lon))
      )
        throw new Error("Coordinates must be numbers");
      await rpc("p0_save_location", {
        p_kind: form.kind,
        p_id: form.id,
        p_address: form.address,
        p_village: form.village || null,
        p_city: form.city || null,
        p_district: form.district || null,
        p_state: form.state || null,
        p_postal: form.postal || null,
        p_lat: lat,
        p_lon: lon,
      });
      setMessage(
        "Physical location saved. Registry verification has not changed.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-3">
      <h3 className="font-semibold">{item.name}</h3>
      <p className="text-sm">
        Enter the fixed physical location. Current location fills these fields
        only when you are at this facility.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            "address",
            "village",
            "city",
            "district",
            "state",
            "postal",
            "lat",
            "lon",
          ] as const
        ).map((key) => (
          <label key={key} className="block capitalize">
            {key === "lat" ? "Latitude" : key === "lon" ? "Longitude" : key}
            <input
              className="mt-1 w-full rounded border p-3"
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={locate}>
          Use Current Location for this Facility
        </Button>
        <Button
          disabled={busy || !form.address.trim()}
          onClick={() => void save()}
        >
          Save location
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
