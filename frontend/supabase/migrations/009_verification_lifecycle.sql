-- 009: one authoritative provider verification lifecycle, mirrored to owned places.
-- Run as an ordered migration, outside a surrounding transaction (enum extension).
alter type public.verification_status add value if not exists 'REVOKED';
begin;
create table public.verification_reviews (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(id),
 request_key uuid not null unique, reviewer_id uuid references auth.users(id),
 from_status text not null, to_status text not null, reason text not null check(length(reason) between 3 and 2000),
 notes text check(length(notes)<=4000), facility_states jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.verification_documents (
 id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.provider_profiles(id),
 submitted_by uuid not null references auth.users(id), request_key uuid not null unique,
 document_kind text not null check(document_kind in ('REGISTRATION','QUALIFICATION','LICENSE','OTHER')),
 reference text not null check(length(reference) between 3 and 1000),
 sha256 text check(sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now()
);
create index verification_reviews_provider_time on public.verification_reviews(provider_id,created_at desc);
create index verification_documents_provider_time on public.verification_documents(provider_id,created_at desc);
alter table public.verification_reviews enable row level security;
alter table public.verification_documents enable row level security;
revoke all on public.verification_reviews,public.verification_documents from public,anon,authenticated;
grant select on public.verification_reviews,public.verification_documents to authenticated;
create policy verification_reviews_read on public.verification_reviews for select to authenticated using(public.is_admin() or provider_id=public.my_provider_id());
create policy verification_documents_read on public.verification_documents for select to authenticated using(public.is_admin() or provider_id=public.my_provider_id());

-- Preserve the discrepancy as evidence; do not infer approval from a place's old state.
insert into public.verification_reviews(provider_id,request_key,from_status,to_status,reason,facility_states)
select p.id,gen_random_uuid(),p.verification_status::text,
 case when p.verification_status='APPROVED' then 'PENDING' else p.verification_status::text end,
 'Migration alignment; conflicting approvals require re-review',jsonb_agg(jsonb_build_object('id',f.id,'status',f.verification_status))
from public.provider_profiles p join public.facilities f on f.owner_user_id=p.user_id
where f.verification_status<>p.verification_status group by p.id;
update public.provider_profiles p set verification_status='PENDING',updated_at=now()
where p.verification_status='APPROVED' and exists(select 1 from public.facilities f where f.owner_user_id=p.user_id and f.verification_status<>'APPROVED');
update public.facilities f set verification_status=p.verification_status from public.provider_profiles p
where f.owner_user_id=p.user_id and f.verification_status<>p.verification_status;

-- All writes, including existing registration RPCs, follow the same authority.
create function public.v1_facility_state_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare s public.verification_status;
begin
 select verification_status into s from provider_profiles where user_id=new.owner_user_id for share;
 if s is null then
   if new.verification_status='APPROVED' then raise exception 'Approved facility requires an accountable provider'; end if;
 else
   if tg_op='UPDATE' and new.verification_status<>s then raise exception 'Use provider verification transition'; end if;
   new.verification_status:=s;
 end if;
 if new.identity_source='DEMO' and new.registry_verified then raise exception 'Demo identity is not registry verified'; end if;
 return new;
end $$;
create trigger v1_facility_state before insert or update of verification_status,owner_user_id,identity_source,registry_verified on public.facilities for each row execute function public.v1_facility_state_guard();
create function public.v1_sync_provider_state() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.identity_source='DEMO' and new.registry_verified then raise exception 'Demo identity is not registry verified'; end if;
 update facilities set verification_status=new.verification_status where owner_user_id=new.user_id and verification_status<>new.verification_status;
 return new;
end $$;
create trigger v1_provider_state after insert or update of verification_status,identity_source,registry_verified on public.provider_profiles for each row execute function public.v1_sync_provider_state();

create function public.v1_submit_document(p_kind text,p_reference text,p_sha256 text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid:=my_provider_id(); d verification_documents;
begin
 if pid is null or p_request is null then raise exception 'Provider and request key required'; end if;
 perform 1 from provider_profiles where id=pid for update;
 select * into d from verification_documents where request_key=p_request;
 if found then
  if d.provider_id<>pid or d.document_kind is distinct from p_kind or d.reference is distinct from p_reference or d.sha256 is distinct from p_sha256 then raise exception 'Request key conflict'; end if;
  return d.id;
 end if;
 insert into verification_documents(provider_id,submitted_by,request_key,document_kind,reference,sha256)
 values(pid,auth.uid(),p_request,p_kind,p_reference,p_sha256) returning id into d.id;
 return d.id;
end $$;

create function public.v1_review_provider(p_provider uuid,p_status text,p_reason text,p_notes text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p provider_profiles; r verification_reviews; rid uuid; states jsonb;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Administrator required'; end if;
 if p_request is null or p_status is null or p_status not in ('PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED') or p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'Valid status, reason and request key required'; end if;
 select * into p from provider_profiles where id=p_provider for update;
 if not found then raise exception 'Provider not found'; end if;
 select * into r from verification_reviews where request_key=p_request;
 if found then
  if r.provider_id<>p_provider or r.reviewer_id is distinct from auth.uid() or r.to_status<>p_status or r.reason<>trim(p_reason) or r.notes is distinct from p_notes then raise exception 'Request key conflict'; end if;
  return r.id;
 end if;
 if not ((p.verification_status='PENDING' and p_status in ('APPROVED','REJECTED','REVOKED'))
  or (p.verification_status='APPROVED' and p_status in ('SUSPENDED','REVOKED'))
  or (p.verification_status in ('REJECTED','SUSPENDED','REVOKED') and p_status='PENDING')) then raise exception 'Invalid verification transition; restore requires re-review'; end if;
 if p_status='APPROVED' and not exists(select 1 from verification_documents where provider_id=p_provider) then raise exception 'Verification evidence metadata required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',verification_status)),'[]') into states from facilities where owner_user_id=p.user_id;
 update provider_profiles set verification_status=p_status::verification_status,verification_notes=p_notes,updated_at=now() where id=p_provider;
 insert into verification_reviews(provider_id,request_key,reviewer_id,from_status,to_status,reason,notes,facility_states)
 values(p_provider,p_request,auth.uid(),p.verification_status::text,p_status,trim(p_reason),p_notes,states) returning id into rid;
 return rid;
end $$;
revoke all on function public.v1_facility_state_guard(),public.v1_sync_provider_state(),public.v1_submit_document(text,text,text,uuid),public.v1_review_provider(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.v1_submit_document(text,text,text,uuid),public.v1_review_provider(uuid,text,text,text,uuid) to authenticated;

create function public.v1_verification_queue(p_status text default 'PENDING',p_offset integer default 0)
returns table(provider_id uuid,provider_type public.app_role,full_name text,verification_status public.verification_status,identity_source text,registry_verified boolean,submitted_documents bigint,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() or auth.uid() is null then raise exception 'Administrator required'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 or p_status is null or p_status not in ('PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED') then raise exception 'Invalid queue filter'; end if;
 return query select p.id,p.provider_type,p.full_name,p.verification_status,p.identity_source,p.registry_verified,
 (select count(*) from verification_documents d where d.provider_id=p.id),p.created_at
 from provider_profiles p where p.verification_status::text=p_status order by p.created_at,p.id limit 50 offset p_offset;
end $$;
revoke all on function public.v1_verification_queue(text,integer) from public,anon,authenticated;
grant execute on function public.v1_verification_queue(text,integer) to authenticated;
commit;
