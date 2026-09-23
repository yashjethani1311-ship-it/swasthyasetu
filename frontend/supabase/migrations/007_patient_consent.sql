-- 007: scoped patient consent and audited longitudinal access. No clinical data deleted.
begin;
create table public.patient_consents (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references patient_profiles(id),
 requester_provider_id uuid not null references provider_profiles(id), requester_role text not null check(requester_role='DOCTOR'),
 purpose text not null check(purpose in ('TREATMENT','AI_ASSISTANCE')), reason text not null check(length(trim(reason)) between 3 and 1000),
 categories text[] not null check(cardinality(categories)>0 and categories <@ array['ENCOUNTERS','PRESCRIPTIONS','DIAGNOSTICS','DOCUMENTS','TIMELINE','FOLLOW_UPS']::text[]),
 records_from timestamptz, records_until timestamptz, valid_from timestamptz not null, expires_at timestamptz not null,
 status text not null default 'REQUESTED' check(status in ('REQUESTED','GRANTED','DENIED','REVOKED')),
 requested_at timestamptz not null default now(), decided_at timestamptz, revoked_at timestamptz,
 check(expires_at>valid_from), check(records_until is null or records_from is null or records_until>=records_from)
);
create index a1_consent_lookup on patient_consents(patient_id,requester_provider_id,purpose,status,expires_at);
create table public.consent_audit (
 id uuid primary key default gen_random_uuid(), consent_id uuid references patient_consents(id),patient_id uuid not null references patient_profiles(id),
 actor_user_id uuid not null references profiles(id), action text not null, purpose text, categories text[], created_at timestamptz not null default now()
);
create index a1_consent_audit_patient on consent_audit(patient_id,created_at desc);
alter table patient_consents enable row level security;
alter table consent_audit enable row level security;
revoke all on patient_consents,consent_audit from public,anon,authenticated;
grant select on patient_consents,consent_audit to authenticated;
create policy a1_consent_read on patient_consents for select to authenticated using(patient_id in(select id from patient_profiles where user_id=auth.uid()) or requester_provider_id=my_provider_id());
create policy a1_audit_read on consent_audit for select to authenticated using(patient_id in(select id from patient_profiles where user_id=auth.uid()) or actor_user_id=auth.uid());
create function a1_request_consent(p_patient uuid,p_purpose text,p_categories text[],p_reason text,p_valid_from timestamptz,p_expires timestamptz,p_records_from timestamptz default null,p_records_until timestamptz default null) returns uuid language plpgsql security definer set search_path=public as $$
declare c uuid; begin
 if not is_approved_provider('DOCTOR') or not p0_connected_patient(p_patient) then raise exception 'A connected approved doctor is required'; end if;
 if p_expires<=now() or p_expires>now()+interval '365 days' then raise exception 'Consent must expire within one year'; end if;
 insert into patient_consents(patient_id,requester_provider_id,requester_role,purpose,categories,reason,valid_from,expires_at,records_from,records_until) values(p_patient,my_provider_id(),'DOCTOR',p_purpose,p_categories,trim(p_reason),p_valid_from,p_expires,p_records_from,p_records_until) returning id into c;
 insert into consent_audit(consent_id,patient_id,actor_user_id,action,purpose,categories) values(c,p_patient,auth.uid(),'REQUESTED',p_purpose,p_categories);
 return c;
end $$;
create function a1_decide_consent(p_consent uuid,p_decision text) returns void language plpgsql security definer set search_path=public as $$
declare c patient_consents; begin
 select * into c from patient_consents where id=p_consent for update;
 if not found or not exists(select 1 from patient_profiles where id=c.patient_id and user_id=auth.uid()) then raise exception 'Only the patient may decide this request'; end if;
 if p_decision is null or p_decision not in ('GRANTED','DENIED','REVOKED') then raise exception 'Invalid decision'; end if;
 if c.status=p_decision then return; end if;
 if (p_decision in ('GRANTED','DENIED') and c.status<>'REQUESTED') or (p_decision='REVOKED' and c.status<>'GRANTED') or (p_decision='GRANTED' and c.expires_at<=now()) then raise exception 'Consent transition not allowed'; end if;
 update patient_consents set status=p_decision,decided_at=case when p_decision<>'REVOKED' then now() else decided_at end,revoked_at=case when p_decision='REVOKED' then now() else null end where id=c.id;
 insert into consent_audit(consent_id,patient_id,actor_user_id,action,purpose,categories) values(c.id,c.patient_id,auth.uid(),p_decision,c.purpose,c.categories);
end $$;
create function a1_has_consent(p_patient uuid,p_category text,p_purpose text,p_date timestamptz) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()) or
 (is_approved_provider('DOCTOR') and p0_connected_patient(p_patient) and exists(select 1 from patient_consents c where c.patient_id=p_patient and c.requester_provider_id=my_provider_id() and c.purpose=p_purpose and p_category=any(c.categories) and c.status='GRANTED' and now()>=c.valid_from and now()<c.expires_at and (c.records_from is null or p_date>=c.records_from) and (c.records_until is null or p_date<=c.records_until)))
$$;
-- Keep the prior bounded source query internal. No public bypass endpoint remains.
alter function c1_care_context(uuid,integer) rename to a1_context_source;
revoke all on function a1_context_source(uuid,integer) from public,anon,authenticated;
create function a1_authorized_context(p_patient uuid,p_purpose text,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare payload jsonb; section text; category text; filtered jsonb; owner boolean; begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid history offset'; end if;
 if p_purpose is null or p_purpose not in ('TREATMENT','AI_ASSISTANCE') then raise exception 'Invalid access purpose'; end if;
 select exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()) into owner;
 if not owner then
 if not is_approved_provider('DOCTOR') or not p0_connected_patient(p_patient) then raise exception 'Patient context not authorized'; end if;
 -- Lock active grants during retrieval so a concurrent revoke serializes with the read.
 perform 1 from patient_consents where patient_id=p_patient and requester_provider_id=my_provider_id() and purpose=p_purpose and status='GRANTED' and valid_from<=now() and expires_at>now() for share;
 if not found then raise exception 'Patient consent required or expired'; end if;
 end if;
 payload:=jsonb_build_object('patient_id',p_patient,'allergies','UNKNOWN: allergy history is not documented in this schema','scope','Dated records, 50 per section per page',
 'encounters',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,started_at,completed_at,chief_complaint,symptoms,diagnosis,clinical_notes,follow_up_in_days,status from encounters where patient_id=p_patient and a1_has_consent(p_patient,'ENCOUNTERS',p_purpose,started_at) order by started_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'prescriptions',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.issued_at,p.status,p.clinical_notes,(select jsonb_agg(to_jsonb(i)) from prescription_items i where i.prescription_id=p.id) items,(select to_jsonb(f) from prescription_fulfilments f where f.prescription_id=p.id) fulfilment from prescriptions p where p.patient_id=p_patient and a1_has_consent(p_patient,'PRESCRIPTIONS',p_purpose,p.issued_at) order by issued_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'diagnostics',coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.test_name,o.ordered_at,o.status,o.routing_status,(select to_jsonb(r) from lab_results r where r.lab_order_id=o.id and r.status='COMPLETED' and r.verified_at is not null) result from lab_orders o where o.patient_id=p_patient and a1_has_consent(p_patient,'DIAGNOSTICS',p_purpose,o.ordered_at) order by o.ordered_at desc,o.id limit 50 offset p_offset) x),'[]'::jsonb),
 'health_records',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,record_type,record_date,source_type,original_filename,verification_status,created_at from health_records where patient_id=p_patient and a1_has_consent(p_patient,'DOCUMENTS',p_purpose,coalesce(record_date::timestamptz,created_at)) order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'care_gaps',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care_gaps where patient_id=p_patient and a1_has_consent(p_patient,'TIMELINE',p_purpose,created_at) order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care_events where patient_id=p_patient and a1_has_consent(p_patient,'TIMELINE',p_purpose,created_at) order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'follow_ups',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from follow_up_tasks where patient_id=p_patient and a1_has_consent(p_patient,'FOLLOW_UPS',p_purpose,assigned_at) order by assigned_at desc,id limit 50 offset p_offset) x),'[]'::jsonb));

 if not owner then select coalesce(jsonb_agg(e-'metadata'),'[]'::jsonb) into filtered from jsonb_array_elements(payload->'events') e; payload:=jsonb_set(payload,array['events'],filtered); end if;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(p_patient,auth.uid(),'CONTEXT_READ',p_purpose);
 return payload||jsonb_build_object('actor_role',case when owner then 'PATIENT' else 'DOCTOR' end,'access_purpose',p_purpose,'retrieved_at',now(),'scope','50 source records per section per page, filtered by permitted categories and dates');
end $$;
create function c1_care_context(p_patient uuid,p_offset integer default 0) returns jsonb language sql security definer set search_path=public as $$select a1_authorized_context(p_patient,'TREATMENT',p_offset)$$;
create function a1_ai_context(p_patient uuid) returns jsonb language sql security definer set search_path=public as $$select a1_authorized_context(p_patient,'AI_ASSISTANCE',0)$$;
-- Existing clinical authorship/assigned fulfilment remains operational. Cross-provider history needs consent.
create or replace function c1_reads_prescription(p_rx uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from prescriptions p where p.id=p_rx and ((p.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR')) or exists(select 1 from patient_profiles where id=p.patient_id and user_id=auth.uid()) or exists(select 1 from prescription_fulfilments f where f.prescription_id=p.id and f.pharmacy_provider_id=my_provider_id() and is_approved_provider('PHARMACY'))))
$$;
create policy a1_rx_guard on prescriptions as restrictive for select to authenticated using(c1_reads_prescription(id));
create policy a1_events_guard on care_events as restrictive for select to authenticated using(patient_id in(select id from patient_profiles where user_id=auth.uid()));
create policy a1_gaps_guard on care_gaps as restrictive for select to authenticated using(a1_has_consent(patient_id,'TIMELINE','TREATMENT',created_at));
create function a1_access_history(p_patient uuid,p_offset integer default 0) returns table(id uuid,action text,purpose text,created_at timestamptz,actor_name text) language plpgsql security definer set search_path=public as $$
begin
 if p_offset is null or p_offset<0 or p_offset>10000 or not exists(select 1 from patient_profiles where patient_profiles.id=p_patient and user_id=auth.uid()) then raise exception 'Patient access history not authorized'; end if;
 return query select a.id,a.action,a.purpose,a.created_at,coalesce(p.full_name,'Account') from consent_audit a join profiles p on p.id=a.actor_user_id where a.patient_id=p_patient order by a.created_at desc,a.id limit 30 offset p_offset;
end $$;
-- No public function may call the internal unfiltered query directly.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'a1\_%' escape '\' or p.proname='c1_care_context') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname not in ('a1_context_source','a1_authorized_context') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
commit;
