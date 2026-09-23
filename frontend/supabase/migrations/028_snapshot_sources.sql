-- 028: purpose-scoped Snapshot sources; no inferred current medication/allergy state.
begin;
create function s1_snapshot_context(p_patient uuid,p_purpose text default 'TREATMENT') returns jsonb language plpgsql security definer set search_path=public as $$
declare payload jsonb;
begin
 payload:=a1_authorized_context(p_patient,p_purpose,0);
 return payload||jsonb_build_object(
 'current_state',jsonb_build_object('active_problems','UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION','active_medicines','UNKNOWN_PRESCRIPTION_DOES_NOT_CONFIRM_CURRENT_USE','allergies','No allergy documented in a reconciled allergy list','vitals','See dated clinician-reviewed document observations where available'),
 'reviewed_documents',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.id,r.version,r.normalized_fields,r.review_state,r.source_authenticity,r.created_at,h.id record_id,coalesce(h.record_date::timestamptz,h.created_at) source_at,r.reviewed_by
 from document_extraction_reviews r join document_extraction_drafts d on d.id=r.draft_id join document_extraction_jobs j on j.id=d.job_id join health_records h on h.id=j.record_id
 where h.patient_id=p_patient and a1_has_consent(p_patient,'DOCUMENTS',p_purpose,coalesce(h.record_date::timestamptz,h.created_at))
 and not exists(select 1 from document_extraction_reviews newer where newer.draft_id=r.draft_id and newer.version>r.version)
 order by r.created_at desc,r.id limit 30)x),'[]'),
 'episodes',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select e.id,e.encounter_id,e.source_at,e.status,e.closure_outcome,e.closed_at,
 coalesce((select jsonb_agg(to_jsonb(n)) from (select n.id,n.kind,n.state,n.responsible_role,n.due_at,n.occurred_at,n.updated_at,n.required,n.proof_kind,n.proof_id,
 case when n.state in ('COMPLETED','CANCELLED') then false else not exists(select 1 from care_dependencies d join care_nodes dep on dep.id=d.requires_node_id where d.node_id=n.id and dep.state<>'COMPLETED') end ready
 from care_nodes n where n.episode_id=e.id and a1_has_consent(p_patient,n.category,p_purpose,coalesce(n.occurred_at,e.source_at)) order by n.due_at nulls last,n.id limit 100)n),'[]') nodes
 from care_episodes e where e.patient_id=p_patient and a1_has_consent(p_patient,'ENCOUNTERS',p_purpose,e.source_at) order by e.source_at desc,e.id limit 10)x),'[]'),
 'snapshot_scope','At most 50 base records per section, 30 latest document reviews, 10 episodes and 100 permitted nodes per episode. Dated transcriptions are not reconciled active clinical lists.');
end $$;
create or replace function a1_ai_context(p_patient uuid) returns jsonb language sql security definer set search_path=public as $$select s1_snapshot_context(p_patient,'AI_ASSISTANCE')$$;
revoke all on function s1_snapshot_context(uuid,text) from public,anon,authenticated;
grant execute on function s1_snapshot_context(uuid,text) to authenticated;
commit;
