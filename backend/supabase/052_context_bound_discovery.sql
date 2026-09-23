-- Context comes from persisted care records, never client-supplied location filters.
begin;
create or replace function d2_worker_in_context(p_gap uuid,p_worker uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists (
  select 1 from care_gaps g join encounters e on g.source_table='encounters' and e.id=g.source_id and e.patient_id=g.patient_id
  join provider_profiles w on w.id=p_worker and w.provider_type='WORKER' and w.verification_status='APPROVED'
  where g.id=p_gap and (
   exists(select 1 from worker_delegations d join follow_up_tasks t on t.id=d.task_id
    where d.patient_id=g.patient_id and t.patient_id=g.patient_id and t.worker_provider_id=w.id
    and t.status<>'COMPLETED' and d.worker_provider_id=w.id and d.status='GRANTED'
    and d.valid_until>now() and 'REPORT_OUTCOME'=any(d.actions))
   or exists(select 1 from appointments a join provider_practices pr on pr.id=a.practice_id
    join facilities f on f.id=pr.facility_id and f.verification_status='APPROVED'
    join provider_profiles owner on owner.user_id=f.owner_user_id and owner.verification_status='APPROVED'
    join facility_memberships m on m.facility_id=f.id and m.user_id=w.user_id and m.active
    where a.id=e.appointment_id and a.patient_id=g.patient_id and a.doctor_provider_id=e.doctor_provider_id
    and pr.provider_id=e.doctor_provider_id and pr.active)
  )
 )
$$;
revoke all on function d2_worker_in_context(uuid,uuid) from public,anon,authenticated;

create or replace function d2_gap_workers(p_gap uuid,p_search text default '',p_offset integer default 0)
returns table(id uuid,name text,detail text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or p_search is null or length(p_search)>100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid authenticated discovery request';end if;
 if not is_approved_provider('DOCTOR') or not exists(select 1 from care_gaps g join encounters e on g.source_table='encounters' and e.id=g.source_id and e.patient_id=g.patient_id
  where g.id=p_gap and e.doctor_provider_id=my_provider_id() and g.gap_type='FOLLOW_UP_PENDING' and g.status='OPEN') then raise exception 'Follow-up not authorized';end if;
 return query select w.id,w.full_name,'Authorized delegation or encounter facility'::text from provider_profiles w
 where w.provider_type='WORKER' and w.verification_status='APPROVED' and d2_worker_in_context(p_gap,w.id)
 and (p_search='' or strpos(lower(w.full_name),lower(p_search))>0 or strpos(lower(coalesce(w.organization_name,'')),lower(p_search))>0)
 order by lower(w.full_name),w.id limit 10 offset p_offset;
end $$;

create or replace function d2_rx_pharmacies(p_rx uuid,p_search text default '',p_offset integer default 0)
returns table(id uuid,name text,detail text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare patient patient_profiles;
begin
 if auth.uid() is null or p_search is null or length(p_search)>100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid authenticated discovery request';end if;
 select pp.* into patient from prescriptions rx join patient_profiles pp on pp.id=rx.patient_id
 where rx.id=p_rx and rx.status='ACTIVE' and pp.user_id=auth.uid();
 if not found then raise exception 'Active own prescription required';end if;
 if nullif(trim(patient.city),'') is null or nullif(trim(patient.state),'') is null then raise exception 'Record patient city and state before finding local pharmacies';end if;
 -- An approved dispensing facility in the patient's exact city/state is required.
 -- Like d1_facilities, this does not claim opening hours or medicine availability.
 return query select owner.id,coalesce(nullif(owner.organization_name,''),owner.full_name),
 patient.city||', '||patient.state||' · Confirm opening hours and stock' from provider_profiles owner
 where owner.provider_type='PHARMACY' and owner.verification_status='APPROVED'
 and exists(select 1 from facilities f where f.owner_user_id=owner.user_id and f.facility_type='PHARMACY'
  and f.verification_status='APPROVED' and lower(trim(f.city))=lower(trim(patient.city)) and lower(trim(f.state))=lower(trim(patient.state))
  and (p_search='' or strpos(lower(f.name),lower(p_search))>0 or strpos(lower(owner.full_name),lower(p_search))>0 or strpos(lower(coalesce(owner.organization_name,'')),lower(p_search))>0))
 order by lower(coalesce(nullif(owner.organization_name,''),owner.full_name)),owner.id limit 10 offset p_offset;
end $$;

-- Enforce worker eligibility again at assignment, including direct RPC calls.
create or replace function c1_assign_followup(p_gap uuid,p_worker uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare g care_gaps; e encounters; task uuid; begin
 select * into g from care_gaps where id=p_gap for update;
 select * into e from encounters where id=g.source_id and g.source_table='encounters' and patient_id=g.patient_id;
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') or g.gap_type<>'FOLLOW_UP_PENDING' or g.status<>'OPEN' then raise exception 'Follow-up not authorized';end if;
 if not d2_worker_in_context(g.id,p_worker) then raise exception 'Worker requires active delegation or encounter facility membership';end if;
 if exists(select 1 from follow_up_tasks where care_gap_id=g.id) then raise exception 'Task already assigned';end if;
 insert into follow_up_tasks(care_gap_id,patient_id,doctor_provider_id,worker_provider_id) values(g.id,g.patient_id,my_provider_id(),p_worker) returning id into task;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(g.patient_id,'FOLLOW_UP_ASSIGNED','follow_up_tasks',task,auth.uid());return task;
end $$;

create or replace function c1_patient_directory(p_search text default '',p_offset integer default 0)
returns table(id uuid,full_name text,patient_code text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  clean_term text := lower(regexp_replace(trim(coalesce(p_search,'')),'\s+',' ','g'));
begin
  if not is_approved_provider('DOCTOR') or p_offset<0 or p_offset>10000 or length(coalesce(p_search,''))>100 then
    raise exception 'Not authorized or invalid search';
  end if;

  return query
  select p.id, p.full_name, p.patient_code
  from patient_profiles p
  where (
    exists(select 1 from appointments a where a.patient_id=p.id and a.doctor_provider_id=my_provider_id() and a.status not in ('CANCELLED','REJECTED'))
    or exists(select 1 from encounters e where e.patient_id=p.id and e.doctor_provider_id=my_provider_id())
    or exists(select 1 from care_referrals r where r.patient_id=p.id and (r.destination_doctor_id=my_provider_id() or r.source_doctor_id=my_provider_id()))
    or exists(select 1 from appointments a join provider_practices pr on pr.id=a.practice_id
              join facilities f on f.id=pr.facility_id and f.verification_status='APPROVED'
              join facility_memberships m on m.facility_id=f.id and m.user_id=auth.uid() and m.active
              where a.patient_id=p.id)
    or exists(select 1 from patient_consents c where c.patient_id=p.id and c.requester_provider_id=my_provider_id() and c.status='GRANTED' and c.expires_at>now())
    or exists(select 1 from care_gaps g join encounters e on g.source_table='encounters' and e.id=g.source_id and e.patient_id=g.patient_id
              where e.doctor_provider_id=my_provider_id() and g.patient_id=p.id and g.status='OPEN')
  )
  and (
    clean_term=''
    or position(clean_term in lower(regexp_replace(trim(coalesce(p.full_name,'')),'\s+',' ','g')))>0
    or lower(p.patient_code)=clean_term
    or position(clean_term in lower(p.patient_code))>0
    or (p.phone is not null and (p.phone=clean_term or position(clean_term in p.phone)>0))
  )
  order by p.full_name, p.id
  limit 20 offset p_offset;

  if clean_term <> '' and not found and p_offset = 0 then
    if exists (
      select 1 from patient_profiles p
      where position(clean_term in lower(regexp_replace(trim(coalesce(p.full_name,'')),'\s+',' ','g')))>0
         or lower(p.patient_code)=clean_term
         or position(clean_term in lower(p.patient_code))>0
         or (p.phone is not null and (p.phone=clean_term or position(clean_term in p.phone)>0))
    ) then
      raise exception 'PATIENT_ACCESS_REQUIRED: Patient exists in registry, but an active appointment, referral, clinical encounter, or patient consent is required to access their records.';
    end if;
  end if;
end $$;

create or replace function w1_patient_directory(p_search text default '',p_offset integer default 0)
returns table(patient_id uuid,patient_name text,patient_code text)
language plpgsql stable security definer set search_path=public, pg_temp as $$
declare
 term text:=lower(regexp_replace(trim(coalesce(p_search,'')),'\s+',' ','g'));
 v_match_id uuid;
begin
 if not is_approved_provider('WORKER') or p_search is null or length(p_search)>100 or p_offset is null or p_offset not between 0 and 10000 then
   raise exception 'Assigned worker directory required';
 end if;
 if length(term)>=3 then
  select p.id into v_match_id from patient_profiles p
  where position(term in lower(regexp_replace(trim(p.full_name),'\s+',' ','g')))>0 or lower(p.patient_code)=term or position(term in lower(p.patient_code))>0
  limit 1;
  if v_match_id is not null and not exists (
    select 1 from follow_up_tasks t where t.patient_id=v_match_id and t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED'
    union
    select 1 from worker_delegations d where d.patient_id=v_match_id and d.worker_provider_id=my_provider_id() and d.status='GRANTED' and d.valid_until>now()
    union
    select 1 from follow_up_tasks t join worker_task_areas ta on ta.task_id=t.id
              join worker_area_assignments aa on aa.area_id=ta.area_id
              where t.patient_id=v_match_id and aa.worker_provider_id=my_provider_id() and aa.active
    union
    select 1 from appointments a join provider_practices pr on pr.id=a.practice_id
              join facilities f on f.id=pr.facility_id and f.verification_status='APPROVED'
              join facility_memberships m on m.facility_id=f.id and m.user_id=auth.uid() and m.active
              where a.patient_id=v_match_id and a.status not in ('CANCELLED','REJECTED')
  ) then
    raise exception 'PATIENT_DELEGATION_REQUIRED';
  end if;
 end if;
 return query select p.id,p.full_name,p.patient_code from patient_profiles p
 where (
   exists(select 1 from follow_up_tasks t where t.patient_id=p.id and t.worker_provider_id=my_provider_id() and t.status<>'COMPLETED')
   or exists(select 1 from worker_delegations d where d.patient_id=p.id and d.worker_provider_id=my_provider_id() and d.status='GRANTED' and d.valid_until>now())
   or exists(select 1 from follow_up_tasks t join worker_task_areas ta on ta.task_id=t.id
             join worker_area_assignments aa on aa.area_id=ta.area_id
             where t.patient_id=p.id and aa.worker_provider_id=my_provider_id() and aa.active)
   or exists(select 1 from appointments a join provider_practices pr on pr.id=a.practice_id
             join facilities f on f.id=pr.facility_id and f.verification_status='APPROVED'
             join facility_memberships m on m.facility_id=f.id and m.user_id=auth.uid() and m.active
             where a.patient_id=p.id and a.status not in ('CANCELLED','REJECTED'))
 )
 and (term='' or position(term in lower(regexp_replace(trim(p.full_name),'\s+',' ','g')))>0 or lower(p.patient_code)=term or position(term in lower(p.patient_code))>0)
 order by p.id limit 30 offset p_offset;
end $$;

revoke all on function d2_gap_workers(uuid,text,integer),d2_rx_pharmacies(uuid,text,integer),c1_patient_directory(text,integer),w1_patient_directory(text,integer) from public,anon,authenticated;
grant execute on function d2_gap_workers(uuid,text,integer),d2_rx_pharmacies(uuid,text,integer),c1_patient_directory(text,integer),w1_patient_directory(text,integer) to authenticated;
commit;
