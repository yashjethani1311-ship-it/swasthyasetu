-- 014: facility-scoped inpatient admissions, safe bed transfers and signed discharge.
begin;
create table hospital_beds(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),department_id uuid references facility_departments(id),ward text not null check(length(trim(ward)) between 1 and 100),label text not null check(length(trim(label)) between 1 and 100),state text not null check(state in ('AVAILABLE','OCCUPIED','CLEANING','MAINTENANCE')),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),unique(facility_id,ward,label));
create index h2_beds_facility on hospital_beds(facility_id,state,id);
create table hospital_admissions(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),patient_id uuid not null references patient_profiles(id),encounter_id uuid not null references encounters(id),doctor_provider_id uuid not null references provider_profiles(id),bed_id uuid not null references hospital_beds(id),status text not null default 'ADMITTED' check(status in ('ADMITTED','DISCHARGED')),reason text not null check(length(trim(reason)) between 3 and 2000),request_key uuid not null unique,admitted_at timestamptz not null default now(),discharged_at timestamptz,discharge_summary text,discharged_by uuid references provider_profiles(id));
create unique index h2_active_bed on hospital_admissions(bed_id) where status='ADMITTED';
create unique index h2_active_patient on hospital_admissions(facility_id,patient_id) where status='ADMITTED';
create index h2_admission_facility on hospital_admissions(facility_id,admitted_at desc,id);
create table admission_actions(id uuid primary key default gen_random_uuid(),admission_id uuid not null references hospital_admissions(id),request_key uuid not null unique,action text not null,actor_user_id uuid not null references auth.users(id),payload jsonb not null,created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['hospital_beds','hospital_admissions','admission_actions'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function h2_bed(p_facility uuid,p_department uuid,p_ward text,p_label text,p_state text) returns uuid language plpgsql security definer set search_path=public as $$
declare b hospital_beds;bid uuid;
begin
 if not h1_staff(p_facility,array['MANAGER']) then raise exception 'Bed management not authorized';end if;
 if p_state is null or p_state not in ('AVAILABLE','CLEANING','MAINTENANCE') then raise exception 'Operational bed state required';end if;
 if p_department is not null and not exists(select 1 from facility_departments where id=p_department and facility_id=p_facility and active) then raise exception 'Invalid facility department';end if;
 select * into b from hospital_beds where facility_id=p_facility and ward=trim(p_ward) and label=trim(p_label) for update;
 if found then
  if b.state='OCCUPIED' or exists(select 1 from hospital_admissions where bed_id=b.id and status='ADMITTED') then raise exception 'Occupied bed cannot be changed';end if;
  update hospital_beds set state=p_state,department_id=p_department,updated_at=now(),updated_by=auth.uid() where id=b.id;bid:=b.id;
 else insert into hospital_beds(facility_id,department_id,ward,label,state,updated_by) values(p_facility,p_department,trim(p_ward),trim(p_label),p_state,auth.uid()) returning id into bid;end if;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(p_facility,auth.uid(),'BED_STATE',bid,b.state,p_state);return bid;
end $$;
create function h2_admit(p_facility uuid,p_encounter uuid,p_bed uuid,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare e encounters;b hospital_beds;a hospital_admissions;aid uuid;
begin
 if not h1_staff(p_facility,array['CLINICIAN']) or not is_approved_provider('DOCTOR') or p_request is null then raise exception 'Facility clinician and request key required';end if;
 select * into e from encounters where id=p_encounter;
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not exists(select 1 from appointments ap join provider_practices pr on pr.id=ap.practice_id where ap.id=e.appointment_id and pr.facility_id=p_facility) then raise exception 'Facility encounter not authorized';end if;
 select * into b from hospital_beds where id=p_bed and facility_id=p_facility for update;
 if not found then raise exception 'Facility bed not found';end if;
 select * into a from hospital_admissions where request_key=p_request;
 if found then if a.facility_id<>p_facility or a.encounter_id<>p_encounter or a.reason is distinct from trim(p_reason) then raise exception 'Admission request conflict';end if;
 -- Admission retry uses immutable original bed from its receipt, not current transferred bed.
 if not exists(select 1 from admission_actions where admission_id=a.id and action='ADMIT' and payload->>'bed_id'=p_bed::text) then raise exception 'Admission request conflict';end if;return a.id;end if;
 if b.state<>'AVAILABLE' or b.updated_at<now()-interval '4 hours' then raise exception 'Bed availability requires fresh confirmation';end if;
 insert into hospital_admissions(facility_id,patient_id,encounter_id,doctor_provider_id,bed_id,reason,request_key) values(p_facility,e.patient_id,e.id,e.doctor_provider_id,b.id,trim(p_reason),p_request) returning id into aid;
 update hospital_beds set state='OCCUPIED',updated_at=now(),updated_by=auth.uid() where id=b.id;
 insert into admission_actions(admission_id,request_key,action,actor_user_id,payload) values(aid,p_request,'ADMIT',auth.uid(),jsonb_build_object('bed_id',b.id,'reason',trim(p_reason)));
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(p_facility,auth.uid(),'ADMITTED',aid,'ADMITTED');
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'ADMITTED','hospital_admissions',aid,auth.uid());return aid;
end $$;
create function h2_transfer(p_admission uuid,p_bed uuid,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a hospital_admissions;b hospital_beds;prior admission_actions;payload jsonb;receipt uuid;
begin
 select * into a from hospital_admissions where id=p_admission for update;
 if not found or not h1_staff(a.facility_id,array['MANAGER','CLINICIAN']) or (not h1_staff(a.facility_id,array['MANAGER']) and a.doctor_provider_id is distinct from my_provider_id()) then raise exception 'Admission transfer not authorized';end if;
 if p_request is null or p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'Transfer reason and request key required';end if;
 payload:=jsonb_build_object('bed_id',p_bed,'reason',trim(p_reason));select * into prior from admission_actions where request_key=p_request;
 if found then if prior.admission_id<>a.id or prior.action<>'TRANSFER' or prior.payload<>payload then raise exception 'Transfer request conflict';end if;return prior.id;end if;
 if a.status<>'ADMITTED' or a.bed_id=p_bed then raise exception 'Invalid transfer';end if;
 -- Stable lock ordering prevents opposite bed moves from taking locks in opposite order.
 perform 1 from hospital_beds where id in(a.bed_id,p_bed) order by id for update;
 select * into b from hospital_beds where id=p_bed and facility_id=a.facility_id;
 if not found or b.state<>'AVAILABLE' or b.updated_at<now()-interval '4 hours' then raise exception 'Destination bed not confirmed available';end if;
 update hospital_beds set state='CLEANING',updated_at=now(),updated_by=auth.uid() where id=a.bed_id;
 update hospital_beds set state='OCCUPIED',updated_at=now(),updated_by=auth.uid() where id=b.id;
 update hospital_admissions set bed_id=b.id where id=a.id;
 insert into admission_actions(admission_id,request_key,action,actor_user_id,payload) values(a.id,p_request,'TRANSFER',auth.uid(),payload) returning id into receipt;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(a.facility_id,auth.uid(),'BED_TRANSFER',a.id);return receipt;
end $$;
create function h2_discharge(p_admission uuid,p_summary text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare a hospital_admissions;prior admission_actions;payload jsonb;receipt uuid;
begin
 select * into a from hospital_admissions where id=p_admission for update;
 if not found or not h1_staff(a.facility_id,array['CLINICIAN']) or not is_approved_provider('DOCTOR') or a.doctor_provider_id is distinct from my_provider_id() then raise exception 'Assigned facility clinician required';end if;
 if p_request is null or p_summary is null or length(trim(p_summary)) not between 10 and 20000 then raise exception 'Discharge summary and request key required';end if;
 payload:=jsonb_build_object('summary',trim(p_summary));select * into prior from admission_actions where request_key=p_request;
 if found then if prior.admission_id<>a.id or prior.action<>'DISCHARGE' or prior.payload<>payload then raise exception 'Discharge request conflict';end if;return prior.id;end if;
 if a.status<>'ADMITTED' then raise exception 'Admission already discharged';end if;
 perform 1 from hospital_beds where id=a.bed_id for update;
 update hospital_admissions set status='DISCHARGED',discharged_at=now(),discharge_summary=trim(p_summary),discharged_by=my_provider_id() where id=a.id;
 update hospital_beds set state='CLEANING',updated_at=now(),updated_by=auth.uid() where id=a.bed_id;
 insert into admission_actions(admission_id,request_key,action,actor_user_id,payload) values(a.id,p_request,'DISCHARGE',auth.uid(),payload) returning id into receipt;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,from_state,to_state) values(a.facility_id,auth.uid(),'DISCHARGED',a.id,'ADMITTED','DISCHARGED');
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(a.patient_id,'DISCHARGED','hospital_admissions',a.id,auth.uid());return receipt;
end $$;
create function h2_beds(p_facility uuid,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION','CLINICIAN']) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Bed list not authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,department_id,ward,label,state,updated_at,case when updated_at<now()-interval '4 hours' then 'STATUS_UNKNOWN_CONFIRMATION_REQUIRED' else 'RECENTLY_RECORDED' end freshness from hospital_beds where facility_id=p_facility order by ward,label,id limit 50 offset p_offset)x),'[]');
end $$;
create function h2_admissions(p_facility uuid,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION','CLINICIAN']) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Admission list not authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,a.patient_id,p.full_name patient_name,a.doctor_provider_id,a.bed_id,a.status,a.admitted_at,a.discharged_at from hospital_admissions a join patient_profiles p on p.id=a.patient_id where a.facility_id=p_facility and (h1_staff(p_facility,array['MANAGER','RECEPTION']) or a.doctor_provider_id=my_provider_id()) order by a.admitted_at desc,a.id limit 50 offset p_offset)x),'[]');
end $$;
create function h2_admission_record() returns trigger language plpgsql security definer set search_path=public as $$
declare prior clinical_source_versions;ep uuid;nid uuid;root uuid;
begin
 select * into prior from clinical_source_versions where source_kind='hospital_admissions' and source_id=new.id order by revision desc limit 1;
 insert into clinical_source_versions(patient_id,source_kind,source_id,revision,category,source_provider_id,source_facility_id,occurred_at,verification_state,original,capture_kind,recorded_by,supersedes_id) values(new.patient_id,'hospital_admissions',new.id,coalesce(prior.revision,0)+1,'ENCOUNTERS',new.doctor_provider_id,new.facility_id,new.admitted_at,case when new.status='DISCHARGED' then 'SIGNED' else 'RECORDED' end,to_jsonb(new),tg_op,auth.uid(),prior.id);
 perform g1_refresh(new.encounter_id);select id into ep from care_episodes where encounter_id=new.encounter_id;
 nid:=g1_put_node(ep,'INPATIENT_CARE','ENCOUNTERS','hospital_admissions',new.id,case when new.status='DISCHARGED' then 'COMPLETED' else 'IN_PROGRESS' end,'DOCTOR',null,case when new.status='DISCHARGED' then 'hospital_admissions' end,case when new.status='DISCHARGED' then new.id end);
 update care_nodes set occurred_at=new.admitted_at where id=nid;
 select id into root from care_nodes where episode_id=ep and kind='CONSULTATION';
 insert into care_dependencies values(nid,root) on conflict do nothing;
 return new;
end $$;
create trigger h2_admission_provenance after insert or update on hospital_admissions for each row execute function h2_admission_record();
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'h2_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname<>'h2_admission_record' then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
commit;
