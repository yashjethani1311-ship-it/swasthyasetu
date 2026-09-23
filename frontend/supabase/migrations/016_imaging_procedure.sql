-- 016: explicit imaging/procedure studies; no specimen transitions or fake PACS integration.
begin;
alter table diagnostic_tests add column workflow_kind text check(workflow_kind in ('PATHOLOGY','IMAGING','PROCEDURE'));
alter table diagnostic_tests add column modality text;
alter table lab_orders add column workflow_kind text check(workflow_kind in ('PATHOLOGY','IMAGING','PROCEDURE'));
-- NULL preserves legacy classification as unknown, not inferred from test names.
create function r1_configure_test(p_test uuid,p_kind text,p_modality text default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() or auth.uid() is null then raise exception 'Catalog governance required';end if;
 if p_kind is null or p_kind not in ('PATHOLOGY','IMAGING','PROCEDURE') or (p_kind='IMAGING' and nullif(trim(p_modality),'') is null) or length(coalesce(p_modality,''))>100 then raise exception 'Explicit workflow classification required';end if;
 update diagnostic_tests set workflow_kind=p_kind,modality=nullif(trim(p_modality),''),updated_at=now() where id=p_test;
 if not found then raise exception 'Test not found';end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'DIAGNOSTIC_CLASSIFIED','diagnostic_tests',p_test::text,jsonb_build_object('workflow_kind',p_kind,'modality',p_modality));
end $$;
create function r1_order_kind() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' or new.diagnostic_test_id is distinct from old.diagnostic_test_id then select workflow_kind into new.workflow_kind from diagnostic_tests where id=new.diagnostic_test_id;end if;
 if new.workflow_kind in ('IMAGING','PROCEDURE') and new.collection_centre_id is not null then raise exception 'Imaging/procedure requires a performing facility, not specimen collection';end if;return new;
end $$;
create trigger r1_kind before insert or update on lab_orders for each row execute function r1_order_kind();
create function r1_no_specimen() returns trigger language plpgsql security definer set search_path=public as $$
begin if exists(select 1 from lab_orders where id=new.lab_order_id and workflow_kind in ('IMAGING','PROCEDURE')) then raise exception 'Imaging/procedure has no specimen workflow';end if;return new;end $$;
create trigger r1_no_specimen before insert or update on lab_specimens for each row execute function r1_no_specimen();
create table diagnostic_studies(id uuid primary key default gen_random_uuid(),lab_order_id uuid not null unique references lab_orders(id),facility_id uuid not null references facilities(id),workflow_kind text not null check(workflow_kind in ('IMAGING','PROCEDURE')),modality text,report_author_provider_id uuid not null references provider_profiles(id),state text not null default 'ORDERED',scheduled_at timestamptz,performed_at timestamptz,study_reference text,reference_verification text,report_text text,measurements jsonb,verified_at timestamptz,result_id uuid references lab_results(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(state in ('ORDERED','SCHEDULED','ARRIVED','STUDY_PERFORMED','STUDY_AVAILABLE','PERFORMED','REPORT_DRAFTED','RESULT_RECORDED','VERIFIED','PUBLISHED','DOCTOR_REVIEWED')));
create index r1_study_author on diagnostic_studies(report_author_provider_id,state,id);
create table diagnostic_study_actions(id uuid primary key default gen_random_uuid(),study_id uuid not null references diagnostic_studies(id),request_key uuid not null unique,action text not null,payload jsonb not null,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table diagnostic_studies enable row level security;alter table diagnostic_study_actions enable row level security;
revoke all on diagnostic_studies,diagnostic_study_actions from public,anon,authenticated;
create function r1_open_study(p_order uuid,p_author uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare o lab_orders;t diagnostic_tests;existing diagnostic_studies;sid uuid;
begin
 select * into o from lab_orders where id=p_order for update;
 if not found or o.lab_provider_id is distinct from my_provider_id() or not is_approved_provider('LAB') then raise exception 'Assigned performing laboratory required';end if;
 if o.workflow_kind is null or o.workflow_kind not in ('IMAGING','PROCEDURE') or o.destination_facility_id is null then raise exception 'Explicit imaging/procedure order and performing facility required';end if;
 if not exists(select 1 from facilities f where f.id=o.destination_facility_id and f.owner_user_id=auth.uid() and f.verification_status='APPROVED') then raise exception 'Performing facility not authorized';end if;
 if not exists(select 1 from provider_profiles p join facility_memberships m on m.user_id=p.user_id where p.id=p_author and p.provider_type='DOCTOR' and p.verification_status='APPROVED' and m.facility_id=o.destination_facility_id and m.active and m.staff_role='CLINICIAN') then raise exception 'Approved facility report author required';end if;
 select * into existing from diagnostic_studies where lab_order_id=o.id;
 if found then if existing.report_author_provider_id<>p_author then raise exception 'Study author already assigned';end if;return existing.id;end if;
 select * into t from diagnostic_tests where id=o.diagnostic_test_id;
 insert into diagnostic_studies(lab_order_id,facility_id,workflow_kind,modality,report_author_provider_id) values(o.id,o.destination_facility_id,o.workflow_kind,t.modality,p_author) returning id into sid;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(o.patient_id,'DIAGNOSTIC_STUDY_OPENED','diagnostic_studies',sid,auth.uid());return sid;
end $$;
create function r1_study_step(p_study uuid,p_action text,p_payload jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s diagnostic_studies;o lab_orders;prior diagnostic_study_actions;target text;rid uuid;receipt uuid;lab boolean;author boolean;
begin
 select * into s from diagnostic_studies where id=p_study;
 select * into o from lab_orders where id=s.lab_order_id for update;
 select * into s from diagnostic_studies where id=p_study for update;
 if not found then raise exception 'Study not authorized';end if;
 lab:=o.lab_provider_id=my_provider_id() and is_approved_provider('LAB');
 author:=s.report_author_provider_id=my_provider_id() and is_approved_provider('DOCTOR') and h1_staff(s.facility_id,array['CLINICIAN']);
 if not coalesce(lab,false) and not coalesce(author,false) then raise exception 'Study not authorized';end if;
 if p_request is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>150000 then raise exception 'Valid study payload and request key required';end if;
 select * into prior from diagnostic_study_actions where request_key=p_request;
 if found then if prior.study_id<>s.id or prior.action is distinct from p_action or prior.payload<>p_payload then raise exception 'Study request conflict';end if;return prior.id;end if;
 if s.state in ('VERIFIED','PUBLISHED','DOCTOR_REVIEWED') then raise exception 'Verified study is immutable';end if;
 case p_action
 when 'SCHEDULE' then
  if not coalesce(lab,false) or s.state<>'ORDERED' or (p_payload->>'scheduled_at')::timestamptz is null or (p_payload->>'scheduled_at')::timestamptz<now() then raise exception 'Valid future schedule required';end if;
  target:='SCHEDULED';update diagnostic_studies set scheduled_at=(p_payload->>'scheduled_at')::timestamptz where id=s.id;
 when 'ARRIVE' then
  if not coalesce(lab,false) or s.workflow_kind<>'IMAGING' or s.state<>'SCHEDULED' then raise exception 'Only scheduled imaging arrival is supported';end if;target:='ARRIVED';
 when 'PERFORM' then
  if not coalesce(lab,false) or not ((s.workflow_kind='IMAGING' and s.state='ARRIVED') or (s.workflow_kind='PROCEDURE' and s.state='SCHEDULED')) then raise exception 'Study not ready to perform';end if;
  target:=case when s.workflow_kind='IMAGING' then 'STUDY_PERFORMED' else 'PERFORMED' end;update diagnostic_studies set performed_at=now() where id=s.id;
 when 'ATTACH_STUDY' then
  if not coalesce(lab,false) or s.workflow_kind<>'IMAGING' or s.state<>'STUDY_PERFORMED' or nullif(trim(p_payload->>'reference'),'') is null or length(p_payload->>'reference')>2000 then raise exception 'Performed imaging and study reference required';end if;
  target:='STUDY_AVAILABLE';update diagnostic_studies set study_reference=p_payload->>'reference',reference_verification='EXTERNAL_REFERENCE_UNVERIFIED' where id=s.id;
 when 'DRAFT' then
  if not coalesce(author,false) or s.state not in ('STUDY_AVAILABLE','PERFORMED','REPORT_DRAFTED','RESULT_RECORDED') or nullif(trim(p_payload->>'report_text'),'') is null or length(p_payload->>'report_text')>100000 then raise exception 'Assigned author and actual report required';end if;
  target:=case when s.workflow_kind='IMAGING' then 'REPORT_DRAFTED' else 'RESULT_RECORDED' end;update diagnostic_studies set report_text=p_payload->>'report_text',measurements=p_payload->'measurements' where id=s.id;
 when 'VERIFY' then
  if not coalesce(author,false) or s.state not in ('REPORT_DRAFTED','RESULT_RECORDED') or s.report_text is null then raise exception 'Assigned author must verify recorded report';end if;
  if exists(select 1 from lab_results where lab_order_id=o.id) then raise exception 'Result already exists';end if;
  insert into lab_results(lab_order_id,entered_by_lab_provider_id,result_json,status,verified_at) values(o.id,o.lab_provider_id,jsonb_build_object('workflow_kind',s.workflow_kind,'report_text',s.report_text,'measurements',s.measurements,'study_id',s.id,'report_author_provider_id',s.report_author_provider_id,'study_reference',s.study_reference,'reference_verification',s.reference_verification),'VERIFIED',now()) returning id into rid;
  target:='VERIFIED';update diagnostic_studies set verified_at=now(),result_id=rid where id=s.id;
 else raise exception 'Unsupported study action';end case;
 update diagnostic_studies set state=target,updated_at=now() where id=s.id;
 insert into diagnostic_study_actions(study_id,request_key,action,payload,actor_user_id) values(s.id,p_request,p_action,p_payload,auth.uid()) returning id into receipt;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(o.patient_id,'STUDY_'||target,'diagnostic_studies',s.id,auth.uid());return receipt;
end $$;
create function r1_report_state() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='COMPLETED' and new.verified_at is not null and new.report_storage_path is not null then
 update diagnostic_studies set state=case when new.doctor_reviewed_at is not null then 'DOCTOR_REVIEWED' else 'PUBLISHED' end,updated_at=now() where lab_order_id=new.lab_order_id;
 end if;return new;
end $$;
create trigger r1_report_state after update on lab_results for each row execute function r1_report_state();
create function r1_worklist(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid worklist request';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select s.*,o.patient_id,o.test_name from diagnostic_studies s join lab_orders o on o.id=s.lab_order_id where (o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')) or (s.report_author_provider_id=my_provider_id() and is_approved_provider('DOCTOR') and h1_staff(s.facility_id,array['CLINICIAN'])) order by s.created_at,s.id limit 50 offset p_offset)x),'[]');
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'r1_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname in ('r1_configure_test','r1_open_study','r1_study_step','r1_worklist') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
commit;
