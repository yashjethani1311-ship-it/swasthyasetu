-- 033: hospital duties, procedure-room scheduling and non-medicine stores. No parallel clinical lifecycle.
begin;
create table hospital_duties(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),user_id uuid not null references auth.users(id),starts_at timestamptz not null,ends_at timestamptz not null,request_key uuid not null unique,created_at timestamptz not null default now(),check(ends_at>starts_at and ends_at<=starts_at+interval '24 hours'));
create index h4_duties_user on hospital_duties(user_id,starts_at,ends_at);
create table hospital_procedure_rooms(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),name text not null,active boolean not null default true,created_at timestamptz not null default now(),unique(facility_id,name));
create table hospital_procedure_bookings(id uuid primary key default gen_random_uuid(),room_id uuid not null references hospital_procedure_rooms(id),admission_id uuid not null references hospital_admissions(id),lab_order_id uuid not null references lab_orders(id),clinician_user_id uuid not null references auth.users(id),starts_at timestamptz not null,ends_at timestamptz not null,state text not null default 'SCHEDULED' check(state in ('SCHEDULED','CANCELLED')),request_key uuid not null unique,cancellation_reason text,created_at timestamptz not null default now(),check(ends_at>starts_at and ends_at<=starts_at+interval '12 hours'));
create index h4_room_calendar on hospital_procedure_bookings(room_id,starts_at,ends_at) where state='SCHEDULED';
create table hospital_store_items(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),item_code text not null,name text not null,unit text not null,quantity integer not null default 0 check(quantity>=0),updated_at timestamptz not null default now(),unique(facility_id,item_code));
create table hospital_store_movements(id uuid primary key default gen_random_uuid(),item_id uuid not null references hospital_store_items(id),quantity_delta integer not null check(quantity_delta<>0),reason text not null,source_reference text not null,admission_id uuid references hospital_admissions(id),request_key uuid not null unique,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['hospital_duties','hospital_procedure_rooms','hospital_procedure_bookings','hospital_store_items','hospital_store_movements'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function h4_duty(p_facility uuid,p_user uuid,p_start timestamptz,p_end timestamptz,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r hospital_duties;rid uuid;
begin
 if not h1_staff(p_facility,array['MANAGER']) or not exists(select 1 from facility_memberships where facility_id=p_facility and user_id=p_user and active) or p_start is null or p_end is null or p_start<now()-interval '1 day' or p_start>now()+interval '180 days' or p_request is null then raise exception 'Active facility manager and member with bounded shift required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,33));select * into r from hospital_duties where request_key=p_request;
 if found then if (r.facility_id,r.user_id,r.starts_at,r.ends_at) is distinct from (p_facility,p_user,p_start,p_end) then raise exception 'Duty request conflict';end if;return r.id;end if;
 if exists(select 1 from hospital_duties where user_id=p_user and starts_at<p_end and ends_at>p_start) then raise exception 'Staff duty overlaps existing assignment';end if;
 insert into hospital_duties(facility_id,user_id,starts_at,ends_at,request_key) values(p_facility,p_user,p_start,p_end,p_request) returning id into rid;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(p_facility,auth.uid(),'DUTY_RECORDED',rid);return rid;
end $$;
create function h4_room(p_facility uuid,p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if not h1_staff(p_facility,array['MANAGER']) or p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Facility manager and actual room name required';end if;
 insert into hospital_procedure_rooms(facility_id,name) values(p_facility,trim(p_name)) on conflict(facility_id,name) do nothing;
 select id into rid from hospital_procedure_rooms where facility_id=p_facility and name=trim(p_name);return rid;
end $$;
create function h4_schedule(p_room uuid,p_admission uuid,p_order uuid,p_start timestamptz,p_end timestamptz,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r hospital_procedure_rooms;a hospital_admissions;o lab_orders;b hospital_procedure_bookings;clinician uuid;rid uuid;
begin
 select * into r from hospital_procedure_rooms where id=p_room for update;select * into a from hospital_admissions where id=p_admission for share;select * into o from lab_orders where id=p_order for share;
 if r.id is null or a.id is null or o.id is null or not r.active or r.facility_id<>a.facility_id or not h1_staff(r.facility_id,array['MANAGER','CLINICIAN']) or (not h1_staff(r.facility_id,array['MANAGER']) and a.doctor_provider_id<>my_provider_id()) then raise exception 'Facility admission scheduling not authorized';end if;
 if a.status<>'ADMITTED' or o.encounter_id is distinct from a.encounter_id or o.patient_id is distinct from a.patient_id or o.workflow_kind is distinct from 'PROCEDURE' or o.status in ('COMPLETED','CANCELLED') then raise exception 'Active admission and actual ordered procedure required';end if;
 select user_id into clinician from provider_profiles where id=a.doctor_provider_id and verification_status='APPROVED';
 if clinician is null or not exists(select 1 from facility_memberships where facility_id=r.facility_id and user_id=clinician and staff_role='CLINICIAN' and active) or p_start is null or p_end is null or p_start<now() or p_start>now()+interval '180 days' or p_request is null then raise exception 'Current facility clinician and valid schedule required';end if;
 perform pg_advisory_xact_lock(hashtextextended(clinician::text,33));select * into b from hospital_procedure_bookings where request_key=p_request;
 if found then if (b.room_id,b.admission_id,b.lab_order_id,b.starts_at,b.ends_at) is distinct from (p_room,p_admission,p_order,p_start,p_end) then raise exception 'Procedure request conflict';end if;return b.id;end if;
 if not exists(select 1 from hospital_duties where facility_id=r.facility_id and user_id=clinician and starts_at<=p_start and ends_at>=p_end) then raise exception 'Clinician duty must cover procedure window';end if;
 if exists(select 1 from hospital_procedure_bookings where state='SCHEDULED' and ((starts_at<p_end and ends_at>p_start and (room_id=r.id or clinician_user_id=clinician)) or lab_order_id=o.id)) then raise exception 'Procedure room, clinician or order already reserved';end if;
 insert into hospital_procedure_bookings(room_id,admission_id,lab_order_id,clinician_user_id,starts_at,ends_at,request_key) values(r.id,a.id,o.id,clinician,p_start,p_end,p_request) returning id into rid;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(r.facility_id,auth.uid(),'PROCEDURE_ROOM_RESERVED',rid);return rid;
end $$;
create function h4_cancel_schedule(p_booking uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare b hospital_procedure_bookings;fid uuid;
begin
 select * into b from hospital_procedure_bookings where id=p_booking for update;select facility_id into fid from hospital_procedure_rooms where id=b.room_id;
 if fid is null or not h1_staff(fid,array['MANAGER']) or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Facility manager and cancellation reason required';end if;
 if b.state='CANCELLED' then return;end if;
 update hospital_procedure_bookings set state='CANCELLED',cancellation_reason=trim(p_reason) where id=b.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(fid,auth.uid(),'PROCEDURE_ROOM_CANCELLED',b.id,b.state,'CANCELLED');
end $$;
create function h4_store_item(p_facility uuid,p_code text,p_name text,p_unit text) returns uuid language plpgsql security definer set search_path=public as $$
declare r hospital_store_items;rid uuid;
begin
 if not h1_staff(p_facility,array['MANAGER']) or p_code is null or length(trim(p_code)) not between 1 and 80 or p_name is null or length(trim(p_name)) not between 1 and 200 or p_unit is null or length(trim(p_unit)) not between 1 and 30 then raise exception 'Facility store metadata required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_facility::text||':'||trim(p_code),33));select * into r from hospital_store_items where facility_id=p_facility and item_code=trim(p_code);
 if found then if (r.name,r.unit) is distinct from (trim(p_name),trim(p_unit)) then raise exception 'Store item identity conflict';end if;return r.id;end if;
 insert into hospital_store_items(facility_id,item_code,name,unit) values(p_facility,trim(p_code),trim(p_name),trim(p_unit)) returning id into rid;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(p_facility,auth.uid(),'STORE_ITEM_RECORDED',rid);return rid;
end $$;
create function h4_store_move(p_item uuid,p_delta integer,p_reason text,p_reference text,p_request uuid,p_admission uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare i hospital_store_items;m hospital_store_movements;rid uuid;
begin
 select * into i from hospital_store_items where id=p_item for update;
 if not found or not h1_staff(i.facility_id,array['MANAGER']) or p_delta is null or p_delta=0 or abs(p_delta::bigint)>1000000 or p_reason is null or length(trim(p_reason)) not between 3 and 1000 or p_reference is null or length(trim(p_reference)) not between 3 and 200 or p_request is null then raise exception 'Facility store movement with source reference required';end if;
 if p_admission is not null and not exists(select 1 from hospital_admissions where id=p_admission and facility_id=i.facility_id) then raise exception 'Store issue admission belongs to another facility';end if;
 select * into m from hospital_store_movements where request_key=p_request;
 if found then if (m.item_id,m.quantity_delta,m.reason,m.source_reference,m.admission_id) is distinct from (p_item,p_delta,trim(p_reason),trim(p_reference),p_admission) then raise exception 'Store movement request conflict';end if;return m.id;end if;
 if i.quantity::bigint+p_delta<0 then raise exception 'Insufficient hospital store stock';end if;
 insert into hospital_store_movements(item_id,quantity_delta,reason,source_reference,request_key,admission_id,actor_user_id) values(i.id,p_delta,trim(p_reason),trim(p_reference),p_request,p_admission,auth.uid()) returning id into rid;
 update hospital_store_items set quantity=quantity+p_delta,updated_at=now() where id=i.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(i.facility_id,auth.uid(),'STORE_MOVEMENT_RECORDED',rid);return rid;
end $$;
create function h4_operations(p_facility uuid,p_from timestamptz,p_until timestamptz) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not h1_staff(p_facility,array['MANAGER']) or p_from is null or p_until is null or p_until<=p_from or p_until>p_from+interval '31 days' then raise exception 'Facility manager and bounded operational window required';end if;
 return jsonb_build_object('duties',coalesce((select jsonb_agg(to_jsonb(x)) from (select d.id,d.user_id,d.starts_at,d.ends_at,exists(select 1 from facility_memberships where facility_id=p_facility and user_id=d.user_id and active) membership_current from hospital_duties d where facility_id=p_facility and starts_at<p_until and ends_at>p_from order by starts_at,id limit 100)x),'[]'),
 'procedure_bookings',coalesce((select jsonb_agg(to_jsonb(x)-'request_key') from (select b.* from hospital_procedure_bookings b join hospital_procedure_rooms r on r.id=b.room_id where r.facility_id=p_facility and b.starts_at<p_until and b.ends_at>p_from order by b.starts_at,b.id limit 100)x),'[]'),
 'store_items',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from hospital_store_items where facility_id=p_facility order by item_code limit 100)x),'[]'),
 'admitted_in_window',(select count(*) from hospital_admissions where facility_id=p_facility and admitted_at>=p_from and admitted_at<p_until),
 'discharged_in_window',(select count(*) from hospital_admissions where facility_id=p_facility and discharged_at>=p_from and discharged_at<p_until),
 'notice','Procedure reservation is not a performed procedure. Non-medicine stores do not dispense prescriptions. Lists are bounded to 100 records.');
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'h4_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;end $$;
commit;
