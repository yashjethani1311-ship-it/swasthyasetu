-- 031: consented communication outbox. Delivery receipts never complete clinical work.
begin;
create table communication_preferences(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),channel text not null check(channel in ('SMS','EMAIL')),destination text not null,verified_at timestamptz,verification_source text,valid_until timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create index c4_preferences_user on communication_preferences(user_id,channel,created_at desc);
create table care_communications(id uuid primary key default gen_random_uuid(),recipient_user_id uuid not null references auth.users(id),preference_id uuid not null references communication_preferences(id),source_kind text not null,source_id uuid not null,template_code text not null default 'CARE_UPDATE_SIGN_IN',state text not null default 'QUEUED' check(state in ('QUEUED','SENT','DELIVERED','ACKNOWLEDGED','FAILED','NO_RESPONSE','CANCELLED')),queued_by uuid not null references auth.users(id),request_key uuid not null unique,created_at timestamptz not null default now(),expires_at timestamptz not null,updated_at timestamptz not null default now());
create table communication_receipts(id uuid primary key default gen_random_uuid(),communication_id uuid not null references care_communications(id),state text not null,provider_ref text,event_key text unique,evidence jsonb not null,actor_user_id uuid references auth.users(id),created_at timestamptz not null default now());
create index c4_recipient_messages on care_communications(recipient_user_id,created_at desc);
do $$declare t text;begin foreach t in array array['communication_preferences','care_communications','communication_receipts'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function c4_preference(p_channel text,p_destination text,p_valid_until timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if auth.uid() is null or p_valid_until is null or p_valid_until<=now() or p_valid_until>now()+interval '365 days' or p_destination is null or length(p_destination)>254 or not ((p_channel='SMS' and p_destination~'^\+[1-9][0-9]{7,14}$') or (p_channel='EMAIL' and p_destination~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then raise exception 'Explicit valid communication contact and expiry required';end if;
 insert into communication_preferences(user_id,channel,destination,valid_until) values(auth.uid(),p_channel,p_destination,p_valid_until) returning id into rid;return rid;
end $$;
create function c4_verify_contact(p_preference uuid,p_source text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_source is null or length(p_source) not between 3 and 200 then raise exception 'Actual contact verification source required';end if;
 update communication_preferences set verified_at=now(),verification_source=p_source where id=p_preference and revoked_at is null and valid_until>now();
 if not found then raise exception 'Active contact required';end if;
end $$;
create function c4_revoke(p_preference uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 update communication_preferences set revoked_at=coalesce(revoked_at,now()) where id=p_preference and user_id=auth.uid();if not found then raise exception 'Contact owner required';end if;
 update care_communications set state='CANCELLED',updated_at=now() where preference_id=p_preference and state='QUEUED';
end $$;
create function c4_enqueue(p_kind text,p_source uuid,p_channel text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid;doctor uuid;recipient uuid;pref communication_preferences;c care_communications;rid uuid;
begin
 if auth.uid() is null or p_request is null then raise exception 'Authenticated communication request required';end if;
 case p_kind
 when 'APPOINTMENT' then select patient_id,doctor_provider_id into pid,doctor from appointments where id=p_source;
 when 'CARE_GAP' then select g.patient_id,e.doctor_provider_id into pid,doctor from care_gaps g join care_nodes n on n.id=g.graph_node_id join care_episodes e on e.id=n.episode_id where g.id=p_source;
 when 'REFERRAL' then select patient_id,source_doctor_id into pid,doctor from care_referrals where id=p_source;
 when 'CRITICAL_RESULT' then select patient_id,responsible_doctor_id into pid,doctor from critical_results where id=p_source;
 else raise exception 'Unsupported communication source';end case;
 if pid is null then raise exception 'Actual communication source required';end if;
 if p_kind='CRITICAL_RESULT' then
  select user_id into recipient from provider_profiles where id=doctor;
  if not ((doctor=my_provider_id() and is_approved_provider('DOCTOR')) or (is_approved_provider('LAB') and exists(select 1 from critical_results c join lab_results r on r.id=c.result_id join lab_orders o on o.id=r.lab_order_id where c.id=p_source and o.lab_provider_id=my_provider_id()))) then raise exception 'Critical communication source not authorized';end if;
 else
  select user_id into recipient from patient_profiles where id=pid;
  if auth.uid()<>recipient and not (doctor=my_provider_id() and is_approved_provider('DOCTOR')) then raise exception 'Communication source not authorized';end if;
 end if;
 select * into pref from communication_preferences where user_id=recipient and channel=p_channel and revoked_at is null and valid_until>now() and verified_at is not null order by created_at desc,id limit 1 for share;
 if not found then raise exception 'Recipient verified channel permission required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,31));select * into c from care_communications where request_key=p_request;
 if found then if (c.source_kind,c.source_id,c.recipient_user_id,c.queued_by) is distinct from (p_kind,p_source,recipient,auth.uid()) or not exists(select 1 from communication_preferences where id=c.preference_id and channel=p_channel) then raise exception 'Communication request conflict';end if;return c.id;end if;
 insert into care_communications(recipient_user_id,preference_id,source_kind,source_id,queued_by,request_key,expires_at) values(recipient,pref.id,p_kind,p_source,auth.uid(),p_request,least(pref.valid_until,now()+interval '24 hours')) returning id into rid;return rid;
end $$;
create function c4_delivery_payload(p_message uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c care_communications;p communication_preferences;
begin
 select * into c from care_communications where id=p_message;select * into p from communication_preferences where id=c.preference_id for share;
 if c.id is null or c.state<>'QUEUED' or c.expires_at<=now() or p.revoked_at is not null or p.valid_until<=now() or p.verified_at is null then raise exception 'Delivery authorization expired or revoked';end if;
 return jsonb_build_object('message_id',c.id,'idempotency_key',c.id,'channel',p.channel,'destination',p.destination,'template_code',c.template_code,'text','You have a care update. Sign in to SwasthyaSetu to review it.','expires_at',c.expires_at);
end $$;
create function c4_delivery_event(p_message uuid,p_state text,p_provider_ref text,p_event text,p_evidence jsonb) returns void language plpgsql security definer set search_path=public as $$
declare c care_communications;r communication_receipts;
begin
 select * into c from care_communications where id=p_message for update;
 if not found or p_state is null or p_provider_ref is null or length(p_provider_ref) not between 3 and 200 or p_event is null or length(p_event) not between 3 and 200 or p_evidence is null or jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>10000 then raise exception 'Actual provider receipt required';end if;
 select * into r from communication_receipts where event_key=p_event;
 if found then if (r.communication_id,r.state,r.provider_ref,r.evidence) is distinct from (c.id,p_state,p_provider_ref,p_evidence) then raise exception 'Provider receipt conflict';end if;return;end if;
 if not ((c.state='QUEUED' and p_state in ('SENT','FAILED')) or (c.state='SENT' and p_state in ('DELIVERED','FAILED','NO_RESPONSE')) or (c.state='DELIVERED' and p_state='NO_RESPONSE')) then raise exception 'Invalid communication transition';end if;
 if c.state='QUEUED' then perform c4_delivery_payload(c.id);end if;
 insert into communication_receipts(communication_id,state,provider_ref,event_key,evidence) values(c.id,p_state,p_provider_ref,p_event,p_evidence);
 update care_communications set state=p_state,updated_at=now() where id=c.id;
end $$;
create function c4_acknowledge(p_message uuid) returns void language plpgsql security definer set search_path=public as $$
declare c care_communications;
begin
 select * into c from care_communications where id=p_message for update;
 if not found or c.recipient_user_id<>auth.uid() or auth.uid() is null then raise exception 'Only recipient can acknowledge';end if;
 if c.state='ACKNOWLEDGED' then return;end if;
 if c.state not in ('SENT','DELIVERED','NO_RESPONSE') then raise exception 'Message has not been sent';end if;
 insert into communication_receipts(communication_id,state,evidence,actor_user_id) values(c.id,'ACKNOWLEDGED','{"method":"AUTHENTICATED_RECIPIENT"}',auth.uid());
 update care_communications set state='ACKNOWLEDGED',updated_at=now() where id=c.id;
 -- Intentionally no clinical closure or result acknowledgement: communication receipt is a separate fact.
end $$;
create function c4_messages(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Authenticated recipient required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,source_kind,source_id,state,created_at,updated_at from care_communications where recipient_user_id=auth.uid() order by created_at desc,id limit 50 offset p_offset)x),'[]');
end $$;
revoke all on function c4_preference(text,text,timestamptz),c4_verify_contact(uuid,text),c4_revoke(uuid),c4_enqueue(text,uuid,text,uuid),c4_delivery_payload(uuid),c4_delivery_event(uuid,text,text,text,jsonb),c4_acknowledge(uuid),c4_messages(integer) from public,anon,authenticated;
grant execute on function c4_preference(text,text,timestamptz),c4_revoke(uuid),c4_enqueue(text,uuid,text,uuid),c4_acknowledge(uuid),c4_messages(integer) to authenticated;
grant execute on function c4_verify_contact(uuid,text),c4_delivery_payload(uuid),c4_delivery_event(uuid,text,text,text,jsonb) to service_role;
commit;
