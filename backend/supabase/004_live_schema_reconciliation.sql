-- 004: reconcile the supplied live schema with 001 and 003. Run once, before 005.
-- Metadata only: no table/data deletion, no sequence reset, no healthcare seed data.
-- Existing definitions are retained. The known ABHA CHECK change replaces only a constraint.
-- Export omissions: sequence settings/values, auth triggers, bucket settings and type modifiers.
-- Sequences below are dependencies proven by exported function/default definitions.
-- Existing sequences are NEVER restarted. New ones use PostgreSQL defaults.
begin;
set local search_path = public;
create sequence if not exists public."patient_code_seq";
create sequence if not exists public."demo_abha_seq";
create sequence if not exists public."demo_hpr_seq";
create sequence if not exists public."demo_worker_seq";
create sequence if not exists public."demo_hfr_hospital_seq";
create sequence if not exists public."demo_hfr_lab_seq";
create sequence if not exists public."demo_hfr_pharmacy_seq";
create sequence if not exists public."audit_logs_id_seq";
create sequence if not exists public."sample_code_seq";

create table if not exists public."collection_centre_tests" (
  "id" uuid default gen_random_uuid() not null,
  "collection_centre_id" uuid not null,
  "diagnostic_test_id" uuid not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."collection_centres" (
  "id" uuid default gen_random_uuid() not null,
  "facility_id" uuid,
  "centre_code" text not null,
  "centre_name" text not null,
  "centre_type" text not null,
  "address_line" text,
  "village" text,
  "district" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "latitude" double precision,
  "longitude" double precision,
  "phone" text,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."diagnostic_parameters" (
  "id" uuid default gen_random_uuid() not null,
  "test_id" uuid not null,
  "parameter_code" text not null,
  "parameter_name" text not null,
  "unit" text,
  "data_type" text default 'NUMBER'::text not null,
  "display_order" integer default 0 not null,
  "required" boolean default true not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."diagnostic_reference_ranges" (
  "id" uuid default gen_random_uuid() not null,
  "parameter_id" uuid not null,
  "sex" text,
  "min_age_years" numeric,
  "max_age_years" numeric,
  "lower_limit" numeric,
  "upper_limit" numeric,
  "reference_text" text,
  "method" text,
  "lab_provider_id" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."diagnostic_tests" (
  "id" uuid default gen_random_uuid() not null,
  "test_code" text not null,
  "test_name" text not null,
  "category" text,
  "specimen_type" text,
  "method" text,
  "description" text,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."encounters" (
  "id" uuid default gen_random_uuid() not null,
  "appointment_id" uuid not null,
  "patient_id" uuid not null,
  "doctor_provider_id" uuid not null,
  "status" text default 'IN_PROGRESS'::text not null,
  "chief_complaint" text,
  "symptoms" text,
  "temperature_c" numeric,
  "pulse_bpm" integer,
  "systolic_bp" integer,
  "diastolic_bp" integer,
  "spo2_percent" integer,
  "weight_kg" numeric,
  "diagnosis" text,
  "clinical_notes" text,
  "follow_up_in_days" integer,
  "started_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."lab_machine_integrations" (
  "id" uuid default gen_random_uuid() not null,
  "lab_provider_id" uuid not null,
  "machine_name" text not null,
  "manufacturer" text,
  "model" text,
  "protocol" text default 'MANUAL'::text not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."lab_machine_payloads" (
  "id" uuid default gen_random_uuid() not null,
  "lab_order_id" uuid not null,
  "machine_integration_id" uuid,
  "source_type" text not null,
  "raw_payload" jsonb not null,
  "received_at" timestamp with time zone default now() not null
);

create table if not exists public."lab_observations" (
  "id" uuid default gen_random_uuid() not null,
  "lab_order_id" uuid not null,
  "parameter_id" uuid,
  "parameter_code" text not null,
  "parameter_name" text not null,
  "raw_value" text,
  "numeric_value" numeric,
  "text_value" text,
  "unit" text,
  "reference_range" text,
  "flag" text default 'UNKNOWN'::text not null,
  "source_type" text default 'MANUAL'::text not null,
  "machine_payload_id" uuid,
  "verified" boolean default false not null,
  "verified_by" uuid,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."lab_specimens" (
  "id" uuid default gen_random_uuid() not null,
  "sample_code" text default ('SS-SAMPLE-'::text || nextval('sample_code_seq'::regclass)) not null,
  "lab_order_id" uuid not null,
  "collection_centre_id" uuid,
  "processing_lab_provider_id" uuid,
  "specimen_type" text,
  "status" text default 'COLLECTION_PENDING'::text not null,
  "collected_at" timestamp with time zone,
  "packed_at" timestamp with time zone,
  "dispatched_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "processing_started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "rejection_reason" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."lab_test_capabilities" (
  "id" uuid default gen_random_uuid() not null,
  "lab_provider_id" uuid not null,
  "diagnostic_test_id" uuid not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."provider_availability_overrides" (
  "id" uuid default gen_random_uuid() not null,
  "provider_id" uuid not null,
  "practice_id" uuid,
  "starts_at" timestamp with time zone not null,
  "ends_at" timestamp with time zone not null,
  "availability_status" text not null,
  "reason" text,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."provider_practices" (
  "id" uuid default gen_random_uuid() not null,
  "provider_id" uuid not null,
  "facility_id" uuid,
  "practice_name" text not null,
  "address_line" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "latitude" double precision,
  "longitude" double precision,
  "phone" text,
  "consultation_mode" text default 'PHYSICAL'::text not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table if not exists public."provider_schedules" (
  "id" uuid default gen_random_uuid() not null,
  "provider_id" uuid not null,
  "practice_id" uuid not null,
  "day_of_week" integer not null,
  "start_time" time without time zone not null,
  "end_time" time without time zone not null,
  "slot_minutes" integer default 30 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table if not exists public."sample_custody_events" (
  "id" uuid default gen_random_uuid() not null,
  "specimen_id" uuid not null,
  "event_type" text not null,
  "from_location_type" text,
  "from_location_id" uuid,
  "to_location_type" text,
  "to_location_id" uuid,
  "actor_user_id" uuid,
  "notes" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "occurred_at" timestamp with time zone default now() not null
);

create table if not exists public."sample_transports" (
  "id" uuid default gen_random_uuid() not null,
  "specimen_id" uuid not null,
  "status" text default 'PENDING'::text not null,
  "transporter_name" text,
  "vehicle_reference" text,
  "pickup_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."appointments" add column if not exists "practice_id" uuid;
alter table public."appointments" add column if not exists "reason" text;
alter table public."appointments" add column if not exists "patient_note" text;
alter table public."appointments" add column if not exists "duration_minutes" integer default 30;
alter table public."appointments" add column if not exists "updated_at" timestamp with time zone default now();
alter table public."facilities" add column if not exists "hfr_id" text;
alter table public."facilities" add column if not exists "identity_source" text default 'DEMO'::text;
alter table public."facilities" add column if not exists "registry_verified" boolean default false;
alter table public."facilities" add column if not exists "latitude" double precision;
alter table public."facilities" add column if not exists "longitude" double precision;
alter table public."facilities" add column if not exists "phone" text;
alter table public."lab_orders" add column if not exists "appointment_id" uuid;
alter table public."lab_orders" add column if not exists "encounter_id" uuid;
alter table public."lab_orders" add column if not exists "diagnostic_test_id" uuid;
alter table public."lab_orders" add column if not exists "collection_centre_id" uuid;
alter table public."lab_orders" add column if not exists "routing_mode" text;
alter table public."lab_orders" add column if not exists "routing_status" text;
alter table public."lab_orders" add column if not exists "patient_selected_lab" boolean default false not null;
alter table public."lab_results" add column if not exists "verified_at" timestamp with time zone;
alter table public."lab_results" add column if not exists "doctor_reviewed_at" timestamp with time zone;
alter table public."lab_results" add column if not exists "doctor_reviewed_by" uuid;
alter table public."lab_results" add column if not exists "ai_summary" jsonb;
alter table public."patient_profiles" add column if not exists "identity_source" text default 'DEMO'::text;
alter table public."patient_profiles" add column if not exists "registry_verified" boolean default false;
alter table public."prescriptions" add column if not exists "encounter_id" uuid;
alter table public."provider_profiles" add column if not exists "identity_source" text default 'DEMO'::text;
alter table public."provider_profiles" add column if not exists "registry_verified" boolean default false;
alter table public."provider_profiles" add column if not exists "phone" text;

do $reconcile$ begin
  if exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_abha_link_status_check' and pg_get_constraintdef(oid) not like '%DEMO%') then
    alter table public.patient_profiles drop constraint patient_profiles_abha_link_status_check;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_mode_check') then
    alter table public."appointments" add constraint "appointments_mode_check" CHECK ((mode = ANY (ARRAY['PHYSICAL'::text, 'TELECONSULT'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_pkey') then
    alter table public."appointments" add constraint "appointments_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_status_check') then
    alter table public."appointments" add constraint "appointments_status_check" CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'CONFIRMED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.audit_logs'::regclass and conname='audit_logs_pkey') then
    alter table public."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.care_events'::regclass and conname='care_events_pkey') then
    alter table public."care_events" add constraint "care_events_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.care_gaps'::regclass and conname='care_gaps_pkey') then
    alter table public."care_gaps" add constraint "care_gaps_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centre_tests'::regclass and conname='collection_centre_tests_collection_centre_id_diagnostic_tes_key') then
    alter table public."collection_centre_tests" add constraint "collection_centre_tests_collection_centre_id_diagnostic_tes_key" UNIQUE (collection_centre_id, diagnostic_test_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centre_tests'::regclass and conname='collection_centre_tests_pkey') then
    alter table public."collection_centre_tests" add constraint "collection_centre_tests_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centres'::regclass and conname='collection_centres_centre_code_key') then
    alter table public."collection_centres" add constraint "collection_centres_centre_code_key" UNIQUE (centre_code);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centres'::regclass and conname='collection_centres_centre_type_check') then
    alter table public."collection_centres" add constraint "collection_centres_centre_type_check" CHECK ((centre_type = ANY (ARRAY['PHC'::text, 'CHC'::text, 'SUB_CENTRE'::text, 'HEALTH_WELLNESS_CENTRE'::text, 'LAB_COLLECTION_CENTRE'::text, 'MOBILE_COLLECTION_UNIT'::text, 'HOSPITAL_COLLECTION_POINT'::text, 'OTHER'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centres'::regclass and conname='collection_centres_pkey') then
    alter table public."collection_centres" add constraint "collection_centres_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_parameters'::regclass and conname='diagnostic_parameters_data_type_check') then
    alter table public."diagnostic_parameters" add constraint "diagnostic_parameters_data_type_check" CHECK ((data_type = ANY (ARRAY['NUMBER'::text, 'TEXT'::text, 'BOOLEAN'::text, 'CHOICE'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_parameters'::regclass and conname='diagnostic_parameters_pkey') then
    alter table public."diagnostic_parameters" add constraint "diagnostic_parameters_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_parameters'::regclass and conname='diagnostic_parameters_test_id_parameter_code_key') then
    alter table public."diagnostic_parameters" add constraint "diagnostic_parameters_test_id_parameter_code_key" UNIQUE (test_id, parameter_code);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_reference_ranges'::regclass and conname='diagnostic_reference_ranges_pkey') then
    alter table public."diagnostic_reference_ranges" add constraint "diagnostic_reference_ranges_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_tests'::regclass and conname='diagnostic_tests_pkey') then
    alter table public."diagnostic_tests" add constraint "diagnostic_tests_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_tests'::regclass and conname='diagnostic_tests_test_code_key') then
    alter table public."diagnostic_tests" add constraint "diagnostic_tests_test_code_key" UNIQUE (test_code);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.dispense_events'::regclass and conname='dispense_events_pkey') then
    alter table public."dispense_events" add constraint "dispense_events_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.dispense_events'::regclass and conname='dispense_events_quantity_check') then
    alter table public."dispense_events" add constraint "dispense_events_quantity_check" CHECK ((quantity > 0));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_appointment_id_key') then
    alter table public."encounters" add constraint "encounters_appointment_id_key" UNIQUE (appointment_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_pkey') then
    alter table public."encounters" add constraint "encounters_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_status_check') then
    alter table public."encounters" add constraint "encounters_status_check" CHECK ((status = ANY (ARRAY['IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='valid_follow_up') then
    alter table public."encounters" add constraint "valid_follow_up" CHECK (((follow_up_in_days IS NULL) OR (follow_up_in_days >= 0)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='valid_spo2') then
    alter table public."encounters" add constraint "valid_spo2" CHECK (((spo2_percent IS NULL) OR ((spo2_percent >= 0) AND (spo2_percent <= 100))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.facilities'::regclass and conname='facilities_pkey') then
    alter table public."facilities" add constraint "facilities_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.health_records'::regclass and conname='health_records_pkey') then
    alter table public."health_records" add constraint "health_records_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.health_records'::regclass and conname='health_records_verification_status_check') then
    alter table public."health_records" add constraint "health_records_verification_status_check" CHECK ((verification_status = ANY (ARRAY['UNVERIFIED'::text, 'VERIFIED'::text, 'REJECTED'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.insurance_policies'::regclass and conname='insurance_policies_pkey') then
    alter table public."insurance_policies" add constraint "insurance_policies_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_integrations'::regclass and conname='lab_machine_integrations_pkey') then
    alter table public."lab_machine_integrations" add constraint "lab_machine_integrations_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_integrations'::regclass and conname='lab_machine_integrations_protocol_check') then
    alter table public."lab_machine_integrations" add constraint "lab_machine_integrations_protocol_check" CHECK ((protocol = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_payloads'::regclass and conname='lab_machine_payloads_pkey') then
    alter table public."lab_machine_payloads" add constraint "lab_machine_payloads_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_payloads'::regclass and conname='lab_machine_payloads_source_type_check') then
    alter table public."lab_machine_payloads" add constraint "lab_machine_payloads_source_type_check" CHECK ((source_type = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_flag_check') then
    alter table public."lab_observations" add constraint "lab_observations_flag_check" CHECK ((flag = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'ABNORMAL'::text, 'UNKNOWN'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_pkey') then
    alter table public."lab_observations" add constraint "lab_observations_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_source_type_check') then
    alter table public."lab_observations" add constraint "lab_observations_source_type_check" CHECK ((source_type = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_pkey') then
    alter table public."lab_orders" add constraint "lab_orders_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_results'::regclass and conname='lab_results_lab_order_id_key') then
    alter table public."lab_results" add constraint "lab_results_lab_order_id_key" UNIQUE (lab_order_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_results'::regclass and conname='lab_results_pkey') then
    alter table public."lab_results" add constraint "lab_results_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_pkey') then
    alter table public."lab_specimens" add constraint "lab_specimens_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_sample_code_key') then
    alter table public."lab_specimens" add constraint "lab_specimens_sample_code_key" UNIQUE (sample_code);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_status_check') then
    alter table public."lab_specimens" add constraint "lab_specimens_status_check" CHECK ((status = ANY (ARRAY['COLLECTION_PENDING'::text, 'COLLECTED'::text, 'PACKED'::text, 'IN_TRANSIT'::text, 'RECEIVED_AT_LAB'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'CANCELLED'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_test_capabilities'::regclass and conname='lab_test_capabilities_lab_provider_id_diagnostic_test_id_key') then
    alter table public."lab_test_capabilities" add constraint "lab_test_capabilities_lab_provider_id_diagnostic_test_id_key" UNIQUE (lab_provider_id, diagnostic_test_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_test_capabilities'::regclass and conname='lab_test_capabilities_pkey') then
    alter table public."lab_test_capabilities" add constraint "lab_test_capabilities_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_abha_link_status_check') then
    alter table public."patient_profiles" add constraint "patient_profiles_abha_link_status_check" CHECK ((abha_link_status = ANY (ARRAY['NOT_LINKED'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text, 'DEMO'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_patient_code_key') then
    alter table public."patient_profiles" add constraint "patient_profiles_patient_code_key" UNIQUE (patient_code);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_pkey') then
    alter table public."patient_profiles" add constraint "patient_profiles_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_user_id_key') then
    alter table public."patient_profiles" add constraint "patient_profiles_user_id_key" UNIQUE (user_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.pharmacy_inventory'::regclass and conname='pharmacy_inventory_pkey') then
    alter table public."pharmacy_inventory" add constraint "pharmacy_inventory_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.pharmacy_inventory'::regclass and conname='pharmacy_inventory_quantity_check') then
    alter table public."pharmacy_inventory" add constraint "pharmacy_inventory_quantity_check" CHECK ((quantity >= 0));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescription_items'::regclass and conname='prescription_items_pkey') then
    alter table public."prescription_items" add constraint "prescription_items_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_pkey') then
    alter table public."prescriptions" add constraint "prescriptions_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_status_check') then
    alter table public."prescriptions" add constraint "prescriptions_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CANCELLED'::text, 'SUPERSEDED'::text, 'COMPLETED'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_pkey') then
    alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_availability_overrides'::regclass and conname='provider_availability_overrides_availability_status_check') then
    alter table public."provider_availability_overrides" add constraint "provider_availability_overrides_availability_status_check" CHECK ((availability_status = ANY (ARRAY['AVAILABLE'::text, 'UNAVAILABLE'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_availability_overrides'::regclass and conname='provider_availability_overrides_pkey') then
    alter table public."provider_availability_overrides" add constraint "provider_availability_overrides_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_availability_overrides'::regclass and conname='valid_override_time') then
    alter table public."provider_availability_overrides" add constraint "valid_override_time" CHECK ((ends_at > starts_at));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_practices'::regclass and conname='provider_practices_consultation_mode_check') then
    alter table public."provider_practices" add constraint "provider_practices_consultation_mode_check" CHECK ((consultation_mode = ANY (ARRAY['PHYSICAL'::text, 'TELECONSULT'::text, 'BOTH'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_practices'::regclass and conname='provider_practices_pkey') then
    alter table public."provider_practices" add constraint "provider_practices_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_profiles'::regclass and conname='provider_profiles_pkey') then
    alter table public."provider_profiles" add constraint "provider_profiles_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_profiles'::regclass and conname='provider_profiles_provider_type_check') then
    alter table public."provider_profiles" add constraint "provider_profiles_provider_type_check" CHECK ((provider_type = ANY (ARRAY['DOCTOR'::app_role, 'LAB'::app_role, 'PHARMACY'::app_role, 'WORKER'::app_role, 'FACILITY'::app_role])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_profiles'::regclass and conname='provider_profiles_user_id_key') then
    alter table public."provider_profiles" add constraint "provider_profiles_user_id_key" UNIQUE (user_id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='provider_schedules_day_of_week_check') then
    alter table public."provider_schedules" add constraint "provider_schedules_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='provider_schedules_pkey') then
    alter table public."provider_schedules" add constraint "provider_schedules_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='provider_schedules_slot_minutes_check') then
    alter table public."provider_schedules" add constraint "provider_schedules_slot_minutes_check" CHECK (((slot_minutes >= 5) AND (slot_minutes <= 240)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='valid_schedule_time') then
    alter table public."provider_schedules" add constraint "valid_schedule_time" CHECK ((end_time > start_time));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_custody_events'::regclass and conname='sample_custody_events_event_type_check') then
    alter table public."sample_custody_events" add constraint "sample_custody_events_event_type_check" CHECK ((event_type = ANY (ARRAY['CREATED'::text, 'COLLECTED'::text, 'PACKED'::text, 'HANDOVER'::text, 'DISPATCHED'::text, 'IN_TRANSIT'::text, 'RECEIVED'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'PROCESSING_STARTED'::text, 'PROCESSING_COMPLETED'::text, 'OTHER'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_custody_events'::regclass and conname='sample_custody_events_pkey') then
    alter table public."sample_custody_events" add constraint "sample_custody_events_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_transports'::regclass and conname='sample_transports_pkey') then
    alter table public."sample_transports" add constraint "sample_transports_pkey" PRIMARY KEY (id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_transports'::regclass and conname='sample_transports_status_check') then
    alter table public."sample_transports" add constraint "sample_transports_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ASSIGNED'::text, 'PICKED_UP'::text, 'IN_TRANSIT'::text, 'DELIVERED'::text, 'FAILED'::text, 'CANCELLED'::text])));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_doctor_provider_id_fkey') then
    alter table public."appointments" add constraint "appointments_doctor_provider_id_fkey" FOREIGN KEY (doctor_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_patient_id_fkey') then
    alter table public."appointments" add constraint "appointments_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='appointments_practice_id_fkey') then
    alter table public."appointments" add constraint "appointments_practice_id_fkey" FOREIGN KEY (practice_id) REFERENCES provider_practices(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.audit_logs'::regclass and conname='audit_logs_actor_user_id_fkey') then
    alter table public."audit_logs" add constraint "audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.care_events'::regclass and conname='care_events_actor_user_id_fkey') then
    alter table public."care_events" add constraint "care_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.care_events'::regclass and conname='care_events_patient_id_fkey') then
    alter table public."care_events" add constraint "care_events_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.care_gaps'::regclass and conname='care_gaps_patient_id_fkey') then
    alter table public."care_gaps" add constraint "care_gaps_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centre_tests'::regclass and conname='collection_centre_tests_collection_centre_id_fkey') then
    alter table public."collection_centre_tests" add constraint "collection_centre_tests_collection_centre_id_fkey" FOREIGN KEY (collection_centre_id) REFERENCES collection_centres(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centre_tests'::regclass and conname='collection_centre_tests_diagnostic_test_id_fkey') then
    alter table public."collection_centre_tests" add constraint "collection_centre_tests_diagnostic_test_id_fkey" FOREIGN KEY (diagnostic_test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.collection_centres'::regclass and conname='collection_centres_facility_id_fkey') then
    alter table public."collection_centres" add constraint "collection_centres_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_parameters'::regclass and conname='diagnostic_parameters_test_id_fkey') then
    alter table public."diagnostic_parameters" add constraint "diagnostic_parameters_test_id_fkey" FOREIGN KEY (test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_reference_ranges'::regclass and conname='diagnostic_reference_ranges_lab_provider_id_fkey') then
    alter table public."diagnostic_reference_ranges" add constraint "diagnostic_reference_ranges_lab_provider_id_fkey" FOREIGN KEY (lab_provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.diagnostic_reference_ranges'::regclass and conname='diagnostic_reference_ranges_parameter_id_fkey') then
    alter table public."diagnostic_reference_ranges" add constraint "diagnostic_reference_ranges_parameter_id_fkey" FOREIGN KEY (parameter_id) REFERENCES diagnostic_parameters(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.dispense_events'::regclass and conname='dispense_events_pharmacy_provider_id_fkey') then
    alter table public."dispense_events" add constraint "dispense_events_pharmacy_provider_id_fkey" FOREIGN KEY (pharmacy_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.dispense_events'::regclass and conname='dispense_events_prescription_item_id_fkey') then
    alter table public."dispense_events" add constraint "dispense_events_prescription_item_id_fkey" FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_appointment_id_fkey') then
    alter table public."encounters" add constraint "encounters_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_doctor_provider_id_fkey') then
    alter table public."encounters" add constraint "encounters_doctor_provider_id_fkey" FOREIGN KEY (doctor_provider_id) REFERENCES provider_profiles(id) ON DELETE RESTRICT;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.encounters'::regclass and conname='encounters_patient_id_fkey') then
    alter table public."encounters" add constraint "encounters_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.facilities'::regclass and conname='facilities_owner_user_id_fkey') then
    alter table public."facilities" add constraint "facilities_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.health_records'::regclass and conname='health_records_patient_id_fkey') then
    alter table public."health_records" add constraint "health_records_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.health_records'::regclass and conname='health_records_verified_by_fkey') then
    alter table public."health_records" add constraint "health_records_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.insurance_policies'::regclass and conname='insurance_policies_patient_id_fkey') then
    alter table public."insurance_policies" add constraint "insurance_policies_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_integrations'::regclass and conname='lab_machine_integrations_lab_provider_id_fkey') then
    alter table public."lab_machine_integrations" add constraint "lab_machine_integrations_lab_provider_id_fkey" FOREIGN KEY (lab_provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_payloads'::regclass and conname='lab_machine_payloads_lab_order_id_fkey') then
    alter table public."lab_machine_payloads" add constraint "lab_machine_payloads_lab_order_id_fkey" FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_machine_payloads'::regclass and conname='lab_machine_payloads_machine_integration_id_fkey') then
    alter table public."lab_machine_payloads" add constraint "lab_machine_payloads_machine_integration_id_fkey" FOREIGN KEY (machine_integration_id) REFERENCES lab_machine_integrations(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_lab_order_id_fkey') then
    alter table public."lab_observations" add constraint "lab_observations_lab_order_id_fkey" FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_machine_payload_id_fkey') then
    alter table public."lab_observations" add constraint "lab_observations_machine_payload_id_fkey" FOREIGN KEY (machine_payload_id) REFERENCES lab_machine_payloads(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_parameter_id_fkey') then
    alter table public."lab_observations" add constraint "lab_observations_parameter_id_fkey" FOREIGN KEY (parameter_id) REFERENCES diagnostic_parameters(id) ON DELETE RESTRICT;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_observations'::regclass and conname='lab_observations_verified_by_fkey') then
    alter table public."lab_observations" add constraint "lab_observations_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_appointment_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_collection_centre_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_collection_centre_id_fkey" FOREIGN KEY (collection_centre_id) REFERENCES collection_centres(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_diagnostic_test_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_diagnostic_test_id_fkey" FOREIGN KEY (diagnostic_test_id) REFERENCES diagnostic_tests(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_doctor_provider_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_doctor_provider_id_fkey" FOREIGN KEY (doctor_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_encounter_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_encounter_id_fkey" FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_lab_provider_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_lab_provider_id_fkey" FOREIGN KEY (lab_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_orders'::regclass and conname='lab_orders_patient_id_fkey') then
    alter table public."lab_orders" add constraint "lab_orders_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_results'::regclass and conname='lab_results_doctor_reviewed_by_fkey') then
    alter table public."lab_results" add constraint "lab_results_doctor_reviewed_by_fkey" FOREIGN KEY (doctor_reviewed_by) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_results'::regclass and conname='lab_results_entered_by_lab_provider_id_fkey') then
    alter table public."lab_results" add constraint "lab_results_entered_by_lab_provider_id_fkey" FOREIGN KEY (entered_by_lab_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_results'::regclass and conname='lab_results_lab_order_id_fkey') then
    alter table public."lab_results" add constraint "lab_results_lab_order_id_fkey" FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_collection_centre_id_fkey') then
    alter table public."lab_specimens" add constraint "lab_specimens_collection_centre_id_fkey" FOREIGN KEY (collection_centre_id) REFERENCES collection_centres(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_lab_order_id_fkey') then
    alter table public."lab_specimens" add constraint "lab_specimens_lab_order_id_fkey" FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_specimens'::regclass and conname='lab_specimens_processing_lab_provider_id_fkey') then
    alter table public."lab_specimens" add constraint "lab_specimens_processing_lab_provider_id_fkey" FOREIGN KEY (processing_lab_provider_id) REFERENCES provider_profiles(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_test_capabilities'::regclass and conname='lab_test_capabilities_diagnostic_test_id_fkey') then
    alter table public."lab_test_capabilities" add constraint "lab_test_capabilities_diagnostic_test_id_fkey" FOREIGN KEY (diagnostic_test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.lab_test_capabilities'::regclass and conname='lab_test_capabilities_lab_provider_id_fkey') then
    alter table public."lab_test_capabilities" add constraint "lab_test_capabilities_lab_provider_id_fkey" FOREIGN KEY (lab_provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_profiles'::regclass and conname='patient_profiles_user_id_fkey') then
    alter table public."patient_profiles" add constraint "patient_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.pharmacy_inventory'::regclass and conname='pharmacy_inventory_pharmacy_provider_id_fkey') then
    alter table public."pharmacy_inventory" add constraint "pharmacy_inventory_pharmacy_provider_id_fkey" FOREIGN KEY (pharmacy_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescription_items'::regclass and conname='prescription_items_prescription_id_fkey') then
    alter table public."prescription_items" add constraint "prescription_items_prescription_id_fkey" FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_appointment_id_fkey') then
    alter table public."prescriptions" add constraint "prescriptions_appointment_id_fkey" FOREIGN KEY (appointment_id) REFERENCES appointments(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_doctor_provider_id_fkey') then
    alter table public."prescriptions" add constraint "prescriptions_doctor_provider_id_fkey" FOREIGN KEY (doctor_provider_id) REFERENCES provider_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_encounter_id_fkey') then
    alter table public."prescriptions" add constraint "prescriptions_encounter_id_fkey" FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.prescriptions'::regclass and conname='prescriptions_patient_id_fkey') then
    alter table public."prescriptions" add constraint "prescriptions_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_id_fkey') then
    alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_availability_overrides'::regclass and conname='provider_availability_overrides_practice_id_fkey') then
    alter table public."provider_availability_overrides" add constraint "provider_availability_overrides_practice_id_fkey" FOREIGN KEY (practice_id) REFERENCES provider_practices(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_availability_overrides'::regclass and conname='provider_availability_overrides_provider_id_fkey') then
    alter table public."provider_availability_overrides" add constraint "provider_availability_overrides_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_practices'::regclass and conname='provider_practices_facility_id_fkey') then
    alter table public."provider_practices" add constraint "provider_practices_facility_id_fkey" FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_practices'::regclass and conname='provider_practices_provider_id_fkey') then
    alter table public."provider_practices" add constraint "provider_practices_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_profiles'::regclass and conname='provider_profiles_user_id_fkey') then
    alter table public."provider_profiles" add constraint "provider_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='provider_schedules_practice_id_fkey') then
    alter table public."provider_schedules" add constraint "provider_schedules_practice_id_fkey" FOREIGN KEY (practice_id) REFERENCES provider_practices(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.provider_schedules'::regclass and conname='provider_schedules_provider_id_fkey') then
    alter table public."provider_schedules" add constraint "provider_schedules_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES provider_profiles(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_custody_events'::regclass and conname='sample_custody_events_actor_user_id_fkey') then
    alter table public."sample_custody_events" add constraint "sample_custody_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_custody_events'::regclass and conname='sample_custody_events_specimen_id_fkey') then
    alter table public."sample_custody_events" add constraint "sample_custody_events_specimen_id_fkey" FOREIGN KEY (specimen_id) REFERENCES lab_specimens(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sample_transports'::regclass and conname='sample_transports_specimen_id_fkey') then
    alter table public."sample_transports" add constraint "sample_transports_specimen_id_fkey" FOREIGN KEY (specimen_id) REFERENCES lab_specimens(id) ON DELETE CASCADE;
  end if;
end $reconcile$;
CREATE UNIQUE INDEX IF NOT EXISTS appointments_unique_active_doctor_slot ON public.appointments USING btree (doctor_provider_id, scheduled_at) WHERE (status <> ALL (ARRAY['CANCELLED'::text, 'REJECTED'::text]));
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_time ON public.appointments USING btree (doctor_provider_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON public.appointments USING btree (patient_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_collection_centre_tests_centre ON public.collection_centre_tests USING btree (collection_centre_id, active);
CREATE INDEX IF NOT EXISTS idx_collection_centres_location ON public.collection_centres USING btree (state, district, active);
CREATE INDEX IF NOT EXISTS diagnostic_parameters_test_idx ON public.diagnostic_parameters USING btree (test_id);
CREATE INDEX IF NOT EXISTS encounters_appointment_idx ON public.encounters USING btree (appointment_id);
CREATE INDEX IF NOT EXISTS encounters_doctor_idx ON public.encounters USING btree (doctor_provider_id);
CREATE INDEX IF NOT EXISTS encounters_patient_idx ON public.encounters USING btree (patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS facilities_hfr_id_unique ON public.facilities USING btree (lower(hfr_id)) WHERE (hfr_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS facilities_hfr_unique ON public.facilities USING btree (lower(hfr_id)) WHERE (hfr_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS facilities_location_search_idx ON public.facilities USING btree (state, city);
CREATE INDEX IF NOT EXISTS lab_observations_order_idx ON public.lab_observations USING btree (lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_specimens_collection_centre ON public.lab_specimens USING btree (collection_centre_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_specimens_order ON public.lab_specimens USING btree (lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_specimens_processing_lab ON public.lab_specimens USING btree (processing_lab_provider_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_test_capabilities_test ON public.lab_test_capabilities USING btree (diagnostic_test_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS patient_profiles_abha_address_unique ON public.patient_profiles USING btree (lower(abha_address)) WHERE (abha_address IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_provider_practices_city ON public.provider_practices USING btree (city);
CREATE INDEX IF NOT EXISTS idx_provider_practices_provider ON public.provider_practices USING btree (provider_id);
CREATE INDEX IF NOT EXISTS provider_profiles_doctor_search_idx ON public.provider_profiles USING btree (provider_type, verification_status, state, city);
CREATE UNIQUE INDEX IF NOT EXISTS provider_profiles_hpr_id_unique ON public.provider_profiles USING btree (lower(hpr_id)) WHERE (hpr_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS provider_profiles_hpr_unique ON public.provider_profiles USING btree (lower(hpr_id)) WHERE (hpr_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS provider_profiles_location_idx ON public.provider_profiles USING btree (state, city);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_day ON public.provider_schedules USING btree (day_of_week);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_practice ON public.provider_schedules USING btree (practice_id);
CREATE INDEX IF NOT EXISTS idx_provider_schedules_provider ON public.provider_schedules USING btree (provider_id);
CREATE INDEX IF NOT EXISTS idx_sample_custody_specimen_time ON public.sample_custody_events USING btree (specimen_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sample_transport_specimen ON public.sample_transports USING btree (specimen_id, status);

CREATE OR REPLACE FUNCTION public.create_patient_profile(p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_sex text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pid uuid; code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.patient_profiles where user_id=auth.uid()) then raise exception 'Patient profile already exists'; end if;
  code := 'SS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.patient_code_seq')::text,6,'0');
  insert into public.patient_profiles(user_id,patient_code,full_name,date_of_birth,sex,phone,city,state,preferred_language)
  values(auth.uid(),code,p_full_name,p_date_of_birth,p_sex,p_phone,p_city,p_state,p_preferred_language) returning id into pid;
  update public.profiles set role='PATIENT',full_name=p_full_name,updated_at=now() where id=auth.uid();
  return pid;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare requested text;
begin
  requested := upper(coalesce(new.raw_user_meta_data->>'requested_role','PATIENT'));
  insert into public.profiles(id,role,full_name)
  values(new.id,
    case when requested in ('DOCTOR','LAB','PHARMACY','WORKER','FACILITY') then requested::public.app_role else 'PATIENT'::public.app_role end,
    nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.my_role()='ADMIN' $function$
;

CREATE OR REPLACE FUNCTION public.is_approved_provider(pt app_role DEFAULT NULL::app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from public.provider_profiles where user_id=auth.uid() and verification_status='APPROVED' and (pt is null or provider_type=pt)) $function$
;

CREATE OR REPLACE FUNCTION public.my_provider_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select id from public.provider_profiles where user_id=auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.profiles where id=auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.register_demo_patient(p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_sex text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_patient_id uuid;
    v_patient_code text;
    v_demo_number bigint;
    v_demo_abha text;
begin

    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    -- Prevent second onboarding / duplicate profile.
    if exists (
        select 1
        from public.patient_profiles
        where user_id = auth.uid()
    ) then
        select
            id,
            patient_code,
            abha_address
        into
            v_patient_id,
            v_patient_code,
            v_demo_abha
        from public.patient_profiles
        where user_id = auth.uid();

        return jsonb_build_object(
            'patient_id', v_patient_id,
            'patient_code', v_patient_code,
            'demo_abha_id', v_demo_abha,
            'already_registered', true
        );
    end if;

    v_demo_number := nextval('public.demo_abha_seq');

    v_demo_abha :=
        'DEMO-ABHA-' ||
        lpad(v_demo_number::text, 3, '0');

    v_patient_code :=
        'SS-' ||
        to_char(current_date, 'YYYY') ||
        '-' ||
        lpad(
            nextval('public.patient_code_seq')::text,
            6,
            '0'
        );

    insert into public.patient_profiles (
        user_id,
        patient_code,
        full_name,
        date_of_birth,
        sex,
        phone,
        city,
        state,
        preferred_language,
        abha_number_masked,
        abha_address,
        abha_link_status,
        identity_source,
        registry_verified
    )
    values (
        auth.uid(),
        v_patient_code,
        nullif(trim(p_full_name), ''),
        p_date_of_birth,
        nullif(trim(p_sex), ''),
        nullif(trim(p_phone), ''),
        nullif(trim(p_city), ''),
        nullif(trim(p_state), ''),
        nullif(trim(p_preferred_language), ''),
        v_demo_abha,
        v_demo_abha,
        'DEMO',
        'DEMO',
        false
    )
    returning id into v_patient_id;

    update public.profiles
    set
        role = 'PATIENT',
        full_name = nullif(trim(p_full_name), ''),
        updated_at = now()
    where id = auth.uid();

    return jsonb_build_object(
        'patient_id', v_patient_id,
        'patient_code', v_patient_code,
        'demo_abha_id', v_demo_abha,
        'already_registered', false
    );

end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_demo_provider(p_provider_type app_role, p_full_name text, p_registration_id text DEFAULT NULL::text, p_specialization text DEFAULT NULL::text, p_organization_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_address_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_provider_id uuid;
    v_facility_id uuid;
    v_demo_number bigint;
    v_registry_id text;
    v_facility_type text;
begin

    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if p_provider_type not in (
        'DOCTOR',
        'LAB',
        'PHARMACY',
        'WORKER',
        'FACILITY'
    ) then
        raise exception 'Invalid provider type';
    end if;

    if nullif(trim(p_full_name), '') is null then
        raise exception 'Name is required';
    end if;


    -- --------------------------------------------------------
    -- Existing account should NOT be forced through onboarding.
    -- --------------------------------------------------------

    if exists (
        select 1
        from public.provider_profiles
        where user_id = auth.uid()
    ) then

        select id
        into v_provider_id
        from public.provider_profiles
        where user_id = auth.uid();

        return jsonb_build_object(
            'provider_id', v_provider_id,
            'already_registered', true
        );

    end if;


    -- --------------------------------------------------------
    -- Generate role-specific demo registry identity
    -- --------------------------------------------------------

    if p_provider_type = 'DOCTOR' then

        v_demo_number :=
            nextval('public.demo_hpr_seq');

        v_registry_id :=
            'DEMO-HPR-' ||
            lpad(v_demo_number::text, 3, '0');


    elsif p_provider_type = 'WORKER' then

        v_demo_number :=
            nextval('public.demo_worker_seq');

        v_registry_id :=
            'DEMO-WORKER-' ||
            lpad(v_demo_number::text, 3, '0');


    elsif p_provider_type = 'FACILITY' then

        v_demo_number :=
            nextval('public.demo_hfr_hospital_seq');

        v_registry_id :=
            'DEMO-HFR-HOSP-' ||
            lpad(v_demo_number::text, 3, '0');


    elsif p_provider_type = 'LAB' then

        v_demo_number :=
            nextval('public.demo_hfr_lab_seq');

        v_registry_id :=
            'DEMO-HFR-LAB-' ||
            lpad(v_demo_number::text, 3, '0');


    elsif p_provider_type = 'PHARMACY' then

        v_demo_number :=
            nextval('public.demo_hfr_pharmacy_seq');

        v_registry_id :=
            'DEMO-HFR-PHARMA-' ||
            lpad(v_demo_number::text, 3, '0');

    end if;


    -- --------------------------------------------------------
    -- Operational account profile
    -- --------------------------------------------------------

    insert into public.provider_profiles (
        user_id,
        provider_type,
        full_name,
        registration_id,
        specialization,
        organization_name,
        verification_status,
        hpr_id,
        city,
        state,
        phone,
        identity_source,
        registry_verified
    )
    values (
        auth.uid(),
        p_provider_type,
        trim(p_full_name),
        nullif(trim(p_registration_id), ''),
        nullif(trim(p_specialization), ''),
        nullif(trim(p_organization_name), ''),
        'PENDING',

        case
            when p_provider_type = 'DOCTOR'
            then v_registry_id
            else null
        end,

        nullif(trim(p_city), ''),
        nullif(trim(p_state), ''),
        nullif(trim(p_phone), ''),
        'DEMO',
        false
    )
    returning id into v_provider_id;


    -- --------------------------------------------------------
    -- Facility entity for Hospital / Lab / Pharmacy
    -- --------------------------------------------------------

    if p_provider_type in (
        'FACILITY',
        'LAB',
        'PHARMACY'
    ) then

        v_facility_type :=
            case
                when p_provider_type = 'FACILITY'
                    then 'HOSPITAL'
                when p_provider_type = 'LAB'
                    then 'DIAGNOSTIC_LAB'
                when p_provider_type = 'PHARMACY'
                    then 'PHARMACY'
            end;

        insert into public.facilities (
            owner_user_id,
            name,
            facility_type,
            registration_id,
            address_text,
            city,
            state,
            verification_status,
            hfr_id,
            identity_source,
            registry_verified,
            phone
        )
        values (
            auth.uid(),
            trim(p_full_name),
            v_facility_type,
            nullif(trim(p_registration_id), ''),
            nullif(trim(p_address_text), ''),
            nullif(trim(p_city), ''),
            nullif(trim(p_state), ''),
            'PENDING',
            v_registry_id,
            'DEMO',
            false,
            nullif(trim(p_phone), '')
        )
        returning id into v_facility_id;

    end if;


    update public.profiles
    set
        role = p_provider_type,
        full_name = trim(p_full_name),
        updated_at = now()
    where id = auth.uid();


    return jsonb_build_object(
        'provider_id', v_provider_id,
        'facility_id', v_facility_id,
        'demo_registry_id', v_registry_id,
        'already_registered', false
    );

end;
$function$
;
alter table public."provider_profiles" enable row level security;
alter table public."appointments" enable row level security;
alter table public."patient_profiles" enable row level security;
alter table public."profiles" enable row level security;
alter table public."health_records" enable row level security;
alter table public."insurance_policies" enable row level security;
alter table public."prescription_items" enable row level security;
alter table public."pharmacy_inventory" enable row level security;
alter table public."dispense_events" enable row level security;
alter table public."care_events" enable row level security;
alter table public."care_gaps" enable row level security;
alter table public."audit_logs" enable row level security;
alter table public."prescriptions" enable row level security;
alter table public."lab_orders" enable row level security;
alter table public."lab_results" enable row level security;
alter table public."facilities" enable row level security;
alter table public."provider_practices" enable row level security;
alter table public."provider_schedules" enable row level security;
alter table public."provider_availability_overrides" enable row level security;
alter table public."encounters" enable row level security;
alter table public."diagnostic_tests" enable row level security;
alter table public."diagnostic_reference_ranges" enable row level security;
alter table public."lab_machine_integrations" enable row level security;
alter table public."lab_machine_payloads" enable row level security;
alter table public."lab_observations" enable row level security;
alter table public."diagnostic_parameters" enable row level security;
alter table public."collection_centres" enable row level security;
alter table public."collection_centre_tests" enable row level security;
alter table public."lab_test_capabilities" enable row level security;
alter table public."lab_specimens" enable row level security;
alter table public."sample_custody_events" enable row level security;
alter table public."sample_transports" enable row level security;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='appointments_doctor_update') then
    create policy "appointments_doctor_update" on "public"."appointments" as PERMISSIVE for UPDATE to "authenticated" using ((doctor_provider_id = my_provider_id())) with check ((doctor_provider_id = my_provider_id()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='appointments_patient_create') then
    create policy "appointments_patient_create" on "public"."appointments" as PERMISSIVE for INSERT to "authenticated" with check (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM provider_profiles p
  WHERE ((p.id = appointments.doctor_provider_id) AND (p.provider_type = 'DOCTOR'::app_role) AND (p.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='appointments_patient_read') then
    create policy "appointments_patient_read" on "public"."appointments" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR (doctor_provider_id = my_provider_id()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_admin_only') then
    create policy "audit_admin_only" on "public"."audit_logs" as PERMISSIVE for SELECT to "authenticated" using (is_admin());
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='care_events' and policyname='care_events_patient_read') then
    create policy "care_events_patient_read" on "public"."care_events" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='care_gaps' and policyname='care_gaps_patient_read') then
    create policy "care_gaps_patient_read" on "public"."care_gaps" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='collection_centre_tests' and policyname='authenticated can view collection centre tests') then
    create policy "authenticated can view collection centre tests" on "public"."collection_centre_tests" as PERMISSIVE for SELECT to "authenticated" using ((active = true));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='collection_centres' and policyname='authenticated can view active collection centres') then
    create policy "authenticated can view active collection centres" on "public"."collection_centres" as PERMISSIVE for SELECT to "authenticated" using ((active = true));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='diagnostic_parameters' and policyname='authenticated read diagnostic parameters') then
    create policy "authenticated read diagnostic parameters" on "public"."diagnostic_parameters" as PERMISSIVE for SELECT to "authenticated" using ((active = true));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='diagnostic_reference_ranges' and policyname='authenticated read reference ranges') then
    create policy "authenticated read reference ranges" on "public"."diagnostic_reference_ranges" as PERMISSIVE for SELECT to "authenticated" using (true);
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='diagnostic_tests' and policyname='authenticated read diagnostic tests') then
    create policy "authenticated read diagnostic tests" on "public"."diagnostic_tests" as PERMISSIVE for SELECT to "authenticated" using ((active = true));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='dispense_events' and policyname='dispense_pharmacy_insert') then
    create policy "dispense_pharmacy_insert" on "public"."dispense_events" as PERMISSIVE for INSERT to "authenticated" with check (((pharmacy_provider_id = my_provider_id()) AND is_approved_provider('PHARMACY'::app_role)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='dispense_events' and policyname='dispense_read') then
    create policy "dispense_read" on "public"."dispense_events" as PERMISSIVE for SELECT to "authenticated" using (((pharmacy_provider_id = my_provider_id()) OR is_admin() OR (EXISTS ( SELECT 1
   FROM (prescription_items i
     JOIN prescriptions p ON ((p.id = i.prescription_id)))
  WHERE ((i.id = dispense_events.prescription_item_id) AND (p.patient_id IN ( SELECT patient_profiles.id
           FROM patient_profiles
          WHERE (patient_profiles.user_id = auth.uid()))))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='encounters' and policyname='doctor can create own encounters') then
    create policy "doctor can create own encounters" on "public"."encounters" as PERMISSIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = encounters.doctor_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='encounters' and policyname='doctor can update own encounters') then
    create policy "doctor can update own encounters" on "public"."encounters" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = encounters.doctor_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = encounters.doctor_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='encounters' and policyname='doctor can view own encounters') then
    create policy "doctor can view own encounters" on "public"."encounters" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = encounters.doctor_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='encounters' and policyname='patient can view own encounters') then
    create policy "patient can view own encounters" on "public"."encounters" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM patient_profiles p
  WHERE ((p.id = encounters.patient_id) AND (p.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='facilities' and policyname='facilities_owner_insert') then
    create policy "facilities_owner_insert" on "public"."facilities" as PERMISSIVE for INSERT to "authenticated" with check ((owner_user_id = auth.uid()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='facilities' and policyname='facilities_read_approved') then
    create policy "facilities_read_approved" on "public"."facilities" as PERMISSIVE for SELECT to "authenticated" using (((verification_status = 'APPROVED'::verification_status) OR (owner_user_id = auth.uid()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='health_records' and policyname='health_records_patient_insert') then
    create policy "health_records_patient_insert" on "public"."health_records" as PERMISSIVE for INSERT to "authenticated" with check (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) AND (source_type = 'PATIENT_UPLOAD'::text)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='health_records' and policyname='health_records_patient_select') then
    create policy "health_records_patient_select" on "public"."health_records" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='insurance_policies' and policyname='insurance_patient_insert') then
    create policy "insurance_patient_insert" on "public"."insurance_policies" as PERMISSIVE for INSERT to "authenticated" with check ((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='insurance_policies' and policyname='insurance_patient_select') then
    create policy "insurance_patient_select" on "public"."insurance_policies" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_machine_integrations' and policyname='lab manages own machines') then
    create policy "lab manages own machines" on "public"."lab_machine_integrations" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_machine_integrations.lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_machine_integrations.lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_machine_payloads' and policyname='lab manages machine payloads') then
    create policy "lab manages machine payloads" on "public"."lab_machine_payloads" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles pp ON ((pp.id = lo.lab_provider_id)))
  WHERE ((lo.id = lab_machine_payloads.lab_order_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))) with check ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles pp ON ((pp.id = lo.lab_provider_id)))
  WHERE ((lo.id = lab_machine_payloads.lab_order_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_observations' and policyname='doctor reads ordered observations') then
    create policy "doctor reads ordered observations" on "public"."lab_observations" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles doctor ON ((doctor.id = lo.doctor_provider_id)))
  WHERE ((lo.id = lab_observations.lab_order_id) AND (doctor.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_observations' and policyname='lab manages observations') then
    create policy "lab manages observations" on "public"."lab_observations" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles pp ON ((pp.id = lo.lab_provider_id)))
  WHERE ((lo.id = lab_observations.lab_order_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))) with check ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles pp ON ((pp.id = lo.lab_provider_id)))
  WHERE ((lo.id = lab_observations.lab_order_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_observations' and policyname='patient reads own observations') then
    create policy "patient reads own observations" on "public"."lab_observations" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN patient_profiles patient ON ((patient.id = lo.patient_id)))
  WHERE ((lo.id = lab_observations.lab_order_id) AND (patient.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_orders' and policyname='lab can update assigned orders') then
    create policy "lab can update assigned orders" on "public"."lab_orders" as PERMISSIVE for UPDATE to "authenticated" using (((lab_provider_id IS NULL) OR (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_orders.lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_orders.lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_orders' and policyname='lab can view available orders') then
    create policy "lab can view available orders" on "public"."lab_orders" as PERMISSIVE for SELECT to "authenticated" using (((lab_provider_id IS NULL) OR (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_orders.lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_orders' and policyname='lab_orders_doctor_insert') then
    create policy "lab_orders_doctor_insert" on "public"."lab_orders" as PERMISSIVE for INSERT to "authenticated" with check (((doctor_provider_id = my_provider_id()) AND is_approved_provider('DOCTOR'::app_role)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_orders' and policyname='lab_orders_read') then
    create policy "lab_orders_read" on "public"."lab_orders" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR (doctor_provider_id = my_provider_id()) OR (lab_provider_id = my_provider_id()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_results' and policyname='lab can create results') then
    create policy "lab can create results" on "public"."lab_results" as PERMISSIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_results.entered_by_lab_provider_id) AND (pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_results' and policyname='lab can update own results') then
    create policy "lab can update own results" on "public"."lab_results" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_results.entered_by_lab_provider_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_results' and policyname='lab can view own results') then
    create policy "lab can view own results" on "public"."lab_results" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = lab_results.entered_by_lab_provider_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_results' and policyname='lab_results_lab_insert') then
    create policy "lab_results_lab_insert" on "public"."lab_results" as PERMISSIVE for INSERT to "authenticated" with check (((entered_by_lab_provider_id = my_provider_id()) AND is_approved_provider('LAB'::app_role)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_results' and policyname='lab_results_read') then
    create policy "lab_results_read" on "public"."lab_results" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM lab_orders o
  WHERE ((o.id = lab_results.lab_order_id) AND ((o.patient_id IN ( SELECT patient_profiles.id
           FROM patient_profiles
          WHERE (patient_profiles.user_id = auth.uid()))) OR (o.doctor_provider_id = my_provider_id()) OR (o.lab_provider_id = my_provider_id()) OR is_admin())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_specimens' and policyname='ordering doctor can view specimens') then
    create policy "ordering doctor can view specimens" on "public"."lab_specimens" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN provider_profiles dp ON ((dp.id = lo.doctor_provider_id)))
  WHERE ((lo.id = lab_specimens.lab_order_id) AND (dp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_specimens' and policyname='patient can view own specimens') then
    create policy "patient can view own specimens" on "public"."lab_specimens" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM (lab_orders lo
     JOIN patient_profiles pp ON ((pp.id = lo.patient_id)))
  WHERE ((lo.id = lab_specimens.lab_order_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_specimens' and policyname='processing lab can update specimens') then
    create policy "processing lab can update specimens" on "public"."lab_specimens" as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles lp
  WHERE ((lp.id = lab_specimens.processing_lab_provider_id) AND (lp.user_id = auth.uid()) AND (lp.provider_type = 'LAB'::app_role) AND (lp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_specimens' and policyname='processing lab can view specimens') then
    create policy "processing lab can view specimens" on "public"."lab_specimens" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles lp
  WHERE ((lp.id = lab_specimens.processing_lab_provider_id) AND (lp.user_id = auth.uid()) AND (lp.provider_type = 'LAB'::app_role) AND (lp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lab_test_capabilities' and policyname='authenticated can view active lab capabilities') then
    create policy "authenticated can view active lab capabilities" on "public"."lab_test_capabilities" as PERMISSIVE for SELECT to "authenticated" using ((active = true));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='patient_profiles' and policyname='patient_own_all_select') then
    create policy "patient_own_all_select" on "public"."patient_profiles" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='patient_profiles' and policyname='patient_own_update') then
    create policy "patient_own_update" on "public"."patient_profiles" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='pharmacy_inventory' and policyname='inventory_pharmacy_write') then
    create policy "inventory_pharmacy_write" on "public"."pharmacy_inventory" as PERMISSIVE for ALL to "authenticated" using ((pharmacy_provider_id = my_provider_id())) with check (((pharmacy_provider_id = my_provider_id()) AND is_approved_provider('PHARMACY'::app_role)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='pharmacy_inventory' and policyname='inventory_public_authenticated_read') then
    create policy "inventory_public_authenticated_read" on "public"."pharmacy_inventory" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles p
  WHERE ((p.id = pharmacy_inventory.pharmacy_provider_id) AND (p.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='prescription_items' and policyname='prescription_items_doctor_insert') then
    create policy "prescription_items_doctor_insert" on "public"."prescription_items" as PERMISSIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM prescriptions p
  WHERE ((p.id = prescription_items.prescription_id) AND (p.doctor_provider_id = my_provider_id())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='prescription_items' and policyname='prescription_items_read') then
    create policy "prescription_items_read" on "public"."prescription_items" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM prescriptions p
  WHERE ((p.id = prescription_items.prescription_id) AND ((p.patient_id IN ( SELECT patient_profiles.id
           FROM patient_profiles
          WHERE (patient_profiles.user_id = auth.uid()))) OR (p.doctor_provider_id = my_provider_id()) OR is_approved_provider('PHARMACY'::app_role) OR is_admin())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='prescriptions' and policyname='prescriptions_doctor_insert') then
    create policy "prescriptions_doctor_insert" on "public"."prescriptions" as PERMISSIVE for INSERT to "authenticated" with check (((doctor_provider_id = my_provider_id()) AND is_approved_provider('DOCTOR'::app_role)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='prescriptions' and policyname='prescriptions_patient_or_doctor_read') then
    create policy "prescriptions_patient_or_doctor_read" on "public"."prescriptions" as PERMISSIVE for SELECT to "authenticated" using (((patient_id IN ( SELECT patient_profiles.id
   FROM patient_profiles
  WHERE (patient_profiles.user_id = auth.uid()))) OR (doctor_provider_id = my_provider_id()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_select') then
    create policy "profiles_self_select" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated" using (((id = auth.uid()) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_self_update') then
    create policy "profiles_self_update" on "public"."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((id = auth.uid())) with check ((id = auth.uid()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_availability_overrides' and policyname='Authenticated users can view availability overrides') then
    create policy "Authenticated users can view availability overrides" on "public"."provider_availability_overrides" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_availability_overrides.provider_id) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status)))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_availability_overrides' and policyname='Providers can manage own availability overrides') then
    create policy "Providers can manage own availability overrides" on "public"."provider_availability_overrides" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_availability_overrides.provider_id) AND (pp.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_availability_overrides.provider_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_practices' and policyname='Authenticated users can view active approved practices') then
    create policy "Authenticated users can view active approved practices" on "public"."provider_practices" as PERMISSIVE for SELECT to "authenticated" using (((active = true) AND (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_practices.provider_id) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_practices' and policyname='Providers can manage own practices') then
    create policy "Providers can manage own practices" on "public"."provider_practices" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_practices.provider_id) AND (pp.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_practices.provider_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_profiles' and policyname='provider_self_insert') then
    create policy "provider_self_insert" on "public"."provider_profiles" as PERMISSIVE for INSERT to "authenticated" with check ((user_id = auth.uid()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_profiles' and policyname='provider_self_or_directory_select') then
    create policy "provider_self_or_directory_select" on "public"."provider_profiles" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR (verification_status = 'APPROVED'::verification_status) OR is_admin()));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_profiles' and policyname='provider_self_update') then
    create policy "provider_self_update" on "public"."provider_profiles" as PERMISSIVE for UPDATE to "authenticated" using ((user_id = auth.uid())) with check (((user_id = auth.uid()) AND (verification_status = 'PENDING'::verification_status)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_schedules' and policyname='Authenticated users can view active schedules') then
    create policy "Authenticated users can view active schedules" on "public"."provider_schedules" as PERMISSIVE for SELECT to "authenticated" using (((active = true) AND (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_schedules.provider_id) AND (pp.provider_type = 'DOCTOR'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='provider_schedules' and policyname='Providers can manage own schedules') then
    create policy "Providers can manage own schedules" on "public"."provider_schedules" as PERMISSIVE for ALL to "authenticated" using ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_schedules.provider_id) AND (pp.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.id = provider_schedules.provider_id) AND (pp.user_id = auth.uid())))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sample_custody_events' and policyname='authorized users can view sample custody') then
    create policy "authorized users can view sample custody" on "public"."sample_custody_events" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM ((((lab_specimens s
     JOIN lab_orders lo ON ((lo.id = s.lab_order_id)))
     LEFT JOIN patient_profiles pp ON ((pp.id = lo.patient_id)))
     LEFT JOIN provider_profiles dp ON ((dp.id = lo.doctor_provider_id)))
     LEFT JOIN provider_profiles lp ON ((lp.id = s.processing_lab_provider_id)))
  WHERE ((s.id = sample_custody_events.specimen_id) AND ((pp.user_id = auth.uid()) OR (dp.user_id = auth.uid()) OR (lp.user_id = auth.uid()))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='sample_transports' and policyname='authorized users can view sample transport') then
    create policy "authorized users can view sample transport" on "public"."sample_transports" as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM ((((lab_specimens s
     JOIN lab_orders lo ON ((lo.id = s.lab_order_id)))
     LEFT JOIN patient_profiles pp ON ((pp.id = lo.patient_id)))
     LEFT JOIN provider_profiles dp ON ((dp.id = lo.doctor_provider_id)))
     LEFT JOIN provider_profiles lp ON ((lp.id = s.processing_lab_provider_id)))
  WHERE ((s.id = sample_transports.specimen_id) AND ((pp.user_id = auth.uid()) OR (dp.user_id = auth.uid()) OR (lp.user_id = auth.uid()))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='health_records_delete_own') then
    create policy "health_records_delete_own" on "storage"."objects" as PERMISSIVE for DELETE to "authenticated" using (((bucket_id = 'health-records'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='health_records_insert_own') then
    create policy "health_records_insert_own" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'health-records'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='health_records_select_own') then
    create policy "health_records_select_own" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'health-records'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='labs read lab reports') then
    create policy "labs read lab reports" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'lab-reports'::text) AND (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='labs upload lab reports') then
    create policy "labs upload lab reports" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'lab-reports'::text) AND (EXISTS ( SELECT 1
   FROM provider_profiles pp
  WHERE ((pp.user_id = auth.uid()) AND (pp.provider_type = 'LAB'::app_role) AND (pp.verification_status = 'APPROVED'::verification_status))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='ordering doctor can read lab reports') then
    create policy "ordering doctor can read lab reports" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'lab-reports'::text) AND (EXISTS ( SELECT 1
   FROM ((lab_results lr
     JOIN lab_orders lo ON ((lo.id = lr.lab_order_id)))
     JOIN provider_profiles dp ON ((dp.id = lo.doctor_provider_id)))
  WHERE ((lr.report_storage_path = objects.name) AND (dp.user_id = auth.uid()))))));
  end if;
end $reconcile$;
do $reconcile$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='patient can read own lab reports') then
    create policy "patient can read own lab reports" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'lab-reports'::text) AND (EXISTS ( SELECT 1
   FROM ((lab_results lr
     JOIN lab_orders lo ON ((lo.id = lr.lab_order_id)))
     JOIN patient_profiles pp ON ((pp.id = lo.patient_id)))
  WHERE ((lr.report_storage_path = objects.name) AND (pp.user_id = auth.uid()))))));
  end if;
end $reconcile$;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_profiles" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_profiles" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."appointments" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."appointments" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."patient_profiles" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."patient_profiles" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."profiles" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."profiles" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."health_records" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."health_records" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."insurance_policies" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."insurance_policies" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."prescription_items" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."prescription_items" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."pharmacy_inventory" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."pharmacy_inventory" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."dispense_events" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."dispense_events" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."care_events" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."care_events" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."care_gaps" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."care_gaps" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."audit_logs" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."audit_logs" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."prescriptions" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."prescriptions" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_orders" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_orders" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_results" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_results" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."facilities" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."facilities" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_practices" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_practices" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_schedules" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_schedules" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_availability_overrides" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."provider_availability_overrides" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."encounters" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."encounters" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_tests" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_tests" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_reference_ranges" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_reference_ranges" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_machine_integrations" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_machine_integrations" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_machine_payloads" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_machine_payloads" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_observations" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_observations" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_parameters" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."diagnostic_parameters" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."collection_centres" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."collection_centres" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."collection_centre_tests" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."collection_centre_tests" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_test_capabilities" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_test_capabilities" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_specimens" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."lab_specimens" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."sample_custody_events" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."sample_custody_events" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."sample_transports" to "anon";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER on public."sample_transports" to "authenticated";

-- Existing storage bucket privacy/configuration was NOT included in the export.
-- 005 explicitly provisions private report storage and replaces its access assumptions.
commit;
