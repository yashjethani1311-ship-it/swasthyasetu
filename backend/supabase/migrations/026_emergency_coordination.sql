-- 026: truthful emergency coordination; no inferred dispatch or bed reservation.
begin;
create table facility_capability_updates(facility_id uuid not null references facilities(id),capability_code text not null check(capability_code ~ '^[A-Z0-9_]{2,80}$'),available boolean,observed_at timestamptz not null,valid_until timestamptz not null,recorded_by uuid not null references auth.users(id),primary key(facility_id,capability_code),check(valid_until>observed_at));
create table emergency_requests(id uuid primary key default gen_random_uuid(),patient_id uuid not null references patient_profiles(id),episode_id uuid references care_episodes(id),requested_by uuid not null references auth.users(id),required_capabilities text[] not null,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),reason text not null,state text not null default 'OPEN' check(state in ('OPEN','FACILITY_CONFIRMED','ARRIVED','CLOSED')),accepted_facility_id uuid references facilities(id),transport_state text not null default 'NOT_REQUESTED' check(transport_state in ('NOT_REQUESTED','REQUESTED','CONFIRMED','DISPATCHED','ARRIVED','FAILED')),arrival_queue_id uuid references reception_queue(id),request_key uuid not null unique,created_at timestamptz not null default now());
create table emergency_contacts(id uuid primary key default gen_random_uuid(),request_id uuid not null references emergency_requests(id),facility_id uuid not null references facilities(id),state text not null default 'REQUESTED' check(state in ('REQUESTED','ACCEPTED','REJECTED')),response text,responded_by uuid references auth.users(id),responded_at timestamptz,created_at timestamptz not null default now(),unique(request_id,facility_id));
create table emergency_transport_events(id uuid primary key default gen_random_uuid(),request_id uuid not null references emergency_requests(id),event_key text not null unique,state text not null,source_reference text not null,original_payload jsonb not null,created_at timestamptz not null default now());
create index e1_contact_facility on emergency_contacts(facility_id,state,created_at);
do $$declare t text;begin foreach t in array array['facility_capability_updates','emergency_requests','emergency_contacts','emergency_transport_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function e1_capability(p_facility uuid,p_code text,p_available boolean,p_until timestamptz) returns void language plpgsql security definer set search_path=public as $$
begin
 if not h1_staff(p_facility,array['MANAGER']) or p_until is null or p_until<=now() or p_until>now()+interval '4 hours' then raise exception 'Facility authority and bounded freshness required';end if;
 insert into facility_capability_updates(facility_id,capability_code,available,observed_at,valid_until,recorded_by) values(p_facility,p_code,p_available,now(),p_until,auth.uid()) on conflict(facility_id,capability_code) do update set available=excluded.available,observed_at=excluded.observed_at,valid_until=excluded.valid_until,recorded_by=excluded.recorded_by;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(p_facility,auth.uid(),'CAPABILITY_RECORDED:'||p_code,p_facility,coalesce(p_available::text,'UNKNOWN'));
end $$;
create function e1_request(p_patient uuid,p_episode uuid,p_capabilities text[],p_latitude float8,p_longitude float8,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare prior emergency_requests;rid uuid;nid uuid;
begin
 if not exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()) and not (is_approved_provider('DOCTOR') and exists(select 1 from care_episodes where id=p_episode and patient_id=p_patient and doctor_provider_id=my_provider_id())) then raise exception 'Patient or actual episode clinician required';end if;
 if p_episode is not null and not exists(select 1 from care_episodes where id=p_episode and patient_id=p_patient) then raise exception 'Emergency episode patient mismatch';end if;
 if p_request is null or p_capabilities is null or cardinality(p_capabilities) not between 1 and 20 or exists(select 1 from unnest(p_capabilities)c where c is null or c!~'^[A-Z0-9_]{2,80}$') or p_reason is null or length(trim(p_reason)) not between 3 and 4000 then raise exception 'Explicit capability need and location required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,26));select * into prior from emergency_requests where request_key=p_request;
 if found then if prior.patient_id<>p_patient or prior.episode_id is distinct from p_episode or prior.required_capabilities<>p_capabilities or prior.latitude is distinct from p_latitude or prior.longitude is distinct from p_longitude or prior.reason<>trim(p_reason) or prior.requested_by<>auth.uid() then raise exception 'Emergency request conflict';end if;return prior.id;end if;
 insert into emergency_requests(patient_id,episode_id,requested_by,required_capabilities,latitude,longitude,reason,request_key) values(p_patient,p_episode,auth.uid(),p_capabilities,p_latitude,p_longitude,trim(p_reason),p_request) returning id into rid;
 if p_episode is not null then nid:=g1_put_node(p_episode,'EMERGENCY_COORDINATION','ENCOUNTERS','emergency_requests',rid,'IN_PROGRESS','FACILITY',now(),null,null);update care_nodes set occurred_at=now() where id=nid;end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(p_patient,'EMERGENCY_COORDINATION_REQUESTED','emergency_requests',rid,auth.uid());return rid;
end $$;
create function e1_requester(p_request uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from emergency_requests e where e.id=p_request and (e.requested_by=auth.uid() or exists(select 1 from patient_profiles p where p.id=e.patient_id and p.user_id=auth.uid())))$$;
create function e1_candidates(p_request uuid,p_radius_km float8 default 50,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r emergency_requests;
begin
 if not e1_requester(p_request) or p_radius_km is null or p_radius_km not between 0.1 and 500 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Emergency candidates not authorized';end if;
 select * into r from emergency_requests where id=p_request;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select f.id facility_id,f.name,d1_distance(r.latitude,r.longitude,f.latitude,f.longitude) distance_km,
 case when not exists(select 1 from unnest(r.required_capabilities)c where not exists(select 1 from facility_capability_updates u where u.facility_id=f.id and u.capability_code=c and u.available and u.valid_until>now())) then 'RECENTLY_RECORDED_CONFIRMATION_REQUIRED' else 'STATUS_UNKNOWN_CONFIRMATION_REQUIRED' end capability_state,
 (select count(*) from hospital_beds b where b.facility_id=f.id and b.state='AVAILABLE' and b.updated_at>now()-interval '4 hours') recently_recorded_available_beds,
 false bed_reserved
 from facilities f join provider_profiles owner on owner.user_id=f.owner_user_id where f.verification_status='APPROVED' and owner.verification_status='APPROVED' and d1_distance(r.latitude,r.longitude,f.latitude,f.longitude)<=p_radius_km and not exists(select 1 from unnest(r.required_capabilities)c where not exists(select 1 from facility_capability_updates u where u.facility_id=f.id and u.capability_code=c)) order by d1_distance(r.latitude,r.longitude,f.latitude,f.longitude),f.id limit 20 offset p_offset)x),'[]');
end $$;
create function e1_contact(p_request uuid,p_facility uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if not e1_requester(p_request) or not exists(select 1 from facilities f join provider_profiles owner on owner.user_id=f.owner_user_id where f.id=p_facility and f.verification_status='APPROVED' and owner.verification_status='APPROVED') then raise exception 'Authorized contact destination required';end if;
 perform 1 from emergency_requests where id=p_request and state='OPEN' for update;if not found then raise exception 'Emergency request no longer open';end if;
 insert into emergency_contacts(request_id,facility_id) values(p_request,p_facility) on conflict(request_id,facility_id) do nothing returning id into rid;if rid is null then select id into rid from emergency_contacts where request_id=p_request and facility_id=p_facility;end if;return rid;
end $$;
create function e1_respond(p_contact uuid,p_accept boolean,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare c emergency_contacts;r emergency_requests;
begin
 select * into c from emergency_contacts where id=p_contact;select * into r from emergency_requests where id=c.request_id for update;select * into c from emergency_contacts where id=p_contact for update;
 if not found or not h1_staff(c.facility_id,array['MANAGER','RECEPTION']) or p_accept is null or p_note is null or length(trim(p_note)) not between 3 and 4000 then raise exception 'Destination facility response required';end if;
 if c.state=(case when p_accept then 'ACCEPTED' else 'REJECTED' end) and c.response=trim(p_note) then return;end if;
 if c.state<>'REQUESTED' or r.state<>'OPEN' then raise exception 'Emergency contact already decided';end if;
 if p_accept and exists(select 1 from unnest(r.required_capabilities)need where not exists(select 1 from facility_capability_updates u where u.facility_id=c.facility_id and u.capability_code=need and u.available and u.valid_until>now())) then raise exception 'Fresh capability confirmation required';end if;
 update emergency_contacts set state=case when p_accept then 'ACCEPTED' else 'REJECTED' end,response=trim(p_note),responded_by=auth.uid(),responded_at=now() where id=c.id;
 if p_accept then update emergency_requests set state='FACILITY_CONFIRMED',accepted_facility_id=c.facility_id where id=r.id;end if;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(c.facility_id,auth.uid(),'EMERGENCY_RESPONSE',r.id,case when p_accept then 'ACCEPTED' else 'REJECTED' end);
end $$;
create function e1_transport_request(p_request uuid) returns text language plpgsql security definer set search_path=public as $$
begin
 if not e1_requester(p_request) then raise exception 'Transport request not authorized';end if;
 update emergency_requests set transport_state='REQUESTED' where id=p_request and state='FACILITY_CONFIRMED' and transport_state in ('NOT_REQUESTED','FAILED');
 if not found and not exists(select 1 from emergency_requests where id=p_request and transport_state='REQUESTED') then raise exception 'Confirmed facility required before transport coordination';end if;
 return 'EXTERNAL_TRANSPORT_CONFIRMATION_REQUIRED';
end $$;
create function e1_transport_event(p_request uuid,p_state text,p_reference text,p_payload jsonb,p_event_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare r emergency_requests;e emergency_transport_events;rid uuid;
begin
 select * into r from emergency_requests where id=p_request for update;
 if not found or p_reference is null or length(trim(p_reference)) not between 3 and 500 or p_event_key is null or length(p_event_key) not between 3 and 500 or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then raise exception 'Verified external transport event required';end if;
 select * into e from emergency_transport_events where event_key=p_event_key;if found then if e.request_id<>r.id or e.state is distinct from p_state or e.source_reference<>p_reference or e.original_payload<>p_payload then raise exception 'Transport event conflict';end if;return e.id;end if;
 if p_state is null or not ((r.transport_state='REQUESTED' and p_state in ('CONFIRMED','FAILED')) or (r.transport_state='CONFIRMED' and p_state in ('DISPATCHED','FAILED')) or (r.transport_state='DISPATCHED' and p_state in ('ARRIVED','FAILED'))) then raise exception 'Invalid transport transition';end if;
 update emergency_requests set transport_state=p_state where id=r.id;
 insert into emergency_transport_events(request_id,event_key,state,source_reference,original_payload) values(r.id,p_event_key,p_state,p_reference,p_payload) returning id into rid;return rid;
end $$;
create function e1_arrival(p_request uuid,p_queue uuid) returns void language plpgsql security definer set search_path=public as $$
declare r emergency_requests;q reception_queue;
begin
 select * into r from emergency_requests where id=p_request for update;
 if not found or not h1_staff(r.accepted_facility_id,array['MANAGER','RECEPTION']) then raise exception 'Destination reception required';end if;
 select * into q from reception_queue where id=p_queue and patient_id=r.patient_id and facility_id=r.accepted_facility_id and state not in ('CANCELLED','SKIPPED');if not found then raise exception 'Actual destination check-in required';end if;
 if r.state='ARRIVED' and r.arrival_queue_id=q.id then return;end if;if r.state<>'FACILITY_CONFIRMED' then raise exception 'Confirmed facility required';end if;
 update emergency_requests set state='ARRIVED',arrival_queue_id=q.id where id=r.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(r.patient_id,'EMERGENCY_PATIENT_ARRIVED','emergency_requests',r.id,auth.uid());
end $$;
create function e1_worklist(p_facility uuid,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION']) or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Facility emergency worklist not authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select c.id contact_id,c.state contact_state,r.id request_id,r.patient_id,r.required_capabilities,r.latitude,r.longitude,r.reason,r.state,r.transport_state,r.created_at from emergency_contacts c join emergency_requests r on r.id=c.request_id where c.facility_id=p_facility order by r.created_at desc,r.id limit 30 offset p_offset)x),'[]');
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'e1_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname not in ('e1_requester','e1_transport_event') then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
grant execute on function e1_transport_event(uuid,text,text,jsonb,text) to service_role;

create function e1_complete(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r emergency_requests;e encounters;n care_nodes;
begin
 select * into r from emergency_requests where id=p_request for update;
 select en.* into e from reception_queue q join encounters en on en.appointment_id=q.appointment_id where q.id=r.arrival_queue_id and en.patient_id=r.patient_id and en.status='COMPLETED';
 if e.id is null or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') or not h1_staff(r.accepted_facility_id,array['CLINICIAN']) then raise exception 'Actual signed destination encounter required';end if;
 if r.state='CLOSED' then return;end if;if r.state<>'ARRIVED' then raise exception 'Actual arrival required';end if;
 update emergency_requests set state='CLOSED' where id=r.id;
 select * into n from care_nodes where source_kind='emergency_requests' and source_id=r.id;
 if found then perform g1_put_node(n.episode_id,n.kind,n.category,n.source_kind,n.source_id,'COMPLETED','DOCTOR',n.due_at,'encounters',e.id);end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(r.patient_id,'EMERGENCY_COORDINATION_COMPLETED','emergency_requests',r.id,auth.uid());
end $$;
revoke all on function e1_complete(uuid) from public,anon,authenticated;
grant execute on function e1_complete(uuid) to authenticated;
commit;


