-- 027: preserved originals, expiring extraction authorization and versioned human review.
begin;
create table document_extraction_jobs(id uuid primary key default gen_random_uuid(),record_id uuid not null references health_records(id),patient_id uuid not null references patient_profiles(id),requested_by uuid not null references auth.users(id),request_key uuid not null unique,state text not null default 'CONFIGURATION_REQUIRED' check(state in ('CONFIGURATION_REQUIRED','PROCESSING','DRAFT_READY','FAILED','CANCELLED')),authorization_until timestamptz not null,provider text,model_version text,created_at timestamptz not null default now(),completed_at timestamptz);
create table document_extraction_drafts(id uuid primary key default gen_random_uuid(),job_id uuid not null unique references document_extraction_jobs(id),document_type text not null,raw_text text not null,extracted_fields jsonb not null,provider_event_key text not null unique,created_at timestamptz not null default now());
create table document_extraction_reviews(id uuid primary key default gen_random_uuid(),draft_id uuid not null references document_extraction_drafts(id),version integer not null,normalized_fields jsonb not null,review_note text not null,reviewed_by uuid not null references provider_profiles(id),request_key uuid not null unique,review_state text not null default 'HUMAN_REVIEWED_TRANSCRIPTION',source_authenticity text not null default 'UNKNOWN',created_at timestamptz not null default now(),unique(draft_id,version));
create index q1_patient_jobs on document_extraction_jobs(patient_id,created_at desc,id);
do $$declare t text;begin foreach t in array array['document_extraction_jobs','document_extraction_drafts','document_extraction_reviews'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function q1_request(p_record uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare h health_records;j document_extraction_jobs;rid uuid;
begin
 select * into h from health_records where id=p_record for share;
 if not found or not exists(select 1 from patient_profiles where id=h.patient_id and user_id=auth.uid()) or p_request is null then raise exception 'Patient document authorization required';end if;
 if not exists(select 1 from storage.objects where bucket_id='health-records' and name=h.storage_path) then raise exception 'Original private document object required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,27));select * into j from document_extraction_jobs where request_key=p_request;
 if found then if j.record_id<>h.id or j.requested_by<>auth.uid() then raise exception 'Extraction request conflict';end if;return j.id;end if;
 insert into document_extraction_jobs(record_id,patient_id,requested_by,request_key,authorization_until) values(h.id,h.patient_id,auth.uid(),p_request,now()+interval '1 hour') returning id into rid;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(h.patient_id,auth.uid(),'DOCUMENT_EXTRACTION_AUTHORIZED','DOCUMENT_EXTRACTION',array['DOCUMENTS']);return rid;
end $$;
create function q1_cancel(p_job uuid) returns void language plpgsql security definer set search_path=public as $$
declare j document_extraction_jobs;
begin
 select * into j from document_extraction_jobs where id=p_job for update;
 if not found or not exists(select 1 from patient_profiles where id=j.patient_id and user_id=auth.uid()) then raise exception 'Patient document authorization required';end if;
 if j.state='CANCELLED' then return;end if;
 update document_extraction_jobs set state='CANCELLED',authorization_until=now() where id=j.id;
 insert into consent_audit(patient_id,actor_user_id,action,purpose,categories) values(j.patient_id,auth.uid(),'DOCUMENT_EXTRACTION_REVOKED','DOCUMENT_EXTRACTION',array['DOCUMENTS']);
end $$;
create function q1_claim(p_job uuid,p_provider text,p_model text) returns jsonb language plpgsql security definer set search_path=public as $$
declare j document_extraction_jobs;h health_records;
begin
 select * into j from document_extraction_jobs where id=p_job for update;
 if not found or j.state<>'CONFIGURATION_REQUIRED' or j.authorization_until<=now() or p_provider is null or length(trim(p_provider)) not between 1 and 100 or p_model is null or length(trim(p_model)) not between 1 and 200 then raise exception 'Unclaimed authorized job and actual configured provider required';end if;
 select * into h from health_records where id=j.record_id;
 update document_extraction_jobs set state='PROCESSING',provider=trim(p_provider),model_version=trim(p_model) where id=j.id;
 return jsonb_build_object('job_id',j.id,'record_id',h.id,'bucket','health-records','storage_path',h.storage_path,'mime_type',h.mime_type,'authorization_until',j.authorization_until,'source_verification',h.verification_status);
end $$;
create function q1_extracted(p_job uuid,p_type text,p_raw text,p_fields jsonb,p_event text) returns uuid language plpgsql security definer set search_path=public as $$
declare j document_extraction_jobs;d document_extraction_drafts;field record;rid uuid;
begin
 select * into j from document_extraction_jobs where id=p_job for update;
 if not found or j.state not in ('PROCESSING','DRAFT_READY') or j.authorization_until<=now() then raise exception 'Extraction authorization expired or revoked';end if;
 if p_type is null or p_type not in ('PRESCRIPTION','LAB_REPORT','IMAGING_REPORT','DISCHARGE_SUMMARY','CONSULTATION_NOTE','INSURANCE','GENERIC_MEDICAL_RECORD') or p_raw is null or octet_length(p_raw) not between 1 and 1000000 or p_fields is null or jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>200000 or p_event is null or length(p_event) not between 3 and 500 then raise exception 'Valid extraction draft required';end if;
 for field in select * from jsonb_each(p_fields) loop
  if jsonb_typeof(field.value)<>'object' or not field.value ? 'value' or not field.value ? 'source_quote' or (field.value->>'confidence') is null or not ((field.value->>'confidence')::numeric between 0 and 1) then raise exception 'Each field needs value, confidence and original source quote';end if;
  if nullif(field.value->>'source_quote','') is null or position(field.value->>'source_quote' in p_raw)=0 then raise exception 'Extraction quote not grounded in OCR text';end if;
 end loop;
 select * into d from document_extraction_drafts where job_id=j.id or provider_event_key=p_event;
 if found then if d.job_id<>j.id or d.document_type<>p_type or d.raw_text<>p_raw or d.extracted_fields<>p_fields then raise exception 'Extraction event conflict';end if;return d.id;end if;
 insert into document_extraction_drafts(job_id,document_type,raw_text,extracted_fields,provider_event_key) values(j.id,p_type,p_raw,p_fields,p_event) returning id into rid;
 update document_extraction_jobs set state='DRAFT_READY',completed_at=now() where id=j.id;return rid;
end $$;
create function q1_review(p_draft uuid,p_fields jsonb,p_note text,p_patient_confirmed boolean,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d document_extraction_drafts;j document_extraction_jobs;h health_records;r document_extraction_reviews;rid uuid;v integer;
begin
 select * into d from document_extraction_drafts where id=p_draft for update;select * into j from document_extraction_jobs where id=d.job_id;select * into h from health_records where id=j.record_id;
 if h.id is null or not is_approved_provider('DOCTOR') or not a1_has_consent(h.patient_id,'DOCUMENTS','TREATMENT',coalesce(h.record_date::timestamptz,h.created_at)) then raise exception 'Document review requires connected clinician and scoped treatment consent';end if;
 perform 1 from patient_consents where patient_id=h.patient_id and requester_provider_id=my_provider_id() and purpose='TREATMENT' and status='GRANTED' for share;
 if p_patient_confirmed is distinct from true or p_request is null or p_fields is null or jsonb_typeof(p_fields)<>'object' or octet_length(p_fields::text)>200000 or p_note is null or length(trim(p_note)) not between 10 and 4000 then raise exception 'Explicit patient match, corrected fields and human review note required';end if;
 if exists(select 1 from jsonb_object_keys(p_fields)k where k not in ('document_date','problems','medications','allergies','vitals','diagnostics','summary')) then raise exception 'Unsupported normalized document field';end if;
 select * into r from document_extraction_reviews where request_key=p_request;
 if found then if r.draft_id<>d.id or r.normalized_fields<>p_fields or r.review_note<>trim(p_note) or r.reviewed_by<>my_provider_id() then raise exception 'Review request conflict';end if;return r.id;end if;
 select coalesce(max(version),0)+1 into v from document_extraction_reviews where draft_id=d.id;
 insert into document_extraction_reviews(draft_id,version,normalized_fields,review_note,reviewed_by,request_key) values(d.id,v,p_fields,trim(p_note),my_provider_id(),p_request) returning id into rid;
 insert into clinical_source_versions(patient_id,source_kind,source_id,revision,category,source_provider_id,occurred_at,verification_state,original,capture_kind,recorded_by)
 values(h.patient_id,'document_extraction_reviews',rid,1,'DOCUMENTS',my_provider_id(),coalesce(h.record_date::timestamptz,h.created_at),'HUMAN_REVIEWED_TRANSCRIPTION',jsonb_build_object('record_id',h.id,'draft_id',d.id,'review_id',rid,'review_version',v,'fields',p_fields,'source_authenticity','UNKNOWN'),'INSERT',auth.uid());
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(h.patient_id,'DOCUMENT_EXTRACTION_REVIEWED','document_extraction_reviews',rid,auth.uid());return rid;
end $$;
create function q1_read(p_job uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare j document_extraction_jobs;h health_records;
begin
 select * into j from document_extraction_jobs where id=p_job;select * into h from health_records where id=j.record_id;
 if h.id is null or not a1_has_consent(h.patient_id,'DOCUMENTS','TREATMENT',coalesce(h.record_date::timestamptz,h.created_at)) then raise exception 'Document extraction read not authorized';end if;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(h.patient_id,auth.uid(),'DOCUMENT_EXTRACTION_READ','TREATMENT');
 return jsonb_build_object('job',to_jsonb(j)-'request_key','draft',(select to_jsonb(d) from document_extraction_drafts d where job_id=j.id),'reviews',coalesce((select jsonb_agg(to_jsonb(x)-'request_key') from (select r.* from document_extraction_reviews r join document_extraction_drafts d on d.id=r.draft_id where d.job_id=j.id order by r.version desc limit 30)x),'[]'),'notice','OCR/extraction is a draft. Human review verifies transcription; original source authenticity remains separate. No prescription or treatment is created automatically.');
end $$;
revoke all on function q1_request(uuid,uuid),q1_cancel(uuid),q1_claim(uuid,text,text),q1_extracted(uuid,text,text,jsonb,text),q1_review(uuid,jsonb,text,boolean,uuid),q1_read(uuid) from public,anon,authenticated;
grant execute on function q1_request(uuid,uuid),q1_cancel(uuid),q1_review(uuid,jsonb,text,boolean,uuid),q1_read(uuid) to authenticated;
grant execute on function q1_claim(uuid,text,text),q1_extracted(uuid,text,text,jsonb,text) to service_role;
commit;
