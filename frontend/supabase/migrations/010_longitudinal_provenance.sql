-- 010: immutable source revisions and consent-filtered longitudinal retrieval.
begin;
create table public.clinical_source_versions(
 id bigint generated always as identity primary key,
 patient_id uuid not null references patient_profiles(id),
 source_kind text not null, source_id uuid not null, revision integer not null check(revision>0),
 category text not null, source_system text not null default 'SWASTHYASETU',
 source_provider_id uuid references provider_profiles(id), source_facility_id uuid references facilities(id),
 occurred_at timestamptz, recorded_at timestamptz not null default now(),
 verification_state text not null, original jsonb not null,
 capture_kind text not null check(capture_kind in ('BASELINE','INSERT','UPDATE','DELETE')),
 recorded_by uuid references auth.users(id), supersedes_id bigint references clinical_source_versions(id),
 unique(source_kind,source_id,revision)
);
create index l1_patient_history on clinical_source_versions(patient_id,id desc);
create index l1_source_latest on clinical_source_versions(source_kind,source_id,revision desc);
alter table clinical_source_versions enable row level security;
revoke all on clinical_source_versions from public,anon,authenticated;
revoke all on sequence clinical_source_versions_id_seq from public,anon,authenticated;
-- No direct SELECT: all disclosed history is audited by the RPC below.
create function l1_capture(p_kind text,p_row jsonb,p_capture text) returns void language plpgsql security definer set search_path=public as $$
declare pid uuid; actor uuid; place uuid; category text; occurred timestamptz; state text:='RECORDED'; prior clinical_source_versions; sid uuid:=(p_row->>'id')::uuid;
begin
 case p_kind
 when 'encounters' then pid:=(p_row->>'patient_id')::uuid;actor:=(p_row->>'doctor_provider_id')::uuid;category:='ENCOUNTERS';occurred:=(p_row->>'started_at')::timestamptz;state:=case when p_row->>'status'='COMPLETED' then 'SIGNED' else 'DRAFT' end;
 when 'prescriptions' then pid:=(p_row->>'patient_id')::uuid;actor:=(p_row->>'doctor_provider_id')::uuid;category:='PRESCRIPTIONS';occurred:=(p_row->>'issued_at')::timestamptz;
 when 'prescription_items' then select patient_id,doctor_provider_id,issued_at into pid,actor,occurred from prescriptions where id=(p_row->>'prescription_id')::uuid;category:='PRESCRIPTIONS';
 when 'lab_orders' then pid:=(p_row->>'patient_id')::uuid;actor:=(p_row->>'doctor_provider_id')::uuid;place:=(p_row->>'destination_facility_id')::uuid;category:='DIAGNOSTICS';occurred:=(p_row->>'ordered_at')::timestamptz;
 when 'lab_results' then select patient_id,destination_facility_id into pid,place from lab_orders where id=(p_row->>'lab_order_id')::uuid;actor:=(p_row->>'entered_by_lab_provider_id')::uuid;category:='DIAGNOSTICS';occurred:=(p_row->>'created_at')::timestamptz;state:=case when p_row->>'verified_at' is not null then 'VERIFIED' else 'UNVERIFIED' end;
 when 'health_records' then pid:=(p_row->>'patient_id')::uuid;actor:=(p_row->>'verified_by')::uuid;category:='DOCUMENTS';occurred:=coalesce((p_row->>'record_date')::timestamptz,(p_row->>'created_at')::timestamptz);state:=p_row->>'verification_status';
 when 'dispense_events' then select p.patient_id,d.pharmacy_provider_id,p.issued_at into pid,actor,occurred from prescription_items i join prescriptions p on p.id=i.prescription_id cross join lateral (select (p_row->>'pharmacy_provider_id')::uuid pharmacy_provider_id) d where i.id=(p_row->>'prescription_item_id')::uuid;category:='PRESCRIPTIONS';occurred:=(p_row->>'dispensed_at')::timestamptz;
 when 'follow_up_tasks' then pid:=(p_row->>'patient_id')::uuid;actor:=(p_row->>'worker_provider_id')::uuid;category:='FOLLOW_UPS';occurred:=(p_row->>'assigned_at')::timestamptz;state:=case when p_row->>'verified_at' is not null then 'VERIFIED' else 'UNVERIFIED' end;
 else raise exception 'Unsupported provenance source'; end case;
 if pid is null then raise exception 'Unresolved source patient'; end if;
 -- Parent/source writes already hold row locks; advisory lock also serializes baseline capture.
 perform pg_advisory_xact_lock(hashtextextended(p_kind||sid::text,10));
 select * into prior from clinical_source_versions where source_kind=p_kind and source_id=sid order by revision desc limit 1;
 if found and prior.original=p_row and prior.capture_kind=p_capture then return; end if;
 insert into clinical_source_versions(patient_id,source_kind,source_id,revision,category,source_provider_id,source_facility_id,occurred_at,verification_state,original,capture_kind,recorded_by,supersedes_id)
 values(pid,p_kind,sid,coalesce(prior.revision,0)+1,category,actor,place,occurred,state,p_row,p_capture,case when p_capture='BASELINE' then null else auth.uid() end,prior.id);
end $$;
create function l1_source_trigger() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 perform l1_capture(tg_table_name,case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end,tg_op);
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$ declare t text;r record;begin
 foreach t in array array['encounters','prescriptions','prescription_items','lab_orders','lab_results','health_records','dispense_events','follow_up_tasks'] loop
  for r in execute format('select to_jsonb(s) payload from %I s',t) loop perform l1_capture(t,r.payload,'BASELINE'); end loop;
  execute format('create trigger l1_provenance after insert or update or delete on %I for each row execute function l1_source_trigger()',t);
 end loop;
end $$;
create function l1_history(p_patient uuid,p_purpose text default 'TREATMENT',p_before bigint default null,p_limit integer default 50)
returns setof clinical_source_versions language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_purpose is null or p_purpose not in ('TREATMENT','AI_ASSISTANCE') or p_limit is null or p_limit not between 1 and 100 or (p_before is not null and p_before<1) then raise exception 'Invalid history request'; end if;
 if not exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()) then
  if not is_approved_provider('DOCTOR') or not p0_connected_patient(p_patient) then raise exception 'History not authorized'; end if;
  perform 1 from patient_consents where patient_id=p_patient and requester_provider_id=my_provider_id() and purpose=p_purpose and status='GRANTED' and now()>=valid_from and now()<expires_at for share;
  if not found then raise exception 'History consent required'; end if;
 end if;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(p_patient,auth.uid(),'LONGITUDINAL_READ',p_purpose);
 return query select v.* from clinical_source_versions v where v.patient_id=p_patient and (p_before is null or v.id<p_before)
 and a1_has_consent(p_patient,v.category,p_purpose,coalesce(v.occurred_at,v.recorded_at))
 -- Draft laboratory revisions are internal, not published patient results.
 and (v.source_kind<>'lab_results' or (v.original->>'status'='COMPLETED' and v.original->>'verified_at' is not null and v.original->>'report_storage_path' is not null))
 order by v.id desc limit p_limit;
end $$;
revoke all on function l1_capture(text,jsonb,text),l1_source_trigger(),l1_history(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function l1_history(uuid,text,bigint,integer) to authenticated;

-- Uploading a document cannot assert clinician verification or rewrite its original.
create policy l1_upload_unverified on health_records as restrictive for insert to authenticated with check(verification_status='UNVERIFIED' and verified_by is null);
revoke update,delete on health_records from public,anon,authenticated;
do $$declare c record;begin for c in select column_name from information_schema.columns where table_schema='public' and table_name='health_records' loop execute format('revoke update(%I) on health_records from public,anon,authenticated',c.column_name);end loop;end $$;
create policy l1_original_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'health-records') with check(bucket_id<>'health-records');
create policy l1_original_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'health-records');
commit;
