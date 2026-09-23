-- 037: audited incident/retention governance, pathway retirement and model suspension.
begin;
create table governance_incidents(id uuid primary key default gen_random_uuid(),reported_by uuid not null references auth.users(id),category text not null check(category in ('SECURITY','PRIVACY','CLINICAL_WORKFLOW','INTEGRATION','DATA_QUALITY')),summary text not null,state text not null default 'OPEN' check(state in ('OPEN','TRIAGED','INVESTIGATING','RESOLVED','CLOSED')),severity text check(severity in ('LOW','MEDIUM','HIGH','CRITICAL')),assigned_admin uuid references auth.users(id),revision integer not null default 1,request_key uuid not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table governance_incident_events(id uuid primary key default gen_random_uuid(),incident_id uuid not null references governance_incidents(id),from_state text,to_state text not null,note text not null,request_payload jsonb not null default '{}',revision integer not null,actor_user_id uuid not null references auth.users(id),request_key uuid not null unique,created_at timestamptz not null default now());
create table retention_policy_versions(id uuid primary key default gen_random_uuid(),record_class text not null,version integer not null,retention_days integer not null check(retention_days between 1 and 36500),policy_reference text not null,created_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),approved_at timestamptz,created_at timestamptz not null default now(),unique(record_class,version));
create table ai_model_holds(model_version_id uuid primary key references ai_model_versions(id),suspended boolean not null,reason text not null,revision integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['governance_incidents','governance_incident_events','retention_policy_versions','ai_model_holds'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function a4_incident(p_category text,p_summary text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r governance_incidents;rid uuid;
begin
 if auth.uid() is null or p_request is null or p_summary is null or length(trim(p_summary)) not between 10 and 4000 then raise exception 'Authenticated incident report required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,37));select * into r from governance_incidents where request_key=p_request;
 if found then if (r.reported_by,r.category,r.summary) is distinct from (auth.uid(),p_category,trim(p_summary)) then raise exception 'Incident request conflict';end if;return r.id;end if;
 insert into governance_incidents(reported_by,category,summary,request_key) values(auth.uid(),p_category,trim(p_summary),p_request) returning id into rid;
 insert into governance_incident_events(incident_id,to_state,note,revision,actor_user_id,request_key) values(rid,'OPEN','Incident submitted',1,auth.uid(),p_request);return rid;
end $$;
create function a4_incident_transition(p_incident uuid,p_state text,p_severity text,p_assigned uuid,p_revision integer,p_note text,p_request uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r governance_incidents;e governance_incident_events;
begin
 if auth.uid() is null or not is_admin() or p_request is null or p_note is null or length(trim(p_note)) not between 10 and 4000 or p_severity is null or p_severity not in ('LOW','MEDIUM','HIGH','CRITICAL') or not exists(select 1 from profiles where id=p_assigned and role='ADMIN') then raise exception 'Governance admin, assigned admin and disposition note required';end if;
 select * into r from governance_incidents where id=p_incident for update;if not found then raise exception 'Incident unavailable';end if;
 select * into e from governance_incident_events where request_key=p_request;
 if found then if (e.incident_id,e.to_state,e.note,e.actor_user_id) is distinct from (r.id,p_state,trim(p_note),auth.uid()) or e.request_payload is distinct from jsonb_build_object('severity',p_severity,'assigned_admin',p_assigned,'expected_revision',p_revision) then raise exception 'Incident event conflict';end if;return e.revision;end if;
 if p_revision is distinct from r.revision then raise exception 'Stale incident revision';end if;
 if not ((r.state='OPEN' and p_state='TRIAGED') or (r.state='TRIAGED' and p_state='INVESTIGATING') or (r.state='INVESTIGATING' and p_state='RESOLVED') or (r.state='RESOLVED' and p_state in ('CLOSED','INVESTIGATING')) or (r.state='CLOSED' and p_state='INVESTIGATING')) then raise exception 'Invalid incident transition';end if;
 update governance_incidents set state=p_state,severity=p_severity,assigned_admin=p_assigned,revision=r.revision+1,updated_at=now() where id=r.id;
 insert into governance_incident_events(incident_id,from_state,to_state,note,request_payload,revision,actor_user_id,request_key) values(r.id,r.state,p_state,trim(p_note),jsonb_build_object('severity',p_severity,'assigned_admin',p_assigned,'expected_revision',p_revision),r.revision+1,auth.uid(),p_request);
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'INCIDENT_'||p_state,'governance_incidents',r.id::text);return r.revision+1;
end $$;
create function a4_incidents(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Authenticated incident access required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)-'request_key') from (select * from governance_incidents where reported_by=auth.uid() or is_admin() order by updated_at desc,id limit 50 offset p_offset)x),'[]');
end $$;
create function a4_retention(p_class text,p_version integer,p_days integer,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare r retention_policy_versions;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_class is null or p_class not in ('CLINICAL_RECORDS','AUDIT_LOGS','AI_FEEDBACK','DOCUMENT_ORIGINALS','COMMUNICATION_RECEIPTS') or p_version is null or p_version<1 or p_reference is null or length(trim(p_reference)) not between 10 and 1000 then raise exception 'Governance policy reference required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_class,37));select * into r from retention_policy_versions where record_class=p_class and version=p_version;
 if found then if (r.retention_days,r.policy_reference) is distinct from (p_days,trim(p_reference)) then raise exception 'Immutable retention policy conflict';end if;return r.id;end if;
 insert into retention_policy_versions(record_class,version,retention_days,policy_reference,created_by) values(p_class,p_version,p_days,trim(p_reference),auth.uid()) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'RETENTION_POLICY_DRAFTED','retention_policy_versions',rid::text);return rid;
end $$;
create function a4_approve_retention(p_policy uuid) returns void language plpgsql security definer set search_path=public as $$
declare r retention_policy_versions;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Governance admin required';end if;
 select * into r from retention_policy_versions where id=p_policy for update;if not found or r.created_by=auth.uid() then raise exception 'Independent retention policy approval required';end if;
 if r.approved_at is not null then return;end if;
 update retention_policy_versions set approved_by=auth.uid(),approved_at=now() where id=r.id;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'RETENTION_POLICY_APPROVED_METADATA_ONLY','retention_policy_versions',r.id::text);
 -- Metadata only. This RPC never purges clinical data, evidence, originals or logs.
end $$;
create function a4_retire_pathway(p_version uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not is_admin() or p_reason is null or length(trim(p_reason)) not between 10 and 2000 then raise exception 'Governance retirement reason required';end if;
 perform 1 from care_pathway_versions where id=p_version and status in ('APPROVED','RETIRED') for update;if not found then raise exception 'Approved pathway version required';end if;
 update care_pathway_versions set status='RETIRED' where id=p_version;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'PATHWAY_RETIRED','care_pathway_versions',p_version::text,jsonb_build_object('reason',trim(p_reason),'existing_activations_preserved',true));
end $$;
create function a4_model_hold(p_model uuid,p_suspended boolean,p_expected integer,p_reason text) returns integer language plpgsql security definer set search_path=public as $$
declare r ai_model_holds;v integer;
begin
 if auth.uid() is null or not is_admin() or p_suspended is null or p_reason is null or length(trim(p_reason)) not between 10 and 2000 then raise exception 'Governance model decision required';end if;
 perform 1 from ai_model_versions where id=p_model for update;if not found then raise exception 'Model unavailable';end if;
 select * into r from ai_model_holds where model_version_id=p_model;
 if p_expected is distinct from coalesce(r.revision,0) then raise exception 'Stale model governance revision';end if;v:=coalesce(r.revision,0)+1;
 insert into ai_model_holds(model_version_id,suspended,reason,revision,updated_by) values(p_model,p_suspended,trim(p_reason),v,auth.uid()) on conflict(model_version_id) do update set suspended=excluded.suspended,reason=excluded.reason,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'MODEL_GOVERNANCE_HOLD','ai_model_versions',p_model::text,jsonb_build_object('suspended',p_suspended,'revision',v,'reason',trim(p_reason)));return v;
end $$;
alter function m1_eligible(uuid,text,text) rename to a4_pre_hold_eligible;
create function m1_eligible(p_model uuid,p_capability text,p_language text) returns boolean language sql stable security definer set search_path=public as $$select a4_pre_hold_eligible(p_model,p_capability,p_language) and not exists(select 1 from ai_model_holds where model_version_id=p_model and suspended)$$;
create function a4_audit(p_before bigint default null,p_action text default null) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() or (p_before is not null and p_before<1) or length(coalesce(p_action,''))>100 then raise exception 'Governance audit query required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,actor_user_id,action,entity_type,entity_id,created_at from audit_logs where (p_before is null or id<p_before) and (p_action is null or action=p_action) order by id desc limit 100)x),'[]');
end $$;
create function a4_model_history(p_model uuid) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() then raise exception 'Model governance administrator required';end if;
 return jsonb_build_object('evaluations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from ai_model_evaluations where model_version_id=p_model order by recorded_at desc,id limit 50)x),'[]'),'approvals',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.* from ai_model_approvals a join ai_model_evaluations e on e.id=a.evaluation_id where e.model_version_id=p_model order by a.created_at desc,a.id limit 50)x),'[]'),'hold',(select to_jsonb(h) from ai_model_holds h where model_version_id=p_model));
end $$;
revoke all on function a4_incident(text,text,uuid),a4_incident_transition(uuid,text,text,uuid,integer,text,uuid),a4_incidents(integer),a4_retention(text,integer,integer,text),a4_approve_retention(uuid),a4_retire_pathway(uuid,text),a4_model_hold(uuid,boolean,integer,text),a4_pre_hold_eligible(uuid,text,text),m1_eligible(uuid,text,text),a4_audit(bigint,text),a4_model_history(uuid) from public,anon,authenticated;
grant execute on function a4_incident(text,text,uuid),a4_incident_transition(uuid,text,text,uuid,integer,text,uuid),a4_incidents(integer),a4_retention(text,integer,integer,text),a4_approve_retention(uuid),a4_retire_pathway(uuid,text),a4_model_hold(uuid,boolean,integer,text),a4_audit(bigint,text),a4_model_history(uuid) to authenticated;
commit;
