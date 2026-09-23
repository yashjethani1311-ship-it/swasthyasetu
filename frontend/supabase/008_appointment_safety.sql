-- 008: appointment safety. Provider row serializes bookings; appointment row serializes start/cancel.
begin;
alter table provider_practices add column if not exists timezone text not null default 'Asia/Kolkata';
alter table provider_practices add column if not exists consultation_fee numeric check(consultation_fee>=0 and consultation_fee::text not in ('NaN','Infinity','-Infinity'));
alter table appointments add column if not exists booking_request_key uuid unique;
alter table appointments add column if not exists consultation_fee numeric;
alter table appointments add column if not exists practice_timezone text;
create function a2_valid_timezone(p_zone text) returns boolean language sql stable set search_path=public as $$select exists(select 1 from pg_timezone_names where name=p_zone)$$;
alter table provider_practices add constraint a2_practice_timezone_valid check(a2_valid_timezone(timezone));
create function a2_available_slots(p_practice uuid,p_mode text) returns table(scheduled_at timestamptz,duration_minutes integer,consultation_fee numeric,practice_timezone text) language plpgsql stable security definer set search_path=public as $$
declare p provider_practices; begin
 if auth.uid() is null or p_mode is null or p_mode not in ('PHYSICAL','TELECONSULT') then raise exception 'Authenticated valid slot request required'; end if;
 select * into p from provider_practices where id=p_practice and active;
 if not found or p.consultation_mode not in (p_mode,'BOTH') or not exists(select 1 from provider_profiles where id=p.provider_id and provider_type='DOCTOR' and verification_status='APPROVED') or (p.facility_id is not null and not exists(select 1 from facilities where id=p.facility_id and verification_status='APPROVED')) then raise exception 'Practice is not available for this consultation type'; end if;
 return query with candidates as (
 select distinct ((d::date+s.start_time)+make_interval(mins=>n*s.slot_minutes)) at time zone p.timezone at_time,s.slot_minutes duration
 from generate_series((now() at time zone p.timezone)::date::timestamp,(now() at time zone p.timezone)::date::timestamp+interval '13 days',interval '1 day') d
 join provider_schedules s on s.practice_id=p.id and s.provider_id=p.provider_id and s.active and s.day_of_week=extract(dow from d)::int
 cross join lateral generate_series(0,greatest(0,floor(extract(epoch from(s.end_time-s.start_time))/60/s.slot_minutes)::int-1)) n
 where s.end_time>s.start_time and (n+1)*s.slot_minutes<=extract(epoch from(s.end_time-s.start_time))/60
 ) select c.at_time,c.duration,p.consultation_fee,p.timezone from candidates c where c.at_time>now()
 and not exists(select 1 from appointments a where a.doctor_provider_id=p.provider_id and a.status not in ('CANCELLED','NO_SHOW') and tstzrange(a.scheduled_at,a.scheduled_at+make_interval(mins=>coalesce(a.duration_minutes,30)),'[)') && tstzrange(c.at_time,c.at_time+make_interval(mins=>c.duration),'[)'))
 and not exists(select 1 from provider_availability_overrides o where o.provider_id=p.provider_id and (o.practice_id is null or o.practice_id=p.id) and o.availability_status='UNAVAILABLE' and tstzrange(o.starts_at,o.ends_at,'[)') && tstzrange(c.at_time,c.at_time+make_interval(mins=>c.duration),'[)'))
 order by c.at_time,c.duration limit 300;
end $$;
create function a2_book_appointment(p_practice uuid,p_slot timestamptz,p_mode text,p_reason text,p_note text,p_request uuid,p_expected_fee numeric default null) returns uuid language plpgsql security definer set search_path=public as $$
declare patient uuid; practice provider_practices; prior appointments; slot record; result uuid; begin
 select id into patient from patient_profiles where user_id=auth.uid();
 if patient is null or p_request is null or length(coalesce(p_reason,''))>2000 or length(coalesce(p_note,''))>2000 then raise exception 'Patient and valid booking details required'; end if;
 select * into practice from provider_practices where id=p_practice;
 if not found then raise exception 'Practice not found'; end if;
 perform 1 from provider_profiles where id=practice.provider_id for update;
 select * into prior from appointments where booking_request_key=p_request;
 if found then if prior.patient_id=patient and prior.practice_id=p_practice and prior.scheduled_at=p_slot and prior.mode=p_mode and prior.reason is not distinct from nullif(trim(p_reason),'') and prior.patient_note is not distinct from nullif(trim(p_note),'') then return prior.id; else raise exception 'Booking request key conflict'; end if; end if;
 select * into slot from a2_available_slots(p_practice,p_mode) s where s.scheduled_at=p_slot limit 1;
 if not found then raise exception 'This slot is no longer available'; end if;
 if slot.consultation_fee is distinct from p_expected_fee then raise exception 'Consultation fee changed; select a refreshed slot to confirm'; end if;
 insert into appointments(patient_id,doctor_provider_id,practice_id,scheduled_at,mode,status,reason,patient_note,duration_minutes,booking_request_key,consultation_fee,practice_timezone)
 values(patient,practice.provider_id,p_practice,p_slot,p_mode,'REQUESTED',nullif(trim(p_reason),''),nullif(trim(p_note),''),slot.duration_minutes,p_request,slot.consultation_fee,slot.practice_timezone) returning id into result;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(patient,'APPOINTMENT_REQUESTED','appointments',result,auth.uid());
 return result;
end $$;
create function a2_appointment_transition(p_appointment uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare a appointments; doctor boolean; patient boolean; begin
 select * into a from appointments where id=p_appointment for update;
 if not found then raise exception 'Appointment not authorized'; end if;
 doctor:=a.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR');
 patient:=exists(select 1 from patient_profiles where id=a.patient_id and user_id=auth.uid());
 if not coalesce(doctor,false) and not patient then raise exception 'Appointment not authorized'; end if;
 if p_status is null or p_status not in ('CONFIRMED','CANCELLED','NO_SHOW') then raise exception 'Unsupported appointment transition'; end if;
 if p_status<>'CANCELLED' and not coalesce(doctor,false) then raise exception 'Doctor authorization required'; end if;
 if a.status=p_status then return; end if;
 if exists(select 1 from encounters where appointment_id=a.id) then raise exception 'Consultation has started; appointment cannot be changed'; end if;
 if (p_status='CONFIRMED' and a.status<>'REQUESTED') or (p_status in ('CANCELLED','NO_SHOW') and a.status not in ('REQUESTED','CONFIRMED')) or (p_status='NO_SHOW' and a.scheduled_at>now()) then raise exception 'Appointment transition not allowed'; end if;
 update appointments set status=p_status,updated_at=now() where id=a.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(a.patient_id,'APPOINTMENT_'||p_status,'appointments',a.id,auth.uid());
end $$;
create function a2_start_encounter(p_appointment uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; e encounters; begin
 select * into a from appointments where id=p_appointment for update;
 if not found or a.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Doctor not authorized'; end if;
 select * into e from encounters where appointment_id=a.id;
 if found then return to_jsonb(e); end if;
 if a.status<>'CONFIRMED' then raise exception 'Confirmed appointment required'; end if;
 insert into encounters(appointment_id,patient_id,doctor_provider_id,chief_complaint,status) values(a.id,a.patient_id,a.doctor_provider_id,a.reason,'IN_PROGRESS') returning * into e;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(a.patient_id,'CONSULTATION_STARTED','encounters',e.id,auth.uid());
 return to_jsonb(e);
end $$;
do $$ declare c record; f record; begin
 for c in select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('appointments','encounters') loop
 execute format('revoke insert(%I) on %I from public,anon,authenticated',c.column_name,c.table_name);
 if c.table_name='appointments' then execute format('revoke update(%I) on appointments from public,anon,authenticated',c.column_name); end if;
 end loop;
 revoke insert,update,delete on appointments from public,anon,authenticated;
 revoke insert,delete on encounters from public,anon,authenticated;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'a2\_%' escape '\' loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end $$;
commit;
