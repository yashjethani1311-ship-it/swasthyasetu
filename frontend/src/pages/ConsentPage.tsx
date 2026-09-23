import {useCareLanguage} from '@/lib/care-language'
import { useEffect, useState } from "react";
import { ConsentPanel } from "@/components/ConsentPanel";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/diagnostics/service";
export function ConsentPage() {
 const {tr}=useCareLanguage();
  const { profile } = useAuth();
  const [patient, setPatient] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase
      .from("patient_profiles")
      .select("id")
      .eq("user_id", profile!.id)
      .single()
      .then((r) => {
        if (active) {
          if (r.error) setError(errorText(r.error));
          else setPatient(r.data.id);
        }
      });
    return () => {
      active = false;
    };
  }, [profile?.id]);
  return error ? (
    <p role="alert">{error}</p>
  ) : patient ? (
    <ConsentPanel patientId={patient} doctor={false} />
  ) : (
    <p role="status">{tr('Loading…','जानकारी आ रही है…')}</p>
  );
}
