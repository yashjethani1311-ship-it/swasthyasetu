-- 022: immutable versioned pathways, clinician review, activation and source proof.
begin;
create table care_pathways(id uuid primary key default gen_random_uuid(),code text not null unique,title text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table care_pathway_versions(id uuid primary key default gen_random_uuid(),pathway_id uuid not null references care_pathways(id),version integer not null,specification jsonb not null,status text not null default 'DRAFT' check(status in ('DRAFT','CLINICALLY_REVIEWED','APPROVED','RETIRED')),reviewed_by uuid references provider_profiles(id),review_note text,reviewed_at timestamptz,approved_by uuid references auth.users(id),approved_at timestamptz,unique(pathway_id,version));
create table care_pathway_steps(id uuid primary key default gen_random_uuid(),version_id uuid not null references care_pathway_versions(id),step_key text not null,label text not null,required boolean not null,category text not null,responsible_role text not null,deadline_seconds integer not null check(deadline_seconds between 0 and 31536000),evidence_kind text not null,dependencies text[] not null,allowed_closures text[] not null,unique(version_id,step_key));
create table episode_pathways(id uuid primary key default gen_random_uuid(),episode_id uuid not null references care_episodes(id),version_id uuid not null references care_pathway_versions(id),activated_by uuid not null references provider_profiles(id),criteria_attestation text not null,activated_at timestamptz not null default now(),unique(episode_id,version_id));
create table pathway_step_instances(id uuid primary key default gen_random_uuid(),activation_id uuid not null references episode_pathways(id),step_id uuid not null references care_pathway_steps(id),node_id uuid references care_nodes(id),closure_state text,closure_reason text,proof_kind text,proof_id uuid,closed_by uuid references auth.users(id),closed_at timestamptz,unique(activation_id,step_id));
create table pathway_proof_receipts(id uuid primary key default gen_random_uuid(),instance_id uuid not null references pathway_step_instances(id),request_key uuid not null unique,proof_kind text not null,proof_id uuid not null,source_snapshot jsonb not null,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table care_nodes add column required boolean not null default true;
alter table care_nodes add column pathway_version_id uuid references care_pathway_versions(id);
alter table care_episodes add column closure_outcome text;
create index c2_instance_node on pathway_step_instances(node_id);
do $$declare t text;begin foreach t in array array['care_pathways','care_pathway_versions','care_pathway_steps','episode_pathways','pathway_step_instances','pathway_proof_receipts'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function c2_define(p_code text,p_title text,p_spec jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid;vid uuid;v integer;s jsonb;key text;deps text[];closures text[];
begin
 if not is_admin() or auth.uid() is null then raise exception 'Pathway governance required';end if;
 if p_code is null or p_code!~'^[A-Z0-9_]{3,80}$' or p_title is null or length(trim(p_title)) not between 3 and 200 or p_spec is null or jsonb_typeof(p_spec)<>'object' or octet_length(p_spec::text)>100000 or jsonb_typeof(p_spec->'steps') is distinct from 'array' or jsonb_array_length(p_spec->'steps') not between 1 and 50 or nullif(trim(p_spec->>'entry_criteria'),'') is null then raise exception 'Valid versioned specification and explicit entry criteria required';end if;
 insert into care_pathways(code,title,created_by) values(p_code,trim(p_title),auth.uid()) on conflict(code) do nothing;
 select id into pid from care_pathways where code=p_code for update;select coalesce(max(version),0)+1 into v from care_pathway_versions where pathway_id=pid;
 insert into care_pathway_versions(pathway_id,version,specification) values(pid,v,p_spec) returning id into vid;
 for s in select value from jsonb_array_elements(p_spec->'steps') loop
  key:=s->>'key';
  if key is null or key!~'^[A-Z0-9_]{1,80}$' or nullif(trim(s->>'label'),'') is null or length(s->>'label')>300 or s->>'category' not in ('ENCOUNTERS','PRESCRIPTIONS','DIAGNOSTICS','FOLLOW_UPS','TIMELINE') or s->>'actor' not in ('PATIENT','DOCTOR','LAB','PHARMACY','WORKER','FACILITY') or s->>'evidence' not in ('ENCOUNTER_COMPLETED','PRESCRIPTION_ISSUED','REPORT_PUBLISHED','REPORT_REVIEWED','MEDICINES_DISPENSED','FOLLOW_UP_VERIFIED') then raise exception 'Invalid pathway step definition';end if;
  deps:=array(select jsonb_array_elements_text(coalesce(s->'dependencies','[]')));closures:=array(select jsonb_array_elements_text(coalesce(s->'allowed_closures','[]')));
  if not closures <@ array['PATIENT_DECLINED','CLINICALLY_CANCELLED','TRANSFERRED','UNABLE_TO_COMPLETE','DUPLICATE_ERROR','DECEASED']::text[] then raise exception 'Unsupported pathway closure';end if;
  if (s->>'evidence'='ENCOUNTER_COMPLETED' and s->>'category'<>'ENCOUNTERS') or (s->>'evidence' in ('PRESCRIPTION_ISSUED','MEDICINES_DISPENSED') and s->>'category'<>'PRESCRIPTIONS') or (s->>'evidence' in ('REPORT_PUBLISHED','REPORT_REVIEWED') and s->>'category'<>'DIAGNOSTICS') or (s->>'evidence'='FOLLOW_UP_VERIFIED' and s->>'category'<>'FOLLOW_UPS') then raise exception 'Proof category does not match consent scope';end if;
  insert into care_pathway_steps(version_id,step_key,label,required,category,responsible_role,deadline_seconds,evidence_kind,dependencies,allowed_closures) values(vid,key,trim(s->>'label'),coalesce((s->>'required')::boolean,true),s->>'category',s->>'actor',(s->>'deadline_seconds')::integer,s->>'evidence',deps,closures);
 end loop;
 if exists(select 1 from care_pathway_steps a cross join lateral unnest(a.dependencies) d where a.version_id=vid and not exists(select 1 from care_pathway_steps b where b.version_id=vid and b.step_key=d)) then raise exception 'Unknown pathway dependency';end if;
 if exists(with recursive paths as(select step_key root,step_key current,dependencies,array[step_key] visited,false cyclic from care_pathway_steps where version_id=vid union all select p.root,s.step_key,s.dependencies,p.visited||s.step_key,s.step_key=any(p.visited) from paths p join care_pathway_steps s on s.version_id=vid and s.step_key=any(p.dependencies) where not p.cyclic) select 1 from paths where cyclic) then raise exception 'Cyclic pathway dependency';end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'PATHWAY_VERSION_DRAFTED','care_pathway_versions',vid::text);return vid;
end $$;
create function c2_review(p_version uuid,p_note text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_approved_provider('DOCTOR') or p_note is null or length(trim(p_note)) not between 10 and 4000 then raise exception 'Approved clinician review and note required';end if;
 update care_pathway_versions set status='CLINICALLY_REVIEWED',reviewed_by=my_provider_id(),review_note=trim(p_note),reviewed_at=now() where id=p_version and status='DRAFT';if not found then raise exception 'Draft version required';end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'PATHWAY_CLINICALLY_REVIEWED','care_pathway_versions',p_version::text);
end $$;
create function c2_publish(p_version uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() or auth.uid() is null then raise exception 'Pathway governance required';end if;
 update care_pathway_versions v set status='APPROVED',approved_by=auth.uid(),approved_at=now() where id=p_version and status='CLINICALLY_REVIEWED' and exists(select 1 from provider_profiles p where p.id=v.reviewed_by and p.verification_status='APPROVED');if not found then raise exception 'Clinically reviewed version required';end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'PATHWAY_APPROVED','care_pathway_versions',p_version::text);
end $$;
create function c2_versions(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or (not is_admin() and not is_approved_provider('DOCTOR')) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Pathway catalogue not authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select v.*,p.code,p.title from care_pathway_versions v join care_pathways p on p.id=v.pathway_id order by p.code,v.version desc limit 30 offset p_offset)x),'[]');
end $$;
create function c2_activate(p_episode uuid,p_version uuid,p_attestation text) returns uuid language plpgsql security definer set search_path=public as $$
declare e care_episodes;v care_pathway_versions;a uuid;s care_pathway_steps;i uuid;n uuid;
begin
 select * into e from care_episodes where id=p_episode for update;
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Assigned episode clinician required';end if;
 select * into v from care_pathway_versions where id=p_version and status='APPROVED' for share;
 if not found or p_attestation is null or length(trim(p_attestation)) not between 10 and 4000 then raise exception 'Approved version and clinician entry-criteria attestation required';end if;
 select id into a from episode_pathways where episode_id=e.id and version_id=v.id;
 if found then return a;end if;
 insert into episode_pathways(episode_id,version_id,activated_by,criteria_attestation) values(e.id,v.id,my_provider_id(),trim(p_attestation)) returning id into a;
 for s in select * from care_pathway_steps where version_id=v.id loop
  insert into pathway_step_instances(activation_id,step_id) values(a,s.id) returning id into i;
  n:=g1_put_node(e.id,'PATHWAY:'||s.step_key,s.category,'pathway_step_instances',i,'PENDING',s.responsible_role,now()+make_interval(secs=>s.deadline_seconds),null,null);
  update care_nodes set required=s.required,pathway_version_id=v.id,occurred_at=e.source_at where id=n;
  update pathway_step_instances set node_id=n where id=i;
  if s.required then insert into care_gaps(patient_id,gap_type,source_table,source_id,graph_node_id,due_at) values(e.patient_id,'PATHWAY_STEP_PENDING','pathway_step_instances',i,n,now()+make_interval(secs=>s.deadline_seconds));end if;
 end loop;
 insert into care_dependencies(node_id,requires_node_id) select i.node_id,parent.node_id from pathway_step_instances i join care_pathway_steps definition on definition.id=i.step_id cross join lateral unnest(definition.dependencies) dep join care_pathway_steps ps on ps.version_id=v.id and ps.step_key=dep join pathway_step_instances parent on parent.step_id=ps.id and parent.activation_id=a where i.activation_id=a;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'PATHWAY_ACTIVATED','episode_pathways',a,auth.uid());return a;
end $$;
create function c2_valid_proof(p_encounter uuid,p_kind text,p_source uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
begin
 case p_kind
 when 'ENCOUNTER_COMPLETED' then return exists(select 1 from encounters where id=p_source and id=p_encounter and status='COMPLETED');
 when 'PRESCRIPTION_ISSUED' then return exists(select 1 from prescriptions p join encounters e on e.id=p.encounter_id where p.id=p_source and e.id=p_encounter and e.status='COMPLETED' and p.status='ACTIVE');
 when 'REPORT_PUBLISHED' then return exists(select 1 from lab_results r join lab_orders o on o.id=r.lab_order_id where r.id=p_source and o.encounter_id=p_encounter and r.status='COMPLETED' and r.verified_at is not null and r.report_storage_path is not null);
 when 'REPORT_REVIEWED' then return exists(select 1 from lab_results r join lab_orders o on o.id=r.lab_order_id where r.id=p_source and o.encounter_id=p_encounter and r.status='COMPLETED' and r.verified_at is not null and r.report_storage_path is not null and r.doctor_reviewed_at is not null and r.doctor_reviewed_by=o.doctor_provider_id);
 when 'MEDICINES_DISPENSED' then return exists(select 1 from prescription_fulfilments f join prescriptions p on p.id=f.prescription_id where f.id=p_source and p.encounter_id=p_encounter and f.status='DISPENSED');
 when 'FOLLOW_UP_VERIFIED' then return exists(select 1 from follow_up_tasks t join care_gaps g on g.id=t.care_gap_id where t.id=p_source and g.source_table='encounters' and g.source_id=p_encounter and t.status='COMPLETED' and t.verified_at is not null);
 else return false;end case;
end $$;

create function c2_evidence_snapshot(p_kind text,p_source uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t text;payload jsonb;
begin
 t:=case p_kind when 'ENCOUNTER_COMPLETED' then 'encounters' when 'PRESCRIPTION_ISSUED' then 'prescriptions' when 'REPORT_PUBLISHED' then 'lab_results' when 'REPORT_REVIEWED' then 'lab_results' when 'MEDICINES_DISPENSED' then 'prescription_fulfilments' when 'FOLLOW_UP_VERIFIED' then 'follow_up_tasks' end;
 if t is null then raise exception 'Unsupported proof source';end if;
 execute format('select to_jsonb(x) from %I x where id=$1 for share',t) into payload using p_source;return payload;
end $$;
create function c2_prove(p_instance uuid,p_kind text,p_source uuid,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i pathway_step_instances;s care_pathway_steps;e care_episodes;prior pathway_proof_receipts;receipt uuid;n care_nodes;snapshot jsonb;
begin
 select * into i from pathway_step_instances where id=p_instance for update;
 select * into s from care_pathway_steps where id=i.step_id;
 select ep.* into e from episode_pathways a join care_episodes ep on ep.id=a.episode_id where a.id=i.activation_id;
 if e.id is null or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Assigned episode clinician required';end if;
 snapshot:=c2_evidence_snapshot(p_kind,p_source);
 if p_request is null or p_kind is distinct from s.evidence_kind or not c2_valid_proof(e.encounter_id,p_kind,p_source) then raise exception 'Matching episode source completion evidence required';end if;
 select * into prior from pathway_proof_receipts where request_key=p_request;
 if found then if prior.instance_id<>i.id or prior.proof_kind<>p_kind or prior.proof_id<>p_source then raise exception 'Proof request conflict';end if;return prior.id;end if;
 if i.closure_state is not null then raise exception 'Pathway step already closed';end if;
 if exists(select 1 from care_dependencies d join care_nodes p on p.id=d.requires_node_id where d.node_id=i.node_id and p.state<>'COMPLETED') then raise exception 'Pathway dependencies incomplete';end if;
 insert into pathway_proof_receipts(instance_id,request_key,proof_kind,proof_id,source_snapshot,actor_user_id) values(i.id,p_request,p_kind,p_source,snapshot,auth.uid()) returning id into receipt;
 update pathway_step_instances set closure_state='COMPLETED',proof_kind=p_kind,proof_id=p_source,closed_by=auth.uid(),closed_at=now() where id=i.id;
 select * into n from care_nodes where id=i.node_id;perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'COMPLETED',n.responsible_role,n.due_at,p_kind,p_source);
 update care_gaps set status='CLOSED',closed_at=now() where graph_node_id=n.id and status='OPEN';return receipt;
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'c2_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname not in ('c2_valid_proof','c2_evidence_snapshot') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
create or replace function g1_close_episode(p_episode uuid) returns void language plpgsql security definer set search_path=public as $$
declare e care_episodes;
begin
 select * into e from care_episodes where id=p_episode;
 if not found or not is_approved_provider('DOCTOR') or e.doctor_provider_id is distinct from my_provider_id() then raise exception 'Episode closure not authorized';end if;
 perform g1_refresh(e.encounter_id);
 select * into e from care_episodes where id=p_episode for update;
 if exists(select 1 from care_nodes where episode_id=e.id and required and state not in ('COMPLETED','CANCELLED')) or exists(select 1 from care_gaps g join care_nodes n on n.id=g.graph_node_id where n.episode_id=e.id and g.status<>'CLOSED') then raise exception 'Required care lacks completion evidence';end if;
 if e.status='COMPLETED' then return;end if;
 update care_episodes set status='COMPLETED',closed_at=now(),closure_outcome=case when exists(select 1 from care_nodes where episode_id=e.id and required and state='CANCELLED') then 'CLOSED_WITH_EXCEPTIONS' else 'COMPLETED' end where id=e.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,case when exists(select 1 from care_nodes where episode_id=e.id and required and state='CANCELLED') then 'EPISODE_CLOSED_WITH_EXCEPTIONS' else 'EPISODE_COMPLETED' end,'care_episodes',e.id,auth.uid());
end $$;
commit;

