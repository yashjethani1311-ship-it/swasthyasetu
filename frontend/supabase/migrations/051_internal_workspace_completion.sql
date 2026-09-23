-- Additive internal contracts. No operational deletion or auth configuration changes.
begin;
alter table facility_departments add column specialty text check(length(specialty)<=160);
alter table facility_departments add column head_user_id uuid references auth.users(id);
create function h1_update_department(p_department uuid,p_name text,p_specialty text,p_head uuid,p_active boolean)
returns void language plpgsql security definer set search_path=public, pg_temp as $$
declare d facility_departments;
begin
 select * into d from facility_departments where id=p_department for update;
 if not found or not h1_staff(d.facility_id,array['MANAGER']) then raise exception 'Facility manager required';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 160 or p_active is null then raise exception 'Department name and active state required';end if;
 if p_head is not null and not exists(select 1 from facility_memberships where facility_id=d.facility_id and user_id=p_head and active and staff_role='CLINICIAN') then raise exception 'Head must be a current facility clinician';end if;
 update facility_departments set name=trim(p_name),specialty=nullif(trim(p_specialty),''),head_user_id=p_head,active=p_active where id=d.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(d.facility_id,auth.uid(),'DEPARTMENT_UPDATED',d.id);
end $$;

create function h3_register(p_facility uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public, pg_temp as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION']) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Facility billing authorization required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
   select i.id,i.patient_id,p.full_name patient_name,p.patient_code,i.source_kind,i.created_at,i.currency,i.status,i.total,
     coalesce(m.paid,0) paid,case when i.status='VOID' then 0 else i.total-coalesce(m.paid,0) end outstanding
   from facility_invoices i join patient_profiles p on p.id=i.patient_id
   left join lateral (select sum(case when kind='PAYMENT' then amount else -amount end) paid from facility_payments where invoice_id=i.id) m on true
   where i.facility_id=p_facility order by i.created_at desc,i.id limit 30 offset p_offset
 ) x),'[]');
end $$;

-- Names and membership come from the selected facility, never a national provider list.
create function h4_staff(p_facility uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public, pg_temp as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION','CLINICIAN']) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Facility staff authorization required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select m.id,m.user_id,m.staff_role,m.active,p.full_name,pp.id provider_id,pp.provider_type,pp.specialization,pp.registration_id,pp.organization_name,pp.verification_status
 from facility_memberships m join profiles p on p.id=m.user_id left join provider_profiles pp on pp.user_id=m.user_id
 where m.facility_id=p_facility order by m.id limit 50 offset p_offset
 ) x),'[]');
end $$;

-- Search remains assigned-task scoped. No new patient access or phone disclosure.
create or replace function w1_patient_directory(p_search text default '',p_offset integer default 0)
returns table(patient_id uuid,patient_name text,patient_code text) language plpgsql stable security definer set search_path=public, pg_temp as $$
declare term text:=lower(regexp_replace(trim(p_search),'\s+',' ','g'));
begin
 if not is_approved_provider('WORKER') or p_search is null or length(p_search)>100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Assigned worker directory required';end if;
 return query select p.id,p.full_name,p.patient_code from patient_profiles p
 where exists(select 1 from follow_up_tasks t where t.patient_id=p.id and t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED')
 and (term='' or position(term in lower(regexp_replace(trim(p.full_name),'\s+',' ','g')))>0 or lower(p.patient_code)=term or position(term in lower(p.patient_code))>0)
 order by p.id limit 30 offset p_offset;
end $$;
revoke all on function h1_update_department(uuid,text,text,uuid,boolean),h3_register(uuid,integer),h4_staff(uuid,integer) from public,anon,authenticated;
grant execute on function h1_update_department(uuid,text,text,uuid,boolean),h3_register(uuid,integer),h4_staff(uuid,integer) to authenticated;
commit;
