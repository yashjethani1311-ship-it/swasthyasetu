-- 020: explicit patient delegation and server-revalidated worker sync.
begin;
alter table follow_up_tasks add column sync_version bigint not null default 1;
create table worker_delegations(id uuid primary key default gen_random_uuid(),task_id uuid not null references follow_up_tasks(id),patient_id uuid not null references patient_profiles(id),worker_provider_id uuid not null references provider_profiles(id),actions text[] not null check(cardinality(actions)>0 and actions <@ array['BOOK_APPOINTMENT','REPORT_OUTCOME']::text[]),status text not null default 'GRANTED' check(status in ('GRANTED','REVOKED')),valid_until timestamptz not null,granted_by uuid not null references auth.users(id),created_at timestamptz not null default now(),revoked_at timestamptz);
create index w1_delegation_task on worker_delegations(task_id,worker_provider_id,status,valid_until);
create table worker_sync_receipts(id uuid primary key default gen_random_uuid(),worker_provider_id uuid not null references provider_profiles(id),patient_id uuid not null references patient_profiles(id),task_id uuid not null references follow_up_tasks(id),delegation_id uuid not null references worker_delegations(id),authorization_method text not null default 'PATIENT_EXPLICIT_CONSENT',purpose text not null,request_key uuid not null,request_payload jsonb not null,status text not null check(status in ('ACCEPTED','CONFLICT','REJECTED')),result jsonb not null,created_at timestamptz not null default now(),unique(worker_provider_id,request_key));
alter table worker_delegations enable row level security;alter table worker_sync_receipts enable row level security;
revoke all on worker_delegations,worker_sync_receipts from public,anon,authenticated;
create function w1_task_version() returns trigger language plpgsql set search_path=public as $$begin if to_jsonb(new) is distinct from to_jsonb(old) then new.sync_version:=old.sync_version+1;end if;return new;end $$;
create trigger w1_task_version before update on follow_up_tasks for each row execute function w1_task_version();
create function w1_delegate(p_task uuid,p_actions text[],p_until timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks;rid uuid;
begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or t.status='COMPLETED' or not exists(select 1 from patient_profiles where id=t.patient_id and user_id=auth.uid()) then raise exception 'Only the task patient may grant delegation';end if;
 if p_until is null or p_until<=now() or p_until>now()+interval '30 days' then raise exception 'Delegation must expire within thirty days';end if;
 if not exists(select 1 from provider_profiles where id=t.worker_provider_id and provider_type='WORKER' and verification_status='APPROVED') then raise exception 'Approved assigned worker required';end if;
 insert into worker_delegations(task_id,patient_id,worker_provider_id,actions,valid_until,granted_by) values(t.id,t.patient_id,t.worker_provider_id,p_actions,p_until,auth.uid()) returning id into rid;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(t.patient_id,auth.uid(),'WORKER_DELEGATION_GRANTED','ASSISTED_CARE',p_actions);return rid;
end $$;
create function w1_revoke(p_delegation uuid) returns void language plpgsql security definer set search_path=public as $$
declare d worker_delegations;
begin
 select * into d from worker_delegations where id=p_delegation for update;
 if not found or not exists(select 1 from patient_profiles where id=d.patient_id and user_id=auth.uid()) then raise exception 'Only patient may revoke delegation';end if;
 if d.status='REVOKED' then return;end if;
 update worker_delegations set status='REVOKED',revoked_at=now() where id=d.id;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(d.patient_id,auth.uid(),'WORKER_DELEGATION_REVOKED','ASSISTED_CARE',d.actions);
end $$;
create function w1_patient_directory(p_search text default '',p_offset integer default 0) returns table(patient_id uuid,patient_name text,patient_code text) language plpgsql stable security definer set search_path=public as $$
begin
 if not is_approved_provider('WORKER') or p_search is null or length(p_search)>100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Assigned worker directory required';end if;
 return query select p.id,p.full_name,p.patient_code from patient_profiles p where exists(select 1 from follow_up_tasks t where t.patient_id=p.id and t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED') and (starts_with(lower(p.full_name),lower(p_search)) or p.patient_code=p_search) order by p.id limit 30 offset p_offset;
end $$;
create function w1_package(p_task uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks;d jsonb;
begin
 select * into t from follow_up_tasks where id=p_task and worker_provider_id=my_provider_id();
 if not found or not is_approved_provider('WORKER') then raise exception 'Assigned worker task required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('delegation_id',id,'actions',actions,'valid_until',valid_until)),'[]') into d from worker_delegations where task_id=t.id and worker_provider_id=my_provider_id() and status='GRANTED' and valid_until>now();
 return jsonb_build_object('task_id',t.id,'patient_id',t.patient_id,'patient_name',(select full_name from patient_profiles where id=t.patient_id),'status',t.status,'version',t.sync_version,'delegations',d,'retrieved_at',now(),'package_expires_at',now()+interval '15 minutes','storage_requirement','Encrypted client storage and eviction on logout/revocation; server rechecks every queued action');
end $$;
-- Booking domain helper is generated from 008 below; only trusted wrappers can invoke it.
create function w1_book_for_patient(p_patient uuid,p_practice uuid,p_slot timestamptz,p_mode text,p_reason text,p_note text,p_request uuid,p_expected_fee numeric default null) returns uuid language plpgsql security definer set search_path=public as $$
declare patient uuid; practice provider_practices; prior appointments; slot record; result uuid; begin
 patient:=p_patient;
 if patient is null or p_request is null or length(coalesce(p_reason,''))>2000 or length(coalesce(p_note,''))>2000 then raise exception 'Patient and valid booking details required'; end if;
 select * into practice from provider_practices where id=p_practice;
 if not found then raise exception 'Practice not found'; end if;
 perform 1 from provider_profiles where id=practice.provider_id for update;
 select * into prior from appointments where booking_request_key=p_request;
 if found then if prior.patient_id=patient and prior.practice_id=p_practice and prior.scheduled_at=p_slot and prior.mode=p_mode and prior.reason is not distinct from nullif(trim(p_reason),'') and prior.patient_note is not distinct from nullif(trim(p_note),'') then return prior.id; else raise exception 'Booking request key conflict'; end if; end if;
 select * into slot from a2_available_slots(p_practice,p_mode) s where s.scheduled_at=p_slot limit 1;
 if not found then raise exception 'This slot is no longer available'; end if;
 if slot.consultation_fee is distinct from p_expected_fee then raise exception 'Consultation fee changed; select a refreshed slot to confirm'; end if;
 insert into appointments(patient_id,doctor_provider_id,practice_id,scheduled_at,mode,status,reason,patient_note,duration_minutes,booking_request_key,consultation_fee,practice_timezone)
 values(patient,practice.provider_id,p_practice,p_slot,p_mode,'REQUESTED',nullif(trim(p_reason),''),nullif(trim(p_note),''),slot.duration_minutes,p_request,slot.consultation_fee,slot.practice_timezone) returning id into result;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(patient,'APPOINTMENT_REQUESTED','appointments',result,auth.uid());
 return result;
end $$;
create function w1_sync(p_task uuid,p_patient uuid,p_delegation uuid,p_action text,p_payload jsonb,p_version bigint,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks;d worker_delegations;prior worker_sync_receipts;payload jsonb;result jsonb;state text;booking uuid;receipt uuid;
begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or t.worker_provider_id is distinct from my_provider_id() or not is_approved_provider('WORKER') or t.patient_id is distinct from p_patient then raise exception 'Assigned task patient does not match';end if;
 select * into d from worker_delegations where id=p_delegation and task_id=t.id and patient_id=t.patient_id and worker_provider_id=t.worker_provider_id and status='GRANTED' and valid_until>now() and p_action=any(actions) for share;
 if not found then raise exception 'Active explicit patient delegation required';end if;
 if p_request is null or p_action is null or p_action not in ('BOOK_APPOINTMENT','REPORT_OUTCOME') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8000 or p_version is null then raise exception 'Invalid sync request';end if;
 payload:=jsonb_build_object('task_id',p_task,'patient_id',p_patient,'delegation_id',p_delegation,'action',p_action,'payload',p_payload,'version',p_version);
 select * into prior from worker_sync_receipts where worker_provider_id=my_provider_id() and request_key=p_request;
 if found then if prior.request_payload<>payload then raise exception 'Sync request conflict';end if;return jsonb_build_object('receipt_id',prior.id,'status',prior.status,'result',prior.result);end if;
 if p_version<>t.sync_version then state:='CONFLICT';result:=jsonb_build_object('error','TASK_VERSION_CHANGED','current_version',t.sync_version);
 elsif t.status='COMPLETED' then state:='REJECTED';result:=jsonb_build_object('error','TASK_COMPLETED');
 else
  begin
   if p_action='BOOK_APPOINTMENT' then
    booking:=w1_book_for_patient(t.patient_id,(p_payload->>'practice_id')::uuid,(p_payload->>'scheduled_at')::timestamptz,p_payload->>'mode',p_payload->>'reason',p_payload->>'patient_note',p_request,(p_payload->>'expected_fee')::numeric);
    update follow_up_tasks set updated_at=clock_timestamp() where id=t.id;
    result:=jsonb_build_object('appointment_id',booking);
   else
    perform c1_worker_outcome(t.id,p_payload->>'status',p_payload->>'outcome');result:=jsonb_build_object('task_id',t.id,'outcome_status',p_payload->>'status');
   end if;
   state:='ACCEPTED';select result||jsonb_build_object('current_version',sync_version) into result from follow_up_tasks where id=t.id;
  exception when raise_exception or check_violation or invalid_text_representation or not_null_violation then state:='REJECTED';result:=jsonb_build_object('error','ACTION_VALIDATION_FAILED');end;
 end if;
 insert into worker_sync_receipts(worker_provider_id,patient_id,task_id,delegation_id,purpose,request_key,request_payload,status,result) values(t.worker_provider_id,t.patient_id,t.id,d.id,p_action,p_request,payload,state,result) returning id into receipt;
 return jsonb_build_object('receipt_id',receipt,'status',state,'result',result);
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'w1_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname not in ('w1_task_version','w1_book_for_patient') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
commit;
