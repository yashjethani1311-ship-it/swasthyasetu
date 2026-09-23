-- 032: bounded read-only AI tools. Every call derives role and scope from current database authority.
begin;
create table ai_tool_audit(id bigint generated always as identity primary key,actor_user_id uuid not null references auth.users(id),tool_name text not null,actor_role text not null,record_count integer not null,created_at timestamptz not null default now());
alter table ai_tool_audit enable row level security;revoke all on ai_tool_audit from public,anon,authenticated;revoke all on sequence ai_tool_audit_id_seq from public,anon,authenticated;
create function a3_tool(p_tool text,p_scope jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;payload jsonb;ctx jsonb;patient uuid;facility uuid;task uuid;section text;category text;
begin
 if auth.uid() is null or p_tool is null or p_scope is null or jsonb_typeof(p_scope)<>'object' or octet_length(p_scope::text)>1000 or exists(select 1 from jsonb_object_keys(p_scope)k where k not in ('patient_id','facility_id','task_id')) then raise exception 'INVALID_AI_TOOL_REQUEST';end if;
 patient:=(p_scope->>'patient_id')::uuid;facility:=(p_scope->>'facility_id')::uuid;task:=(p_scope->>'task_id')::uuid;
 if p_tool in ('get_patient_snapshot','get_recent_diagnostics','get_prescriptions','get_medicine_fulfilment','get_appointments','get_open_caregaps','get_nextstep','get_caregraph','get_longitudinal_history','get_diagnostic_trends','get_pending_report_reviews','get_active_medicines','get_followup_state','get_referral_status') then
  if patient is null or facility is not null or task is not null then raise exception 'PATIENT_SCOPE_REQUIRED';end if;
  ctx:=s1_snapshot_context(patient,'AI_ASSISTANCE');actor:=ctx->>'actor_role';
  case p_tool
   when 'get_patient_snapshot' then payload:=jsonb_build_array(ctx);
   when 'get_recent_diagnostics' then payload:=ctx->'diagnostics';
   when 'get_diagnostic_trends' then payload:=ctx->'diagnostics'; -- Dated measurements, no inferred diagnostic trend.
   when 'get_prescriptions' then payload:=ctx->'prescriptions';
   when 'get_medicine_fulfilment' then payload:=coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','issued_at',x->'issued_at','status',x->'status','fulfilment',x->'fulfilment')) from jsonb_array_elements(ctx->'prescriptions')x),'[]');
   when 'get_open_caregaps' then payload:=coalesce((select jsonb_agg(x) from jsonb_array_elements(ctx->'care_gaps')x where x->>'status'<>'CLOSED'),'[]');
   when 'get_referral_status' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,state,urgency,created_at,updated_at,destination_facility_id,appointment_id,outcome_encounter_id from care_referrals where patient_id=patient and a1_has_consent(patient,'TIMELINE','AI_ASSISTANCE',created_at) order by created_at desc,id limit 50)x),'[]');
   when 'get_followup_state' then payload:=ctx->'follow_ups';
   when 'get_caregraph' then payload:=ctx->'episodes';
   when 'get_nextstep' then payload:=coalesce((select jsonb_agg(n) from jsonb_array_elements(ctx->'episodes')e cross join lateral jsonb_array_elements(e->'nodes')n where n->>'ready'='true' and n->>'state' not in ('COMPLETED','CANCELLED')),'[]');
   when 'get_active_medicines' then payload:=jsonb_build_array(jsonb_build_object('state','UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION','notice','Prescription and dispensing do not establish current medicine use'));
   when 'get_longitudinal_history' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from l1_history(patient,'AI_ASSISTANCE',null,50)x),'[]');
   when 'get_pending_report_reviews' then payload:=coalesce((select jsonb_agg(x) from jsonb_array_elements(ctx->'diagnostics')x where x->'result' is not null and x->'result'<>'null'::jsonb and x->'result'->>'doctor_reviewed_at' is null),'[]');
   when 'get_appointments' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,scheduled_at,mode,status,created_at from appointments where patient_id=patient and a1_has_consent(patient,'ENCOUNTERS','AI_ASSISTANCE',scheduled_at) order by scheduled_at desc,id limit 50)x),'[]');
  end case;
 elsif p_tool in ('get_hospital_queue','get_admissions','get_beds','get_discharge_pending','get_facility_workload') then
  if facility is null or patient is not null or task is not null or not h1_staff(facility,array['MANAGER','RECEPTION','CLINICIAN']) then raise exception 'FACILITY_SCOPE_NOT_AUTHORIZED';end if;actor:='FACILITY';
  case p_tool
   when 'get_hospital_queue' then payload:=coalesce((select jsonb_agg(to_jsonb(x)-'patient_id'-'patient_name') from h1_queue(facility,current_date,0)x),'[]');
   when 'get_beds' then payload:=h2_beds(facility,0);
   when 'get_admissions' then payload:=coalesce((select jsonb_agg(x-'patient_id'-'patient_name') from jsonb_array_elements(h2_admissions(facility,0))x),'[]');
   when 'get_discharge_pending' then payload:=coalesce((select jsonb_agg(x-'patient_id'-'patient_name'||jsonb_build_object('discharge_readiness','UNKNOWN_CLINICIAN_REVIEW_REQUIRED')) from jsonb_array_elements(h2_admissions(facility,0))x where x->>'status'='ADMITTED'),'[]');
   when 'get_facility_workload' then payload:=jsonb_build_array(jsonb_build_object('id',facility,'queue_records_in_first_page',(select count(*) from h1_queue(facility,current_date,0)),'admission_records_in_first_page',jsonb_array_length(h2_admissions(facility,0)),'scope','Bounded authorized pages; not whole-hospital totals'));
  end case;
 elsif p_tool in ('get_pathology_worklist','get_study_worklist','get_critical_worklist') then
  if patient is not null or facility is not null or task is not null then raise exception 'PROVIDER_SCOPE_ONLY';end if;
  if is_approved_provider('LAB') then actor:='LAB';elsif p_tool='get_critical_worklist' and is_approved_provider('DOCTOR') then actor:='DOCTOR';else raise exception 'PROVIDER_ROLE_NOT_AUTHORIZED';end if;
  case p_tool
   when 'get_pathology_worklist' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,test_name,status,routing_status,ordered_at from lab_orders where lab_provider_id=my_provider_id() and (workflow_kind is null or workflow_kind='PATHOLOGY') order by ordered_at desc,id limit 50)x),'[]');
   when 'get_study_worklist' then payload:=coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','lab_order_id',x->'lab_order_id','test_name',x->'test_name','state',x->'state','workflow_kind',x->'workflow_kind','created_at',x->'created_at','updated_at',x->'updated_at')) from jsonb_array_elements(r1_worklist(0))x),'[]');
   when 'get_critical_worklist' then payload:=coalesce((select jsonb_agg(x-'patient_id'-'finding') from jsonb_array_elements(r2_worklist(0))x),'[]');
  end case;
 elsif p_tool in ('get_inventory','get_low_stock','get_expiry','get_pharmacy_fulfilment','get_purchases','get_sales_summary') then
  if not is_approved_provider('PHARMACY') or patient is not null or facility is not null or task is not null then raise exception 'PHARMACY_SCOPE_NOT_AUTHORIZED';end if;actor:='PHARMACY';
  case p_tool
   when 'get_purchases' then payload:=p3_purchases(0);
   when 'get_pharmacy_fulfilment' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,status,requested_at,completed_at from prescription_fulfilments where pharmacy_provider_id=my_provider_id() order by requested_at desc,id limit 50)x),'[]');
   when 'get_sales_summary' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,total,created_at from pharmacy_sales where pharmacy_provider_id=my_provider_id() order by created_at desc,id limit 50)x),'[]');
   else payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,medicine_name,strength,batch_number,expiry_date,quantity,selling_price,updated_at,case when expiry_date is null then 'EXPIRY_UNKNOWN' when expiry_date<current_date then 'EXPIRED' else 'RECORDED_EXPIRY' end expiry_state from pharmacy_inventory where pharmacy_provider_id=my_provider_id() and (p_tool<>'get_low_stock' or quantity=0) and (p_tool<>'get_expiry' or expiry_date is null or expiry_date<=current_date+30) order by expiry_date nulls first,id limit 50)x),'[]');
  end case;
 elsif p_tool in ('get_assigned_tasks','get_worker_delegations','get_worker_sync','get_worker_next_action') then
  if not is_approved_provider('WORKER') or patient is not null or facility is not null then raise exception 'WORKER_SCOPE_NOT_AUTHORIZED';end if;actor:='WORKER';
  if task is not null and not exists(select 1 from follow_up_tasks where id=task and worker_provider_id=my_provider_id()) then raise exception 'WORKER_TASK_NOT_AUTHORIZED';end if;
  if p_tool='get_worker_sync' then payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select id,task_id,status,purpose,created_at from worker_sync_receipts where worker_provider_id=my_provider_id() and (task is null or task_id=task) order by created_at desc,id limit 50)x),'[]');
  else payload:=coalesce((select jsonb_agg(to_jsonb(x)) from (select t.id,t.status,t.sync_version,t.assigned_at,t.updated_at,
  (select jsonb_build_object('id',g.id,'gap_type',g.gap_type,'status',g.status,'due_at',g.due_at) from care_gaps g where g.id=t.care_gap_id) care_gap,
  coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'actions',d.actions,'valid_until',d.valid_until)) from worker_delegations d where d.task_id=t.id and d.worker_provider_id=my_provider_id() and d.status='GRANTED' and d.valid_until>now()),'[]') delegations,
  case when t.status='AWAITING_VERIFICATION' then 'WAIT_FOR_CLINICIAN_REVIEW' when t.status='COMPLETED' then 'NO_PENDING_ACTION' else 'REVIEW_CURRENT_TASK_AND_VALID_DELEGATION' end next_action
  from follow_up_tasks t where t.worker_provider_id=my_provider_id() and (task is null or t.id=task) order by t.updated_at desc,t.id limit 50)x),'[]');end if;
 elsif p_tool in ('get_verification_queue','get_model_governance') then
  if not is_admin() or patient is not null or facility is not null or task is not null then raise exception 'ADMIN_SCOPE_NOT_AUTHORIZED';end if;actor:='ADMIN';
  if p_tool='get_verification_queue' then payload:=coalesce((select jsonb_agg(to_jsonb(x)-'full_name') from v1_verification_queue('PENDING',0)x),'[]');else payload:=jsonb_build_array(m1_registry());end if;
 else raise exception 'AI_TOOL_UNAVAILABLE';end if;
 insert into ai_tool_audit(actor_user_id,tool_name,actor_role,record_count) values(auth.uid(),p_tool,actor,jsonb_array_length(payload));
 return jsonb_build_object('tool',p_tool,'actor_role',actor,'retrieved_at',now(),'data',payload,'scope',p_scope,'purpose','AI_ASSISTANCE','provenance','AUTHORIZED_DATABASE_RPC','uncertainty','Bounded source records; missing or stale information remains unknown. Operational projections omit patient identity and clinical narrative.');
end $$;
revoke all on function a3_tool(text,jsonb) from public,anon,authenticated;
grant execute on function a3_tool(text,jsonb) to authenticated;
commit;
