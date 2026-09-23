-- 021: operational frontend context without exposing membership tables.
begin;
create function h1_my_facilities(p_offset integer default 0,p_limit integer default 50)
returns table(facility_id uuid,facility_name text,facility_type text,role text,membership_state text,verification_status text,operational_access boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Valid authenticated facility context required';end if;
 return query select f.id,f.name,f.facility_type,case when f.owner_user_id=auth.uid() then 'OWNER' else m.staff_role end,case when f.owner_user_id=auth.uid() then 'OWNER' else 'ACTIVE' end,f.verification_status::text,h1_staff(f.id,array['MANAGER','RECEPTION','CLINICIAN'])
 from facilities f left join facility_memberships m on m.facility_id=f.id and m.user_id=auth.uid() and m.active
 where f.owner_user_id=auth.uid() or m.id is not null order by f.name,f.id limit p_limit offset p_offset;
end $$;
revoke all on function h1_my_facilities(integer,integer) from public,anon,authenticated;
grant execute on function h1_my_facilities(integer,integer) to authenticated;
commit;
