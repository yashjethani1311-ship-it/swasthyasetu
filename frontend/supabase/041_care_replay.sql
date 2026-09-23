-- 041: immutable operational provenance and consent-scoped replay. No editable timeline.
begin;
create function t1_source_episode(p_kind text,p_id uuid) returns uuid language plpgsql stable security definer set search_path=public as $$
declare eid uuid;ep uuid;
begin
 case p_kind
 when 'encounters' then eid:=p_id;
 when 'appointments' then select id into eid from encounters where appointment_id=p_id;
 when 'prescriptions' then select encounter_id into eid from prescriptions where id=p_id;
 when 'prescription_items' then select p.encounter_id into eid from prescriptions p join prescription_items i on i.prescription_id=p.id where i.id=p_id;
 when 'dispense_events' then select p.encounter_id into eid from dispense_events d join prescription_items i on i.id=d.prescription_item_id join prescriptions p on p.id=i.prescription_id where d.id=p_id;
 when 'lab_orders' then select encounter_id into eid from lab_orders where id=p_id;
 when 'lab_results' then select o.encounter_id into eid from lab_results r join lab_orders o on o.id=r.lab_order_id where r.id=p_id;
 when 'lab_specimens' then select o.encounter_id into eid from lab_specimens s join lab_orders o on o.id=s.lab_order_id where s.id=p_id;
 when 'hospital_admissions' then select encounter_id into eid from hospital_admissions where id=p_id;
 when 'reception_queue' then select e.id into eid from reception_queue q join encounters e on e.appointment_id=q.appointment_id where q.id=p_id;
 when 'follow_up_tasks' then select n.episode_id into ep from follow_up_tasks t join care_gaps g on g.id=t.care_gap_id join care_nodes n on n.id=g.graph_node_id where t.id=p_id;
 when 'care_gaps' then select n.episode_id into ep from care_gaps g join care_nodes n on n.id=g.graph_node_id where g.id=p_id;
 when 'care_episodes' then ep:=p_id;
 when 'care_referrals' then select episode_id into ep from care_referrals where id=p_id;
 when 'critical_results' then select o.encounter_id into eid from critical_results c join lab_results r on r.id=c.result_id join lab_orders o on o.id=r.lab_order_id where c.id=p_id;
 when 'pharmacy_deliveries' then select p.encounter_id into eid from pharmacy_deliveries d join prescription_fulfilments f on f.id=d.fulfilment_id join prescriptions p on p.id=f.prescription_id where d.id=p_id;
 when 'emergency_requests' then select episode_id into ep from emergency_requests where id=p_id;
 else null;end case;
 if ep is null and eid is not null then select id into ep from care_episodes where encounter_id=eid;end if;return ep;
end $$;
create function t1_operational_capture(p_kind text,p_row jsonb,p_before jsonb,p_capture text) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid;sid uuid:=(p_row->>'id')::uuid;category text;v clinical_source_versions;state text;fid uuid;observed timestamptz;
begin
 pid:=case when p_kind='patient_profiles' then sid else (p_row->>'patient_id')::uuid end;
 if pid is null then return;end if;
 category:=case when p_kind in ('appointments','reception_queue','care_episodes') then 'ENCOUNTERS' when p_kind='pharmacy_deliveries' then 'PRESCRIPTIONS' when p_kind='critical_results' then 'DIAGNOSTICS' when p_kind='document_extraction_jobs' then 'DOCUMENTS' else 'TIMELINE' end;
 fid:=coalesce((p_row->>'facility_id')::uuid,(p_row->>'destination_facility_id')::uuid);
 state:=coalesce(p_row->>'state',p_row->>'status',case when p_kind='patient_profiles' then 'REGISTERED' end);
 observed:=coalesce((p_row->>'updated_at')::timestamptz,(p_row->>'created_at')::timestamptz,(p_row->>'detected_at')::timestamptz,now());
 perform pg_advisory_xact_lock(hashtextextended(p_kind||':'||sid::text,41));
 select * into v from clinical_source_versions where source_kind=p_kind and source_id=sid order by revision desc limit 1;
 insert into clinical_source_versions(patient_id,source_kind,source_id,revision,category,source_facility_id,occurred_at,verification_state,original,capture_kind,recorded_by,supersedes_id)
 values(pid,p_kind,sid,coalesce(v.revision,0)+1,category,fid,observed,'OPERATIONAL_SOURCE_RECORD',jsonb_build_object('id',sid,'state',state,'previous_state',coalesce(p_before->>'state',p_before->>'status'),'closure_outcome',p_row->>'closure_outcome','source_created_at',p_row->>'created_at','source_updated_at',p_row->>'updated_at','episode_id',t1_source_episode(p_kind,sid),'actor_role_at_event',(select role from profiles where id=auth.uid()),'baseline',p_capture='BASELINE'),p_capture,auth.uid(),v.id);
end $$;
create function t1_operational_trigger() returns trigger language plpgsql security definer set search_path=public as $$begin
 if tg_op='UPDATE' and to_jsonb(new) is not distinct from to_jsonb(old) then return new;end if;
 perform t1_operational_capture(tg_table_name,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) end,tg_op);return new;
end $$;
do $$declare t text;r record;begin foreach t in array array['patient_profiles','appointments','reception_queue','care_gaps','care_episodes','critical_results','care_referrals','payer_cases','emergency_requests','pharmacy_deliveries','document_extraction_jobs'] loop
 for r in execute format('select to_jsonb(s) body from %I s',t) loop perform t1_operational_capture(t,r.body,null,'BASELINE');end loop;
 execute format('create trigger t1_provenance after insert or update on %I for each row execute function t1_operational_trigger()',t);
end loop;end $$;
create function t1_communication_patient(p_communication uuid) returns uuid language sql stable security definer set search_path=public as $$
 select case c.source_kind when 'APPOINTMENT' then (select patient_id from appointments where id=c.source_id) when 'CARE_GAP' then (select patient_id from care_gaps where id=c.source_id) when 'REFERRAL' then (select patient_id from care_referrals where id=c.source_id) when 'CRITICAL_RESULT' then (select patient_id from critical_results where id=c.source_id) end from care_communications c where c.id=p_communication
$$;
create view care_replay_evidence as
 select 'SOURCE:'||v.id event_key,v.patient_id,coalesce((v.original->>'episode_id')::uuid,t1_source_episode(v.source_kind,v.source_id)) episode_id,v.category,coalesce(v.occurred_at,v.recorded_at) consent_date,v.recorded_at recorded_at,v.occurred_at occurred_at,v.recorded_by actor_user_id,v.source_facility_id facility_id,v.source_kind source_entity,v.source_id,
 case when v.capture_kind='BASELINE' then 'BASELINE_OBSERVATION' else v.source_kind||'_'||v.capture_kind end event_type,
 v.original->>'previous_state' previous_state,coalesce(v.original->>'state',v.original->>'status') resulting_state,v.verification_state,
 jsonb_build_object('revision',v.revision,'capture_kind',v.capture_kind,'closure_outcome',v.original->>'closure_outcome','actor_role_at_event',v.original->>'actor_role_at_event') safe_metadata
 from clinical_source_versions v where v.source_kind<>'lab_results' or (v.original->>'status'='COMPLETED' and v.original->>'verified_at' is not null and v.original->>'report_storage_path' is not null)
 union all
 select 'CARE:'||e.id,e.patient_id,t1_source_episode(e.source_table,e.source_id),case when e.source_table in ('lab_orders','lab_results','critical_results') then 'DIAGNOSTICS' when e.source_table in ('prescriptions','dispense_events','pharmacy_deliveries') then 'PRESCRIPTIONS' when e.source_table='encounters' then 'ENCOUNTERS' when e.source_table='follow_up_tasks' then 'FOLLOW_UPS' when e.source_table in ('health_records','document_extraction_reviews') then 'DOCUMENTS' else 'TIMELINE' end,e.created_at,e.created_at,e.created_at,e.actor_user_id,null,e.source_table,e.source_id,e.event_type,null,null,'RECORDED_EVENT','{}'::jsonb from care_events e
 union all
 select 'CONSENT:'||a.id,a.patient_id,null,'TIMELINE',a.created_at,a.created_at,a.created_at,a.actor_user_id,null,'consent_audit',a.id,a.action,null,null,'CONSENT_AUDIT',jsonb_build_object('purpose',a.purpose,'categories',a.categories) from consent_audit a where a.action not like '%READ%'
 union all
 select 'NODE:'||n.id,e.patient_id,c.episode_id,c.category,coalesce(c.occurred_at,e.source_at),n.recorded_at,n.recorded_at,n.actor_user_id,null,'care_nodes',c.id,'CARE_NODE_TRANSITION',n.from_state,n.to_state,case when n.proof_id is null then 'VERIFICATION_PENDING' else 'SOURCE_PROOF_RECORDED' end,jsonb_build_object('proof_kind',n.proof_kind,'proof_id',n.proof_id) from care_node_events n join care_nodes c on c.id=n.node_id join care_episodes e on e.id=c.episode_id
 union all
 select 'CUSTODY:'||c.id,o.patient_id,t1_source_episode('lab_orders',o.id),'DIAGNOSTICS',o.ordered_at,c.occurred_at,c.occurred_at,c.actor_user_id,o.destination_facility_id,'sample_custody_events',c.id,c.event_type,c.metadata->>'previous_status',c.metadata->>'status','CUSTODY_EVENT',jsonb_build_object('specimen_id',s.id,'lab_order_id',o.id) from sample_custody_events c join lab_specimens s on s.id=c.specimen_id join lab_orders o on o.id=s.lab_order_id
 union all
 select 'REFERRAL:'||a.id,r.patient_id,r.episode_id,'TIMELINE',r.created_at,a.created_at,a.created_at,a.actor_user_id,r.destination_facility_id,'referral_actions',a.id,'REFERRAL_TRANSITION',a.from_state,a.to_state,'RECORDED_EVENT',jsonb_build_object('referral_id',r.id,'request_key',a.request_key) from referral_actions a join care_referrals r on r.id=a.referral_id
 union all
 select 'PAYER:'||a.id,c.patient_id,null,'TIMELINE',c.created_at,a.created_at,a.created_at,a.actor_user_id,c.facility_id,'payer_case_events',a.id,a.event_type,null,null,'EXTERNAL_EVIDENCE_RECORDED',jsonb_build_object('case_id',c.id,'submission_version',a.submission_version) from payer_case_events a join payer_cases c on c.id=a.case_id
 union all
 select 'CRITICAL:'||a.id,c.patient_id,t1_source_episode('critical_results',c.id),'DIAGNOSTICS',c.detected_at,a.created_at,a.created_at,a.actor_user_id,null,'critical_result_actions',a.id,a.action,null,null,'RECORDED_EVENT',jsonb_build_object('critical_id',c.id,'channel',a.channel) from critical_result_actions a join critical_results c on c.id=a.critical_id
 union all
 select 'TRANSPORT:'||a.id,e.patient_id,e.episode_id,'TIMELINE',e.created_at,a.created_at,a.created_at,null,e.accepted_facility_id,'emergency_transport_events',a.id,'TRANSPORT_'||a.state,null,a.state,'EXTERNAL_EVIDENCE_RECORDED',jsonb_build_object('emergency_request_id',e.id) from emergency_transport_events a join emergency_requests e on e.id=a.request_id
 union all
 select 'DELIVERY:'||a.id,d.patient_id,t1_source_episode('pharmacy_deliveries',d.id),'PRESCRIPTIONS',d.created_at,a.created_at,a.created_at,a.actor_user_id,null,'pharmacy_delivery_events',a.id,a.action,a.from_state,a.to_state,'RECORDED_EVENT',jsonb_build_object('delivery_id',d.id,'request_key',a.request_key) from pharmacy_delivery_events a join pharmacy_deliveries d on d.id=a.delivery_id
 union all
 select 'IDENTITY:'||a.id||':'||p.patient_id,p.patient_id,null,'TIMELINE',a.created_at,a.created_at,a.created_at,a.actor_user_id,null,'patient_identity_events',a.id,a.action,null,null,'IDENTITY_ALIAS_EVENT',jsonb_build_object('candidate_id',c.id,'authorization_unchanged',true) from patient_identity_events a join patient_identity_candidates c on c.id=a.candidate_id cross join lateral(values(c.alias_patient_id),(c.canonical_patient_id))p(patient_id)
 union all
 select 'COMMUNICATION:'||r.id,t1_communication_patient(c.id),null,'TIMELINE',c.created_at,r.created_at,r.created_at,r.actor_user_id,null,'communication_receipts',r.id,'COMMUNICATION_'||r.state,null,r.state,'COMMUNICATION_EVIDENCE',jsonb_build_object('communication_id',c.id,'source_kind',c.source_kind,'source_id',c.source_id,'clinical_closure',false) from communication_receipts r join care_communications c on c.id=r.communication_id;
revoke all on care_replay_evidence from public,anon,authenticated,service_role;
create function t1_replay(p_patient uuid,p_purpose text default 'TREATMENT',p_episode uuid default null,p_before timestamptz default null,p_before_key text default null,p_limit integer default 50) returns jsonb language plpgsql security definer set search_path=public as $$
declare items jsonb;ctx jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or (p_before_key is not null and (p_before is null or length(p_before_key)>100)) then raise exception 'Bounded replay cursor required';end if;
 ctx:=a1_authorized_context(p_patient,p_purpose,0);
 if p_episode is not null and not exists(select 1 from care_episodes where id=p_episode and patient_id=p_patient) then raise exception 'Replay episode does not belong to patient';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc,x.event_key desc),'[]') into items from (
 select event_key,patient_id,episode_id,recorded_at,occurred_at,actor_user_id,facility_id,source_entity,source_id,event_type,previous_state,resulting_state,verification_state,safe_metadata,'IMMUTABLE_SOURCE_EVIDENCE'::text provenance
 from care_replay_evidence e where patient_id=p_patient and (p_episode is null or episode_id=p_episode) and a1_has_consent(p_patient,e.category,p_purpose,e.consent_date)
 and (p_before is null or e.recorded_at<p_before or (e.recorded_at=p_before and p_before_key is not null and e.event_key<p_before_key))
 order by recorded_at desc,event_key desc limit p_limit)x;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(p_patient,auth.uid(),'CARE_REPLAY_READ',p_purpose);
 return jsonb_build_object('items',items,'next_cursor',case when jsonb_array_length(items)=p_limit then jsonb_build_object('recorded_at',items->-1->'recorded_at','event_key',items->-1->'event_key') end,'order','recorded_at DESC, event_key DESC','notice','Recorded chronology preserves late-arriving evidence. occurred_at is separate. Baseline observations are not reconstructed past transitions. Actor role may be unknown on older evidence. Related source/event records have distinct stable evidence keys. No clinical narrative is returned.');
end $$;
revoke all on function t1_communication_patient(uuid),t1_source_episode(text,uuid),t1_operational_capture(text,jsonb,jsonb,text),t1_operational_trigger(),t1_replay(uuid,text,uuid,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function t1_replay(uuid,text,uuid,timestamptz,text,integer) to authenticated;
commit;
