-- 012: bounded directory contracts; person != practice != availability.
begin;
alter table provider_practices add column district text;
create index d1_practice_city on provider_practices(lower(city),id) where active;
create index d1_practice_state on provider_practices(lower(state),id) where active;
create index d1_practice_lat on provider_practices(latitude) where active;
create index d1_doctor_name on provider_profiles(lower(full_name) text_pattern_ops) where provider_type='DOCTOR' and verification_status='APPROVED';
create index d1_doctor_hpr on provider_profiles(hpr_id) where provider_type='DOCTOR';
create index d1_facility_city on facilities(lower(city),id) where verification_status='APPROVED';
create index d1_facility_lat on facilities(latitude) where verification_status='APPROVED';
create function d1_distance(p_lat double precision,p_lon double precision,p_target_lat double precision,p_target_lon double precision) returns double precision language sql immutable strict set search_path=public as $$
 select 6371.0088*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(p_target_lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(p_target_lat))*power(sin(radians(p_target_lon-p_lon)/2),2)))))
$$;
create function d1_validate_filters(p jsonb) returns void language plpgsql immutable set search_path=public as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or length(p::text)>3000 then raise exception 'Invalid discovery filters';end if;
 if (p ? 'latitude' or p ? 'longitude' or p ? 'radius_km') and
 ((p->>'latitude') is null or (p->>'longitude') is null or (p->>'radius_km') is null or not ((p->>'latitude')::double precision between -90 and 90) or not ((p->>'longitude')::double precision between -180 and 180) or not ((p->>'radius_km')::double precision between 0.1 and 500)) then raise exception 'Valid coordinates and radius required';end if;
 if p ? 'mode' and (p->>'mode' is null or p->>'mode' not in ('PHYSICAL','TELECONSULT')) then raise exception 'Invalid consultation mode';end if;
 if coalesce((p->>'min_fee')::numeric,0)<0 or coalesce((p->>'max_fee')::numeric,0)<0 or (p->>'min_fee')::numeric>(p->>'max_fee')::numeric then raise exception 'Invalid fee range';end if;
 if length(coalesce(p->>'search',''))>100 then raise exception 'Search is too long';end if;
end $$;

create function d1_directory_slots(p_practice uuid,p_mode text) returns table(scheduled_at timestamptz) language plpgsql stable security definer set search_path=public as $$
begin
 if not exists(select 1 from provider_practices p join provider_profiles d on d.id=p.provider_id where p.id=p_practice and p.active and d.verification_status='APPROVED' and d.provider_type='DOCTOR' and p.consultation_mode in(p_mode,'BOTH') and (p.facility_id is null or exists(select 1 from facilities f where f.id=p.facility_id and f.verification_status='APPROVED'))) then return;end if;
 return query select s.scheduled_at from a2_available_slots(p_practice,p_mode) s order by s.scheduled_at limit 1;
end $$;
revoke all on function d1_directory_slots(uuid,text) from public,anon,authenticated;
create function d1_practices(p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 25)
returns table(practice_id uuid,doctor_id uuid,doctor_name text,hpr_id text,specialization text,practice_name text,facility_id uuid,address text,city text,district text,state text,postal_code text,latitude double precision,longitude double precision,distance_km double precision,mode text,consultation_fee numeric,timezone text,next_slot timestamptz,availability_state text,checked_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid authenticated directory request';end if;
 perform d1_validate_filters(p_filters);
 if exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('search','hpr','specialization','facility_id','city','district','state','postal_code','latitude','longitude','radius_km','mode','min_fee','max_fee','has_slot')) then raise exception 'Unknown practice filter';end if;
 return query select pr.id,pp.id,pp.full_name,pp.hpr_id,pp.specialization,pr.practice_name,pr.facility_id,pr.address_line,pr.city,pr.district,pr.state,pr.postal_code,pr.latitude,pr.longitude,d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,pr.latitude,pr.longitude),pr.consultation_mode,pr.consultation_fee,pr.timezone,slot.scheduled_at,case when slot.scheduled_at is not null then 'NEXT_KNOWN_SLOT' else 'AVAILABILITY_UNKNOWN' end,now()
 from provider_practices pr join provider_profiles pp on pp.id=pr.provider_id
 left join lateral (select s.scheduled_at from d1_directory_slots(pr.id,coalesce(p_filters->>'mode',case when pr.consultation_mode='TELECONSULT' then 'TELECONSULT' else 'PHYSICAL' end)) s order by s.scheduled_at limit 1) slot on true
 where pr.active and pp.provider_type='DOCTOR' and pp.verification_status='APPROVED'
 and (pr.facility_id is null or exists(select 1 from facilities f where f.id=pr.facility_id and f.verification_status='APPROVED'))
 and (not p_filters ? 'search' or lower(pp.full_name) like lower(replace(replace(replace(p_filters->>'search','\','\\'),'%','\%'),'_','\_'))||'%')
 and (not p_filters ? 'hpr' or pp.hpr_id=p_filters->>'hpr')
 and (not p_filters ? 'specialization' or lower(pp.specialization)=lower(p_filters->>'specialization'))
 and (not p_filters ? 'facility_id' or pr.facility_id=(p_filters->>'facility_id')::uuid)
 and (not p_filters ? 'city' or lower(pr.city)=lower(p_filters->>'city'))
 and (not p_filters ? 'district' or lower(pr.district)=lower(p_filters->>'district'))
 and (not p_filters ? 'state' or lower(pr.state)=lower(p_filters->>'state'))
 and (not p_filters ? 'postal_code' or pr.postal_code=p_filters->>'postal_code')
 and (not p_filters ? 'mode' or pr.consultation_mode in (p_filters->>'mode','BOTH'))
 and (not p_filters ? 'min_fee' or pr.consultation_fee>=(p_filters->>'min_fee')::numeric)
 and (not p_filters ? 'max_fee' or pr.consultation_fee<=(p_filters->>'max_fee')::numeric)
 and (not p_filters ? 'latitude' or (pr.latitude between (p_filters->>'latitude')::float8-(p_filters->>'radius_km')::float8/111.0-0.01 and (p_filters->>'latitude')::float8+(p_filters->>'radius_km')::float8/111.0+0.01 and d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,pr.latitude,pr.longitude)<=(p_filters->>'radius_km')::float8))
 and (not coalesce((p_filters->>'has_slot')::boolean,false) or slot.scheduled_at is not null)
 order by d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,pr.latitude,pr.longitude) nulls last,pr.id limit p_limit offset p_offset;
end $$;
create function d1_facilities(p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 25)
returns table(facility_id uuid,name text,facility_type text,address text,city text,district text,state text,postal_code text,latitude double precision,longitude double precision,distance_km double precision,operating_state text)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid authenticated directory request';end if;
 perform d1_validate_filters(p_filters);
 if exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('search','type','city','district','state','postal_code','latitude','longitude','radius_km','diagnostic_test_id')) then raise exception 'Unknown facility filter';end if;
 return query select f.id,f.name,f.facility_type,f.address_text,f.city,f.district,f.state,f.postal_code,f.latitude,f.longitude,d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,f.latitude,f.longitude),'STATUS_UNKNOWN_CONFIRMATION_REQUIRED'::text
 from facilities f join provider_profiles owner on owner.user_id=f.owner_user_id
 where f.verification_status='APPROVED' and owner.verification_status='APPROVED'
 and (not p_filters ? 'search' or starts_with(lower(f.name),lower(p_filters->>'search')))
 and (not p_filters ? 'type' or f.facility_type=p_filters->>'type')
 and (not p_filters ? 'city' or lower(f.city)=lower(p_filters->>'city'))
 and (not p_filters ? 'district' or lower(f.district)=lower(p_filters->>'district'))
 and (not p_filters ? 'state' or lower(f.state)=lower(p_filters->>'state'))
 and (not p_filters ? 'postal_code' or f.postal_code=p_filters->>'postal_code')
 and (not p_filters ? 'latitude' or (f.latitude between (p_filters->>'latitude')::float8-(p_filters->>'radius_km')::float8/111.0-0.01 and (p_filters->>'latitude')::float8+(p_filters->>'radius_km')::float8/111.0+0.01 and d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,f.latitude,f.longitude)<=(p_filters->>'radius_km')::float8))
 and (not p_filters ? 'diagnostic_test_id' or exists(select 1 from lab_test_capabilities c where c.lab_provider_id=owner.id and c.active and c.diagnostic_test_id=(p_filters->>'diagnostic_test_id')::uuid) or exists(select 1 from collection_centres cc join collection_centre_tests ct on ct.collection_centre_id=cc.id where cc.facility_id=f.id and cc.active and ct.active and ct.diagnostic_test_id=(p_filters->>'diagnostic_test_id')::uuid))
 order by d1_distance((p_filters->>'latitude')::float8,(p_filters->>'longitude')::float8,f.latitude,f.longitude) nulls last,f.id limit p_limit offset p_offset;
end $$;
revoke all on function d1_distance(float8,float8,float8,float8),d1_validate_filters(jsonb),d1_practices(jsonb,integer,integer),d1_facilities(jsonb,integer,integer) from public,anon,authenticated;
grant execute on function d1_practices(jsonb,integer,integer),d1_facilities(jsonb,integer,integer) to authenticated;
commit;
