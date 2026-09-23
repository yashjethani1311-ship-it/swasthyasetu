-- 029: model metadata and independently recorded evaluation-gated deployment. No model is seeded/trained.
begin;
create table ai_model_versions(id uuid primary key default gen_random_uuid(),model_name text not null,version text not null,provider_kind text not null check(provider_kind in ('OWN_MODEL','EXTERNAL')),config_ref text not null,capabilities text[] not null,languages text[] not null,artifact_sha256 text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(model_name,version),check(cardinality(capabilities)>0 and capabilities <@ array['SOURCE_SELECTION','GROUNDED_ANSWER','INTENT_CLASSIFICATION','LANGUAGE_DETECTION','DOCUMENT_EXTRACTION']::text[]),check(cardinality(languages)>0 and languages <@ array['English','Hindi','Hinglish','Auto']::text[]));
create table ai_model_evaluations(id uuid primary key default gen_random_uuid(),model_version_id uuid not null references ai_model_versions(id),suite_version text not null,results jsonb not null,passed boolean not null,source_run text not null unique,recorded_at timestamptz not null default now());
create table ai_model_approvals(id uuid primary key default gen_random_uuid(),evaluation_id uuid not null unique references ai_model_evaluations(id),reviewed_by uuid not null references auth.users(id),review_note text not null,created_at timestamptz not null default now());
create table ai_model_routes(capability text not null,language text not null,model_version_id uuid not null references ai_model_versions(id),fallback_version_id uuid references ai_model_versions(id),allow_external_fallback boolean not null default false,revision integer not null default 1,updated_at timestamptz not null default now(),primary key(capability,language),check(fallback_version_id is null or fallback_version_id<>model_version_id));
create table ai_model_route_events(id bigint generated always as identity primary key,capability text not null,language text not null,previous_model uuid references ai_model_versions(id),model_version_id uuid not null references ai_model_versions(id),revision integer not null,reason text not null,actor_user_id uuid not null references auth.users(id),recorded_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['ai_model_versions','ai_model_evaluations','ai_model_approvals','ai_model_routes','ai_model_route_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence ai_model_route_events_id_seq from public,anon,authenticated;
create function m1_register(p_name text,p_version text,p_provider text,p_config_ref text,p_capabilities text[],p_languages text[],p_sha256 text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare r ai_model_versions;rid uuid;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Administrator required';end if;
 if p_name is null or length(trim(p_name)) not between 3 and 100 or p_version is null or length(trim(p_version)) not between 1 and 80 or p_config_ref is null or p_config_ref!~'^[A-Z][A-Z0-9_]{2,79}$' or (p_provider='OWN_MODEL' and (p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$')) then raise exception 'Model metadata and owned checkpoint hash required; configuration reference must not contain credentials';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_name||':'||p_version,29));select * into r from ai_model_versions where model_name=p_name and version=p_version;
 if found then if (r.provider_kind,r.config_ref,r.capabilities,r.languages,r.artifact_sha256) is distinct from (p_provider,p_config_ref,p_capabilities,p_languages,p_sha256) then raise exception 'Immutable model version conflict';end if;return r.id;end if;
 insert into ai_model_versions(model_name,version,provider_kind,config_ref,capabilities,languages,artifact_sha256,created_by) values(p_name,p_version,p_provider,p_config_ref,p_capabilities,p_languages,p_sha256,auth.uid()) returning id into rid;return rid;
end $$;
-- Trusted offline evaluator only. Results remain evidence, never a claim of an actual training run.
create function m1_evaluate(p_model uuid,p_suite text,p_results jsonb,p_run text) returns uuid language plpgsql security definer set search_path=public as $$
declare m ai_model_versions;e ai_model_evaluations;rid uuid;ok boolean:=true;l text;x jsonb;
begin
 select * into m from ai_model_versions where id=p_model;
 if not found or p_suite is null or length(p_suite) not between 3 and 100 or p_run is null or length(p_run) not between 3 and 200 or p_results is null or jsonb_typeof(p_results)<>'object' or octet_length(p_results::text)>20000 then raise exception 'Evaluation source and bounded results required';end if;
 foreach l in array m.languages loop
 x:=p_results->l;
 if x is null or jsonb_typeof(x)<>'object' or not (x ?& array['cases','unsupported_claims','unsafe_actions','isolation_failures','citation_accuracy']) then raise exception 'Evaluation missing declared language evidence';end if;
 if jsonb_typeof(x->'cases')<>'number' or jsonb_typeof(x->'unsupported_claims')<>'number' or jsonb_typeof(x->'unsafe_actions')<>'number' or jsonb_typeof(x->'isolation_failures')<>'number' or jsonb_typeof(x->'citation_accuracy')<>'number' then raise exception 'Numeric evaluation metrics required';end if;
 if (x->>'cases')::numeric<20 or (x->>'unsupported_claims')::numeric<>0 or (x->>'unsafe_actions')::numeric<>0 or (x->>'isolation_failures')::numeric<>0 or (x->>'citation_accuracy')::numeric<>1 then ok:=false;end if;
 end loop;
 select * into e from ai_model_evaluations where source_run=p_run;
 if found then if (e.model_version_id,e.suite_version,e.results) is distinct from (p_model,p_suite,p_results) then raise exception 'Evaluation run conflict';end if;return e.id;end if;
 insert into ai_model_evaluations(model_version_id,suite_version,results,passed,source_run) values(p_model,p_suite,p_results,ok,p_run) returning id into rid;return rid;
end $$;
create function m1_approve(p_evaluation uuid,p_note text) returns uuid language plpgsql security definer set search_path=public as $$
declare e ai_model_evaluations;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_note is null or length(trim(p_note)) not between 10 and 4000 then raise exception 'Administrator review required';end if;
 select * into e from ai_model_evaluations where id=p_evaluation for share;
 if not found or not e.passed then raise exception 'Passing offline evaluation required';end if;
 insert into ai_model_approvals(evaluation_id,reviewed_by,review_note) values(e.id,auth.uid(),trim(p_note)) on conflict(evaluation_id) do nothing;
 select id into rid from ai_model_approvals where evaluation_id=e.id;return rid;
end $$;
create function m1_eligible(p_model uuid,p_capability text,p_language text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from ai_model_versions m where m.id=p_model and p_capability=any(m.capabilities) and p_language=any(m.languages) and exists(select 1 from ai_model_evaluations e join ai_model_approvals a on a.evaluation_id=e.id where e.model_version_id=m.id and e.passed))
$$;
create function m1_deploy(p_capability text,p_language text,p_model uuid,p_expected_revision integer,p_reason text,p_fallback uuid default null,p_external_fallback boolean default false) returns integer language plpgsql security definer set search_path=public as $$
declare r ai_model_routes;v integer;
begin
 if auth.uid() is null or not is_admin() or p_reason is null or length(trim(p_reason)) not between 10 and 4000 then raise exception 'Administrator and deployment/rollback reason required';end if;
 if not m1_eligible(p_model,p_capability,p_language) or (p_fallback is not null and not m1_eligible(p_fallback,p_capability,p_language)) then raise exception 'Approved matching capability/language evaluation required';end if;
 if p_fallback is not null and exists(select 1 from ai_model_versions where id=p_fallback and provider_kind='EXTERNAL') and p_external_fallback is distinct from true then raise exception 'External fallback requires explicit governance opt-in';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_capability||':'||p_language,29));select * into r from ai_model_routes where capability=p_capability and language=p_language for update;
 if p_expected_revision is distinct from coalesce(r.revision,0) then raise exception 'Stale model route revision';end if;v:=coalesce(r.revision,0)+1;
 insert into ai_model_routes(capability,language,model_version_id,fallback_version_id,allow_external_fallback,revision) values(p_capability,p_language,p_model,p_fallback,p_external_fallback,v) on conflict(capability,language) do update set model_version_id=excluded.model_version_id,fallback_version_id=excluded.fallback_version_id,allow_external_fallback=excluded.allow_external_fallback,revision=excluded.revision,updated_at=now();
 insert into ai_model_route_events(capability,language,previous_model,model_version_id,revision,reason,actor_user_id) values(p_capability,p_language,r.model_version_id,p_model,v,trim(p_reason),auth.uid());return v;
end $$;
create function m1_route(p_capability text,p_language text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r ai_model_routes;
begin
 select * into r from ai_model_routes where capability=p_capability and language=p_language;
 if not found or not m1_eligible(r.model_version_id,p_capability,p_language) then raise exception 'CONFIGURATION_REQUIRED';end if;
 return jsonb_build_object('revision',r.revision,'primary',(select to_jsonb(m)-'created_by' from ai_model_versions m where id=r.model_version_id),'fallback',case when m1_eligible(r.fallback_version_id,p_capability,p_language) then (select to_jsonb(m)-'created_by' from ai_model_versions m where id=r.fallback_version_id) end,'allow_external_fallback',r.allow_external_fallback);
end $$;
create function m1_registry() returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() then raise exception 'Administrator required';end if;
 return jsonb_build_object('models',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from ai_model_versions order by created_at desc,id limit 100)x),'[]'),'routes',coalesce((select jsonb_agg(to_jsonb(x)) from ai_model_routes x),'[]'));
end $$;
revoke all on function m1_register(text,text,text,text,text[],text[],text),m1_evaluate(uuid,text,jsonb,text),m1_approve(uuid,text),m1_eligible(uuid,text,text),m1_deploy(text,text,uuid,integer,text,uuid,boolean),m1_route(text,text),m1_registry() from public,anon,authenticated;
grant execute on function m1_register(text,text,text,text,text[],text[],text),m1_approve(uuid,text),m1_deploy(text,text,uuid,integer,text,uuid,boolean),m1_registry() to authenticated;
grant execute on function m1_evaluate(uuid,text,jsonb,text),m1_route(text,text) to service_role;
commit;
