-- SwasthyaSetu clean core. Intentionally creates ZERO doctors, patients, labs,
-- medicines, insurance policies, appointments, reports or facilities.

create extension if not exists pgcrypto;

DO $$ BEGIN
  create type public.app_role as enum ('PATIENT','DOCTOR','LAB','PHARMACY','WORKER','FACILITY','ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type public.verification_status as enum ('PENDING','APPROVED','REJECTED','SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'PATIENT',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare requested text;
begin
  requested := upper(coalesce(new.raw_user_meta_data->>'requested_role','PATIENT'));
  insert into public.profiles(id,role,full_name)
  values(new.id,
    case when requested in ('DOCTOR','LAB','PHARMACY','WORKER','FACILITY') then requested::public.app_role else 'PATIENT'::public.app_role end,
    nullif(new.raw_user_meta_data->>'full_name',''))
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  patient_code text unique not null,
  full_name text,
  date_of_birth date,
  sex text,
  phone text,
  city text,
  state text,
  preferred_language text,
  abha_number_masked text,
  abha_address text,
  abha_link_status text not null default 'NOT_LINKED' check (abha_link_status in ('NOT_LINKED','VERIFICATION_PENDING','VERIFIED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.patient_code_seq start 1;
create or replace function public.create_patient_profile(p_full_name text,p_date_of_birth date default null,p_sex text default null,p_phone text default null,p_city text default null,p_state text default null,p_preferred_language text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from public.patient_profiles where user_id=auth.uid()) then raise exception 'Patient profile already exists'; end if;
  code := 'SS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.patient_code_seq')::text,6,'0');
  insert into public.patient_profiles(user_id,patient_code,full_name,date_of_birth,sex,phone,city,state,preferred_language)
  values(auth.uid(),code,p_full_name,p_date_of_birth,p_sex,p_phone,p_city,p_state,p_preferred_language) returning id into pid;
  update public.profiles set role='PATIENT',full_name=p_full_name,updated_at=now() where id=auth.uid();
  return pid;
end $$;

grant execute on function public.create_patient_profile(text,date,text,text,text,text,text) to authenticated;

create table if not exists public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  provider_type public.app_role not null check(provider_type in ('DOCTOR','LAB','PHARMACY','WORKER','FACILITY')),
  full_name text not null,
  registration_id text,
  specialization text,
  organization_name text,
  verification_status public.verification_status not null default 'PENDING',
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  facility_type text not null,
  registration_id text,
  address_text text,
  city text,
  state text,
  verification_status public.verification_status not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  record_type text not null,
  record_date date,
  source_type text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  verification_status text not null default 'UNVERIFIED' check(verification_status in ('UNVERIFIED','VERIFIED','REJECTED')),
  verified_by uuid references public.provider_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  insurer_name text not null,
  policy_number text not null,
  valid_from date,
  valid_to date,
  sum_insured numeric,
  source_type text not null default 'PATIENT_ENTERED',
  verification_status text not null default 'UNVERIFIED',
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  doctor_provider_id uuid not null references public.provider_profiles(id),
  scheduled_at timestamptz not null,
  mode text not null check(mode in ('PHYSICAL','TELECONSULT')),
  status text not null default 'REQUESTED' check(status in ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
  created_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id),
  doctor_provider_id uuid not null references public.provider_profiles(id),
  appointment_id uuid references public.appointments(id),
  clinical_notes text,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','CANCELLED','SUPERSEDED','COMPLETED')),
  issued_at timestamptz not null default now()
);
create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medicine_name text not null,
  strength text,
  dose text,
  route text,
  frequency text,
  duration text,
  instructions text
);

create table if not exists public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id),
  doctor_provider_id uuid not null references public.provider_profiles(id),
  lab_provider_id uuid references public.provider_profiles(id),
  test_name text not null,
  clinical_note text,
  status text not null default 'ORDERED',
  ordered_at timestamptz not null default now()
);
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid unique not null references public.lab_orders(id) on delete cascade,
  entered_by_lab_provider_id uuid references public.provider_profiles(id),
  result_json jsonb,
  report_storage_path text,
  status text not null default 'FINAL',
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_provider_id uuid not null references public.provider_profiles(id),
  medicine_name text not null,
  strength text,
  batch_number text,
  expiry_date date,
  quantity integer not null default 0 check(quantity>=0),
  mrp numeric,
  selling_price numeric,
  updated_at timestamptz not null default now()
);
create table if not exists public.dispense_events (
  id uuid primary key default gen_random_uuid(),
  prescription_item_id uuid not null references public.prescription_items(id),
  pharmacy_provider_id uuid not null references public.provider_profiles(id),
  quantity integer not null check(quantity>0),
  price_paid numeric,
  dispensed_at timestamptz not null default now()
);

create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id),
  event_type text not null,
  source_table text,
  source_id uuid,
  actor_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.care_gaps (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id),
  gap_type text not null,
  severity text not null default 'ROUTINE',
  status text not null default 'OPEN',
  source_table text,
  source_id uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Private storage bucket for patient-uploaded records.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('health-records','health-records',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false;

-- Helpers
create or replace function public.my_role() returns public.app_role language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
create or replace function public.my_provider_id() returns uuid language sql stable security definer set search_path=public as $$ select id from public.provider_profiles where user_id=auth.uid() $$;
create or replace function public.is_approved_provider(pt public.app_role default null) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.provider_profiles where user_id=auth.uid() and verification_status='APPROVED' and (pt is null or provider_type=pt)) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select public.my_role()='ADMIN' $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.provider_profiles enable row level security;
alter table public.facilities enable row level security;
alter table public.health_records enable row level security;
alter table public.insurance_policies enable row level security;
alter table public.appointments enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_results enable row level security;
alter table public.pharmacy_inventory enable row level security;
alter table public.dispense_events enable row level security;
alter table public.care_events enable row level security;
alter table public.care_gaps enable row level security;
alter table public.audit_logs enable row level security;

-- Drop/recreate policies safely
DO $$ DECLARE r record; BEGIN FOR r IN select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','patient_profiles','provider_profiles','facilities','health_records','insurance_policies','appointments','prescriptions','prescription_items','lab_orders','lab_results','pharmacy_inventory','dispense_events','care_events','care_gaps','audit_logs') LOOP execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); END LOOP; END $$;

create policy profiles_self_select on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create policy patient_own_all_select on public.patient_profiles for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy patient_own_update on public.patient_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy provider_self_insert on public.provider_profiles for insert to authenticated with check(user_id=auth.uid());
create policy provider_self_or_directory_select on public.provider_profiles for select to authenticated using(user_id=auth.uid() or verification_status='APPROVED' or public.is_admin());
create policy provider_self_update on public.provider_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and verification_status='PENDING');

create policy facilities_read_approved on public.facilities for select to authenticated using(verification_status='APPROVED' or owner_user_id=auth.uid() or public.is_admin());
create policy facilities_owner_insert on public.facilities for insert to authenticated with check(owner_user_id=auth.uid());

create policy health_records_patient_select on public.health_records for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or public.is_admin());
create policy health_records_patient_insert on public.health_records for insert to authenticated with check(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) and source_type='PATIENT_UPLOAD');

create policy insurance_patient_select on public.insurance_policies for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or public.is_admin());
create policy insurance_patient_insert on public.insurance_policies for insert to authenticated with check(patient_id in(select id from public.patient_profiles where user_id=auth.uid()));

create policy appointments_patient_read on public.appointments for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or doctor_provider_id=public.my_provider_id() or public.is_admin());
create policy appointments_patient_create on public.appointments for insert to authenticated with check(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) and exists(select 1 from public.provider_profiles p where p.id=doctor_provider_id and p.provider_type='DOCTOR' and p.verification_status='APPROVED'));
create policy appointments_doctor_update on public.appointments for update to authenticated using(doctor_provider_id=public.my_provider_id()) with check(doctor_provider_id=public.my_provider_id());

create policy prescriptions_patient_or_doctor_read on public.prescriptions for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or doctor_provider_id=public.my_provider_id() or public.is_admin());
create policy prescriptions_doctor_insert on public.prescriptions for insert to authenticated with check(doctor_provider_id=public.my_provider_id() and public.is_approved_provider('DOCTOR'));
create policy prescription_items_read on public.prescription_items for select to authenticated using(exists(select 1 from public.prescriptions p where p.id=prescription_id and (p.patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or p.doctor_provider_id=public.my_provider_id() or public.is_approved_provider('PHARMACY') or public.is_admin())));
create policy prescription_items_doctor_insert on public.prescription_items for insert to authenticated with check(exists(select 1 from public.prescriptions p where p.id=prescription_id and p.doctor_provider_id=public.my_provider_id()));

create policy lab_orders_read on public.lab_orders for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or doctor_provider_id=public.my_provider_id() or lab_provider_id=public.my_provider_id() or public.is_admin());
create policy lab_orders_doctor_insert on public.lab_orders for insert to authenticated with check(doctor_provider_id=public.my_provider_id() and public.is_approved_provider('DOCTOR'));
create policy lab_results_read on public.lab_results for select to authenticated using(exists(select 1 from public.lab_orders o where o.id=lab_order_id and (o.patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or o.doctor_provider_id=public.my_provider_id() or o.lab_provider_id=public.my_provider_id() or public.is_admin())));
create policy lab_results_lab_insert on public.lab_results for insert to authenticated with check(entered_by_lab_provider_id=public.my_provider_id() and public.is_approved_provider('LAB'));

create policy inventory_public_authenticated_read on public.pharmacy_inventory for select to authenticated using(exists(select 1 from public.provider_profiles p where p.id=pharmacy_provider_id and p.verification_status='APPROVED'));
create policy inventory_pharmacy_write on public.pharmacy_inventory for all to authenticated using(pharmacy_provider_id=public.my_provider_id()) with check(pharmacy_provider_id=public.my_provider_id() and public.is_approved_provider('PHARMACY'));
create policy dispense_read on public.dispense_events for select to authenticated using(pharmacy_provider_id=public.my_provider_id() or public.is_admin() or exists(select 1 from public.prescription_items i join public.prescriptions p on p.id=i.prescription_id where i.id=prescription_item_id and p.patient_id in(select id from public.patient_profiles where user_id=auth.uid())));
create policy dispense_pharmacy_insert on public.dispense_events for insert to authenticated with check(pharmacy_provider_id=public.my_provider_id() and public.is_approved_provider('PHARMACY'));

create policy care_events_patient_read on public.care_events for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or public.is_admin());
create policy care_gaps_patient_read on public.care_gaps for select to authenticated using(patient_id in(select id from public.patient_profiles where user_id=auth.uid()) or public.is_admin());
create policy audit_admin_only on public.audit_logs for select to authenticated using(public.is_admin());

-- Storage: patient can only access own auth.uid() prefix.
drop policy if exists health_records_insert_own on storage.objects;
drop policy if exists health_records_select_own on storage.objects;
drop policy if exists health_records_delete_own on storage.objects;
create policy health_records_insert_own on storage.objects for insert to authenticated with check(bucket_id='health-records' and (storage.foldername(name))[1]=auth.uid()::text);
create policy health_records_select_own on storage.objects for select to authenticated using(bucket_id='health-records' and (storage.foldername(name))[1]=auth.uid()::text);
create policy health_records_delete_own on storage.objects for delete to authenticated using(bucket_id='health-records' and (storage.foldername(name))[1]=auth.uid()::text);

-- Prevent clients from self-approving provider verification through direct update.
revoke update(verification_status,verification_notes) on public.provider_profiles from authenticated;
revoke update(verification_status) on public.facilities from authenticated;
