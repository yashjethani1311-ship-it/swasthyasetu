-- 039: provider-independent integration metadata and evidenced sync receipts. No credentials or network calls stored/executed.
begin;
create table platform_integrations(id uuid primary key default gen_random_uuid(),facility_id uuid references facilities(id),kind text not null check(kind in ('ABDM_ABHA','HPR_HFR','HIS_HMIS','LIS_RIS_PACS','PHARMACY','PAYER','EMERGENCY','VIDEO','OCR','AI','COMMUNICATION')),provider_name text not null,environment text not null check(environment in ('SANDBOX','PRODUCTION')),endpoint_origin text not null,config_ref text not null,enabled boolean not null default false,revision integer not null default 1,created_by uuid not null references auth.users(id),request_key uuid not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table integration_observations(id uuid primary key default gen_random_uuid(),integration_id uuid not null references platform_integrations(id),config_revision integer not null,auth_state text not null check(auth_state in ('CONFIGURATION_REQUIRED','CONFIGURED','EXPIRED','REVOKED')),health text not null check(health in ('OK','DEGRADED','DOWN','UNKNOWN')),error_code text,observed_at timestamptz not null,valid_until timestamptz not null,source_reference text not null,event_key text not null unique,created_at timestamptz not null default now());
create index x2_observations_latest on integration_observations(integration_id,config_revision,observed_at desc);
create table integration_sync_runs(id uuid primary key default gen_random_uuid(),integration_id uuid not null references platform_integrations(id),config_revision integer not null,state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),request_key uuid not null unique,requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz);
create table integration_sync_events(id uuid primary key default gen_random_uuid(),run_id uuid not null references integration_sync_runs(id),state text not null,event_key text not null unique,source_reference text not null,processed_count integer check(processed_count>=0),error_code text,created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['platform_integrations','integration_observations','integration_sync_runs','integration_sync_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function x2_register(p_kind text,p_provider text,p_environment text,p_origin text,p_config_ref text,p_facility uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r platform_integrations;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_provider is null or length(trim(p_provider)) not between 3 and 100 or p_origin is null or p_origin!~'^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' or p_config_ref is null or p_config_ref!~'^[A-Z][A-Z0-9_]{2,79}$' or p_request is null then raise exception 'Governance registration requires HTTPS origin and secret-free configuration reference';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,39));select * into r from platform_integrations where request_key=p_request;
 if found then if (r.kind,r.provider_name,r.environment,r.endpoint_origin,r.config_ref,r.facility_id) is distinct from (p_kind,trim(p_provider),p_environment,p_origin,p_config_ref,p_facility) then raise exception 'Integration registration conflict';end if;return r.id;end if;
 insert into platform_integrations(kind,provider_name,environment,endpoint_origin,config_ref,facility_id,created_by,request_key) values(p_kind,trim(p_provider),p_environment,p_origin,p_config_ref,p_facility,auth.uid(),p_request) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'INTEGRATION_REGISTERED_DISABLED','platform_integrations',rid::text);return rid;
end $$;
create function x2_enable(p_integration uuid,p_enabled boolean,p_expected integer,p_reason text) returns integer language plpgsql security definer set search_path=public as $$
declare r platform_integrations;
begin
 if auth.uid() is null or not is_admin() or p_enabled is null or p_reason is null or length(trim(p_reason)) not between 10 and 2000 then raise exception 'Governance integration decision required';end if;
 select * into r from platform_integrations where id=p_integration for update;
 if not found or p_expected is distinct from r.revision then raise exception 'Stale integration revision';end if;
 update platform_integrations set enabled=p_enabled,revision=revision+1,updated_at=now() where id=r.id;
 update integration_sync_runs set state='CANCELLED',completed_at=now() where integration_id=r.id and state in ('QUEUED','RUNNING');
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'INTEGRATION_CONFIGURATION_CHANGED','platform_integrations',r.id::text,jsonb_build_object('enabled',p_enabled,'revision',r.revision+1,'reason',trim(p_reason)));return r.revision+1;
end $$;
create function x2_observe(p_integration uuid,p_revision integer,p_auth text,p_health text,p_error text,p_observed timestamptz,p_until timestamptz,p_source text,p_event text) returns uuid language plpgsql security definer set search_path=public as $$
declare i platform_integrations;r integration_observations;rid uuid;
begin
 select * into i from platform_integrations where id=p_integration for share;
 if not found or not i.enabled or i.revision is distinct from p_revision or p_observed is null or p_observed>now()+interval '1 minute' or p_until is null or p_until<=p_observed or p_until>p_observed+interval '4 hours' or p_source is null or length(p_source) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 or (p_error is not null and p_error!~'^[A-Z0-9_]{3,80}$') then raise exception 'Current integration revision and bounded source health evidence required';end if;
 if p_health='OK' and p_auth<>'CONFIGURED' then raise exception 'Healthy connection requires configured authentication evidence';end if;
 select * into r from integration_observations where event_key=p_event;
 if found then if (r.integration_id,r.config_revision,r.auth_state,r.health,r.error_code,r.observed_at,r.valid_until,r.source_reference) is distinct from (p_integration,p_revision,p_auth,p_health,p_error,p_observed,p_until,p_source) then raise exception 'Integration observation conflict';end if;return r.id;end if;
 insert into integration_observations(integration_id,config_revision,auth_state,health,error_code,observed_at,valid_until,source_reference,event_key) values(p_integration,p_revision,p_auth,p_health,p_error,p_observed,p_until,p_source,p_event) returning id into rid;return rid;
end $$;
create function x2_sync(p_integration uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i platform_integrations;r integration_sync_runs;rid uuid;
begin
 select * into i from platform_integrations where id=p_integration for update;
 if not found or not i.enabled or auth.uid() is null or not (is_admin() or (i.facility_id is not null and h1_staff(i.facility_id,array['MANAGER']))) or p_request is null then raise exception 'Authorized enabled integration required';end if;
 select * into r from integration_sync_runs where request_key=p_request;
 if found then if (r.integration_id,r.config_revision,r.requested_by) is distinct from (i.id,i.revision,auth.uid()) then raise exception 'Sync request conflict';end if;return r.id;end if;
 if exists(select 1 from integration_sync_runs where integration_id=i.id and state in ('QUEUED','RUNNING')) then raise exception 'Integration sync already pending';end if;
 insert into integration_sync_runs(integration_id,config_revision,request_key,requested_by) values(i.id,i.revision,p_request,auth.uid()) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'INTEGRATION_SYNC_QUEUED','integration_sync_runs',rid::text);return rid;
end $$;
create function x2_sync_event(p_run uuid,p_state text,p_source text,p_event text,p_count integer default null,p_error text default null) returns void language plpgsql security definer set search_path=public as $$
declare r integration_sync_runs;i platform_integrations;e integration_sync_events;
begin
 -- Consistent lock order with x2_enable/sync.
 select integration_id into i.id from integration_sync_runs where id=p_run;select * into i from platform_integrations where id=i.id for share;select * into r from integration_sync_runs where id=p_run for update;
 if r.id is null or not i.enabled or i.revision<>r.config_revision or p_source is null or length(p_source) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 or (p_error is not null and p_error!~'^[A-Z0-9_]{3,80}$') then raise exception 'Active current integration and actual adapter receipt required';end if;
 select * into e from integration_sync_events where event_key=p_event;
 if found then if (e.run_id,e.state,e.source_reference,e.processed_count,e.error_code) is distinct from (r.id,p_state,p_source,p_count,p_error) then raise exception 'Sync adapter event conflict';end if;return;end if;
 if not ((r.state='QUEUED' and p_state='RUNNING') or (r.state='RUNNING' and p_state in ('SUCCEEDED','FAILED'))) then raise exception 'Invalid sync transition';end if;
 if p_state='SUCCEEDED' and (p_count is null or p_count<0 or p_error is not null) then raise exception 'Actual processed count required for success';end if;
 if p_state='FAILED' and p_error is null then raise exception 'Failure code required';end if;
 insert into integration_sync_events(run_id,state,event_key,source_reference,processed_count,error_code) values(r.id,p_state,p_event,p_source,p_count,p_error);
 update integration_sync_runs set state=p_state,started_at=case when p_state='RUNNING' then now() else started_at end,completed_at=case when p_state in ('SUCCEEDED','FAILED') then now() end where id=r.id;
end $$;
create function x2_health(p_facility uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not (is_admin() or (p_facility is not null and h1_staff(p_facility,array['MANAGER']))) then raise exception 'Integration governance/facility scope required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select i.id,i.kind,i.provider_name,i.environment,i.facility_id,i.enabled,i.revision,
 case when not i.enabled then 'DISABLED' when o.valid_until>now() then o.health else 'STATUS_UNKNOWN_CONFIRMATION_REQUIRED' end health,
 case when o.valid_until>now() then o.auth_state else 'CONFIGURATION_OR_CONFIRMATION_REQUIRED' end auth_state,o.observed_at,o.valid_until,o.error_code,
 (select max(completed_at) from integration_sync_runs where integration_id=i.id and config_revision=i.revision and state='SUCCEEDED') last_successful_sync,
 (select state from integration_sync_runs where integration_id=i.id order by created_at desc,id limit 1) latest_sync_state
 from platform_integrations i left join lateral(select * from integration_observations where integration_id=i.id and config_revision=i.revision order by observed_at desc,id desc limit 1)o on true
 where (p_facility is null and is_admin()) or i.facility_id=p_facility order by i.created_at desc,i.id limit 100)x),'[]');
end $$;
revoke all on function x2_register(text,text,text,text,text,uuid,uuid),x2_enable(uuid,boolean,integer,text),x2_observe(uuid,integer,text,text,text,timestamptz,timestamptz,text,text),x2_sync(uuid,uuid),x2_sync_event(uuid,text,text,text,integer,text),x2_health(uuid) from public,anon,authenticated;
grant execute on function x2_register(text,text,text,text,text,uuid,uuid),x2_enable(uuid,boolean,integer,text),x2_sync(uuid,uuid),x2_health(uuid) to authenticated;
grant execute on function x2_observe(uuid,integer,text,text,text,timestamptz,timestamptz,text,text),x2_sync_event(uuid,text,text,text,integer,text) to service_role;
commit;
