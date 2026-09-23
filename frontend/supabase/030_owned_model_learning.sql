-- 030: opt-in feedback, human de-identification review, immutable datasets and offline run lineage.
begin;
create table ai_feedback(id uuid primary key default gen_random_uuid(),actor_user_id uuid not null references auth.users(id),interaction_ref uuid not null,feedback text not null,training_opt_in boolean not null default false,request_key uuid not null unique,created_at timestamptz not null default now(),withdrawn_at timestamptz);
create table ai_learning_candidates(id uuid primary key default gen_random_uuid(),feedback_id uuid not null unique references ai_feedback(id),state text not null default 'PENDING_REVIEW' check(state in ('PENDING_REVIEW','APPROVED','REJECTED','WITHDRAWN')),created_at timestamptz not null default now());
create table ai_training_examples(id uuid primary key default gen_random_uuid(),candidate_id uuid not null unique references ai_learning_candidates(id),deidentified_content jsonb not null,reviewed_by uuid not null references auth.users(id),review_note text not null,created_at timestamptz not null default now());
create table ai_dataset_versions(id uuid primary key default gen_random_uuid(),name text not null,version text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(name,version));
create table ai_dataset_members(dataset_id uuid not null references ai_dataset_versions(id),example_id uuid not null references ai_training_examples(id),primary key(dataset_id,example_id));
create table ai_training_runs(id uuid primary key default gen_random_uuid(),dataset_id uuid not null references ai_dataset_versions(id),recipe_ref text not null,state text not null default 'REQUESTED' check(state in ('REQUESTED','RUNNING','COMPLETED','FAILED')),external_run text unique,artifact_sha256 text,requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),completed_at timestamptz);
create table ai_training_checkpoints(model_version_id uuid primary key references ai_model_versions(id),training_run_id uuid not null references ai_training_runs(id),linked_by uuid not null references auth.users(id),linked_at timestamptz not null default now());
create table ai_learning_events(id bigint generated always as identity primary key,action text not null,source_id uuid not null,actor_user_id uuid references auth.users(id),metadata jsonb not null default '{}',created_at timestamptz not null default now());
create index m2_actor_feedback on ai_feedback(actor_user_id,created_at desc);
do $$declare t text;begin foreach t in array array['ai_feedback','ai_learning_candidates','ai_training_examples','ai_dataset_versions','ai_dataset_members','ai_training_runs','ai_training_checkpoints','ai_learning_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence ai_learning_events_id_seq from public,anon,authenticated;
create function m2_feedback(p_interaction uuid,p_feedback text,p_training_opt_in boolean,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare f ai_feedback;rid uuid;
begin
 if auth.uid() is null or p_interaction is null or p_request is null or p_training_opt_in is null or p_feedback is null or length(trim(p_feedback)) not between 3 and 4000 then raise exception 'Authenticated bounded feedback required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,30));select * into f from ai_feedback where request_key=p_request;
 if found then if (f.actor_user_id,f.interaction_ref,f.feedback,f.training_opt_in) is distinct from (auth.uid(),p_interaction,trim(p_feedback),p_training_opt_in) then raise exception 'Feedback request conflict';end if;return f.id;end if;
 insert into ai_feedback(actor_user_id,interaction_ref,feedback,training_opt_in,request_key) values(auth.uid(),p_interaction,trim(p_feedback),p_training_opt_in,p_request) returning id into rid;
 if p_training_opt_in then insert into ai_learning_candidates(feedback_id) values(rid);end if;
 insert into ai_learning_events(action,source_id,actor_user_id) values('FEEDBACK_RECEIVED',rid,auth.uid());return rid;
end $$;
create function m2_withdraw(p_feedback uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from ai_feedback where id=p_feedback and actor_user_id=auth.uid() for update;
 if not found then raise exception 'Feedback owner required';end if;
 update ai_feedback set withdrawn_at=coalesce(withdrawn_at,now()) where id=p_feedback;
 update ai_learning_candidates set state='WITHDRAWN' where feedback_id=p_feedback;
 insert into ai_learning_events(action,source_id,actor_user_id) values('TRAINING_AUTHORIZATION_WITHDRAWN',p_feedback,auth.uid());
end $$;
create function m2_review(p_candidate uuid,p_deidentified jsonb,p_note text,p_identifiers_removed boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare c ai_learning_candidates;f ai_feedback;rid uuid;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Governance reviewer required';end if;
 select feedback_id into rid from ai_learning_candidates where id=p_candidate;select * into f from ai_feedback where id=rid for share;select * into c from ai_learning_candidates where id=p_candidate for update;
 if c.id is null or c.state<>'PENDING_REVIEW' or not f.training_opt_in or f.withdrawn_at is not null then raise exception 'Active opt-in pending candidate required';end if;
 if f.actor_user_id=auth.uid() then raise exception 'Independent human reviewer required';end if;
 if p_identifiers_removed is distinct from true or p_note is null or length(trim(p_note)) not between 10 and 4000 or p_deidentified is null or jsonb_typeof(p_deidentified)<>'object' or not(p_deidentified ?& array['input','expected_output','task','language']) or (select count(*) from jsonb_object_keys(p_deidentified))<>4 or octet_length(p_deidentified::text)>12000 then raise exception 'Explicit de-identification review and bounded training example required';end if;
 if p_deidentified->>'task' not in ('SOURCE_SELECTION','INTENT_CLASSIFICATION','LANGUAGE_DETECTION','DOCUMENT_EXTRACTION','GROUNDED_ANSWER') or p_deidentified->>'language' not in ('English','Hindi','Hinglish','Auto') or jsonb_typeof(p_deidentified->'input')<>'string' or jsonb_typeof(p_deidentified->'expected_output')<>'string' then raise exception 'Invalid reviewed training task';end if;
 insert into ai_training_examples(candidate_id,deidentified_content,reviewed_by,review_note) values(c.id,p_deidentified,auth.uid(),trim(p_note)) returning id into rid;
 update ai_learning_candidates set state='APPROVED' where id=c.id;
 insert into ai_learning_events(action,source_id,actor_user_id) values('DEIDENTIFIED_EXAMPLE_APPROVED',rid,auth.uid());return rid;
end $$;
create function m2_dataset_valid(p_dataset uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from ai_dataset_members where dataset_id=p_dataset) and not exists(select 1 from ai_dataset_members m join ai_training_examples e on e.id=m.example_id join ai_learning_candidates c on c.id=e.candidate_id join ai_feedback f on f.id=c.feedback_id where m.dataset_id=p_dataset and (c.state<>'APPROVED' or f.withdrawn_at is not null or not f.training_opt_in))
$$;
create function m2_dataset(p_name text,p_version text,p_examples uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;eid uuid;
begin
 if auth.uid() is null or not is_admin() or p_name is null or length(p_name) not between 3 and 100 or p_version is null or length(p_version) not between 1 and 80 or p_examples is null or cardinality(p_examples) not between 1 and 100 or exists(select 1 from unnest(p_examples)x where x is null) or (select count(distinct x) from unnest(p_examples)x)<>cardinality(p_examples) then raise exception 'Governance-approved dataset members required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_name||':'||p_version,30));select id into rid from ai_dataset_versions where name=p_name and version=p_version;
 if found then if (select array_agg(example_id order by example_id) from ai_dataset_members where dataset_id=rid) is distinct from (select array_agg(x order by x) from unnest(p_examples)x) then raise exception 'Immutable dataset version conflict';end if;return rid;end if;
 perform 1 from ai_feedback f join ai_learning_candidates c on c.feedback_id=f.id join ai_training_examples e on e.candidate_id=c.id where e.id=any(p_examples) order by f.id for share of f;
 insert into ai_dataset_versions(name,version,created_by) values(p_name,p_version,auth.uid()) returning id into rid;
 foreach eid in array p_examples loop insert into ai_dataset_members(dataset_id,example_id) values(rid,eid);end loop;
 if not m2_dataset_valid(rid) then raise exception 'Dataset contains withdrawn or unapproved examples';end if;
 insert into ai_learning_events(action,source_id,actor_user_id) values('DATASET_VERSION_CREATED',rid,auth.uid());return rid;
end $$;
create function m2_export(p_dataset uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform 1 from ai_feedback f join ai_learning_candidates c on c.feedback_id=f.id join ai_training_examples e on e.candidate_id=c.id join ai_dataset_members m on m.example_id=e.id where m.dataset_id=p_dataset order by f.id for share of f;
 if not m2_dataset_valid(p_dataset) then raise exception 'Dataset consent withdrawn or dataset unavailable';end if;
 insert into ai_learning_events(action,source_id) values('OFFLINE_DATASET_EXPORTED',p_dataset);
 return jsonb_build_object('dataset_version_id',p_dataset,'examples',(select jsonb_agg(e.deidentified_content order by e.id) from ai_dataset_members m join ai_training_examples e on e.id=m.example_id where m.dataset_id=p_dataset),'review_method','HUMAN_DEIDENTIFICATION_ATTESTATION','notice','Only reviewed examples are exported. Manual de-identification is not an automated guarantee. Withdrawal blocks future exports and serving of linked checkpoints; previously exported copies require operator deletion.');
end $$;
create function m2_training(p_dataset uuid,p_recipe text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if auth.uid() is null or not is_admin() or not m2_dataset_valid(p_dataset) or p_recipe is null or p_recipe!~'^[A-Za-z0-9_.-]{3,100}$' then raise exception 'Approved active dataset and offline recipe reference required';end if;
 insert into ai_training_runs(dataset_id,recipe_ref,requested_by) values(p_dataset,p_recipe,auth.uid()) returning id into rid;
 insert into ai_learning_events(action,source_id,actor_user_id) values('OFFLINE_TRAINING_REQUESTED',rid,auth.uid());return rid;
end $$;
create function m2_training_result(p_run uuid,p_external text,p_state text,p_sha256 text default null) returns void language plpgsql security definer set search_path=public as $$
declare r ai_training_runs;
begin
 select * into r from ai_training_runs where id=p_run for update;
 if not found or not m2_dataset_valid(r.dataset_id) or p_external is null or length(p_external) not between 3 and 200 or p_state is null or p_state not in ('RUNNING','COMPLETED','FAILED') then raise exception 'Active dataset and real offline run evidence required';end if;
 if r.state=p_state and r.external_run=p_external and r.artifact_sha256 is not distinct from p_sha256 then return;end if;
 if (r.external_run is not null and r.external_run<>p_external) or not ((r.state='REQUESTED' and p_state='RUNNING') or (r.state='RUNNING' and p_state in ('COMPLETED','FAILED'))) then raise exception 'Invalid offline training transition';end if;
 if p_state='COMPLETED' and (p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$') then raise exception 'Completed artifact hash required';end if;
 update ai_training_runs set state=p_state,external_run=p_external,artifact_sha256=p_sha256,completed_at=case when p_state in ('COMPLETED','FAILED') then now() end where id=r.id;
 insert into ai_learning_events(action,source_id,metadata) values('OFFLINE_TRAINING_'||p_state,r.id,jsonb_build_object('external_run',p_external));
end $$;
create function m2_checkpoint(p_model uuid,p_run uuid) returns void language plpgsql security definer set search_path=public as $$
declare m ai_model_versions;r ai_training_runs;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Governance reviewer required';end if;
 select * into m from ai_model_versions where id=p_model for share;select * into r from ai_training_runs where id=p_run for share;
 if m.id is null or r.id is null or m.provider_kind<>'OWN_MODEL' or r.state<>'COMPLETED' or not m2_dataset_valid(r.dataset_id) or m.artifact_sha256 is distinct from r.artifact_sha256 then raise exception 'Completed matching owned-model checkpoint required';end if;
 if exists(select 1 from ai_training_checkpoints where model_version_id=m.id and training_run_id<>r.id) then raise exception 'Immutable checkpoint lineage conflict';end if;
 insert into ai_training_checkpoints(model_version_id,training_run_id,linked_by) values(m.id,r.id,auth.uid()) on conflict(model_version_id) do nothing;
end $$;
alter function m1_eligible(uuid,text,text) rename to m2_base_eligible;
create function m1_eligible(p_model uuid,p_capability text,p_language text) returns boolean language sql stable security definer set search_path=public as $$
 select m2_base_eligible(p_model,p_capability,p_language) and not exists(select 1 from ai_training_checkpoints c join ai_training_runs r on r.id=c.training_run_id where c.model_version_id=p_model and not m2_dataset_valid(r.dataset_id))
$$;
create function m2_candidates(p_limit integer default 30) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() or p_limit is null or p_limit not between 1 and 100 then raise exception 'Governance reviewer required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,c.state,f.feedback,f.created_at from ai_learning_candidates c join ai_feedback f on f.id=c.feedback_id where c.state='PENDING_REVIEW' and f.withdrawn_at is null and f.training_opt_in order by f.created_at,c.id limit p_limit)x),'[]');
end $$;
revoke all on function m2_feedback(uuid,text,boolean,uuid),m2_withdraw(uuid),m2_review(uuid,jsonb,text,boolean),m2_dataset_valid(uuid),m2_dataset(text,text,uuid[]),m2_export(uuid),m2_training(uuid,text),m2_training_result(uuid,text,text,text),m2_checkpoint(uuid,uuid),m2_base_eligible(uuid,text,text),m1_eligible(uuid,text,text),m2_candidates(integer) from public,anon,authenticated;
grant execute on function m2_feedback(uuid,text,boolean,uuid),m2_withdraw(uuid),m2_review(uuid,jsonb,text,boolean),m2_dataset(text,text,uuid[]),m2_training(uuid,text),m2_checkpoint(uuid,uuid),m2_candidates(integer) to authenticated;
grant execute on function m2_export(uuid),m2_training_result(uuid,text,text,text) to service_role;
commit;
