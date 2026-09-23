-- 025: consent-scoped payer cases; only trusted adapter callbacks record external decisions.
begin;
create table payer_cases(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),patient_id uuid not null references patient_profiles(id),policy_id uuid not null references insurance_policies(id),invoice_id uuid not null references facility_invoices(id),kind text not null check(kind in ('PREAUTH','CLAIM')),requested_amount numeric(14,2) not null check(requested_amount>0),state text not null default 'DRAFT' check(state in ('DRAFT','READY_FOR_EXTERNAL_SUBMISSION','SUBMITTED','MORE_INFORMATION','APPROVED','DENIED','SETTLED')),consent_status text not null default 'REQUESTED' check(consent_status in ('REQUESTED','GRANTED','REVOKED')),consent_until timestamptz,submission_version integer not null default 0,approved_amount numeric(14,2),settled_amount numeric(14,2),decision_reason text,request_key uuid not null unique,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table payer_case_documents(id uuid primary key default gen_random_uuid(),case_id uuid not null references payer_cases(id),health_record_id uuid not null references health_records(id),added_by uuid not null references auth.users(id),added_at timestamptz not null default now(),unique(case_id,health_record_id));
create table payer_case_events(id uuid primary key default gen_random_uuid(),case_id uuid not null references payer_cases(id),submission_version integer not null,external_event_key text unique,event_type text not null,external_reference text,original_payload jsonb not null,actor_user_id uuid references auth.users(id),created_at timestamptz not null default now());
create index i1_case_facility on payer_cases(facility_id,created_at desc,id);
do $$declare t text;begin foreach t in array array['payer_cases','payer_case_documents','payer_case_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function i1_case(p_invoice uuid,p_policy uuid,p_kind text,p_amount numeric,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare invoice facility_invoices;r payer_cases;rid uuid;
begin
 select * into invoice from facility_invoices where id=p_invoice for share;
 if not found or not h1_staff(invoice.facility_id,array['MANAGER','RECEPTION']) then raise exception 'Facility billing authority required';end if;
 if not exists(select 1 from insurance_policies where id=p_policy and patient_id=invoice.patient_id) or p_request is null or p_amount is null or p_amount<=0 or p_amount>invoice.total or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Matching patient coverage and actual requested amount required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,25));select * into r from payer_cases where request_key=p_request;
 if found then if r.invoice_id<>p_invoice or r.policy_id<>p_policy or r.kind is distinct from p_kind or r.requested_amount<>p_amount then raise exception 'Payer case request conflict';end if;return r.id;end if;
 insert into payer_cases(facility_id,patient_id,policy_id,invoice_id,kind,requested_amount,request_key,created_by) values(invoice.facility_id,invoice.patient_id,p_policy,p_invoice,p_kind,p_amount,p_request,auth.uid()) returning id into rid;return rid;
end $$;
create function i1_consent(p_case uuid,p_decision text,p_until timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
declare c payer_cases;
begin
 select * into c from payer_cases where id=p_case for update;
 if not found or not exists(select 1 from patient_profiles where id=c.patient_id and user_id=auth.uid()) then raise exception 'Patient authorization required';end if;
 if not ((p_decision='GRANTED' and c.consent_status='REQUESTED' and p_until>now() and p_until<=now()+interval '90 days') or (p_decision='REVOKED' and c.consent_status='GRANTED')) or p_decision is null then raise exception 'Invalid payer consent decision';end if;
 if p_decision='GRANTED' and p_until is null then raise exception 'Consent expiry required';end if;
 update payer_cases set consent_status=p_decision,consent_until=case when p_decision='GRANTED' then p_until else consent_until end,updated_at=now() where id=c.id;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(c.patient_id,auth.uid(),'PAYER_'||p_decision,'PAYER_SUBMISSION',array['POLICY','INVOICE','EXPLICIT_DOCUMENTS']);
end $$;
create function i1_add_document(p_case uuid,p_record uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare c payer_cases;rid uuid;
begin
 select * into c from payer_cases where id=p_case for update;
 if not found or not exists(select 1 from patient_profiles where id=c.patient_id and user_id=auth.uid()) or not exists(select 1 from health_records where id=p_record and patient_id=c.patient_id) then raise exception 'Patient must authorize own supporting document';end if;
 if c.state not in ('DRAFT','MORE_INFORMATION','DENIED') then raise exception 'Supporting documents cannot change after submission preparation';end if;
 insert into payer_case_documents(case_id,health_record_id,added_by) values(c.id,p_record,auth.uid()) on conflict(case_id,health_record_id) do nothing returning id into rid;if rid is null then select id into rid from payer_case_documents where case_id=c.id and health_record_id=p_record;end if;return rid;
end $$;
create function i1_prepare(p_case uuid) returns integer language plpgsql security definer set search_path=public as $$
declare c payer_cases;
begin
 select * into c from payer_cases where id=p_case for update;
 if not found or not h1_staff(c.facility_id,array['MANAGER','RECEPTION']) then raise exception 'Payer submission not authorized';end if;
 if c.consent_status<>'GRANTED' or c.consent_until<=now() then raise exception 'Active patient authorization required';end if;
 if c.state='READY_FOR_EXTERNAL_SUBMISSION' then return c.submission_version;end if;
 if c.state not in ('DRAFT','MORE_INFORMATION','DENIED') then raise exception 'Case cannot be submitted from current state';end if;
 update payer_cases set state='READY_FOR_EXTERNAL_SUBMISSION',submission_version=submission_version+1,updated_at=now() where id=c.id returning submission_version into c.submission_version;
 insert into payer_case_events(case_id,submission_version,event_type,original_payload,actor_user_id) values(c.id,c.submission_version,'PREPARED','{}',auth.uid());return c.submission_version;
end $$;
-- This is an integration boundary, not a simulated insurer. Authenticated users have no execute privilege.
create function i1_external_event(p_case uuid,p_version integer,p_event text,p_reference text,p_payload jsonb,p_event_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare c payer_cases;r payer_case_events;rid uuid;amount numeric;
begin
 select * into c from payer_cases where id=p_case for update;
 if not found or c.consent_status<>'GRANTED' or c.consent_until<=now() then raise exception 'Payer event case authorization expired';end if;
 if p_version is distinct from c.submission_version or p_reference is null or length(trim(p_reference)) not between 3 and 500 or p_event_key is null or length(p_event_key) not between 3 and 500 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then raise exception 'Verified adapter source event required';end if;
 select * into r from payer_case_events where external_event_key=p_event_key;
 if found then if r.case_id<>c.id or r.submission_version<>p_version or r.event_type is distinct from p_event or r.external_reference<>p_reference or r.original_payload<>p_payload then raise exception 'Payer source event conflict';end if;return r.id;end if;
 if p_event is null or not ((c.state='READY_FOR_EXTERNAL_SUBMISSION' and p_event='SUBMITTED') or (c.state='SUBMITTED' and p_event in ('APPROVED','DENIED','MORE_INFORMATION')) or (c.state='APPROVED' and c.kind='CLAIM' and p_event='SETTLED')) then raise exception 'Invalid external payer transition';end if;
 if p_event in ('DENIED','MORE_INFORMATION') and length(trim(coalesce(p_payload->>'reason','')))<3 then raise exception 'Payer decision reason required';end if;
 if p_event in ('APPROVED','SETTLED') then amount:=(p_payload->>'amount')::numeric;if amount is null or amount<0 or amount>c.requested_amount or amount<>round(amount,2) or amount::text in ('NaN','Infinity','-Infinity') or (p_event='SETTLED' and amount>c.approved_amount) then raise exception 'Payer amount inconsistent with request/approval';end if;end if;
 update payer_cases set state=p_event,approved_amount=case when p_event='APPROVED' then amount else approved_amount end,settled_amount=case when p_event='SETTLED' then amount else settled_amount end,decision_reason=p_payload->>'reason',updated_at=now() where id=c.id;
 insert into payer_case_events(case_id,submission_version,external_event_key,event_type,external_reference,original_payload) values(c.id,p_version,p_event_key,p_event,p_reference,p_payload) returning id into rid;return rid;
end $$;
create function i1_read(p_case uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c payer_cases;patient boolean;
begin
 select * into c from payer_cases where id=p_case;
 patient:=exists(select 1 from patient_profiles where id=c.patient_id and user_id=auth.uid());
 if not found or not(patient or (h1_staff(c.facility_id,array['MANAGER','RECEPTION']) and c.consent_status='GRANTED' and c.consent_until>now())) then raise exception 'Payer case read not authorized';end if;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(c.patient_id,auth.uid(),'PAYER_CASE_READ','PAYER_SUBMISSION');
 return jsonb_build_object('case',to_jsonb(c)-'request_key','eligibility_state','UNKNOWN_EXTERNAL_CHECK_REQUIRED','submission_boundary','External adapter required; PREPARED is not SUBMITTED','documents',coalesce((select jsonb_agg(jsonb_build_object('record_id',health_record_id)) from payer_case_documents where case_id=c.id),'[]'),'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select event_type,submission_version,external_reference,created_at from payer_case_events where case_id=c.id order by created_at desc,id limit 100)x),'[]'));
end $$;
revoke all on function i1_case(uuid,uuid,text,numeric,uuid),i1_consent(uuid,text,timestamptz),i1_add_document(uuid,uuid),i1_prepare(uuid),i1_external_event(uuid,integer,text,text,jsonb,text),i1_read(uuid) from public,anon,authenticated;
grant execute on function i1_case(uuid,uuid,text,numeric,uuid),i1_consent(uuid,text,timestamptz),i1_add_document(uuid,uuid),i1_prepare(uuid),i1_read(uuid) to authenticated;
grant execute on function i1_external_event(uuid,integer,text,text,jsonb,text) to service_role;
commit;
