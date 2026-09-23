-- Controlled synthetic namespaces only. Ordinary example.com accounts are protected.
begin;
set local lock_timeout='10s';
set local statement_timeout='120s';
create temporary table cleanup_rows(rel oid,row_key jsonb,primary key(rel,row_key));
create temporary table cleanup_keys as
 select i.indrelid rel,array_agg(a.attname order by k.ord) columns
 from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
 cross join lateral unnest(i.indkey) with ordinality k(attnum,ord)
 join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
 where i.indisprimary and n.nspname in ('public','auth') group by i.indrelid;
-- Stable primary keys survive trigger updates; exclude concurrent writes during cleanup.
do $$declare t record;begin
 for t in with recursive related(rel) as (
  select unnest(array['auth.users'::regclass::oid,'public.facilities'::regclass::oid])
  union select fk.conrelid from pg_constraint fk join related r on r.rel=fk.confrelid where fk.contype='f'
 ) select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','auth') and c.relkind='r' and c.oid in(select rel from related) order by c.oid loop
 execute format('lock table %s in share row exclusive mode',t.oid::regclass);
 end loop;
end $$;
insert into cleanup_rows select 'auth.users'::regclass,jsonb_build_object('id',id) from auth.users
 where lower(email) like 'swasthyasetu.test.%@example.com' or lower(email) like 'test.staging.%@example.com';
insert into cleanup_rows select 'facilities'::regclass,jsonb_build_object('id',id) from facilities where name like 'TEST DEMO %';
create function pg_temp.cleanup_capture() returns void language plpgsql as $$
declare fk record; added integer; total_added integer; predicate text;
begin
 loop
  total_added:=0;
  for fk in select c.*,k.columns from pg_constraint c join cleanup_keys k on k.rel=c.conrelid where c.contype='f' loop
   select string_agg(format('child.%I=parent.%I',a.attname,b.attname),' and ') into predicate
   from unnest(fk.conkey,fk.confkey) x(child_col,parent_col)
   join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=x.child_col
   join pg_attribute b on b.attrelid=fk.confrelid and b.attnum=x.parent_col;
   execute format('insert into cleanup_rows select %s,(select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(child)) where key=any($1)) from %s child join %s parent on %s join cleanup_rows roots on roots.rel=%s and to_jsonb(parent) @> roots.row_key on conflict do nothing',fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,predicate,fk.confrelid) using fk.columns;
   get diagnostics added=row_count; total_added:=total_added+added;
  end loop;
  exit when total_added=0;
 end loop;
end $$;
select pg_temp.cleanup_capture();
-- Refuse deletion of legitimate profiles and patient workflows linked to synthetic actors.
do $$declare t record; unsafe_count bigint;begin
 if exists(select 1 from patient_profiles p join cleanup_rows r on r.rel='patient_profiles'::regclass and to_jsonb(p) @> r.row_key
  where not exists(select 1 from cleanup_rows u where u.rel='auth.users'::regclass and u.row_key->>'id'=p.user_id::text))
 or exists(select 1 from provider_profiles p join cleanup_rows r on r.rel='provider_profiles'::regclass and to_jsonb(p) @> r.row_key
  where not exists(select 1 from cleanup_rows u where u.rel='auth.users'::regclass and u.row_key->>'id'=p.user_id::text))
 then raise exception 'Cleanup touches a protected legitimate profile';end if;
 for t in select distinct r.rel from cleanup_rows r join pg_attribute a on a.attrelid=r.rel and a.attname='patient_id' and not a.attisdropped loop
 execute format('select count(*) from %s x join cleanup_rows r on r.rel=%s and to_jsonb(x) @> r.row_key where x.patient_id is not null and not exists(select 1 from cleanup_rows p where p.rel=''patient_profiles''::regclass and p.row_key->>''id''=x.patient_id::text)',t.rel::regclass,t.rel) into unsafe_count;
 if unsafe_count>0 then raise exception 'Cleanup touches protected patient workflow';end if;
 end loop;
end $$;
create temporary table cleanup_report(mode text,cleanup_verified boolean,synthetic_auth_users bigint,synthetic_facilities bigint,synthetic_operational_rows bigint,selected_rows bigint);
do $$declare target record; removed integer; progress integer; remaining bigint;begin
 for attempt in 1..100 loop
  perform pg_temp.cleanup_capture();
  progress:=0;
  for target in select distinct rel from cleanup_rows order by rel loop
   begin
    execute format('delete from %s x using cleanup_rows r where r.rel=%s and to_jsonb(x) @> r.row_key',target.rel::regclass,target.rel);
    get diagnostics removed=row_count; progress:=progress+removed;
   exception when foreign_key_violation then null;
   when raise_exception then
    if sqlerrm not in ('Unresolved source patient','Approved facility requires an accountable provider') then raise;end if;
   end;
  end loop;
  if progress=0 then exit;end if;
 end loop;
 remaining:=0;
 for target in select distinct rel from cleanup_rows loop
  execute format('select count(*) from %s x join cleanup_rows r on r.rel=%s and to_jsonb(x) @> r.row_key',target.rel::regclass,target.rel) into removed;
  remaining:=remaining+removed;
 end loop;
 if remaining<>0 then raise exception 'Cleanup blocked: % captured operational rows remain',remaining;end if;
 insert into cleanup_report select 'ROLLBACK',true,
  (select count(*) from auth.users where lower(email) like 'swasthyasetu.test.%@example.com' or lower(email) like 'test.staging.%@example.com'),
  (select count(*) from facilities where name like 'TEST DEMO %'),remaining,(select count(*) from cleanup_rows);
 if exists(select 1 from cleanup_report where synthetic_auth_users<>0 or synthetic_facilities<>0) then raise exception 'Synthetic roots remain';end if;
end $$;
select * from cleanup_report;
rollback;
