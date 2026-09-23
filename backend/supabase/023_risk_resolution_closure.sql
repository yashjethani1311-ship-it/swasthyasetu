-- 023: explicit operational risk, resolution attempts and non-completion dispositions.
begin;
alter table care_gaps add column blocked_reason text;
alter table care_gaps add column responsible_provider_id uuid references provider_profiles(id);
alter table care_gaps add column clinical_urgency text not null default 'ROUTINE' check(clinical_urgency in ('ROUTINE','HIGH','CRITICAL'));
alter table care_gaps add column vulnerable_context boolean not null default false;
alter table care_gaps add column stale_operational_data boolean not null default false;
alter table care_gaps add column risk_recorded_by uuid references provider_profiles(id);
alter table care_gaps add column risk_recorded_at timestamptz;
alter table care_gaps add column closure_outcome text;
create table gap_resolution_attempts(id uuid primary key default gen_random_uuid(),gap_id uuid not null references care_gaps(id),action text not null check(action in ('REMINDER','RETRY','WORKER_CONTACT','ALTERNATE_SEARCH','ESCALATE','CLINICIAN_REVIEW','PATIENT_CONFIRMATION')),autonomy_level integer not null check(autonomy_level in (1,2)),outcome text not null check(outcome in ('QUEUED','FAILED','RECORDED')),note text not null check(length(trim(note)) between 3 and 2000),request_key uuid not null unique,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index c3_gap_attempts on gap_resolution_attempts(gap_id,created_at desc);
create table pathway_dispositions(id uuid primary key default gen_random_uuid(),instance_id uuid not null references pathway_step_instances(id),outcome text not null,reason text not null,source_id uuid,request_key uuid not null unique,actor_user_id uuid not null references auth.users(id),recorded_at timestamptz not null default now());
alter table gap_resolution_attempts enable row level security;alter table pathway_dispositions enable row level security;
revoke all on gap_resolution_attempts,pathway_dispositions from public,anon,authenticated;
create function c3_gap_actor(p_gap uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from care_gaps g where g.id=p_gap and (
 exists(select 1 from patient_profiles where id=g.patient_id and user_id=auth.uid()) or
 (is_approved_provider('DOCTOR') and exists(select 1 from care_nodes n join care_episodes e on e.id=n.episode_id where n.id=g.graph_node_id and e.doctor_provider_id=my_provider_id())) or
 (is_approved_provider('WORKER') and exists(select 1 from follow_up_tasks t where t.care_gap_id=g.id and t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED'))))
$$;
create function c3_risk_inputs(p_gap uuid,p_urgency text,p_vulnerable boolean,p_stale boolean,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare g care_gaps;
begin
 select * into g from care_gaps where id=p_gap for update;
 if not found or not is_approved_provider('DOCTOR') or not exists(select 1 from care_nodes n join care_episodes e on e.id=n.episode_id where n.id=g.graph_node_id and e.doctor_provider_id=my_provider_id()) then raise exception 'Assigned clinician risk input required';end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 2000 or p_urgency is null or p_vulnerable is null or p_stale is null then raise exception 'Explicit risk inputs and reason required';end if;
 update care_gaps set clinical_urgency=p_urgency,vulnerable_context=p_vulnerable,stale_operational_data=p_stale,blocked_reason=trim(p_reason),risk_recorded_by=my_provider_id(),risk_recorded_at=now(),responsible_provider_id=my_provider_id() where id=g.id;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'OPERATIONAL_RISK_INPUTS','care_gaps',g.id::text,jsonb_build_object('urgency',p_urgency,'vulnerable',p_vulnerable,'stale',p_stale,'reason',trim(p_reason)));
end $$;
create function c3_attempt(p_gap uuid,p_action text,p_outcome text,p_note text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare g care_gaps;r gap_resolution_attempts;rid uuid;
begin
 select * into g from care_gaps where id=p_gap for update;
 if not found or not c3_gap_actor(g.id) then raise exception 'Care-gap resolution not authorized';end if;
 if p_request is null then raise exception 'Request key required';end if;
 select * into r from gap_resolution_attempts where request_key=p_request;
 if found then if r.gap_id<>g.id or r.action is distinct from p_action or r.outcome is distinct from p_outcome or r.note is distinct from trim(p_note) or r.actor_user_id<>auth.uid() then raise exception 'Resolution request conflict';end if;return r.id;end if;
 if g.status<>'OPEN' then raise exception 'Care gap is already closed';end if;
 if p_action='PATIENT_CONFIRMATION' and not exists(select 1 from patient_profiles where id=g.patient_id and user_id=auth.uid()) then raise exception 'Patient must record own confirmation';end if;
 insert into gap_resolution_attempts(gap_id,action,autonomy_level,outcome,note,request_key,actor_user_id) values(g.id,p_action,case when p_action='PATIENT_CONFIRMATION' then 2 else 1 end,p_outcome,trim(p_note),p_request,auth.uid()) returning id into rid;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(g.patient_id,'RESOLUTION_ATTEMPT_RECORDED','gap_resolution_attempts',rid,auth.uid());return rid;
end $$;
create function c3_resolution(p_gap uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare g care_gaps;failures integer;overdue integer;score integer;critical boolean;
begin
 select * into g from care_gaps where id=p_gap;
 if not found or not c3_gap_actor(g.id) then raise exception 'Care-gap resolution not authorized';end if;
 if is_approved_provider('DOCTOR') and not a1_has_consent(g.patient_id,'TIMELINE','TREATMENT',g.created_at) then raise exception 'Timeline consent required';end if;
 select count(*) into failures from gap_resolution_attempts where gap_id=g.id and outcome='FAILED';
 overdue:=case when g.due_at is null then 0 else greatest(0,floor(extract(epoch from now()-g.due_at)/3600)::integer) end;
 critical:=g.gap_type='CRITICAL_RESULT_ACKNOWLEDGEMENT' and g.status='OPEN';
 score:=case when critical or g.clinical_urgency='CRITICAL' then 1000 when g.clinical_urgency='HIGH' or g.severity='HIGH' then 100 else 10 end+least(overdue,72)+least(failures,20)*5+g.vulnerable_context::integer*10+g.stale_operational_data::integer*10;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(g.patient_id,auth.uid(),'RESOLUTION_READ','TREATMENT');
 return jsonb_build_object('gap_id',g.id,'status',g.status,'due_at',g.due_at,'blocked_reason',g.blocked_reason,'responsible_provider_id',g.responsible_provider_id,'risk',jsonb_build_object('rule_version','operational-v1','score',score,'clinical_urgency',g.clinical_urgency,'overdue_hours',overdue,'failed_attempts',failures,'unacknowledged_critical',critical,'vulnerable_context',g.vulnerable_context,'stale_operational_data',g.stale_operational_data),'allowed_operational_actions',case when g.status='OPEN' then jsonb_build_array('REMINDER','RETRY','WORKER_CONTACT','ALTERNATE_SEARCH','ESCALATE','CLINICIAN_REVIEW','PATIENT_CONFIRMATION') else '[]'::jsonb end,'notice','Operational prioritization, not autonomous diagnosis or clinical triage. Recorded/queued attempts do not mean delivery or completed care.');
end $$;
create function c3_disposition(p_instance uuid,p_outcome text,p_reason text,p_source uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i pathway_step_instances;s care_pathway_steps;e care_episodes;n care_nodes;r pathway_dispositions;rid uuid;patient boolean;doctor boolean;
begin
 select * into i from pathway_step_instances where id=p_instance for update;select * into s from care_pathway_steps where id=i.step_id;select ep.* into e from episode_pathways a join care_episodes ep on ep.id=a.episode_id where a.id=i.activation_id;
 patient:=exists(select 1 from patient_profiles where id=e.patient_id and user_id=auth.uid());doctor:=e.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR');
 if e.id is null or not coalesce(patient or doctor,false) then raise exception 'Pathway disposition not authorized';end if;
 if p_request is null or p_outcome is null or not p_outcome=any(s.allowed_closures) or p_reason is null or length(trim(p_reason)) not between 10 and 4000 then raise exception 'Approved closure rule and explicit reason required';end if;
 if (p_outcome='PATIENT_DECLINED' and not patient) or (p_outcome<>'PATIENT_DECLINED' and not coalesce(doctor,false)) then raise exception 'Appropriate human confirmation required';end if;
 select * into r from pathway_dispositions where request_key=p_request;
 if found then if r.instance_id<>i.id or r.outcome<>p_outcome or r.reason<>trim(p_reason) or r.source_id is distinct from p_source or r.actor_user_id<>auth.uid() then raise exception 'Disposition request conflict';end if;return r.id;end if;
 if i.closure_state is not null then raise exception 'Pathway step already closed';end if;
 if p_outcome='TRANSFERRED' and not exists(select 1 from admission_actions a join hospital_admissions h on h.id=a.admission_id where a.id=p_source and a.action='TRANSFER' and h.encounter_id=e.encounter_id and h.patient_id=e.patient_id) then raise exception 'Verified transfer source required; external completion remains verification pending';end if;
 if p_outcome='DECEASED' and not exists(select 1 from health_records where id=p_source and patient_id=e.patient_id and record_type='DEATH_CERTIFICATE' and verification_status='VERIFIED') then raise exception 'Verified clinical source required';end if;
 if p_outcome='DUPLICATE_ERROR' and not exists(select 1 from pathway_step_instances other join episode_pathways a on a.id=other.activation_id join care_pathway_steps d on d.id=other.step_id where other.id=p_source and other.id<>i.id and a.episode_id=e.id and d.evidence_kind=s.evidence_kind) then raise exception 'Matching original step required';end if;
 insert into pathway_dispositions(instance_id,outcome,reason,source_id,request_key,actor_user_id) values(i.id,p_outcome,trim(p_reason),p_source,p_request,auth.uid()) returning id into rid;
 update pathway_step_instances set closure_state=p_outcome,closure_reason=trim(p_reason),proof_kind='pathway_dispositions',proof_id=rid,closed_by=auth.uid(),closed_at=now() where id=i.id;
 select * into n from care_nodes where id=i.node_id;perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'CANCELLED',n.responsible_role,n.due_at,'pathway_dispositions',rid);
 update care_gaps set status='CLOSED',closed_at=now(),closure_outcome=p_outcome where graph_node_id=n.id and status='OPEN';
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'PATHWAY_'||p_outcome,'pathway_dispositions',rid,auth.uid());return rid;
end $$;
revoke all on function c3_gap_actor(uuid),c3_risk_inputs(uuid,text,boolean,boolean,text),c3_attempt(uuid,text,text,text,uuid),c3_resolution(uuid),c3_disposition(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function c3_risk_inputs(uuid,text,boolean,boolean,text),c3_attempt(uuid,text,text,text,uuid),c3_resolution(uuid),c3_disposition(uuid,text,text,uuid,uuid) to authenticated;
commit;
