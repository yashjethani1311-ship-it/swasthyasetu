-- 050: persisted Snapshot audit reference and privacy-suppressed current operational source aggregates.
begin;
alter function s1_snapshot_context(uuid,text) rename to t5_base_snapshot;
create function s1_snapshot_context(p_patient uuid,p_purpose text default 'TREATMENT') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;aid uuid;begin
 result:=t5_base_snapshot(p_patient,p_purpose);
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(p_patient,auth.uid(),'SNAPSHOT_PROJECTION_READ',p_purpose) returning id into aid;
 return result||jsonb_build_object('audit_reference',aid,'freshness','Dated source history; source timestamps, not retrieval time, govern clinical freshness.');
end $$;
create or replace function a1_ai_context(p_patient uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$select s1_snapshot_context(p_patient,'AI_ASSISTANCE')$$;
alter function t3_pulse(text,text,date,uuid) rename to t5_base_pulse;
create function t3_pulse(p_state text,p_district text,p_month date,p_facility uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare result jsonb;metrics jsonb;begin
 result:=t5_base_pulse(p_state,p_district,p_month,p_facility);
 with scoped as materialized(select f.id,f.owner_user_id from facilities f join provider_profiles p on p.user_id=f.owner_user_id where lower(f.state)=lower(trim(p_state)) and lower(f.district)=lower(trim(p_district)) and (p_facility is null or f.id=p_facility) and f.verification_status='APPROVED' and p.verification_status='APPROVED'),
 pharmacies as materialized(select s.id,p.id provider_id from scoped s join facilities f on f.id=s.id join provider_profiles p on p.user_id=s.owner_user_id and p.provider_type='PHARMACY' where f.facility_type='PHARMACY' and (select count(*) from facilities ff where ff.owner_user_id=s.owner_user_id and ff.facility_type='PHARMACY')=1),
 counts as(select 'FACILITIES_WITH_FRESH_CAPABILITY_EVIDENCE' metric,count(*)::int denominator,count(*) filter(where exists(select 1 from facility_capability_updates u where u.facility_id=s.id and u.valid_until>now()))::int numerator from scoped s
 union all select 'SINGLE_SITE_PHARMACIES_WITH_RECORDED_USABLE_STOCK',count(*)::int,count(*) filter(where exists(select 1 from pharmacy_inventory i where i.pharmacy_provider_id=p.provider_id and i.quantity>0 and i.expiry_date>=current_date))::int from pharmacies p)
 select jsonb_agg(jsonb_build_object('metric',metric,'numerator',case when denominator>=20 and numerator>=10 and denominator-numerator>=10 then numerator end,'denominator',case when denominator>=20 and numerator>=10 and denominator-numerator>=10 then denominator end,'suppression_state',case when denominator>=20 and numerator>=10 and denominator-numerator>=10 then 'RELEASED' else 'SUPPRESSED_MINIMUM_CELL_SIZE' end) order by metric) into metrics from counts;
 return result||jsonb_build_object('current_operations',jsonb_build_object('observed_at',now(),'time_basis','CURRENT_RECORDED_STATE_NOT_MONTH_COHORT','metrics',metrics,'limitations','Capability evidence freshness does not mean capability available. Stock means at least one recorded positive unexpired line, not every prescribed medicine available. Provider-level stock is mapped only for owners with exactly one pharmacy site. Missing/ambiguous geography is excluded. Threshold suppression is not differential privacy.'));
end $$;
revoke all on function t5_base_snapshot(uuid,text),t5_base_pulse(text,text,date,uuid),s1_snapshot_context(uuid,text),t3_pulse(text,text,date,uuid) from public,anon,authenticated;
grant execute on function s1_snapshot_context(uuid,text),t3_pulse(text,text,date,uuid) to authenticated;
commit;
