-- 017: human-validated critical result communication and evidence-based closure.
begin;
create table critical_results(id uuid primary key default gen_random_uuid(),result_id uuid not null unique references lab_results(id),patient_id uuid not null references patient_profiles(id),responsible_doctor_id uuid not null references provider_profiles(id),finding text not null check(length(trim(finding)) between 3 and 4000),state text not null default 'DETECTED' check(state in ('DETECTED','VALIDATED','QUEUED','SENT','DELIVERED','FAILED','NO_RESPONSE','ESCALATED','ACKNOWLEDGED','CLOSED')),request_key uuid not null unique,detected_by uuid not null references auth.users(id),detected_at timestamptz not null default now(),acknowledged_at timestamptz,acknowledged_by uuid references auth.users(id),closed_at timestamptz,disposition text);
create table critical_result_actions(id uuid primary key default gen_random_uuid(),critical_id uuid not null references critical_results(id),request_key uuid not null unique,action text not null,channel text,note text not null,recipient_user_id uuid references auth.users(id),actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index r2_critical_doctor on critical_results(responsible_doctor_id,state,detected_at);
alter table critical_results enable row level security;alter table critical_result_actions enable row level security;
revoke all on critical_results,critical_result_actions from public,anon,authenticated;
create function r2_detect(p_result uuid,p_finding text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r lab_results;o lab_orders;c critical_results;cid uuid;ep uuid;nid uuid;
begin
 select * into r from lab_results where id=p_result;
 select * into o from lab_orders where id=r.lab_order_id for update;
 if not found or r.verified_at is null or not ((o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')) or (o.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR'))) then raise exception 'Verified source and assigned clinical actor required';end if;
 if p_request is null or p_finding is null or length(trim(p_finding)) not between 3 and 4000 then raise exception 'Actual critical finding and request key required';end if;
 select * into c from critical_results where request_key=p_request or result_id=r.id;
 if found then if c.result_id<>r.id or c.finding<>trim(p_finding) then raise exception 'Critical finding request conflict';end if;return c.id;end if;
 insert into critical_results(result_id,patient_id,responsible_doctor_id,finding,request_key,detected_by) values(r.id,o.patient_id,o.doctor_provider_id,trim(p_finding),p_request,auth.uid()) returning id into cid;
 if o.encounter_id is not null then
  perform g1_refresh(o.encounter_id);select id into ep from care_episodes where encounter_id=o.encounter_id;
  nid:=g1_put_node(ep,'CRITICAL_ACKNOWLEDGEMENT','DIAGNOSTICS','critical_results',cid,'VERIFICATION_PENDING','DOCTOR',now(),null,null);
  update care_nodes set occurred_at=r.created_at where id=nid;
 end if;
 insert into care_gaps(patient_id,gap_type,severity,status,source_table,source_id,due_at,graph_node_id) values(o.patient_id,'CRITICAL_RESULT_ACKNOWLEDGEMENT','CRITICAL','OPEN','critical_results',cid,now(),nid);
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(o.patient_id,'CRITICAL_RESULT_DETECTED','critical_results',cid,auth.uid());return cid;
end $$;
create function r2_transition(p_critical uuid,p_action text,p_channel text,p_note text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c critical_results;r lab_results;o lab_orders;prior critical_result_actions;lab boolean;doctor boolean;recipient uuid;receipt uuid;nid uuid;
begin
 select * into c from critical_results where id=p_critical;
 select * into r from lab_results where id=c.result_id;
 select * into o from lab_orders where id=r.lab_order_id for update;
 select * into c from critical_results where id=p_critical for update;
 if not found then raise exception 'Critical result not authorized';end if;
 lab:=o.lab_provider_id=my_provider_id() and is_approved_provider('LAB');doctor:=c.responsible_doctor_id=my_provider_id() and is_approved_provider('DOCTOR');
 if not coalesce(lab,false) and not coalesce(doctor,false) then raise exception 'Critical result not authorized';end if;
 if p_request is null or p_note is null or length(trim(p_note)) not between 3 and 4000 or (p_channel is not null and p_channel not in ('PHONE','IN_PERSON','EXTERNAL_RECORDED')) then raise exception 'Communication evidence and valid channel required';end if;
 select * into prior from critical_result_actions where request_key=p_request;
 if found then if prior.critical_id<>c.id or prior.action is distinct from p_action or prior.channel is distinct from p_channel or prior.note<>trim(p_note) then raise exception 'Critical action request conflict';end if;return prior.id;end if;
 if p_action is null or not ((c.state='DETECTED' and p_action='VALIDATED') or (c.state in ('VALIDATED','FAILED','NO_RESPONSE','ESCALATED') and p_action='QUEUED') or (c.state='QUEUED' and p_action in ('SENT','FAILED')) or (c.state='SENT' and p_action in ('DELIVERED','FAILED','NO_RESPONSE')) or (c.state='DELIVERED' and p_action='NO_RESPONSE') or (c.state in ('VALIDATED','QUEUED','SENT','DELIVERED','FAILED','NO_RESPONSE') and p_action='ESCALATED') or (c.state not in ('DETECTED','CLOSED','ACKNOWLEDGED') and p_action='ACKNOWLEDGED') or (c.state='ACKNOWLEDGED' and p_action='CLOSED')) then raise exception 'Invalid critical result transition';end if;
 if p_action in ('ACKNOWLEDGED','CLOSED') and not coalesce(doctor,false) then raise exception 'Responsible clinician acknowledgement required';end if;
 if p_action in ('QUEUED','SENT','DELIVERED','FAILED','NO_RESPONSE') and p_channel is null then raise exception 'Communication channel required';end if;
 if p_action='CLOSED' then
  select * into r from lab_results where id=c.result_id;
  if r.doctor_reviewed_at is null or r.doctor_reviewed_by is distinct from c.responsible_doctor_id or length(trim(p_note))<10 then raise exception 'Reviewed report and clinician disposition required';end if;
 end if;
 select user_id into recipient from provider_profiles where id=c.responsible_doctor_id;
 update critical_results set state=p_action,acknowledged_at=case when p_action='ACKNOWLEDGED' then now() else acknowledged_at end,acknowledged_by=case when p_action='ACKNOWLEDGED' then auth.uid() else acknowledged_by end,closed_at=case when p_action='CLOSED' then now() else closed_at end,disposition=case when p_action='CLOSED' then trim(p_note) else disposition end where id=c.id;
 insert into critical_result_actions(critical_id,request_key,action,channel,note,recipient_user_id,actor_user_id) values(c.id,p_request,p_action,p_channel,trim(p_note),recipient,auth.uid()) returning id into receipt;
 if p_action='CLOSED' then
  select graph_node_id into nid from care_gaps where source_table='critical_results' and source_id=c.id limit 1;
  if nid is not null then perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'COMPLETED','DOCTOR',n.due_at,'critical_result_actions',receipt) from care_nodes n where n.id=nid;end if;
  update care_gaps set status='CLOSED',closed_at=now() where source_table='critical_results' and source_id=c.id and status='OPEN';
 end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(c.patient_id,'CRITICAL_RESULT_'||p_action,'critical_results',c.id,auth.uid());return receipt;
end $$;
create function r2_worklist(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid critical worklist request';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,c.result_id,c.patient_id,c.finding,c.state,c.detected_at,c.acknowledged_at,c.closed_at from critical_results c join lab_results r on r.id=c.result_id join lab_orders o on o.id=r.lab_order_id where (c.responsible_doctor_id=my_provider_id() and is_approved_provider('DOCTOR')) or (o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')) order by c.detected_at,c.id limit 50 offset p_offset)x),'[]');
end $$;
revoke all on function r2_detect(uuid,text,uuid),r2_transition(uuid,text,text,text,uuid),r2_worklist(integer) from public,anon,authenticated;
grant execute on function r2_detect(uuid,text,uuid),r2_transition(uuid,text,text,text,uuid),r2_worklist(integer) to authenticated;
commit;
