-- 034: extend existing diagnostic registries with evidence, freshness and linked recollection.
begin;
alter table lab_machine_integrations add column registration_request uuid unique;
create table lab_machine_health(id uuid primary key default gen_random_uuid(),machine_id uuid not null references lab_machine_integrations(id),state text not null check(state in ('CONNECTED','DISCONNECTED','ERROR','UNKNOWN')),observed_at timestamptz not null,valid_until timestamptz not null,source_reference text not null,event_key text not null unique,created_at timestamptz not null default now());
create index r3_machine_health_latest on lab_machine_health(machine_id,observed_at desc);
create table lab_quality_events(id uuid primary key default gen_random_uuid(),machine_id uuid not null references lab_machine_integrations(id),control_reference text not null,assessment text not null check(assessment in ('PASS','FAIL','UNKNOWN')),observed_values jsonb not null,review_note text not null,recorded_by uuid not null references auth.users(id),request_key uuid not null unique,observed_at timestamptz not null,created_at timestamptz not null default now());
create index r3_qc_latest on lab_quality_events(machine_id,observed_at desc);
create table lab_recollections(id uuid primary key default gen_random_uuid(),rejected_order_id uuid not null unique references lab_orders(id),replacement_order_id uuid not null unique references lab_orders(id),reason text not null,ordered_by uuid not null references provider_profiles(id),request_key uuid not null unique,created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['lab_machine_health','lab_quality_events','lab_recollections'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function r3_machine(p_name text,p_manufacturer text,p_model text,p_protocol text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare m lab_machine_integrations;rid uuid;
begin
 if not is_approved_provider('LAB') or p_name is null or length(trim(p_name)) not between 1 and 200 or length(coalesce(p_manufacturer,''))>200 or length(coalesce(p_model,''))>200 or p_request is null then raise exception 'Approved lab and actual machine metadata required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,34));select * into m from lab_machine_integrations where registration_request=p_request;
 if found then if (m.lab_provider_id,m.machine_name,m.manufacturer,m.model,m.protocol) is distinct from (my_provider_id(),trim(p_name),p_manufacturer,p_model,p_protocol) then raise exception 'Machine registration conflict';end if;return m.id;end if;
 insert into lab_machine_integrations(lab_provider_id,machine_name,manufacturer,model,protocol,registration_request) values(my_provider_id(),trim(p_name),p_manufacturer,p_model,p_protocol,p_request) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'LAB_MACHINE_REGISTERED','lab_machine_integrations',rid::text);return rid;
end $$;
create function r3_health(p_machine uuid,p_state text,p_observed timestamptz,p_until timestamptz,p_reference text,p_event text) returns uuid language plpgsql security definer set search_path=public as $$
declare e lab_machine_health;rid uuid;
begin
 if not exists(select 1 from lab_machine_integrations m join provider_profiles p on p.id=m.lab_provider_id where m.id=p_machine and m.active and p.verification_status='APPROVED') or p_observed is null or p_observed>now()+interval '1 minute' or p_until is null or p_until<=p_observed or p_until>p_observed+interval '4 hours' or p_reference is null or length(p_reference) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 then raise exception 'Actual active machine health source and bounded freshness required';end if;
 select * into e from lab_machine_health where event_key=p_event;
 if found then if (e.machine_id,e.state,e.observed_at,e.valid_until,e.source_reference) is distinct from (p_machine,p_state,p_observed,p_until,p_reference) then raise exception 'Health event conflict';end if;return e.id;end if;
 insert into lab_machine_health(machine_id,state,observed_at,valid_until,source_reference,event_key) values(p_machine,p_state,p_observed,p_until,p_reference,p_event) returning id into rid;return rid;
end $$;
create function r3_quality(p_machine uuid,p_control text,p_assessment text,p_values jsonb,p_note text,p_observed timestamptz,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare e lab_quality_events;rid uuid;
begin
 perform 1 from lab_machine_integrations where id=p_machine and lab_provider_id=my_provider_id() and active for share;
 if not found or not is_approved_provider('LAB') or p_control is null or length(trim(p_control)) not between 3 and 200 or p_values is null or jsonb_typeof(p_values)<>'object' or p_values='{}'::jsonb or octet_length(p_values::text)>20000 or p_note is null or length(trim(p_note)) not between 10 and 2000 or p_observed is null or p_observed>now()+interval '1 minute' or p_request is null then raise exception 'Assigned lab, actual QC values and explicit human assessment required';end if;
 select * into e from lab_quality_events where request_key=p_request;
 if found then if (e.machine_id,e.control_reference,e.assessment,e.observed_values,e.review_note,e.observed_at) is distinct from (p_machine,trim(p_control),p_assessment,p_values,trim(p_note),p_observed) then raise exception 'QC request conflict';end if;return e.id;end if;
 insert into lab_quality_events(machine_id,control_reference,assessment,observed_values,review_note,recorded_by,request_key,observed_at) values(p_machine,trim(p_control),p_assessment,p_values,trim(p_note),auth.uid(),p_request,p_observed) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'LAB_QC_RECORDED','lab_quality_events',rid::text);return rid;
end $$;
create function r3_capability(p_test uuid,p_active boolean,p_centre uuid default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_active is null or not exists(select 1 from diagnostic_tests where id=p_test and active) then raise exception 'Actual active test definition required';end if;
 if p_centre is null then
 if not is_approved_provider('LAB') then raise exception 'Approved lab required';end if;
 insert into lab_test_capabilities(lab_provider_id,diagnostic_test_id,active) values(my_provider_id(),p_test,p_active) on conflict(lab_provider_id,diagnostic_test_id) do update set active=excluded.active;
 else
 if not p0_owns_centre(p_centre) or exists(select 1 from diagnostic_tests where id=p_test and workflow_kind in ('IMAGING','PROCEDURE')) then raise exception 'Authorized collection centre and specimen test required';end if;
 insert into collection_centre_tests(collection_centre_id,diagnostic_test_id,active) values(p_centre,p_test,p_active) on conflict(collection_centre_id,diagnostic_test_id) do update set active=excluded.active;
 end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'DIAGNOSTIC_CAPABILITY_RECORDED','diagnostic_tests',p_test::text,jsonb_build_object('active',p_active,'collection_centre_id',p_centre));
end $$;
create function r3_recollect(p_rejected uuid,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare o lab_orders;r lab_recollections;rid uuid;
begin
 select * into o from lab_orders where id=p_rejected for update;
 if not found or not is_approved_provider('DOCTOR') or o.doctor_provider_id<>my_provider_id() or p_reason is null or length(trim(p_reason)) not between 10 and 2000 or p_request is null then raise exception 'Ordering clinician and explicit recollection reason required';end if;
 select * into r from lab_recollections where request_key=p_request or rejected_order_id=o.id;
 if found then if (r.rejected_order_id,r.reason,r.request_key) is distinct from (o.id,trim(p_reason),p_request) then raise exception 'Recollection request conflict';end if;return r.replacement_order_id;end if;
 if o.status<>'SAMPLE_REJECTED' or not exists(select 1 from lab_specimens where lab_order_id=o.id and status='REJECTED') or o.workflow_kind in ('IMAGING','PROCEDURE') or not exists(select 1 from diagnostic_tests where id=o.diagnostic_test_id and active) then raise exception 'Actual rejected pathology specimen and active test required';end if;
 insert into lab_orders(patient_id,doctor_provider_id,encounter_id,diagnostic_test_id,test_name,status) values(o.patient_id,o.doctor_provider_id,o.encounter_id,o.diagnostic_test_id,o.test_name,'ORDERED') returning id into rid;
 insert into lab_recollections(rejected_order_id,replacement_order_id,reason,ordered_by,request_key) values(o.id,rid,trim(p_reason),my_provider_id(),p_request);
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(o.patient_id,'RECOLLECTION_ORDERED','lab_orders',rid,auth.uid(),jsonb_build_object('rejected_order_id',o.id,'reason',trim(p_reason)));
 -- Old rejection and custody stay unchanged. Patient chooses the new collection destination.
 return rid;
end $$;
create function r3_quality_worklist() returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('LAB') then raise exception 'Approved lab required';end if;
 return jsonb_build_object('machines',coalesce((select jsonb_agg(to_jsonb(x)) from (select m.id,m.machine_name,m.protocol,m.active,h.observed_at last_health_at,h.valid_until,
 case when h.valid_until>now() then h.state else 'STATUS_UNKNOWN_CONFIRMATION_REQUIRED' end integration_state,
 case when qc.observed_at>now()-interval '24 hours' then qc.assessment else 'QC_UNKNOWN_REVIEW_REQUIRED' end quality_state,qc.observed_at last_qc_at
 from lab_machine_integrations m left join lateral(select * from lab_machine_health where machine_id=m.id order by observed_at desc,id desc limit 1)h on true left join lateral(select * from lab_quality_events where machine_id=m.id order by observed_at desc,id desc limit 1)qc on true where m.lab_provider_id=my_provider_id() order by m.machine_name,m.id limit 100)x),'[]'),
 'rejected',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.id,s.lab_order_id,s.sample_code,s.status,s.rejection_reason,s.updated_at,r.replacement_order_id from lab_specimens s join lab_orders o on o.id=s.lab_order_id left join lab_recollections r on r.rejected_order_id=o.id where o.lab_provider_id=my_provider_id() and s.status='REJECTED' order by s.updated_at desc,s.id limit 50)x),'[]'),
 'notice','Machine connectivity and human QC assessments are separate recorded facts. Neither verifies a patient result or bypasses existing diagnostic review.');
end $$;
revoke all on function r3_machine(text,text,text,text,uuid),r3_health(uuid,text,timestamptz,timestamptz,text,text),r3_quality(uuid,text,text,jsonb,text,timestamptz,uuid),r3_capability(uuid,boolean,uuid),r3_recollect(uuid,text,uuid),r3_quality_worklist() from public,anon,authenticated;
grant execute on function r3_machine(text,text,text,text,uuid),r3_quality(uuid,text,text,jsonb,text,timestamptz,uuid),r3_capability(uuid,boolean,uuid),r3_recollect(uuid,text,uuid),r3_quality_worklist() to authenticated;
grant execute on function r3_health(uuid,text,timestamptz,timestamptz,text,text) to service_role;
commit;
