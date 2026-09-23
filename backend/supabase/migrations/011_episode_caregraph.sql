-- 011: episode-linked operational CareGraph, source-evidence transitions and NextStep.
begin;
create table care_episodes(id uuid primary key default gen_random_uuid(),patient_id uuid not null references patient_profiles(id),encounter_id uuid not null unique references encounters(id),doctor_provider_id uuid not null references provider_profiles(id),status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED')),source_at timestamptz not null,created_at timestamptz not null default now(),closed_at timestamptz);
create index g1_episode_patient on care_episodes(patient_id,created_at desc);
create table care_nodes(id uuid primary key default gen_random_uuid(),episode_id uuid not null references care_episodes(id),kind text not null,category text not null,source_kind text not null,source_id uuid not null,state text not null check(state in ('PENDING','IN_PROGRESS','VERIFICATION_PENDING','COMPLETED','CANCELLED')),responsible_role text not null,occurred_at timestamptz,due_at timestamptz,proof_kind text,proof_id uuid,updated_at timestamptz not null default now(),unique(episode_id,kind,source_id));
create table care_dependencies(node_id uuid not null references care_nodes(id),requires_node_id uuid not null references care_nodes(id),primary key(node_id,requires_node_id),check(node_id<>requires_node_id));
create table care_node_events(id bigint generated always as identity primary key,node_id uuid not null references care_nodes(id),from_state text,to_state text not null,proof_kind text,proof_id uuid,actor_user_id uuid references auth.users(id),recorded_at timestamptz not null default now());
create index g1_nodes_episode on care_nodes(episode_id,state,due_at);
create index g1_node_events on care_node_events(node_id,id desc);
alter table care_gaps add column graph_node_id uuid references care_nodes(id);
create index g1_gap_node on care_gaps(graph_node_id,status);
do $$declare t text;begin foreach t in array array['care_episodes','care_nodes','care_dependencies','care_node_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence care_node_events_id_seq from public,anon,authenticated;
create function g1_put_node(p_episode uuid,p_kind text,p_category text,p_source text,p_id uuid,p_state text,p_role text,p_due timestamptz,p_proof_kind text,p_proof_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare n care_nodes; nid uuid; occurred timestamptz;
begin
 select case p_source when 'encounters' then (select started_at from encounters where id=p_id) when 'prescriptions' then (select issued_at from prescriptions where id=p_id) when 'lab_orders' then (select ordered_at from lab_orders where id=p_id) when 'care_gaps' then (select created_at from care_gaps where id=p_id) end into occurred;
 select * into n from care_nodes where episode_id=p_episode and kind=p_kind and source_id=p_id for update;
 if found then
  nid:=n.id;
  if (n.state,n.due_at,n.proof_kind,n.proof_id,n.responsible_role) is not distinct from (p_state,p_due,p_proof_kind,p_proof_id,p_role) then return nid; end if;
  update care_nodes set state=p_state,responsible_role=p_role,occurred_at=coalesce(occurred,n.occurred_at),due_at=p_due,proof_kind=p_proof_kind,proof_id=p_proof_id,updated_at=now() where id=nid;
 else
  insert into care_nodes(episode_id,kind,category,source_kind,source_id,state,responsible_role,occurred_at,due_at,proof_kind,proof_id) values(p_episode,p_kind,p_category,p_source,p_id,p_state,p_role,occurred,p_due,p_proof_kind,p_proof_id) returning id into nid;
 end if;
 insert into care_node_events(node_id,from_state,to_state,proof_kind,proof_id,actor_user_id) values(nid,n.state,p_state,p_proof_kind,p_proof_id,auth.uid());
 -- Newly recorded obligations reopen an episode, never silently leave false closure.
 if p_state not in ('COMPLETED','CANCELLED') then update care_episodes set status='ACTIVE',closed_at=null where id=p_episode and status='COMPLETED'; end if;
 return nid;
end $$;
create function g1_refresh(p_encounter uuid) returns void language plpgsql security definer set search_path=public as $$
declare e encounters; ep uuid; root uuid; nid uuid; r record; state text; proof uuid;
begin
 select * into e from encounters where id=p_encounter;
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_encounter::text,11));
 insert into care_episodes(patient_id,encounter_id,doctor_provider_id,source_at) values(e.patient_id,e.id,e.doctor_provider_id,e.started_at) on conflict(encounter_id) do nothing;
 select id into ep from care_episodes where encounter_id=e.id for update;
 root:=g1_put_node(ep,'CONSULTATION','ENCOUNTERS','encounters',e.id,case when e.status='COMPLETED' then 'COMPLETED' else 'IN_PROGRESS' end,'DOCTOR',null,case when e.status='COMPLETED' then 'encounters' end,case when e.status='COMPLETED' then e.id end);
 for r in select p.*,f.status fulfilment_status,f.id fulfilment_id from prescriptions p left join prescription_fulfilments f on f.prescription_id=p.id where p.encounter_id=e.id and p.patient_id=e.patient_id loop
  -- Empty prescriptions create no medicine obligation.
  if not exists(select 1 from prescription_items where prescription_id=r.id) then continue; end if;
  state:=case when r.status in ('CANCELLED','SUPERSEDED') then 'CANCELLED' when r.fulfilment_status='DISPENSED' then 'COMPLETED' when r.fulfilment_status='PARTIAL' then 'IN_PROGRESS' else 'PENDING' end;
  nid:=g1_put_node(ep,'MEDICINE_FULFILMENT','PRESCRIPTIONS','prescriptions',r.id,state,'PHARMACY',null,case when state='COMPLETED' then 'prescription_fulfilments' end,case when state='COMPLETED' then r.fulfilment_id end);
  insert into care_dependencies values(nid,root) on conflict do nothing;
  update care_gaps set graph_node_id=nid where patient_id=e.patient_id and source_table='prescriptions' and source_id=r.id and graph_node_id is distinct from nid;
 end loop;
 for r in select o.*,lr.id result_id,lr.status result_status,lr.verified_at,lr.doctor_reviewed_at,lr.report_storage_path from lab_orders o left join lab_results lr on lr.lab_order_id=o.id where o.encounter_id=e.id and o.patient_id=e.patient_id loop
  state:=case when r.doctor_reviewed_at is not null and r.verified_at is not null and r.result_status='COMPLETED' and r.report_storage_path is not null then 'COMPLETED' when r.result_status='COMPLETED' then 'VERIFICATION_PENDING' when r.routing_status='ORDERED' then 'PENDING' else 'IN_PROGRESS' end;
  nid:=g1_put_node(ep,'DIAGNOSTIC_REVIEW','DIAGNOSTICS','lab_orders',r.id,state,case when r.result_status='COMPLETED' then 'DOCTOR' else 'PATIENT' end,null,case when state='COMPLETED' then 'lab_results' end,case when state='COMPLETED' then r.result_id end);
  insert into care_dependencies values(nid,root) on conflict do nothing;
  update care_gaps set graph_node_id=nid where patient_id=e.patient_id and ((source_table='lab_orders' and source_id=r.id) or (source_table='lab_results' and source_id=r.result_id)) and graph_node_id is distinct from nid;
 end loop;
 for r in select g.*,t.id task_id,t.status task_status,t.verified_at from care_gaps g left join follow_up_tasks t on t.care_gap_id=g.id where g.patient_id=e.patient_id and g.source_table='encounters' and g.source_id=e.id and g.gap_type='FOLLOW_UP_PENDING' loop
  state:=case when r.task_status='COMPLETED' and r.verified_at is not null and r.status='CLOSED' then 'COMPLETED' when r.task_status='AWAITING_VERIFICATION' then 'VERIFICATION_PENDING' when r.task_id is not null then 'IN_PROGRESS' else 'PENDING' end;
  nid:=g1_put_node(ep,'FOLLOW_UP','FOLLOW_UPS','care_gaps',r.id,state,'WORKER',r.due_at,case when state='COMPLETED' then 'follow_up_tasks' end,case when state='COMPLETED' then r.task_id end);
  insert into care_dependencies values(nid,root) on conflict do nothing;
  update care_gaps set graph_node_id=nid where id=r.id and graph_node_id is distinct from nid;
 end loop;
end $$;
create function g1_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare eid uuid;
begin
 if tg_table_name='encounters' then eid:=new.id;
 elsif tg_table_name in ('prescriptions','lab_orders') then eid:=new.encounter_id;
 elsif tg_table_name='lab_results' then select encounter_id into eid from lab_orders where id=new.lab_order_id;
 elsif tg_table_name in ('prescription_items','prescription_fulfilments') then select encounter_id into eid from prescriptions where id=new.prescription_id;
 elsif tg_table_name='follow_up_tasks' then select source_id into eid from care_gaps where id=new.care_gap_id and source_table='encounters';
 elsif tg_table_name='care_gaps' then
  if tg_op='UPDATE' and (to_jsonb(new)-'graph_node_id')=(to_jsonb(old)-'graph_node_id') then return new; end if;
  if new.source_table='encounters' then eid:=new.source_id;
  elsif new.source_table='prescriptions' then select encounter_id into eid from prescriptions where id=new.source_id;
  elsif new.source_table='lab_orders' then select encounter_id into eid from lab_orders where id=new.source_id;
  end if;
 end if;
 if eid is not null then perform g1_refresh(eid);end if;return new;
end $$;
do $$declare t text;r record;begin
 foreach t in array array['encounters','prescriptions','prescription_items','prescription_fulfilments','lab_orders','lab_results','follow_up_tasks','care_gaps'] loop execute format('create trigger g1_graph after insert or update on %I for each row execute function g1_source_changed()',t);end loop;
 for r in select id from encounters loop perform g1_refresh(r.id);end loop;
end $$;
create function g1_episode(p_episode uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare e care_episodes; nodes jsonb; edges jsonb;
begin
 select * into e from care_episodes where id=p_episode;
 if not found or not a1_has_consent(e.patient_id,'ENCOUNTERS','TREATMENT',e.source_at) then raise exception 'Episode not authorized';end if;
 perform 1 from patient_consents where patient_id=e.patient_id and requester_provider_id=my_provider_id() and status='GRANTED' and purpose='TREATMENT' for share;
 select coalesce(jsonb_agg(to_jsonb(n) order by n.due_at nulls last,n.id),'[]') into nodes from care_nodes n where episode_id=e.id and a1_has_consent(e.patient_id,n.category,'TREATMENT',n.occurred_at);
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into edges from care_dependencies d where d.node_id in(select (x->>'id')::uuid from jsonb_array_elements(nodes) x) and d.requires_node_id in(select (x->>'id')::uuid from jsonb_array_elements(nodes) x);
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(e.patient_id,auth.uid(),'CAREGRAPH_READ','TREATMENT');
 return jsonb_build_object('episode',to_jsonb(e),'nodes',nodes,'dependencies',edges);
end $$;
create function g1_next_steps(p_episode uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare graph jsonb; result jsonb;
begin
 graph:=g1_episode(p_episode);
 select coalesce(jsonb_agg(x order by (x->>'due_at')::timestamptz nulls last,x->>'id'),'[]') into result from jsonb_array_elements(graph->'nodes') x
 where x->>'state' not in ('COMPLETED','CANCELLED') and not exists(select 1 from care_dependencies d join care_nodes parent on parent.id=d.requires_node_id where d.node_id=(x->>'id')::uuid and parent.state not in ('COMPLETED','CANCELLED'));
 return jsonb_build_object('episode_id',p_episode,'steps',result,'scope','Persisted source-linked operational obligations; not clinical advice');
end $$;
create function g1_close_episode(p_episode uuid) returns void language plpgsql security definer set search_path=public as $$
declare e care_episodes;
begin
 select * into e from care_episodes where id=p_episode;
 if not found or not is_approved_provider('DOCTOR') or e.doctor_provider_id is distinct from my_provider_id() then raise exception 'Episode closure not authorized';end if;
 perform g1_refresh(e.encounter_id);
 select * into e from care_episodes where id=p_episode for update;
 if exists(select 1 from care_nodes where episode_id=e.id and state not in ('COMPLETED','CANCELLED')) or exists(select 1 from care_gaps g join care_nodes n on n.id=g.graph_node_id where n.episode_id=e.id and g.status<>'CLOSED') then raise exception 'Required care lacks completion evidence';end if;
 if e.status='COMPLETED' then return;end if;
 update care_episodes set status='COMPLETED',closed_at=now() where id=e.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'EPISODE_COMPLETED','care_episodes',e.id,auth.uid());
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'g1_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname in ('g1_episode','g1_next_steps','g1_close_episode') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;

create function g1_episodes(p_patient uuid,p_offset integer default 0) returns setof care_episodes language plpgsql security definer set search_path=public as $$
begin
 if p_offset is null or p_offset<0 or p_offset>100000 or not c1_can_patient(p_patient) then raise exception 'Episode list not authorized';end if;
 insert into consent_audit(patient_id,actor_user_id,action,purpose) values(p_patient,auth.uid(),'EPISODE_LIST','TREATMENT');
 return query select e.* from care_episodes e where e.patient_id=p_patient and a1_has_consent(p_patient,'ENCOUNTERS','TREATMENT',e.source_at) order by e.source_at desc,e.id limit 50 offset p_offset;
end $$;
revoke all on function g1_episodes(uuid,integer) from public,anon,authenticated;
grant execute on function g1_episodes(uuid,integer) to authenticated;
commit;
