-- 038: reversible, consented identity aliasing. Source rows and authorization identities never move.
begin;
create table patient_identity_candidates(id uuid primary key default gen_random_uuid(),alias_patient_id uuid not null references patient_profiles(id),canonical_patient_id uuid not null references patient_profiles(id),evidence_reference text not null,alias_fingerprint text not null,canonical_fingerprint text not null,alias_confirmed boolean not null default false,canonical_confirmed boolean not null default false,state text not null default 'PROPOSED' check(state in ('PROPOSED','LINKED','REJECTED','UNLINKED')),created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),review_note text,request_key uuid not null unique,created_at timestamptz not null default now(),check(alias_patient_id<>canonical_patient_id));
create table patient_identity_links(id uuid primary key default gen_random_uuid(),candidate_id uuid not null unique references patient_identity_candidates(id),alias_patient_id uuid not null references patient_profiles(id),canonical_patient_id uuid not null references patient_profiles(id),active boolean not null default true,linked_at timestamptz not null default now(),unlinked_at timestamptz,check(alias_patient_id<>canonical_patient_id));
create unique index x1_active_alias on patient_identity_links(alias_patient_id) where active;
create table patient_identity_events(id uuid primary key default gen_random_uuid(),candidate_id uuid not null references patient_identity_candidates(id),action text not null,note text not null,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['patient_identity_candidates','patient_identity_links','patient_identity_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function x1_fingerprint(p_patient uuid) returns text language sql stable security definer set search_path=public as $$select md5(jsonb_build_object('user_id',user_id,'full_name',full_name,'date_of_birth',date_of_birth,'sex',sex,'patient_code',patient_code)::text) from patient_profiles where id=p_patient$$;
create function x1_propose(p_alias uuid,p_canonical uuid,p_evidence text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r patient_identity_candidates;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_alias is null or p_canonical is null or p_alias=p_canonical or p_request is null or p_evidence is null or length(trim(p_evidence)) not between 10 and 2000 then raise exception 'Governance duplicate evidence and distinct source identities required';end if;
 perform 1 from patient_profiles where id in (p_alias,p_canonical) order by id for share;
 if x1_fingerprint(p_alias) is null or x1_fingerprint(p_canonical) is null then raise exception 'Both source identities must exist';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,38));select * into r from patient_identity_candidates where request_key=p_request;
 if found then if (r.alias_patient_id,r.canonical_patient_id,r.evidence_reference) is distinct from (p_alias,p_canonical,trim(p_evidence)) then raise exception 'Identity proposal conflict';end if;return r.id;end if;
 insert into patient_identity_candidates(alias_patient_id,canonical_patient_id,evidence_reference,alias_fingerprint,canonical_fingerprint,created_by,request_key) values(p_alias,p_canonical,trim(p_evidence),x1_fingerprint(p_alias),x1_fingerprint(p_canonical),auth.uid(),p_request) returning id into rid;
 insert into patient_identity_events(candidate_id,action,note,actor_user_id) values(rid,'PROPOSED','Human duplicate identity review requested',auth.uid());return rid;
end $$;
create function x1_decide(p_candidate uuid,p_confirm boolean) returns void language plpgsql security definer set search_path=public as $$
declare r patient_identity_candidates;own_alias boolean;own_canonical boolean;
begin
 select * into r from patient_identity_candidates where id=p_candidate for update;
 own_alias:=exists(select 1 from patient_profiles where id=r.alias_patient_id and user_id=auth.uid());own_canonical:=exists(select 1 from patient_profiles where id=r.canonical_patient_id and user_id=auth.uid());
 if r.id is null or not (own_alias or own_canonical) or p_confirm is null then raise exception 'Source identity owner confirmation required';end if;
 if p_confirm then
 if r.state<>'PROPOSED' then raise exception 'Identity proposal is no longer pending';end if;
 update patient_identity_candidates set alias_confirmed=alias_confirmed or own_alias,canonical_confirmed=canonical_confirmed or own_canonical where id=r.id;
 else
 if r.state in ('REJECTED','UNLINKED') then return;end if;
 update patient_identity_links set active=false,unlinked_at=now() where candidate_id=r.id and active;
 update patient_identity_candidates set state=case when r.state='LINKED' then 'UNLINKED' else 'REJECTED' end,alias_confirmed=case when own_alias then false else alias_confirmed end,canonical_confirmed=case when own_canonical then false else canonical_confirmed end where id=r.id;
 end if;
 insert into patient_identity_events(candidate_id,action,note,actor_user_id) values(r.id,case when p_confirm then 'OWNER_CONFIRMED' else 'OWNER_WITHDREW' end,'No source rows or access privileges changed',auth.uid());
end $$;
create function x1_link(p_candidate uuid,p_note text) returns uuid language plpgsql security definer set search_path=public as $$
declare r patient_identity_candidates;rid uuid;
begin
 if auth.uid() is null or not is_admin() or p_note is null or length(trim(p_note)) not between 10 and 4000 then raise exception 'Governance identity review required';end if;
 -- Serialize topology changes to prevent concurrent cycles and canonical-chain races.
 perform pg_advisory_xact_lock(380038);select * into r from patient_identity_candidates where id=p_candidate for update;
 if r.id is null then raise exception 'Identity proposal missing';end if;
 if r.state='LINKED' then select id into rid from patient_identity_links where candidate_id=r.id and active;return rid;end if;
 if r.state<>'PROPOSED' or not r.alias_confirmed or not r.canonical_confirmed then raise exception 'Both identity owners must explicitly confirm';end if;
 perform 1 from patient_profiles where id in (r.alias_patient_id,r.canonical_patient_id) order by id for share;
 if x1_fingerprint(r.alias_patient_id) is distinct from r.alias_fingerprint or x1_fingerprint(r.canonical_patient_id) is distinct from r.canonical_fingerprint then raise exception 'Source identity changed; new reviewed proposal required';end if;
 if exists(select 1 from patient_identity_links where active and (alias_patient_id in (r.alias_patient_id,r.canonical_patient_id) or canonical_patient_id=r.alias_patient_id)) then raise exception 'Identity alias cycle or existing canonical topology conflict';end if;
 insert into patient_identity_links(candidate_id,alias_patient_id,canonical_patient_id) values(r.id,r.alias_patient_id,r.canonical_patient_id) returning id into rid;
 update patient_identity_candidates set state='LINKED',reviewed_by=auth.uid(),review_note=trim(p_note) where id=r.id;
 insert into patient_identity_events(candidate_id,action,note,actor_user_id) values(r.id,'LINKED',trim(p_note),auth.uid());return rid;
end $$;
create function x1_unlink(p_candidate uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare r patient_identity_candidates;
begin
 if auth.uid() is null or not is_admin() or p_reason is null or length(trim(p_reason)) not between 10 and 4000 then raise exception 'Governance unmerge reason required';end if;
 perform pg_advisory_xact_lock(380038);select * into r from patient_identity_candidates where id=p_candidate for update;
 if r.id is null or r.state not in ('LINKED','UNLINKED') then raise exception 'Linked identity required';end if;
 if r.state='UNLINKED' then return;end if;
 update patient_identity_links set active=false,unlinked_at=now() where candidate_id=r.id and active;
 update patient_identity_candidates set state='UNLINKED' where id=r.id;
 insert into patient_identity_events(candidate_id,action,note,actor_user_id) values(r.id,'UNLINKED',trim(p_reason),auth.uid());
end $$;
create function x1_candidates() returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null then raise exception 'Authenticated identity access required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,c.alias_patient_id,c.canonical_patient_id,c.alias_confirmed,c.canonical_confirmed,c.state,c.created_at,case when is_admin() then c.evidence_reference end evidence_reference,
 a.patient_code alias_patient_code,a.full_name alias_name,p.patient_code canonical_patient_code,p.full_name canonical_name
 from patient_identity_candidates c join patient_profiles a on a.id=c.alias_patient_id join patient_profiles p on p.id=c.canonical_patient_id where is_admin() or a.user_id=auth.uid() or p.user_id=auth.uid() order by c.created_at desc,c.id limit 50)x),'[]');
end $$;
create function x1_identity(p_patient uuid) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not (auth.uid() is not null and (is_admin() or exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()))) then raise exception 'Own source identity or governance access required';end if;
 return jsonb_build_object('source_patient_id',p_patient,'canonical_reference',coalesce((select canonical_patient_id from patient_identity_links where alias_patient_id=p_patient and active),p_patient),'authorization_patient_id',p_patient,'notice','Alias reference only. Source records, consent and access remain bound to original patient identity. No clinical history was moved or combined.');
end $$;
revoke all on function x1_fingerprint(uuid),x1_propose(uuid,uuid,text,uuid),x1_decide(uuid,boolean),x1_link(uuid,text),x1_unlink(uuid,text),x1_candidates(),x1_identity(uuid) from public,anon,authenticated;
grant execute on function x1_propose(uuid,uuid,text,uuid),x1_decide(uuid,boolean),x1_link(uuid,text),x1_unlink(uuid,text),x1_candidates(),x1_identity(uuid) to authenticated;
commit;
