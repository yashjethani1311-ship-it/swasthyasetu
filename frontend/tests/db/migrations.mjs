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

