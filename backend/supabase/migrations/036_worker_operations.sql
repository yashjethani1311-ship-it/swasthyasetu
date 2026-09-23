-- 036: assigned geography, structured assistance observations and explicit sync conflict repair.
begin;
create table worker_areas(id uuid primary key default gen_random_uuid(),area_code text not null unique,name text not null,district text not null,state text not null,source_reference text not null,created_at timestamptz not null default now());
create table worker_area_assignments(worker_provider_id uuid not null references provider_profiles(id),area_id uuid not null references worker_areas(id),active boolean not null default true,assigned_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(worker_provider_id,area_id));
create table worker_task_areas(task_id uuid primary key references follow_up_tasks(id),area_id uuid not null references worker_areas(id),recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now());
create table worker_assistance_records(id uuid primary key default gen_random_uuid(),task_id uuid not null references follow_up_tasks(id),source_kind text not null check(source_kind in ('TEST_ASSISTANCE','SAMPLE_LOGISTICS','MEDICINE_REFILL_REQUEST','ESCALATION')),source_id uuid not null,note text not null,sync_receipt_id uuid not null unique references worker_sync_receipts(id),created_at timestamptz not null default now());
create table worker_conflict_resolutions(id uuid primary key default gen_random_uuid(),original_receipt_id uuid not null references worker_sync_receipts(id),replacement_receipt_id uuid references worker_sync_receipts(id),resolution text not null check(resolution in ('RETRIED_ACCEPTED','RETRY_CONFLICT','RETRY_REJECTED','DISCARDED')),request_key uuid not null unique,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['worker_areas','worker_area_assignments','worker_task_areas','worker_assistance_records','worker_conflict_resolutions'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function w2_area(p_code text,p_name text,p_district text,p_state text,p_source text) returns uuid language plpgsql security definer set search_path=public as $$
declare a worker_areas;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_code is null or length(trim(p_code)) not between 1 and 80 or p_name is null or length(trim(p_name)) not between 1 and 200 or p_district is null or length(trim(p_district)) not between 1 and 100 or p_state is null or length(trim(p_state)) not between 1 and 100 or p_source is null or length(trim(p_source)) not between 3 and 300 then raise exception 'Governed actual geography and source reference required';end if;
 perform pg_advisory_xact_lock(hashtextextended(trim(p_code),36));select * into a from worker_areas where area_code=trim(p_code);
 if found then if (a.name,a.district,a.state,a.source_reference) is distinct from (trim(p_name),trim(p_district),trim(p_state),trim(p_source)) then raise exception 'Area identity conflict';end if;return a.id;end if;
 insert into worker_areas(area_code,name,district,state,source_reference) values(trim(p_code),trim(p_name),trim(p_district),trim(p_state),trim(p_source)) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'WORKER_AREA_RECORDED','worker_areas',rid::text);return rid;
end $$;
create function w2_assign_area(p_worker uuid,p_area uuid,p_active boolean) returns void language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() or p_active is null or not exists(select 1 from provider_profiles where id=p_worker and provider_type='WORKER' and verification_status='APPROVED') then raise exception 'Administrator and approved worker required';end if;
 insert into worker_area_assignments(worker_provider_id,area_id,active,assigned_by) values(p_worker,p_area,p_active,auth.uid()) on conflict(worker_provider_id,area_id) do update set active=excluded.active,assigned_by=excluded.assigned_by,updated_at=now();
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'WORKER_AREA_ASSIGNMENT','worker_areas',p_area::text,jsonb_build_object('worker_id',p_worker,'active',p_active));
end $$;
create function w2_task_area(p_task uuid,p_area uuid) returns void language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks;
begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or t.doctor_provider_id<>my_provider_id() or not is_approved_provider('DOCTOR') or t.status='COMPLETED' or not exists(select 1 from worker_area_assignments where worker_provider_id=t.worker_provider_id and area_id=p_area and active) then raise exception 'Assigned clinician and active worker area required';end if;
 insert into worker_task_areas(task_id,area_id,recorded_by) values(t.id,p_area,auth.uid()) on conflict(task_id) do update set area_id=excluded.area_id,recorded_by=excluded.recorded_by,recorded_at=now();
 update follow_up_tasks set updated_at=clock_timestamp() where id=t.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(t.patient_id,'WORKER_TASK_AREA_RECORDED','follow_up_tasks',t.id,auth.uid());
end $$;
create function w2_worklist(p_area uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('WORKER') or (p_area is not null and not exists(select 1 from worker_area_assignments where worker_provider_id=my_provider_id() and area_id=p_area and active)) then raise exception 'Assigned worker area required';end if;
 return jsonb_build_object('areas',coalesce((select jsonb_agg(to_jsonb(a)) from worker_area_assignments m join worker_areas a on a.id=m.area_id where m.worker_provider_id=my_provider_id() and m.active),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.id,t.patient_id,p.full_name patient_name,t.status,t.sync_version,t.updated_at,ta.area_id,g.gap_type,g.due_at,g.severity,
 coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'actions',d.actions,'valid_until',d.valid_until)) from worker_delegations d where d.task_id=t.id and d.worker_provider_id=t.worker_provider_id and d.status='GRANTED' and d.valid_until>now()),'[]') delegations
 from follow_up_tasks t join patient_profiles p on p.id=t.patient_id join care_gaps g on g.id=t.care_gap_id left join worker_task_areas ta on ta.task_id=t.id
 where t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED' and (p_area is null or ta.area_id=p_area) order by g.due_at nulls last,t.id limit 50)x),'[]'),
 'notice','Area assignment never grants access to unassigned patients. Use current task version and active patient delegation for every assisted action.');
end $$;
create function w2_assist(p_task uuid,p_delegation uuid,p_kind text,p_source uuid,p_note text,p_version bigint,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks;result jsonb;rid uuid;
begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or not is_approved_provider('WORKER') or t.worker_provider_id<>my_provider_id() or p_kind is null or p_kind not in ('TEST_ASSISTANCE','SAMPLE_LOGISTICS','MEDICINE_REFILL_REQUEST','ESCALATION') or p_note is null or length(trim(p_note)) not between 3 and 2000 then raise exception 'Assigned task and bounded structured assistance required';end if;
 if (p_kind in ('TEST_ASSISTANCE','SAMPLE_LOGISTICS') and not exists(select 1 from lab_orders where id=p_source and patient_id=t.patient_id)) or (p_kind='MEDICINE_REFILL_REQUEST' and not exists(select 1 from prescriptions where id=p_source and patient_id=t.patient_id)) or (p_kind='ESCALATION' and p_source is distinct from t.care_gap_id) then raise exception 'Assistance source must belong to assigned patient/task';end if;
 -- A refill request is an observation for clinician review, never a new prescription or dispensing action.
 result:=w1_sync(t.id,t.patient_id,p_delegation,'REPORT_OUTCOME',jsonb_build_object('status',case when p_kind='ESCALATION' then 'ESCALATED' else 'CONTACTED' end,'outcome',p_kind||': '||trim(p_note),'assistance_kind',p_kind,'source_id',p_source),p_version,p_request);
 if result->>'status'='ACCEPTED' then
 insert into worker_assistance_records(task_id,source_kind,source_id,note,sync_receipt_id) values(t.id,p_kind,p_source,trim(p_note),(result->>'receipt_id')::uuid) on conflict(sync_receipt_id) do nothing;
 end if;return result;
end $$;
create function w2_resolve_conflict(p_receipt uuid,p_payload jsonb,p_version bigint,p_request uuid,p_discard boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r worker_sync_receipts;x worker_conflict_resolutions;result jsonb;resolution text;
begin
 select * into r from worker_sync_receipts where id=p_receipt for update;
 if not found or r.worker_provider_id<>my_provider_id() or not is_approved_provider('WORKER') or r.status not in ('CONFLICT','REJECTED') or p_request is null or p_request=r.request_key or p_discard is null then raise exception 'Own unresolved sync conflict and distinct request key required';end if;
 select * into x from worker_conflict_resolutions where request_key=p_request;
 if found then
 if x.original_receipt_id<>r.id or (x.resolution='DISCARDED')<>p_discard then raise exception 'Conflict resolution request collision';end if;
 if p_discard then return jsonb_build_object('resolution','DISCARDED');end if;
 -- Delegate idempotency and current consent recheck to the same source RPC on retries.
 end if;
 if exists(select 1 from worker_conflict_resolutions cr where cr.original_receipt_id=r.id and cr.resolution in ('DISCARDED','RETRIED_ACCEPTED') and cr.request_key<>p_request) then raise exception 'Conflict already resolved';end if;
 if p_discard then resolution:='DISCARDED';result:=jsonb_build_object('resolution',resolution);
 else
 if exists(select 1 from worker_conflict_resolutions cr where cr.original_receipt_id=r.id and cr.resolution in ('DISCARDED','RETRIED_ACCEPTED') and cr.request_key<>p_request) then raise exception 'Conflict already resolved';end if;
 if r.request_payload->'payload' ? 'assistance_kind' then
  if p_payload is distinct from r.request_payload->'payload' then raise exception 'Structured assistance conflict retry must preserve reviewed intent';end if;
  result:=w2_assist(r.task_id,r.delegation_id,p_payload->>'assistance_kind',(p_payload->>'source_id')::uuid,substring(p_payload->>'outcome' from length(p_payload->>'assistance_kind')+3),p_version,p_request);
 else result:=w1_sync(r.task_id,r.patient_id,r.delegation_id,r.purpose,p_payload,p_version,p_request);end if;
 resolution:=case result->>'status' when 'ACCEPTED' then 'RETRIED_ACCEPTED' when 'CONFLICT' then 'RETRY_CONFLICT' else 'RETRY_REJECTED' end;
 end if;
 insert into worker_conflict_resolutions(original_receipt_id,replacement_receipt_id,resolution,request_key,actor_user_id) values(r.id,(result->>'receipt_id')::uuid,resolution,p_request,auth.uid()) on conflict(request_key) do nothing;
 return result||jsonb_build_object('resolution',resolution);
end $$;
revoke all on function w2_area(text,text,text,text,text),w2_assign_area(uuid,uuid,boolean),w2_task_area(uuid,uuid),w2_worklist(uuid),w2_assist(uuid,uuid,text,uuid,text,bigint,uuid),w2_resolve_conflict(uuid,jsonb,bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function w2_area(text,text,text,text,text),w2_assign_area(uuid,uuid,boolean),w2_task_area(uuid,uuid),w2_worklist(uuid),w2_assist(uuid,uuid,text,uuid,text,bigint,uuid),w2_resolve_conflict(uuid,jsonb,bigint,uuid,boolean) to authenticated;
commit;
