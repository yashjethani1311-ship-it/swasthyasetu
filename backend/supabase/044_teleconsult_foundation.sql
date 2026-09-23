-- 044: provider-independent teleconsult rooms and short-lived server issuance intents. No recording or clinical completion.
begin;
create table teleconsult_routes(scope_key text primary key,facility_id uuid references facilities(id),integration_id uuid not null references platform_integrations(id),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),check(scope_key=coalesce(facility_id::text,'PLATFORM')));
create table teleconsult_sessions(id uuid primary key default gen_random_uuid(),appointment_id uuid not null unique references appointments(id),patient_id uuid not null references patient_profiles(id),doctor_provider_id uuid not null references provider_profiles(id),integration_id uuid references platform_integrations(id),integration_revision integer,external_room_reference text unique,state text not null default 'UNCONFIGURED' check(state in ('UNCONFIGURED','WAITING','ACTIVE','ENDING','ENDED','FAILED')),provider_state text not null default 'UNCONFIGURED' check(provider_state in ('UNCONFIGURED','AVAILABLE','DEGRADED','FAILED')),join_from timestamptz not null,expires_at timestamptz not null,recording_enabled boolean not null default false check(not recording_enabled),created_at timestamptz not null default now(),started_at timestamptz,ended_at timestamptz);
create table teleconsult_participants(id uuid primary key default gen_random_uuid(),session_id uuid not null references teleconsult_sessions(id),user_id uuid not null references auth.users(id),participant_role text not null check(participant_role in ('PATIENT','DOCTOR')),state text not null default 'WAITING' check(state in ('WAITING','JOINED','LEFT')),joined_at timestamptz,left_at timestamptz,unique(session_id,user_id));
create table teleconsult_join_intents(id uuid primary key default gen_random_uuid(),session_id uuid not null references teleconsult_sessions(id),participant_id uuid not null references teleconsult_participants(id),requested_by uuid not null references auth.users(id),request_key uuid not null unique,expires_at timestamptz not null,state text not null default 'PENDING' check(state in ('PENDING','ISSUED')),provider_reference text,created_at timestamptz not null default now(),issued_at timestamptz);
create table teleconsult_events(id uuid primary key default gen_random_uuid(),session_id uuid not null references teleconsult_sessions(id),participant_id uuid references teleconsult_participants(id),event_type text not null,actor_user_id uuid references auth.users(id),provider_reference text,event_key text unique,created_at timestamptz not null default now());
create index t4_intents_rate on teleconsult_join_intents(requested_by,created_at desc);
do $$declare t text;begin foreach t in array array['teleconsult_routes','teleconsult_sessions','teleconsult_participants','teleconsult_join_intents','teleconsult_events'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function t4_participant(p_appointment uuid) returns boolean language sql stable security definer set search_path=public as $$select auth.uid() is not null and exists(select 1 from appointments a join patient_profiles p on p.id=a.patient_id join provider_profiles d on d.id=a.doctor_provider_id where a.id=p_appointment and a.mode='TELECONSULT' and a.status='CONFIRMED' and d.provider_type='DOCTOR' and d.verification_status='APPROVED' and (p.user_id=auth.uid() or d.user_id=auth.uid()))$$;
create function t4_route(p_integration uuid,p_facility uuid default null) returns void language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not is_admin() or not exists(select 1 from platform_integrations where id=p_integration and kind='VIDEO' and facility_id is not distinct from p_facility) then raise exception 'Governance VIDEO integration in matching scope required';end if;
 insert into teleconsult_routes(scope_key,facility_id,integration_id,updated_by) values(coalesce(p_facility::text,'PLATFORM'),p_facility,p_integration,auth.uid()) on conflict(scope_key) do update set integration_id=excluded.integration_id,updated_by=excluded.updated_by,updated_at=now();
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'TELECONSULT_ROUTE_RECORDED','platform_integrations',p_integration::text);
end $$;
create function t4_open(p_appointment uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments;s teleconsult_sessions;rid uuid;fid uuid;i platform_integrations;
begin
 select * into a from appointments where id=p_appointment for update;
 if not t4_participant(a.id) then raise exception 'Teleconsult appointment participant required';end if;
 if a.scheduled_at+interval '2 hours'<=now() then raise exception 'Teleconsult appointment expired';end if;
 select * into s from teleconsult_sessions where appointment_id=a.id;
 if not found then
 select facility_id into fid from provider_practices where id=a.practice_id;
 select p.* into i from teleconsult_routes r join platform_integrations p on p.id=r.integration_id where (r.facility_id=fid or r.scope_key='PLATFORM') order by (r.facility_id is not null) desc limit 1;
 insert into teleconsult_sessions(appointment_id,patient_id,doctor_provider_id,integration_id,integration_revision,join_from,expires_at) values(a.id,a.patient_id,a.doctor_provider_id,i.id,i.revision,a.scheduled_at-interval '15 minutes',a.scheduled_at+interval '2 hours') returning * into s;
 insert into teleconsult_participants(session_id,user_id,participant_role) select s.id,user_id,'PATIENT' from patient_profiles where id=a.patient_id;
 insert into teleconsult_participants(session_id,user_id,participant_role) select s.id,user_id,'DOCTOR' from provider_profiles where id=a.doctor_provider_id;
 insert into teleconsult_events(session_id,event_type,actor_user_id) values(s.id,'SESSION_REQUESTED',auth.uid());
 end if;
 return jsonb_build_object('session_id',s.id,'state',s.state,'provider_state',s.provider_state,'join_from',s.join_from,'expires_at',s.expires_at,'recording_enabled',false,'notice','Room and credentials require a configured server video adapter. Appointment completion is separate.');
end $$;
create function t4_prepare(p_session uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;i platform_integrations;fid uuid;
begin
 select * into s from teleconsult_sessions where id=p_session for update;
 if s.state='UNCONFIGURED' and s.external_room_reference is null then
 select pp.facility_id into fid from appointments a left join provider_practices pp on pp.id=a.practice_id where a.id=s.appointment_id;
 select pi.* into i from teleconsult_routes r join platform_integrations pi on pi.id=r.integration_id where (r.facility_id=fid or r.scope_key='PLATFORM') order by (r.facility_id is not null) desc limit 1;
 if i.id is not null and i.enabled then update teleconsult_sessions set integration_id=i.id,integration_revision=i.revision where id=s.id returning * into s;end if;
 end if;
 select * into i from platform_integrations where id=s.integration_id for share;
 if s.id is null or s.state not in ('UNCONFIGURED','WAITING') or s.expires_at<=now() or i.id is null or not i.enabled or i.revision<>s.integration_revision or not exists(select 1 from appointments a join provider_profiles p on p.id=a.doctor_provider_id where a.id=s.appointment_id and a.status='CONFIRMED' and p.verification_status='APPROVED') then raise exception 'PROVIDER_UNAVAILABLE';end if;
 return jsonb_build_object('session_id',s.id,'config_ref',i.config_ref,'provider_name',i.provider_name,'external_room_reference',s.external_room_reference,'expires_at',s.expires_at,'recording_enabled',false,'idempotency_key',s.id);
end $$;
create function t4_room_ready(p_session uuid,p_reference text,p_event text) returns void language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;
begin
 perform t4_prepare(p_session);select * into s from teleconsult_sessions where id=p_session for update;
 if p_reference is null or p_reference!~'^[A-Za-z0-9_.:-]{1,200}$' or p_event is null or length(p_event) not between 3 and 200 then raise exception 'Actual opaque provider room reference required';end if;
 if s.external_room_reference is not null then if s.external_room_reference<>p_reference then raise exception 'Room reference conflict';end if;return;end if;
 insert into teleconsult_events(session_id,event_type,provider_reference,event_key) values(s.id,'ROOM_CREATED',p_reference,p_event);
 update teleconsult_sessions set state='WAITING',provider_state='AVAILABLE',external_room_reference=p_reference where id=s.id;
end $$;
create function t4_join_intent(p_session uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;p teleconsult_participants;r teleconsult_join_intents;rid uuid;
begin
 select * into s from teleconsult_sessions where id=p_session for update;
 if s.id is null or not t4_participant(s.appointment_id) or p_request is null then raise exception 'Authorized teleconsult participant required';end if;
 if now()<s.join_from or now()>=s.expires_at or s.state in ('ENDING','ENDED','FAILED') then raise exception 'Teleconsult join window closed';end if;
 if s.state='UNCONFIGURED' or s.provider_state not in ('AVAILABLE','DEGRADED') or s.external_room_reference is null then return jsonb_build_object('status','PROVIDER_UNAVAILABLE','session_id',s.id);end if;
 if not exists(select 1 from platform_integrations where id=s.integration_id and enabled and revision=s.integration_revision) then raise exception 'PROVIDER_UNAVAILABLE';end if;
 select * into p from teleconsult_participants where session_id=s.id and user_id=auth.uid();
 select * into r from teleconsult_join_intents where request_key=p_request;
 if found then if (r.session_id,r.participant_id,r.requested_by) is distinct from (s.id,p.id,auth.uid()) then raise exception 'Join request conflict';end if;if r.expires_at<=now() then raise exception 'Join intent expired';end if;return jsonb_build_object('status','ISSUANCE_REQUIRED','intent_id',r.id,'expires_at',r.expires_at);end if;
 if (select count(*) from teleconsult_join_intents where requested_by=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Join request rate limit';end if;
 insert into teleconsult_join_intents(session_id,participant_id,requested_by,request_key,expires_at) values(s.id,p.id,auth.uid(),p_request,least(s.expires_at,now()+interval '2 minutes')) returning id into rid;
 return jsonb_build_object('status','ISSUANCE_REQUIRED','intent_id',rid,'expires_at',least(s.expires_at,now()+interval '2 minutes'));
end $$;
create function t4_issue_context(p_intent uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r teleconsult_join_intents;s teleconsult_sessions;p teleconsult_participants;i platform_integrations;a appointments;
begin
 select * into r from teleconsult_join_intents where id=p_intent for share;select * into s from teleconsult_sessions where id=r.session_id for share;select * into p from teleconsult_participants where id=r.participant_id;select * into i from platform_integrations where id=s.integration_id for share;select * into a from appointments where id=s.appointment_id for share;
 if r.id is null or r.expires_at<=now() or s.state not in ('WAITING','ACTIVE') or s.provider_state not in ('AVAILABLE','DEGRADED') or s.expires_at<=now() or s.join_from>now() or i.id is null or not i.enabled or i.revision<>s.integration_revision or a.status<>'CONFIRMED' or a.mode<>'TELECONSULT' or not exists(select 1 from provider_profiles where id=a.doctor_provider_id and verification_status='APPROVED') then raise exception 'Teleconsult issuance expired or revoked';end if;
 if not ((p.participant_role='PATIENT' and exists(select 1 from patient_profiles where id=a.patient_id and user_id=p.user_id)) or (p.participant_role='DOCTOR' and exists(select 1 from provider_profiles where id=a.doctor_provider_id and user_id=p.user_id))) then raise exception 'Participant identity changed';end if;
 return jsonb_build_object('intent_id',r.id,'session_id',s.id,'participant_id',p.id,'role',p.participant_role,'room_reference',s.external_room_reference,'config_ref',i.config_ref,'expires_at',r.expires_at,'recording_enabled',false);
end $$;
create function t4_token_issued(p_intent uuid,p_reference text) returns void language plpgsql security definer set search_path=public as $$
declare r teleconsult_join_intents;
begin
 perform t4_issue_context(p_intent);
 if p_reference is null or length(p_reference) not between 3 and 200 then raise exception 'Provider issuance reference required';end if;
 select * into r from teleconsult_join_intents where id=p_intent for update;
 if r.state='ISSUED' then if r.provider_reference<>p_reference then raise exception 'Token issuance conflict';end if;return;end if;
 update teleconsult_join_intents set state='ISSUED',issued_at=now(),provider_reference=p_reference where id=r.id;
 insert into teleconsult_events(session_id,participant_id,event_type,actor_user_id,provider_reference) values(r.session_id,r.participant_id,'JOIN_CREDENTIAL_ISSUED',r.requested_by,p_reference);
end $$;
create function t4_connection(p_session uuid,p_participant uuid,p_state text,p_reference text,p_event text) returns void language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;p teleconsult_participants;e teleconsult_events;
begin
 select * into s from teleconsult_sessions where id=p_session for update;select * into p from teleconsult_participants where id=p_participant and session_id=s.id for update;
 if p.id is null or p_state is null or p_state not in ('JOINED','LEFT') or p_reference is null or length(p_reference) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 then raise exception 'Actual participant connection receipt required';end if;
 select * into e from teleconsult_events where event_key=p_event;
 if found then if (e.session_id,e.participant_id,e.event_type,e.provider_reference) is distinct from (s.id,p.id,p_state,p_reference) then raise exception 'Connection event conflict';end if;return;end if;
 if p_state='JOINED' then perform t4_issue_context((select id from teleconsult_join_intents where participant_id=p.id and state='ISSUED' and expires_at>now() order by created_at desc limit 1));end if;
 if p_state='JOINED' and (s.state not in ('WAITING','ACTIVE') or s.expires_at<=now() or not exists(select 1 from teleconsult_join_intents where participant_id=p.id and state='ISSUED' and expires_at>now()) or not exists(select 1 from appointments where id=s.appointment_id and status='CONFIRMED')) then raise exception 'Issued participant credential and active appointment required';end if;
 insert into teleconsult_events(session_id,participant_id,event_type,provider_reference,event_key) values(s.id,p.id,p_state,p_reference,p_event);
 update teleconsult_participants set state=p_state,joined_at=case when p_state='JOINED' then now() else joined_at end,left_at=case when p_state='LEFT' then now() else left_at end where id=p.id;
 if p_state='JOINED' and (select count(*) from teleconsult_participants where session_id=s.id and state='JOINED')=2 then update teleconsult_sessions set state='ACTIVE',started_at=coalesce(started_at,now()) where id=s.id;end if;
end $$;
create function t4_request_end(p_session uuid) returns text language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;nextstate text;
begin
 select * into s from teleconsult_sessions where id=p_session for update;
 if s.id is null or not exists(select 1 from teleconsult_participants where session_id=s.id and user_id=auth.uid()) then raise exception 'Teleconsult participant required';end if;
 if s.state in ('ENDING','ENDED') then return s.state;end if;nextstate:=case when s.external_room_reference is null then 'ENDED' else 'ENDING' end;
 update teleconsult_sessions set state=nextstate,ended_at=case when nextstate='ENDED' then now() end where id=s.id;
 insert into teleconsult_events(session_id,event_type,actor_user_id) values(s.id,'END_REQUESTED',auth.uid());return nextstate;
end $$;
create function t4_provider_state(p_session uuid,p_state text,p_reference text,p_event text) returns void language plpgsql security definer set search_path=public as $$
declare s teleconsult_sessions;e teleconsult_events;
begin
 select * into s from teleconsult_sessions where id=p_session for update;
 if s.id is null or p_state is null or p_state not in ('DEGRADED','FAILED','ENDED') or p_reference is null or length(p_reference) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 then raise exception 'Actual provider state evidence required';end if;
 select * into e from teleconsult_events where event_key=p_event;if found then if (e.session_id,e.event_type,e.provider_reference) is distinct from (s.id,p_state,p_reference) then raise exception 'Provider event conflict';end if;return;end if;
 if s.state='ENDED' or (p_state='ENDED' and s.external_room_reference is null) then raise exception 'Provider transition invalid';end if;
 insert into teleconsult_events(session_id,event_type,provider_reference,event_key) values(s.id,p_state,p_reference,p_event);
 update teleconsult_sessions set state=case when p_state in ('ENDED','FAILED') then p_state else state end,provider_state=case when p_state='ENDED' then provider_state else p_state end,ended_at=case when p_state='ENDED' then now() else ended_at end where id=s.id;
end $$;
revoke all on function t4_participant(uuid),t4_route(uuid,uuid),t4_open(uuid),t4_prepare(uuid),t4_room_ready(uuid,text,text),t4_join_intent(uuid,uuid),t4_issue_context(uuid),t4_token_issued(uuid,text),t4_connection(uuid,uuid,text,text,text),t4_request_end(uuid),t4_provider_state(uuid,text,text,text) from public,anon,authenticated;
grant execute on function t4_route(uuid,uuid),t4_open(uuid),t4_join_intent(uuid,uuid),t4_request_end(uuid) to authenticated;
grant execute on function t4_prepare(uuid),t4_room_ready(uuid,text,text),t4_issue_context(uuid),t4_token_issued(uuid,text),t4_connection(uuid,uuid,text,text,text),t4_provider_state(uuid,text,text,text) to service_role;
commit;
