-- 024: consent-scoped internal referrals with destination encounter proof.
begin;
create table care_referrals(id uuid primary key default gen_random_uuid(),episode_id uuid not null references care_episodes(id),patient_id uuid not null references patient_profiles(id),source_doctor_id uuid not null references provider_profiles(id),destination_facility_id uuid not null references facilities(id),destination_department_id uuid references facility_departments(id),destination_doctor_id uuid not null references provider_profiles(id),reason text not null check(length(trim(reason)) between 10 and 8000),urgency text not null check(urgency in ('ROUTINE','HIGH','CRITICAL')),state text not null default 'CREATED' check(state in ('CREATED','SENT','RECEIVED','ACCEPTED','REJECTED','CLARIFICATION','SCHEDULED','ARRIVED','ENCOUNTER_COMPLETED','OUTCOME_RETURNED','CLOSED','CANCELLED')),consent_status text not null default 'REQUESTED' check(consent_status in ('REQUESTED','GRANTED','DENIED','REVOKED')),consent_until timestamptz,consent_decided_at timestamptz,appointment_id uuid references appointments(id),outcome_encounter_id uuid references encounters(id),outcome_summary text,request_key uuid not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index r4_destination_queue on care_referrals(destination_facility_id,state,created_at);
create index r4_patient_referral on care_referrals(patient_id,created_at desc);
create table referral_actions(id uuid primary key default gen_random_uuid(),referral_id uuid not null references care_referrals(id),request_key uuid not null unique,from_state text,to_state text not null,payload jsonb not null,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table care_referrals enable row level security;alter table referral_actions enable row level security;
revoke all on care_referrals,referral_actions from public,anon,authenticated;
create function r4_create(p_episode uuid,p_facility uuid,p_department uuid,p_doctor uuid,p_reason text,p_urgency text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare e care_episodes;r care_referrals;rid uuid;nid uuid;
begin
 select * into e from care_episodes where id=p_episode for update;
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Source episode clinician required';end if;
 if p_request is null then raise exception 'Request key required';end if;
 if not exists(select 1 from facilities f join provider_profiles owner on owner.user_id=f.owner_user_id where f.id=p_facility and f.verification_status='APPROVED' and owner.verification_status='APPROVED') or not exists(select 1 from provider_profiles d join facility_memberships m on m.user_id=d.user_id where d.id=p_doctor and d.provider_type='DOCTOR' and d.verification_status='APPROVED' and m.facility_id=p_facility and m.active and m.staff_role='CLINICIAN') then raise exception 'Verified destination and assigned clinician required';end if;
 if p_department is not null and not exists(select 1 from facility_departments where id=p_department and facility_id=p_facility and active) then raise exception 'Destination department mismatch';end if;
 select * into r from care_referrals where request_key=p_request;
 if found then if r.episode_id<>e.id or r.destination_facility_id<>p_facility or r.destination_department_id is distinct from p_department or r.destination_doctor_id<>p_doctor or r.reason is distinct from trim(p_reason) or r.urgency is distinct from p_urgency then raise exception 'Referral request conflict';end if;return r.id;end if;
 insert into care_referrals(episode_id,patient_id,source_doctor_id,destination_facility_id,destination_department_id,destination_doctor_id,reason,urgency,request_key) values(e.id,e.patient_id,e.doctor_provider_id,p_facility,p_department,p_doctor,trim(p_reason),p_urgency,p_request) returning id into rid;
 nid:=g1_put_node(e.id,'REFERRAL','ENCOUNTERS','care_referrals',rid,'PENDING','DOCTOR',null,null,null);update care_nodes set occurred_at=now() where id=nid;
 insert into care_gaps(patient_id,gap_type,severity,source_table,source_id,graph_node_id,clinical_urgency) values(e.patient_id,'REFERRAL_COMPLETION_PENDING',p_urgency,'care_referrals',rid,nid,p_urgency);
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'REFERRAL_CREATED','care_referrals',rid,auth.uid());return rid;
end $$;
create function r4_consent(p_referral uuid,p_decision text,p_until timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
declare r care_referrals;
begin
 select * into r from care_referrals where id=p_referral for update;
 if not found or not exists(select 1 from patient_profiles where id=r.patient_id and user_id=auth.uid()) then raise exception 'Referral patient decision required';end if;
 if p_decision is null or not ((r.consent_status='REQUESTED' and p_decision in ('GRANTED','DENIED')) or (r.consent_status='GRANTED' and p_decision='REVOKED')) then raise exception 'Invalid referral consent transition';end if;
 if p_decision='GRANTED' and (p_until is null or p_until<=now() or p_until>now()+interval '90 days') then raise exception 'Referral consent expiry within ninety days required';end if;
 update care_referrals set consent_status=p_decision,consent_until=case when p_decision='GRANTED' then p_until else consent_until end,consent_decided_at=now(),updated_at=now() where id=r.id;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(r.patient_id,auth.uid(),'REFERRAL_'||p_decision,'REFERRAL',array['REFERRAL_REASON','DESTINATION_OUTCOME']);
end $$;
create function r4_transition(p_referral uuid,p_state text,p_payload jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r care_referrals;prior referral_actions;source boolean;destination boolean;dest_doctor boolean;app appointments;e encounters;receipt uuid;n care_nodes;
begin
 select * into r from care_referrals where id=p_referral for update;
 if not found then raise exception 'Referral not authorized';end if;
 source:=r.source_doctor_id=my_provider_id() and is_approved_provider('DOCTOR');destination:=h1_staff(r.destination_facility_id,array['MANAGER','RECEPTION']) or (r.destination_doctor_id=my_provider_id() and h1_staff(r.destination_facility_id,array['CLINICIAN']));dest_doctor:=r.destination_doctor_id=my_provider_id() and is_approved_provider('DOCTOR') and destination;
 if not coalesce(source,false) and not coalesce(destination,false) then raise exception 'Referral not authorized';end if;
 if r.consent_status<>'GRANTED' or r.consent_until<=now() then raise exception 'Active patient referral consent required';end if;
 if p_request is null or p_state is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>12000 then raise exception 'Valid referral transition payload required';end if;
 select * into prior from referral_actions where request_key=p_request;
 if found then if prior.referral_id<>r.id or prior.to_state<>p_state or prior.payload<>p_payload or prior.actor_user_id<>auth.uid() then raise exception 'Referral action conflict';end if;return prior.id;end if;
 if (p_state in ('SENT','CLOSED') and not coalesce(source,false)) or (p_state in ('ACCEPTED','REJECTED','CLARIFICATION','OUTCOME_RETURNED') and not coalesce(dest_doctor,false)) or (p_state in ('RECEIVED','SCHEDULED','ARRIVED','ENCOUNTER_COMPLETED') and not coalesce(destination,false)) then raise exception 'Appropriate referral actor required';end if;
 if not ((r.state in ('CREATED','CLARIFICATION') and p_state='SENT') or (r.state='SENT' and p_state='RECEIVED') or (r.state='RECEIVED' and p_state in ('ACCEPTED','REJECTED','CLARIFICATION')) or (r.state='ACCEPTED' and p_state='SCHEDULED') or (r.state='SCHEDULED' and p_state='ARRIVED') or (r.state='ARRIVED' and p_state='ENCOUNTER_COMPLETED') or (r.state='ENCOUNTER_COMPLETED' and p_state='OUTCOME_RETURNED') or (r.state='OUTCOME_RETURNED' and p_state='CLOSED')) then raise exception 'Invalid referral state transition';end if;
 if p_state in ('REJECTED','CLARIFICATION') and length(trim(coalesce(p_payload->>'reason','')))<3 then raise exception 'Destination response reason required';end if;
 if p_state='SCHEDULED' then
  select * into app from appointments where id=(p_payload->>'appointment_id')::uuid;
  if not found or app.patient_id<>r.patient_id or app.doctor_provider_id<>r.destination_doctor_id or app.status<>'CONFIRMED' or app.created_at<r.created_at or not exists(select 1 from provider_practices where id=app.practice_id and facility_id=r.destination_facility_id) then raise exception 'Actual destination patient appointment required';end if;
  update care_referrals set appointment_id=app.id where id=r.id;
 end if;
 if p_state='ARRIVED' and not exists(select 1 from reception_queue where appointment_id=r.appointment_id and patient_id=r.patient_id and facility_id=r.destination_facility_id and state not in ('CANCELLED','SKIPPED')) then raise exception 'Actual destination check-in required';end if;
 if p_state='ENCOUNTER_COMPLETED' then
  select * into e from encounters where appointment_id=r.appointment_id and patient_id=r.patient_id and doctor_provider_id=r.destination_doctor_id and status='COMPLETED';
  if not found then raise exception 'Signed destination encounter required';end if;update care_referrals set outcome_encounter_id=e.id where id=r.id;
 end if;
 if p_state='OUTCOME_RETURNED' then
  if length(trim(coalesce(p_payload->>'outcome','')))<10 then raise exception 'Destination clinician outcome required';end if;
  update care_referrals set outcome_summary=trim(p_payload->>'outcome') where id=r.id;
 end if;
 if p_state='CLOSED' and (r.outcome_summary is null or not exists(select 1 from encounters where id=r.outcome_encounter_id and patient_id=r.patient_id and status='COMPLETED')) then raise exception 'Actual returned outcome evidence required';end if;
 update care_referrals set state=p_state,updated_at=now() where id=r.id;
 insert into referral_actions(referral_id,request_key,from_state,to_state,payload,actor_user_id) values(r.id,p_request,r.state,p_state,p_payload,auth.uid()) returning id into receipt;
 select * into n from care_nodes where source_kind='care_referrals' and source_id=r.id;
 if p_state='CLOSED' then
  perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'COMPLETED','DOCTOR',n.due_at,'referral_actions',receipt);
  update care_gaps set status='CLOSED',closed_at=now(),closure_outcome='COMPLETED' where graph_node_id=n.id and status='OPEN';
 elsif p_state in ('REJECTED','CLARIFICATION') then update care_gaps set blocked_reason=p_payload->>'reason' where graph_node_id=n.id and status='OPEN';
 else perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'IN_PROGRESS','DOCTOR',n.due_at,null,null);end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(r.patient_id,'REFERRAL_'||p_state,'care_referrals',r.id,auth.uid());return receipt;
end $$;
create function r4_referrals(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid referral list';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,r.episode_id,r.patient_id,r.source_doctor_id,r.destination_facility_id,r.destination_department_id,r.destination_doctor_id,r.urgency,r.state,r.consent_status,r.consent_until,r.appointment_id,r.outcome_encounter_id,case when r.source_doctor_id=my_provider_id() or r.destination_doctor_id=my_provider_id() or exists(select 1 from patient_profiles where id=r.patient_id and user_id=auth.uid()) then r.reason end reason,case when r.source_doctor_id=my_provider_id() or r.destination_doctor_id=my_provider_id() or exists(select 1 from patient_profiles where id=r.patient_id and user_id=auth.uid()) then r.outcome_summary end outcome_summary,r.created_at from care_referrals r where exists(select 1 from patient_profiles where id=r.patient_id and user_id=auth.uid()) or (r.source_doctor_id=my_provider_id() and is_approved_provider('DOCTOR')) or (r.consent_status='GRANTED' and r.consent_until>now() and r.state<>'CREATED' and h1_staff(r.destination_facility_id,array['MANAGER','RECEPTION','CLINICIAN']) and (h1_staff(r.destination_facility_id,array['MANAGER','RECEPTION']) or r.destination_doctor_id=my_provider_id())) order by r.created_at desc,r.id limit 30 offset p_offset)x),'[]');
end $$;
revoke all on function r4_create(uuid,uuid,uuid,uuid,text,text,uuid),r4_consent(uuid,text,timestamptz),r4_transition(uuid,text,jsonb,uuid),r4_referrals(integer) from public,anon,authenticated;
grant execute on function r4_create(uuid,uuid,uuid,uuid,text,text,uuid),r4_consent(uuid,text,timestamptz),r4_transition(uuid,text,jsonb,uuid),r4_referrals(integer) to authenticated;
commit;
