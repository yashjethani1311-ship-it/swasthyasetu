-- 013: facility-scoped membership, departments, reception and persisted tokens.
begin;
create table facility_memberships(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),user_id uuid not null references auth.users(id),staff_role text not null check(staff_role in ('MANAGER','RECEPTION','CLINICIAN')),active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(facility_id,user_id));
create index h1_memberships_user on facility_memberships(user_id,facility_id) where active;
create table facility_departments(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),name text not null check(length(trim(name)) between 1 and 160),active boolean not null default true,unique(facility_id,name));
create table facility_token_counters(facility_id uuid not null references facilities(id),service_date date not null,last_token integer not null check(last_token>0),primary key(facility_id,service_date));
create table reception_queue(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),appointment_id uuid not null unique references appointments(id),patient_id uuid not null references patient_profiles(id),doctor_provider_id uuid not null references provider_profiles(id),department_id uuid references facility_departments(id),service_date date not null,token_number integer not null,state text not null default 'CHECKED_IN' check(state in ('CHECKED_IN','WAITING','CALLED','SKIPPED','IN_CONSULTATION','COMPLETED','CANCELLED')),request_key uuid not null unique,checked_in_by uuid not null references auth.users(id),checked_in_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(facility_id,service_date,token_number));
create index h1_queue_facility_date on reception_queue(facility_id,service_date,token_number);
create table facility_operation_events(id bigint generated always as identity primary key,facility_id uuid not null references facilities(id),actor_user_id uuid references auth.users(id),action text not null,entity_id uuid not null,from_state text,to_state text,created_at timestamptz not null default now());
create index h1_operation_time on facility_operation_events(facility_id,id desc);
do $$declare t text;begin foreach t in array array['facility_memberships','facility_departments','facility_token_counters','reception_queue','facility_operation_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence facility_operation_events_id_seq from public,anon,authenticated;
create function h1_can_manage(p_facility uuid) returns boolean language sql stable security definer set search_path=public as $$select auth.uid() is not null and exists(select 1 from facilities f where f.id=p_facility and (f.owner_user_id=auth.uid() or is_admin()))$$;
create function h1_staff(p_facility uuid,p_roles text[]) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from facilities f join provider_profiles owner on owner.user_id=f.owner_user_id where f.id=p_facility and f.verification_status='APPROVED' and owner.verification_status='APPROVED' and (f.owner_user_id=auth.uid() or exists(select 1 from facility_memberships m where m.facility_id=f.id and m.user_id=auth.uid() and m.active and m.staff_role=any(p_roles))))
$$;
create function h1_set_member(p_facility uuid,p_user uuid,p_role text,p_active boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
 if not h1_can_manage(p_facility) then raise exception 'Facility management required';end if;
 if p_role is null or p_role not in ('MANAGER','RECEPTION','CLINICIAN') or p_active is null then raise exception 'Valid membership required';end if;
 if p_role='CLINICIAN' and not exists(select 1 from provider_profiles where user_id=p_user and provider_type='DOCTOR' and verification_status='APPROVED') then raise exception 'Approved doctor required for clinician membership';end if;
 insert into facility_memberships(facility_id,user_id,staff_role,active) values(p_facility,p_user,p_role,p_active) on conflict(facility_id,user_id) do update set staff_role=excluded.staff_role,active=excluded.active,updated_at=now() where (facility_memberships.staff_role,facility_memberships.active) is distinct from (excluded.staff_role,excluded.active) returning id into mid;
 if mid is null then select id into mid from facility_memberships where facility_id=p_facility and user_id=p_user;return mid;end if;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(p_facility,auth.uid(),'MEMBERSHIP_CHANGED',mid,case when p_active then p_role else 'INACTIVE' end);return mid;
end $$;
create function h1_department(p_facility uuid,p_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare did uuid;
begin
 if not h1_can_manage(p_facility) then raise exception 'Facility management required';end if;
 insert into facility_departments(facility_id,name) values(p_facility,trim(p_name)) on conflict(facility_id,name) do nothing returning id into did;
 if did is null then select id into did from facility_departments where facility_id=p_facility and name=trim(p_name);else insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(p_facility,auth.uid(),'DEPARTMENT_CREATED',did);end if;return did;
end $$;
create function h1_check_in(p_facility uuid,p_appointment uuid,p_department uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a appointments; pr provider_practices; prior reception_queue; day date; token integer; result uuid;
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION']) then raise exception 'Reception authorization required';end if;
 if p_request is null then raise exception 'Request key required';end if;
 select * into a from appointments where id=p_appointment for update;
 select * into prior from reception_queue where request_key=p_request;
 if found then if prior.appointment_id<>p_appointment or prior.facility_id<>p_facility or prior.department_id is distinct from p_department then raise exception 'Check-in request conflict';end if;return prior.id;end if;

 select * into pr from provider_practices where id=a.practice_id and facility_id=p_facility and active;
 if not found or a.status<>'CONFIRMED' or a.mode<>'PHYSICAL' then raise exception 'Confirmed physical facility appointment required';end if;
 if not exists(select 1 from facility_memberships m join provider_profiles d on d.user_id=m.user_id where m.facility_id=p_facility and m.active and m.staff_role='CLINICIAN' and d.id=a.doctor_provider_id and d.verification_status='APPROVED') then raise exception 'Doctor facility membership required';end if;
 if p_department is not null and not exists(select 1 from facility_departments where id=p_department and facility_id=p_facility and active) then raise exception 'Department belongs to another facility or is inactive';end if;
 select * into prior from reception_queue where appointment_id=p_appointment;
 if found then if prior.facility_id<>p_facility or prior.department_id is distinct from p_department then raise exception 'Appointment already checked in with different details';end if;return prior.id;end if;
 if exists(select 1 from encounters where appointment_id=a.id) then raise exception 'Consultation already started';end if;
 day:=(now() at time zone pr.timezone)::date;
 if (a.scheduled_at at time zone pr.timezone)::date<>day then raise exception 'Appointment is not scheduled for today';end if;
 insert into facility_token_counters(facility_id,service_date,last_token) values(p_facility,day,1) on conflict(facility_id,service_date) do update set last_token=facility_token_counters.last_token+1 returning last_token into token;
 insert into reception_queue(facility_id,appointment_id,patient_id,doctor_provider_id,department_id,service_date,token_number,request_key,checked_in_by) values(p_facility,a.id,a.patient_id,a.doctor_provider_id,p_department,day,token,p_request,auth.uid()) returning id into result;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(p_facility,auth.uid(),'CHECK_IN',result,'CHECKED_IN');return result;
end $$;
create function h1_queue_transition(p_queue uuid,p_state text) returns void language plpgsql security definer set search_path=public as $$
declare r reception_queue;
begin
 select * into r from reception_queue where id=p_queue;
 if not found or not h1_staff(r.facility_id,array['MANAGER','RECEPTION']) then raise exception 'Reception authorization required';end if;
 perform 1 from appointments where id=r.appointment_id for update;
 select * into r from reception_queue where id=p_queue for update;
 if p_state=r.state then return;end if;
 if not ((r.state='CHECKED_IN' and p_state in ('WAITING','CANCELLED')) or (r.state='WAITING' and p_state in ('CALLED','SKIPPED','CANCELLED')) or (r.state='SKIPPED' and p_state='WAITING') or (r.state='CALLED' and p_state in ('WAITING','CANCELLED'))) or p_state is null then raise exception 'Invalid queue transition';end if;
 if exists(select 1 from encounters where appointment_id=r.appointment_id) then raise exception 'Consultation already started';end if;
 update reception_queue set state=p_state,updated_at=now() where id=r.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(r.facility_id,auth.uid(),'QUEUE_TRANSITION',r.id,r.state,p_state);
end $$;
create function h1_encounter_queue() returns trigger language plpgsql security definer set search_path=public as $$
declare r reception_queue; target text;
begin
 target:=case when new.status='COMPLETED' then 'COMPLETED' else 'IN_CONSULTATION' end;
 select * into r from reception_queue where appointment_id=new.appointment_id for update;
 if not found then return new;end if;
 if r.state='CANCELLED' then raise exception 'Reception check-in cancelled';end if;
 if r.state<>target then update reception_queue set state=target,updated_at=now() where id=r.id;insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(r.facility_id,auth.uid(),'ENCOUNTER_QUEUE',r.id,r.state,target);end if;return new;
end $$;
create trigger h1_encounter_queue after insert or update of status on encounters for each row execute function h1_encounter_queue();
create function h1_queue(p_facility uuid,p_date date,p_offset integer default 0) returns table(queue_id uuid,appointment_id uuid,patient_id uuid,patient_name text,doctor_id uuid,department_id uuid,token_number integer,state text,checked_in_at timestamptz) language plpgsql stable security definer set search_path=public as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION','CLINICIAN']) or p_offset is null or p_offset not between 0 and 10000 or p_date is null then raise exception 'Facility queue not authorized';end if;
 return query select r.id,r.appointment_id,r.patient_id,p.full_name,r.doctor_provider_id,r.department_id,r.token_number,r.state,r.checked_in_at from reception_queue r join patient_profiles p on p.id=r.patient_id where r.facility_id=p_facility and r.service_date=p_date and (h1_staff(p_facility,array['MANAGER','RECEPTION']) or r.doctor_provider_id=my_provider_id()) order by r.token_number limit 50 offset p_offset;
end $$;
create function h1_my_token(p_appointment uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r reception_queue;
begin
 select q.* into r from reception_queue q join patient_profiles p on p.id=q.patient_id where q.appointment_id=p_appointment and p.user_id=auth.uid();
 if not found then raise exception 'Patient token not authorized';end if;return to_jsonb(r)-'request_key'-'checked_in_by';
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'h1_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname in ('h1_set_member','h1_department','h1_check_in','h1_queue_transition','h1_queue','h1_my_token') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;

create function h1_appointment_queue() returns trigger language plpgsql security definer set search_path=public as $$
declare r reception_queue;
begin
 if new.status in ('CANCELLED','NO_SHOW') then
  select * into r from reception_queue where appointment_id=new.id for update;
  if found and r.state not in ('COMPLETED','CANCELLED') then
   update reception_queue set state='CANCELLED',updated_at=now() where id=r.id;
   insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(r.facility_id,auth.uid(),'APPOINTMENT_CANCELLED',r.id,r.state,'CANCELLED');
  end if;
 end if;return new;
end $$;
create trigger h1_appointment_queue after update of status on appointments for each row execute function h1_appointment_queue();
create function h1_setup(p_facility uuid,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not h1_can_manage(p_facility) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Facility setup not authorized';end if;
 return jsonb_build_object('departments',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from facility_departments where facility_id=p_facility order by id limit 50 offset p_offset)x),'[]'),'members',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from facility_memberships where facility_id=p_facility order by id limit 50 offset p_offset)x),'[]'));
end $$;
revoke all on function h1_appointment_queue(),h1_setup(uuid,integer) from public,anon,authenticated;
grant execute on function h1_setup(uuid,integer) to authenticated;
commit;
