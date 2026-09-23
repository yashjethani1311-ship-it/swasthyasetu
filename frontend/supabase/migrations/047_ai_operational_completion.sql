-- 047: complete bounded operational AI tools and traceable retrieval metadata; no new clinical permissions.
begin;
alter function a3_tool(text,jsonb) rename to a5_base_tool;
create function a3_tool(p_tool text,p_scope jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare payload jsonb;actor text;fid uuid;result jsonb;aid bigint;
begin
 if auth.uid() is null or p_scope is null or jsonb_typeof(p_scope)<>'object' or octet_length(p_scope::text)>1000 or exists(select 1 from jsonb_object_keys(p_scope) k where k not in ('patient_id','facility_id','task_id','state','district','month')) then raise exception 'INVALID_AI_TOOL_REQUEST';end if;
 if p_tool in ('get_hospital_procedures','get_hospital_stores','get_hospital_referrals') then
 if exists(select 1 from jsonb_object_keys(p_scope) k where k<>'facility_id') then raise exception 'FACILITY_SCOPE_REQUIRED';end if;fid:=(p_scope->>'facility_id')::uuid;
 if fid is null or not h1_staff(fid,array['MANAGER']) then raise exception 'FACILITY_SCOPE_NOT_AUTHORIZED';end if;actor:='FACILITY';
 if p_tool='get_hospital_stores' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into payload from (select id,item_code,name,unit,quantity,updated_at from hospital_store_items where facility_id=fid order by id limit 100)x;
 elsif p_tool='get_hospital_procedures' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into payload from (select b.id,b.state,b.starts_at,b.ends_at,b.created_at from hospital_procedure_bookings b join hospital_procedure_rooms r on r.id=b.room_id where r.facility_id=fid order by b.starts_at desc,b.id limit 100)x;
 else select coalesce(jsonb_agg(to_jsonb(x)),'[]') into payload from (select id,state,urgency,created_at,updated_at from care_referrals where destination_facility_id=fid and consent_status='GRANTED' and consent_until>now() order by created_at desc,id limit 50)x;end if;
 elsif p_tool in ('get_lab_quality','get_lab_machines','get_recollection_worklist') then
 if p_scope<>'{}' or not is_approved_provider('LAB') then raise exception 'LAB_SCOPE_NOT_AUTHORIZED';end if;actor:='LAB';payload:=r3_quality_worklist()->case when p_tool='get_recollection_worklist' then 'rejected' else 'machines' end;
 if p_tool='get_recollection_worklist' then select coalesce(jsonb_agg(x-'rejection_reason'-'sample_code'),'[]') into payload from jsonb_array_elements(payload)x;end if;
 elsif p_tool='get_pharmacy_delivery' then
 if p_scope<>'{}' or not is_approved_provider('PHARMACY') then raise exception 'PHARMACY_SCOPE_NOT_AUTHORIZED';end if;actor:='PHARMACY';select coalesce(jsonb_agg(to_jsonb(x)),'[]') into payload from (select id,mode,state,created_at,updated_at,received_at from pharmacy_deliveries where pharmacy_provider_id=my_provider_id() order by updated_at desc,id limit 50)x;
 elsif p_tool in ('get_integration_health','get_governance_incidents','get_district_pulse') then
 if not is_admin() or p_scope?'patient_id' or p_scope?'task_id' then raise exception 'ADMIN_SCOPE_NOT_AUTHORIZED';end if;actor:='ADMIN';
 if p_tool='get_integration_health' then if exists(select 1 from jsonb_object_keys(p_scope) k where k<>'facility_id') then raise exception 'INVALID_AI_TOOL_REQUEST';end if;payload:=x2_health((p_scope->>'facility_id')::uuid);
 elsif p_tool='get_governance_incidents' then if p_scope<>'{}' then raise exception 'INVALID_AI_TOOL_REQUEST';end if;select coalesce(jsonb_agg(to_jsonb(x)),'[]') into payload from (select id,category,state,severity,revision,created_at,updated_at from governance_incidents order by updated_at desc,id limit 50)x;
 else if exists(select 1 from jsonb_object_keys(p_scope) k where k not in ('state','district','month','facility_id')) then raise exception 'INVALID_AI_TOOL_REQUEST';end if;payload:=jsonb_build_array(t3_pulse(p_scope->>'state',p_scope->>'district',(p_scope->>'month')::date,(p_scope->>'facility_id')::uuid));end if;
 else
 result:=a5_base_tool(p_tool,p_scope);
 select id into aid from ai_tool_audit where actor_user_id=auth.uid() and tool_name=p_tool order by id desc limit 1;
 return result||jsonb_build_object('audit_reference',aid,'freshness','Source timestamps govern freshness; retrieval time is not clinical observation time.');
 end if;
 insert into ai_tool_audit(actor_user_id,tool_name,actor_role,record_count) values(auth.uid(),p_tool,actor,jsonb_array_length(payload)) returning id into aid;
 return jsonb_build_object('tool',p_tool,'actor_role',actor,'retrieved_at',now(),'data',payload,'scope',p_scope,'purpose','AI_ASSISTANCE','provenance','AUTHORIZED_DATABASE_RPC','audit_reference',aid,'freshness','Dated bounded source records; unknown/stale values need confirmation.','uncertainty','Operational evidence only; no clinical narrative or automatic decisions.');
end $$;
alter function s1_snapshot_context(uuid,text) rename to a5_base_snapshot;
create function s1_snapshot_context(p_patient uuid,p_purpose text default 'TREATMENT') returns jsonb language plpgsql security definer set search_path=public as $$declare context jsonb;begin
 context:=a5_base_snapshot(p_patient,p_purpose);
 return context||jsonb_build_object('dated_vitals',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,started_at,temperature_c,pulse_bpm,systolic_bp,diastolic_bp,spo2_percent,weight_kg from encounters where patient_id=p_patient and status='COMPLETED' and a1_has_consent(p_patient,'ENCOUNTERS',p_purpose,started_at) and (temperature_c is not null or pulse_bpm is not null or systolic_bp is not null or diastolic_bp is not null or spo2_percent is not null or weight_kg is not null) order by started_at desc,id limit 50)x),'[]'));
end $$;
create or replace function a1_ai_context(p_patient uuid) returns jsonb language sql security definer set search_path=public as $$select s1_snapshot_context(p_patient,'AI_ASSISTANCE')$$;
revoke all on function a5_base_tool(text,jsonb),a5_base_snapshot(uuid,text),a3_tool(text,jsonb),s1_snapshot_context(uuid,text) from public,anon,authenticated;
grant execute on function a3_tool(text,jsonb),s1_snapshot_context(uuid,text) to authenticated;
commit;
