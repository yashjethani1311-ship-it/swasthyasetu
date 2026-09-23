-- 040: classified bounded retries and explicit integration freshness semantics.
begin;
alter table integration_sync_runs add column retry_of uuid references integration_sync_runs(id);
alter table integration_sync_runs add column retry_count integer not null default 0 check(retry_count between 0 and 3);
alter table integration_sync_runs add column failure_class text check(failure_class in ('TRANSIENT','TERMINAL'));
alter table integration_sync_runs add column next_retry_at timestamptz;
create unique index x3_single_retry on integration_sync_runs(retry_of) where retry_of is not null;
alter function x2_sync_event(uuid,text,text,text,integer,text) rename to x3_base_sync_event;
create function x2_sync_event(p_run uuid,p_state text,p_source text,p_event text,p_count integer default null,p_error text default null) returns void language plpgsql security definer set search_path=public as $$begin
 perform x3_base_sync_event(p_run,p_state,p_source,p_event,p_count,p_error);
 if p_state='FAILED' then
 update integration_sync_runs set failure_class=case when p_error in ('TIMEOUT','RATE_LIMIT','CONNECTION_RESET','TEMPORARY_UNAVAILABLE') then 'TRANSIENT' else 'TERMINAL' end,
 next_retry_at=case when p_error in ('TIMEOUT','RATE_LIMIT','CONNECTION_RESET','TEMPORARY_UNAVAILABLE') and retry_count<3 then completed_at+make_interval(secs=>30*power(2,retry_count)::integer) else null end where id=p_run;
 end if;
end $$;
alter function x2_sync(uuid,uuid) rename to x3_initial_sync;
create function x2_sync(p_integration uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare latest integration_sync_runs;
begin
 perform 1 from platform_integrations where id=p_integration for update;
 if not exists(select 1 from integration_sync_runs where request_key=p_request) then
 select * into latest from integration_sync_runs where integration_id=p_integration and config_revision=(select revision from platform_integrations where id=p_integration) order by created_at desc,id desc limit 1;
 if latest.state='FAILED' then raise exception 'Use bounded retry; terminal failures require governance configuration review';end if;
 end if;
 return x3_initial_sync(p_integration,p_request);
end $$;
create function x2_retry(p_failed_run uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r integration_sync_runs;i platform_integrations;prior integration_sync_runs;rid uuid;
begin
 select integration_id into i.id from integration_sync_runs where id=p_failed_run;select * into i from platform_integrations where id=i.id for update;select * into r from integration_sync_runs where id=p_failed_run for update;
 if r.id is null or not i.enabled or i.revision<>r.config_revision or auth.uid() is null or not (is_admin() or (i.facility_id is not null and h1_staff(i.facility_id,array['MANAGER']))) or p_request is null then raise exception 'Authorized current integration retry required';end if;
 select * into prior from integration_sync_runs where request_key=p_request;
 if found then if prior.retry_of is distinct from r.id or prior.requested_by<>auth.uid() then raise exception 'Retry request conflict';end if;return prior.id;end if;
 if r.state<>'FAILED' or r.failure_class is distinct from 'TRANSIENT' or r.retry_count>=3 or r.next_retry_at is null or r.next_retry_at>now() then raise exception 'Retry terminal, exhausted or not yet eligible';end if;
 if exists(select 1 from integration_sync_runs where retry_of=r.id) then raise exception 'Failed run already has retry';end if;
 rid:=x3_initial_sync(i.id,p_request);
 update integration_sync_runs set retry_of=r.id,retry_count=r.retry_count+1 where id=rid;return rid;
end $$;
alter function x2_health(uuid) rename to x3_base_health;
create function x2_health(p_facility uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare base jsonb;result jsonb;
begin
 base:=x3_base_health(p_facility);
 select coalesce(jsonb_agg(x||jsonb_build_object('truth_state',case when x->>'health'='DISABLED' then 'DISABLED' when x->>'health'='OK' then 'HEALTHY' when x->>'health'='DEGRADED' then 'DEGRADED' when x->>'health'='DOWN' then 'FAILED' when x->>'observed_at' is not null and (x->>'valid_until')::timestamptz<=now() then 'STALE' else 'UNKNOWN' end,
 'last_failed_sync',(select max(completed_at) from integration_sync_runs where integration_id=(x->>'id')::uuid and config_revision=(x->>'revision')::integer and state='FAILED'),
 'latest_failure',(select jsonb_build_object('run_id',r.id,'failure_class',r.failure_class,'retry_count',r.retry_count,'next_retry_at',r.next_retry_at,'retryable',r.failure_class='TRANSIENT' and r.retry_count<3 and r.next_retry_at is not null,'error_code',(select error_code from integration_sync_events where run_id=r.id and state='FAILED' order by created_at desc,id limit 1)) from integration_sync_runs r where r.integration_id=(x->>'id')::uuid and r.config_revision=(x->>'revision')::integer and r.state='FAILED' order by r.completed_at desc,r.id limit 1)
 )),'[]') into result from jsonb_array_elements(base)x;return result;
end $$;
revoke all on function x3_base_sync_event(uuid,text,text,text,integer,text),x3_initial_sync(uuid,uuid),x3_base_health(uuid),x2_sync_event(uuid,text,text,text,integer,text),x2_sync(uuid,uuid),x2_retry(uuid,uuid),x2_health(uuid) from public,anon,authenticated,service_role;
grant execute on function x2_sync_event(uuid,text,text,text,integer,text) to service_role;
grant execute on function x2_sync(uuid,uuid),x2_retry(uuid,uuid),x2_health(uuid) to authenticated;
commit;
