-- 035: patient-requested prescription pickup/delivery and evidence-backed receipt. Reuse c1 stock dispensing.
begin;
create table pharmacy_deliveries(id uuid primary key default gen_random_uuid(),fulfilment_id uuid not null unique references prescription_fulfilments(id),patient_id uuid not null references patient_profiles(id),pharmacy_provider_id uuid not null references provider_profiles(id),mode text not null check(mode in ('PICKUP','DELIVERY')),delivery_address text,state text not null default 'REQUESTED' check(state in ('REQUESTED','ACCEPTED','PREPARING','READY','DISPATCHED','DELIVERY_REPORTED','FAILED_ATTEMPT','RECEIVED','CANCELLED','RETURNED_REVIEW_REQUIRED')),request_key uuid not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),received_at timestamptz);
create table pharmacy_delivery_events(id uuid primary key default gen_random_uuid(),delivery_id uuid not null references pharmacy_deliveries(id),action text not null,from_state text,to_state text not null,evidence text not null,request_key uuid not null unique,actor_user_id uuid references auth.users(id),created_at timestamptz not null default now());
create table pharmacy_reorder_levels(inventory_id uuid primary key references pharmacy_inventory(id),reorder_point integer not null check(reorder_point>=0),updated_at timestamptz not null default now());
alter table pharmacy_suppliers add column active boolean not null default true;
do $$declare t text;begin foreach t in array array['pharmacy_deliveries','pharmacy_delivery_events','pharmacy_reorder_levels'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function p4_source_node(p_delivery uuid) returns void language plpgsql security definer set search_path=public as $$
declare d pharmacy_deliveries;ep uuid;rx prescriptions;nid uuid;
begin
 select * into d from pharmacy_deliveries where id=p_delivery;
 select p.* into rx from prescriptions p join prescription_fulfilments f on f.prescription_id=p.id where f.id=d.fulfilment_id;
 select id into ep from care_episodes where encounter_id=rx.encounter_id;if ep is null then return;end if;
 nid:=g1_put_node(ep,'MEDICINE_RECEIPT','PRESCRIPTIONS','pharmacy_deliveries',d.id,case when d.state='RECEIVED' then 'COMPLETED' when d.state='CANCELLED' then 'CANCELLED' else 'IN_PROGRESS' end,'PATIENT',null,case when d.state='RECEIVED' then 'pharmacy_deliveries' end,case when d.state='RECEIVED' then d.id end);
 update care_nodes set occurred_at=d.created_at where id=nid;
 insert into care_dependencies(node_id,requires_node_id) select nid,n.id from care_nodes n where n.episode_id=ep and n.kind='MEDICINE_FULFILMENT' and n.source_id=rx.id on conflict do nothing;
 if not exists(select 1 from care_gaps where source_table='pharmacy_deliveries' and source_id=d.id) then insert into care_gaps(patient_id,gap_type,source_table,source_id,graph_node_id) values(d.patient_id,'MEDICINE_RECEIPT_PENDING','pharmacy_deliveries',d.id,nid);end if;
 if d.state in ('RECEIVED','CANCELLED') then update care_gaps set status='CLOSED',closed_at=now(),closure_outcome=case when d.state='RECEIVED' then 'PATIENT_CONFIRMED_RECEIPT' else 'PATIENT_CANCELLED_DELIVERY' end where source_table='pharmacy_deliveries' and source_id=d.id and status='OPEN';end if;
end $$;
create function p4_request(p_fulfilment uuid,p_mode text,p_address text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare f prescription_fulfilments;p prescriptions;d pharmacy_deliveries;rid uuid;
begin
 select * into f from prescription_fulfilments where id=p_fulfilment for update;select * into p from prescriptions where id=f.prescription_id;
 if p.id is null or not exists(select 1 from patient_profiles where id=p.patient_id and user_id=auth.uid()) or not exists(select 1 from provider_profiles where id=f.pharmacy_provider_id and verification_status='APPROVED') or p_request is null then raise exception 'Patient and active assigned pharmacy required';end if;
 if p_mode is null or p_mode not in ('PICKUP','DELIVERY') or (p_mode='DELIVERY' and (p_address is null or length(trim(p_address)) not between 10 and 1000)) or (p_mode='PICKUP' and nullif(trim(p_address),'') is not null) then raise exception 'Delivery address or address-free pickup required';end if;
 select * into d from pharmacy_deliveries where request_key=p_request or fulfilment_id=f.id;
 if found then if (d.fulfilment_id,d.mode,d.delivery_address,d.request_key) is distinct from (f.id,p_mode,nullif(trim(p_address),''),p_request) then raise exception 'Delivery request conflict';end if;return d.id;end if;
 if p.status<>'ACTIVE' or f.status<>'REQUESTED' then raise exception 'Delivery choice must precede dispensing';end if;
 insert into pharmacy_deliveries(fulfilment_id,patient_id,pharmacy_provider_id,mode,delivery_address,request_key) values(f.id,p.patient_id,f.pharmacy_provider_id,p_mode,nullif(trim(p_address),''),p_request) returning id into rid;
 insert into pharmacy_delivery_events(delivery_id,action,to_state,evidence,request_key,actor_user_id) values(rid,'REQUEST','REQUESTED','AUTHENTICATED_PATIENT_REQUEST',p_request,auth.uid());perform p4_source_node(rid);return rid;
end $$;
create function p4_transition(p_delivery uuid,p_action text,p_evidence text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare d pharmacy_deliveries;f prescription_fulfilments;e pharmacy_delivery_events;patient boolean;pharmacy boolean;nextstate text;rid uuid;
begin
 select * into d from pharmacy_deliveries where id=p_delivery for update;select * into f from prescription_fulfilments where id=d.fulfilment_id for share;
 patient:=exists(select 1 from patient_profiles where id=d.patient_id and user_id=auth.uid());pharmacy:=d.pharmacy_provider_id=my_provider_id() and is_approved_provider('PHARMACY');
 if d.id is null or not (patient or coalesce(pharmacy,false)) or p_request is null or p_evidence is null or length(trim(p_evidence)) not between 3 and 1000 then raise exception 'Delivery participant and actual evidence required';end if;
 select * into e from pharmacy_delivery_events where request_key=p_request;
 if found then if (e.delivery_id,e.action,e.evidence,e.actor_user_id) is distinct from (d.id,p_action,trim(p_evidence),auth.uid()) then raise exception 'Delivery event conflict';end if;return e.id;end if;
 if p_action='ACCEPT' and pharmacy and d.state='REQUESTED' then nextstate:='ACCEPTED';
 elsif p_action='PREPARE' and pharmacy and d.state='ACCEPTED' then nextstate:='PREPARING';
 elsif p_action='READY' and pharmacy and d.state in ('ACCEPTED','PREPARING') and f.status='DISPENSED' then nextstate:='READY';
 elsif p_action='DISPATCH' and pharmacy and d.mode='DELIVERY' and d.state in ('READY','FAILED_ATTEMPT') and f.status='DISPENSED' then nextstate:='DISPATCHED';
 elsif p_action='REPORT_DELIVERY' and pharmacy and d.state='DISPATCHED' then nextstate:='DELIVERY_REPORTED';
 elsif p_action='FAIL_ATTEMPT' and pharmacy and d.state='DISPATCHED' then nextstate:='FAILED_ATTEMPT';
 elsif p_action='CONFIRM_RECEIPT' and patient and f.status='DISPENSED' and ((d.mode='PICKUP' and d.state='READY') or (d.mode='DELIVERY' and d.state in ('DISPATCHED','DELIVERY_REPORTED'))) then nextstate:='RECEIVED';
 elsif p_action='CANCEL' and patient and d.state in ('REQUESTED','ACCEPTED','PREPARING') and f.status='REQUESTED' then nextstate:='CANCELLED';
 elsif p_action='RETURN_TO_PHARMACY' and pharmacy and d.state in ('FAILED_ATTEMPT','DISPATCHED') then nextstate:='RETURNED_REVIEW_REQUIRED';
 else raise exception 'Invalid delivery transition or missing stock-backed dispensing';end if;
 insert into pharmacy_delivery_events(delivery_id,action,from_state,to_state,evidence,request_key,actor_user_id) values(d.id,p_action,d.state,nextstate,trim(p_evidence),p_request,auth.uid()) returning id into rid;
 update pharmacy_deliveries set state=nextstate,updated_at=now(),received_at=case when nextstate='RECEIVED' then now() end where id=d.id;perform p4_source_node(d.id);
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(d.patient_id,'MEDICINE_DELIVERY_'||nextstate,'pharmacy_deliveries',d.id,auth.uid(),jsonb_build_object('delivery_event_id',rid));return rid;
end $$;
create function p4_deliveries(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Authorized delivery participant required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)-'request_key') from (select d.* from pharmacy_deliveries d where exists(select 1 from patient_profiles where id=d.patient_id and user_id=auth.uid()) or (d.pharmacy_provider_id=my_provider_id() and is_approved_provider('PHARMACY')) order by created_at desc,id limit 30 offset p_offset)x),'[]');
end $$;
create function p4_reorder_level(p_inventory uuid,p_level integer) returns void language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('PHARMACY') or not exists(select 1 from pharmacy_inventory where id=p_inventory and pharmacy_provider_id=my_provider_id()) or p_level is null or p_level not between 0 and 1000000 then raise exception 'Assigned pharmacy and actual reorder threshold required';end if;
 insert into pharmacy_reorder_levels(inventory_id,reorder_point) values(p_inventory,p_level) on conflict(inventory_id) do update set reorder_point=excluded.reorder_point,updated_at=now();
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'REORDER_LEVEL_RECORDED','pharmacy_inventory',p_inventory::text,jsonb_build_object('reorder_point',p_level));
end $$;
create function p4_supplier_state(p_supplier uuid,p_active boolean,p_reason text) returns void language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('PHARMACY') or p_active is null or p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Pharmacy supplier change reason required';end if;
 update pharmacy_suppliers set active=p_active where id=p_supplier and pharmacy_provider_id=my_provider_id();if not found then raise exception 'Supplier not authorized';end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'SUPPLIER_STATE_RECORDED','pharmacy_suppliers',p_supplier::text,jsonb_build_object('active',p_active,'reason',trim(p_reason)));
end $$;
create function p4_supplier_guard() returns trigger language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from pharmacy_suppliers where id=new.supplier_id and pharmacy_provider_id=new.pharmacy_provider_id and active) then raise exception 'Active assigned supplier required for new purchase';end if;return new;
end $$;
create trigger p4_supplier_guard before insert on pharmacy_purchases for each row execute function p4_supplier_guard();
create function p4_reporting() returns jsonb language plpgsql security definer set search_path=public as $$begin
 if not is_approved_provider('PHARMACY') then raise exception 'Approved pharmacy required';end if;
 return jsonb_build_object('stock_attention',coalesce((select jsonb_agg(to_jsonb(x)) from (select i.id,i.medicine_name,i.strength,i.batch_number,i.quantity,i.expiry_date,i.updated_at,r.reorder_point,(i.quantity<=coalesce(r.reorder_point,0)) low_stock,case when i.expiry_date is null then 'EXPIRY_UNKNOWN' when i.expiry_date<current_date then 'EXPIRED' when i.expiry_date<=current_date+30 then 'EXPIRING_WITHIN_30_DAYS' else 'RECORDED' end expiry_state from pharmacy_inventory i left join pharmacy_reorder_levels r on r.inventory_id=i.id where i.pharmacy_provider_id=my_provider_id() and (i.quantity<=coalesce(r.reorder_point,0) or i.expiry_date is null or i.expiry_date<=current_date+30) order by i.expiry_date nulls first,i.id limit 100)x),'[]'),
 'recent_receipts',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,fulfilment_id,quantity,price_paid,dispensed_at from dispense_events where pharmacy_provider_id=my_provider_id() order by dispensed_at desc,id limit 50)x),'[]'),
 'suppliers',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,reference,active,created_at from pharmacy_suppliers where pharmacy_provider_id=my_provider_id() order by name,id limit 50)x),'[]'),
 'notice','Missing reorder thresholds use zero stock only. Delivery receipt requires patient confirmation; returns never automatically restock medicines.');
end $$;
revoke all on function p4_source_node(uuid),p4_request(uuid,text,text,uuid),p4_transition(uuid,text,text,uuid),p4_deliveries(integer),p4_reorder_level(uuid,integer),p4_supplier_state(uuid,boolean,text),p4_supplier_guard(),p4_reporting() from public,anon,authenticated;
grant execute on function p4_request(uuid,text,text,uuid),p4_transition(uuid,text,text,uuid),p4_deliveries(integer),p4_reorder_level(uuid,integer),p4_supplier_state(uuid,boolean,text),p4_reporting() to authenticated;
commit;
