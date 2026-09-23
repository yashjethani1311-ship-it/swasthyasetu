-- 048: targeted authorization, bounded reads, training validation and evidence audit hardening.
begin;
create or replace function m2_review(p_candidate uuid,p_deidentified jsonb,p_note text,p_identifiers_removed boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare c ai_learning_candidates;f ai_feedback;rid uuid;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Governance reviewer required';end if;
 select feedback_id into rid from ai_learning_candidates where id=p_candidate;select * into f from ai_feedback where id=rid for share;select * into c from ai_learning_candidates where id=p_candidate for update;
 if c.id is null or c.state<>'PENDING_REVIEW' or not f.training_opt_in or f.withdrawn_at is not null then raise exception 'Active opt-in pending candidate required';end if;
 if f.actor_user_id=auth.uid() then raise exception 'Independent human reviewer required';end if;
 if p_identifiers_removed is distinct from true or p_note is null or length(trim(p_note)) not between 10 and 4000 or p_deidentified is null or jsonb_typeof(p_deidentified)<>'object' or not(p_deidentified ?& array['input','expected_output','task','language']) or (select count(*) from jsonb_object_keys(p_deidentified))<>4 or octet_length(p_deidentified::text)>12000 then raise exception 'Explicit de-identification review and bounded training example required';end if;
 if jsonb_typeof(p_deidentified->'task') is distinct from 'string' or jsonb_typeof(p_deidentified->'language') is distinct from 'string' or nullif(trim(p_deidentified->>'input'),'') is null or nullif(trim(p_deidentified->>'expected_output'),'') is null or p_deidentified->>'task' not in ('SOURCE_SELECTION','INTENT_CLASSIFICATION','LANGUAGE_DETECTION','DOCUMENT_EXTRACTION','GROUNDED_ANSWER') or p_deidentified->>'language' not in ('English','Hindi','Hinglish','Auto') or jsonb_typeof(p_deidentified->'input')<>'string' or jsonb_typeof(p_deidentified->'expected_output')<>'string' then raise exception 'Invalid reviewed training task';end if;
 insert into ai_training_examples(candidate_id,deidentified_content,reviewed_by,review_note) values(c.id,p_deidentified,auth.uid(),trim(p_note)) returning id into rid;
 update ai_learning_candidates set state='APPROVED' where id=c.id;
 insert into ai_learning_events(action,source_id,actor_user_id) values('DEIDENTIFIED_EXAMPLE_APPROVED',rid,auth.uid());return rid;
end $$;
create or replace function w2_worklist(p_area uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('WORKER') or (p_area is not null and not exists(select 1 from worker_area_assignments where worker_provider_id=my_provider_id() and area_id=p_area and active)) then raise exception 'Assigned worker area required';end if;
 return jsonb_build_object('areas',coalesce((select jsonb_agg(to_jsonb(a)) from (select a.* from worker_area_assignments m join worker_areas a on a.id=m.area_id where m.worker_provider_id=my_provider_id() and m.active order by a.id limit 100)a),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(x)) from (select t.id,t.patient_id,p.full_name patient_name,t.status,t.sync_version,t.updated_at,ta.area_id,g.gap_type,g.due_at,g.severity,
 coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'actions',d.actions,'valid_until',d.valid_until)) from worker_delegations d where d.task_id=t.id and d.worker_provider_id=t.worker_provider_id and d.status='GRANTED' and d.valid_until>now()),'[]') delegations
 from follow_up_tasks t join patient_profiles p on p.id=t.patient_id join care_gaps g on g.id=t.care_gap_id left join worker_task_areas ta on ta.task_id=t.id
 where t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED' and (p_area is null or ta.area_id=p_area) order by g.due_at nulls last,t.id limit 50)x),'[]'),
 'notice','Area assignment never grants access to unassigned patients. Use current task version and active patient delegation for every assisted action.');
end $$;
create or replace function t2_twin(p_episode uuid,p_purpose text default 'TREATMENT') returns jsonb language plpgsql security definer set search_path=public as $$
declare e care_episodes;ctx jsonb;nodes jsonb;gaps jsonb;result jsonb;
begin
 select * into e from care_episodes where id=p_episode;if not found then raise exception 'Episode unavailable';end if;
 ctx:=a1_authorized_context(e.patient_id,p_purpose,0);
 if not a1_has_consent(e.patient_id,'ENCOUNTERS',p_purpose,e.source_at) then raise exception 'Episode encounter consent required';end if;
 select coalesce(jsonb_agg(t2_fresh(to_jsonb(n),n.updated_at,n.state not in ('COMPLETED','CANCELLED'))),'[]') into nodes from (
 select n.id,n.kind,n.category,n.state,n.required,n.responsible_role,n.source_kind,n.source_id,n.occurred_at,n.updated_at,n.due_at,n.proof_kind,n.proof_id,
 not exists(select 1 from care_dependencies d join care_nodes p on p.id=d.requires_node_id where d.node_id=n.id and p.state<>'COMPLETED') and n.state not in ('COMPLETED','CANCELLED') ready
 from care_nodes n where n.episode_id=e.id and a1_has_consent(e.patient_id,n.category,p_purpose,coalesce(n.occurred_at,e.source_at)) order by n.due_at nulls last,n.id limit 100)n;
 select coalesce(jsonb_agg(t2_fresh(to_jsonb(g),coalesce(g.closed_at,g.risk_recorded_at,g.created_at),g.status='OPEN')),'[]') into gaps from (
 select g.id,g.graph_node_id,g.gap_type,g.status,g.due_at,g.severity,g.blocked_reason,g.closure_outcome,g.created_at,g.closed_at,g.risk_recorded_at from care_gaps g join care_nodes n on n.id=g.graph_node_id where n.episode_id=e.id and a1_has_consent(e.patient_id,'TIMELINE',p_purpose,g.created_at) and a1_has_consent(e.patient_id,n.category,p_purpose,coalesce(n.occurred_at,e.source_at)) order by g.created_at desc,g.id limit 100)g;
 result:=jsonb_build_object('episode',jsonb_build_object('id',e.id,'patient_id',e.patient_id,'encounter_id',e.encounter_id,'status',e.status,'closure_outcome',e.closure_outcome,'source_at',e.source_at,'closed_at',e.closed_at),'nodes',nodes,'care_gaps',gaps,
 'next_steps',coalesce((select jsonb_agg(x) from jsonb_array_elements(nodes)x where x->>'ready'='true'),'[]'),
 'pathways',coalesce((select jsonb_agg(jsonb_build_object('activation_id',a.id,'version_id',a.version_id,'activated_at',a.activated_at,'definition_state',v.status)) from (select * from episode_pathways where episode_id=e.id order by activated_at desc,id limit 100) a join care_pathway_versions v on v.id=a.version_id where a.episode_id=e.id),'[]'),
 'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'scheduled_at',a.scheduled_at,'mode',a.mode,'status',a.status)) from appointments a join encounters c on c.appointment_id=a.id where c.id=e.encounter_id),'[]'),
 'diagnostics',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),x.updated_at,x.status not in ('COMPLETED','CANCELLED'))) from (select o.id,o.test_name,o.workflow_kind,o.status,o.routing_status,o.ordered_at,greatest(o.ordered_at,(select max(recorded_at) from clinical_source_versions where source_kind='lab_orders' and source_id=o.id),(select max(updated_at) from lab_specimens where lab_order_id=o.id),(select max(updated_at) from diagnostic_studies where lab_order_id=o.id),(select max(greatest(verified_at,doctor_reviewed_at)) from lab_results where lab_order_id=o.id)) updated_at,
 (select jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'updated_at',s.updated_at,'processing_lab_provider_id',s.processing_lab_provider_id,'collection_centre_id',s.collection_centre_id)) from lab_specimens s where s.lab_order_id=o.id) specimens,
 (select jsonb_build_object('id',s.id,'state',s.state,'updated_at',s.updated_at,'facility_id',s.facility_id) from diagnostic_studies s where s.lab_order_id=o.id) study,
 (select jsonb_build_object('id',r.id,'status',r.status,'verified_at',r.verified_at,'doctor_reviewed_at',r.doctor_reviewed_at,'pending_review',r.doctor_reviewed_at is null) from lab_results r where r.lab_order_id=o.id and r.status='COMPLETED' and r.verified_at is not null and r.report_storage_path is not null) result
 from lab_orders o where o.encounter_id=e.encounter_id and a1_has_consent(e.patient_id,'DIAGNOSTICS',p_purpose,o.ordered_at) order by o.ordered_at desc,o.id limit 50)x),'[]'),
 'prescriptions',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.status,p.issued_at,(select jsonb_build_object('id',f.id,'status',f.status,'requested_at',f.requested_at,'completed_at',f.completed_at) from prescription_fulfilments f where f.prescription_id=p.id) fulfilment,
 (select jsonb_build_object('id',d.id,'state',d.state,'mode',d.mode,'updated_at',d.updated_at,'received_at',d.received_at) from pharmacy_deliveries d join prescription_fulfilments f on f.id=d.fulfilment_id where f.prescription_id=p.id) receipt
 from prescriptions p where p.encounter_id=e.encounter_id and a1_has_consent(e.patient_id,'PRESCRIPTIONS',p_purpose,p.issued_at) order by p.issued_at desc,p.id limit 50)x),'[]'),
 'referrals',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),x.updated_at,x.state not in ('CLOSED','CANCELLED','REJECTED'))) from (select id,state,urgency,destination_facility_id,created_at,updated_at from care_referrals where episode_id=e.id and a1_has_consent(e.patient_id,'TIMELINE',p_purpose,created_at) order by created_at desc,id limit 50)x),'[]'),
 'follow_ups',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),x.updated_at,x.status<>'COMPLETED')) from (select t.id,t.status,t.updated_at,t.verified_at,t.sync_version,(select count(*) from worker_assistance_records a where a.task_id=t.id) assistance_observation_count from follow_up_tasks t join care_gaps g on g.id=t.care_gap_id join care_nodes n on n.id=g.graph_node_id where n.episode_id=e.id and a1_has_consent(e.patient_id,'FOLLOW_UPS',p_purpose,t.assigned_at) order by t.updated_at desc,t.id limit 50)x),'[]'),
 'payer_cases',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),x.updated_at,x.state not in ('SETTLED','DENIED'))) from (select c.id,c.kind,c.state,c.updated_at,c.submission_version from payer_cases c join facility_invoices i on i.id=c.invoice_id where c.patient_id=e.patient_id and ((i.source_kind='APPOINTMENT' and i.source_id=(select appointment_id from encounters where id=e.encounter_id)) or (i.source_kind='ADMISSION' and exists(select 1 from hospital_admissions h where h.id=i.source_id and h.encounter_id=e.encounter_id))) and a1_has_consent(e.patient_id,'TIMELINE',p_purpose,c.created_at) order by c.created_at desc,c.id limit 50)x),'[]'),
 'emergencies',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),x.created_at,x.state<>'CLOSED',interval '15 minutes')) from (select id,state,transport_state,accepted_facility_id,created_at from emergency_requests where episode_id=e.id and a1_has_consent(e.patient_id,'TIMELINE',p_purpose,created_at) order by created_at desc,id limit 30)x),'[]'),
 'critical_results',coalesce((select jsonb_agg(t2_fresh(to_jsonb(x),coalesce(x.closed_at,x.acknowledged_at,x.detected_at),x.state not in ('ACKNOWLEDGED','CLOSED'),interval '15 minutes')) from (select c.id,c.state,c.detected_at,c.acknowledged_at,c.closed_at,c.result_id from critical_results c join lab_results r on r.id=c.result_id join lab_orders o on o.id=r.lab_order_id where o.encounter_id=e.encounter_id and a1_has_consent(e.patient_id,'DIAGNOSTICS',p_purpose,o.ordered_at) order by c.detected_at desc,c.id limit 30)x),'[]'),
 'external_claims',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'gap_id',c.gap_id,'record_id',c.record_id,'reported_at',c.created_at,'state',case when n.state='COMPLETED' and n.proof_id is not null then 'OPERATIONAL_SOURCE_COMPLETED_SEPARATELY' else 'EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING' end)) from (select c.* from external_care_claims c join care_gaps cg on cg.id=c.gap_id join care_nodes cn on cn.id=cg.graph_node_id where cn.episode_id=e.id order by c.created_at desc,c.id limit 100) c join care_gaps g on g.id=c.gap_id join care_nodes n on n.id=g.graph_node_id join health_records h on h.id=c.record_id where n.episode_id=e.id and a1_has_consent(e.patient_id,'DOCUMENTS',p_purpose,coalesce(h.record_date::timestamptz,h.created_at)) and a1_has_consent(e.patient_id,'TIMELINE',p_purpose,g.created_at)),'[]'),
 'as_of',now(),'provenance','CURRENT_AUTHORIZED_SOURCE_PROJECTION','scope','One episode; bounded domain lists. Source IDs remain authoritative.','notice','Operational care state, not disease simulation or diagnosis. Missing evidence remains unknown; external claims do not close care.');
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(e.patient_id,auth.uid(),'CARE_TWIN_READ',p_purpose);return result;
end $$;
create or replace function r1_study_step(p_study uuid,p_action text,p_payload jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s diagnostic_studies;o lab_orders;prior diagnostic_study_actions;target text;rid uuid;receipt uuid;lab boolean;author boolean;
begin
 select * into s from diagnostic_studies where id=p_study;
 select * into o from lab_orders where id=s.lab_order_id for update;
 select * into s from diagnostic_studies where id=p_study for update;
 if not found then raise exception 'Study not authorized';end if;
 lab:=o.lab_provider_id=my_provider_id() and is_approved_provider('LAB') and exists(select 1 from facilities where id=s.facility_id and owner_user_id=auth.uid());
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
create function a6_room_audit() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'HOSPITAL_PROCEDURE_ROOM_RECORDED','hospital_procedure_rooms',new.id::text,jsonb_build_object('facility_id',new.facility_id,'active',new.active));return new;
end $$;
create trigger a6_room_created after insert on hospital_procedure_rooms for each row execute function a6_room_audit();
revoke all on function a6_room_audit() from public,anon,authenticated;
create index t1_patient_recorded on clinical_source_versions(patient_id,recorded_at desc,id desc);
create index t4_session_events on teleconsult_events(session_id,created_at desc,id);
create index t4_participant_intents on teleconsult_join_intents(participant_id,created_at desc);
create index k_master_source_version on master_import_batches(kind,source_name,effective_date desc,created_at desc) where enabled;
commit;
