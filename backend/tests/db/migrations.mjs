import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
grant usage on schema public,auth,storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to authenticated,anon,service_role;`);
for (const file of [
  "001_clean_core.sql",
  "003_provider_hpr_location.sql",
  "004_live_schema_reconciliation.sql",
  "005_p0_diagnostic_workflow.sql",
  "006_care_coordination.sql",
  "007_patient_consent.sql",
  "008_appointment_safety.sql",
  "009_verification_lifecycle.sql",
  "010_longitudinal_provenance.sql",
  "011_episode_caregraph.sql",
  "012_directory_discovery.sql",
  "013_facility_reception.sql",
  "014_hospital_admissions.sql",
  "015_facility_billing.sql",
  "016_imaging_procedure.sql",
  "017_critical_results.sql",
  "018_pharmacy_pos.sql",
  "019_pharmacy_purchasing.sql",
  "020_worker_delegation.sql",
  "021_frontend_context.sql",
  "022_governed_pathways.sql",
  "023_risk_resolution_closure.sql",
  "024_closed_loop_referrals.sql",
  "025_payer_cases.sql",
  "026_emergency_coordination.sql",
  "027_document_intelligence.sql",
  "028_snapshot_sources.sql",
  "029_model_governance.sql",
  "030_owned_model_learning.sql",
  "031_communication_lifecycle.sql",
  "032_role_ai_tools.sql",
  "033_hospital_operations.sql",
  "034_lab_quality_recollection.sql",
  "035_pharmacy_delivery.sql",
  "036_worker_operations.sql",
  "037_governance_operations.sql",
  "038_identity_aliases.sql",
  "039_integration_registry.sql",
  "040_integration_retries.sql",
  "041_care_replay.sql",
  "042_care_twin.sql",
  "043_district_pulse.sql",
  "044_teleconsult_foundation.sql",
  "045_medicine_master.sql",
  "046_diagnostic_master.sql",
  "047_ai_operational_completion.sql",
  "048_targeted_security_hardening.sql",
  "049_termination_access_boundary.sql",
  "050_projection_evidence_completion.sql",
  "051_internal_workspace_completion.sql",
  "052_context_bound_discovery.sql",
  "053_encounter_vitals_hardening.sql",
  "054_account_deletion_lifecycle.sql",
]) {
  const sql = fs
    .readFileSync(new URL("../../supabase/" + file, import.meta.url), "utf8")
    .replace(/create extension if not exists pgcrypto;/i, "");
  try {
    await db.exec(sql);
    console.log("PASS migration " + file);
  } catch (e) {
    console.error("FAIL " + file, e.message, "position", e.position);
    const p = Number(e.position);
    if (p) console.error(sql.slice(Math.max(0, p - 150), p + 150));
    throw new Error(e.message);
  }
}
console.log(
  "Tables",
  (
    await db.query(
      "select count(*) from information_schema.tables where table_schema='public'",
    )
  ).rows,
);
