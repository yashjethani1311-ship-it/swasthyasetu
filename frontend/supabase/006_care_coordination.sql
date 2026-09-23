-- 006: deterministic care coordination, pharmacy and worker follow-up.
-- Apply after 005. No table recreation, no clinical data deletion.
begin;
set local search_path=public;
alter table prescription_items add column if not exists quantity_prescribed integer check(quantity_prescribed>0);
alter table pharmacy_inventory add column if not exists receipt_key uuid unique;
alter table pharmacy_inventory add column if not exists received_quantity integer check(received_quantity>0);
alter table care_gaps add column if not exists due_at timestamptz;
create table prescription_fulfilments(
 id uuid primary key default gen_random_uuid(), prescription_id uuid not null unique references prescriptions(id),
 pharmacy_provider_id uuid not null references provider_profiles(id), status text not null default 'REQUESTED' check(status in ('REQUESTED','PARTIAL','DISPENSED')),
 requested_at timestamptz not null default now(), completed_at timestamptz
);
alter table dispense_events add column if not exists fulfilment_id uuid references prescription_fulfilments(id);
alter table dispense_events add column if not exists inventory_id uuid references pharmacy_inventory(id);
alter table dispense_events add column if not exists request_key uuid unique;
create table follow_up_tasks(
 id uuid primary key default gen_random_uuid(), care_gap_id uuid unique not null references care_gaps(id), patient_id uuid not null references patient_profiles(id),
 doctor_provider_id uuid not null references provider_profiles(id), worker_provider_id uuid not null references provider_profiles(id),
 status text not null default 'ASSIGNED' check(status in ('ASSIGNED','CONTACTED','VISITED','ESCALATED','AWAITING_VERIFICATION','COMPLETED')),
 outcome text, assigned_at timestamptz not null default now(), updated_at timestamptz not null default now(), verified_at timestamptz, verified_by uuid references provider_profiles(id)
);
create index c1_fulfilment_pharmacy on prescription_fulfilments(pharmacy_provider_id,requested_at desc);
create index c1_dispense_item on dispense_events(prescription_item_id,dispensed_at);
create index c1_tasks_worker on follow_up_tasks(worker_provider_id,status,assigned_at);
create index c1_tasks_doctor on follow_up_tasks(doctor_provider_id,status,assigned_at);
create index c1_gaps_patient_due on care_gaps(patient_id,status,due_at);
alter table prescription_fulfilments enable row level security;
alter table follow_up_tasks enable row level security;
revoke all on prescription_fulfilments,follow_up_tasks from public,anon,authenticated;
grant select on prescription_fulfilments,follow_up_tasks to authenticated;
create policy c1_fulfilment_read on prescription_fulfilments for select to authenticated using(
 (pharmacy_provider_id=my_provider_id() and is_approved_provider('PHARMACY')) or exists(select 1 from prescriptions p where p.id=prescription_id and (p.patient_id in(select id from patient_profiles where user_id=auth.uid()) or (p.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR')))));
create policy c1_task_read on follow_up_tasks for select to authenticated using(
 (worker_provider_id=my_provider_id() and is_approved_provider('WORKER')) or (doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR')) or patient_id in(select id from patient_profiles where user_id=auth.uid()));
-- Sensitive changes only through RPC. Strip captured column grants as well as table grants.
do $c1$ declare c record; begin
 for c in select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('prescriptions','prescription_items','pharmacy_inventory','dispense_events') loop
 execute format('revoke insert(%I),update(%I),references(%I) on public.%I from public,anon,authenticated',c.column_name,c.column_name,c.column_name,c.table_name);
 end loop;
end $c1$;
revoke insert,update,delete,truncate,references,trigger on prescriptions,prescription_items,pharmacy_inventory,dispense_events from public,anon,authenticated;

create or replace function c1_can_patient(p_patient uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from patient_profiles where id=p_patient and user_id=auth.uid()) or p0_connected_patient(p_patient)
$$;
create or replace function c1_reads_prescription(p_rx uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from prescriptions p where p.id=p_rx and (c1_can_patient(p.patient_id) or exists(select 1 from prescription_fulfilments f where f.prescription_id=p.id and f.pharmacy_provider_id=my_provider_id() and is_approved_provider('PHARMACY'))))
$$;
create policy c1_prescription_scope on prescriptions for select to authenticated using(c1_reads_prescription(id));
create policy c1_item_scope_guard on prescription_items as restrictive for select to authenticated using(c1_reads_prescription(prescription_id));
create policy c1_patient_dispense on dispense_events for select to authenticated using(exists(select 1 from prescription_items i join prescriptions p on p.id=i.prescription_id where i.id=prescription_item_id and c1_can_patient(p.patient_id)));
create policy c1_doctor_events on care_events for select to authenticated using(p0_connected_patient(patient_id));
create policy c1_doctor_gaps on care_gaps for select to authenticated using(p0_connected_patient(patient_id));

create or replace function c1_finish_encounter(p_encounter uuid,p_medicines jsonb,p_tests uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare e encounters; rx uuid; m jsonb; quantity integer; begin
 select * into e from encounters where id=p_encounter for update;
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') or not p0_connected_patient(e.patient_id) then raise exception 'Encounter not authorized'; end if;
 if e.status='COMPLETED' then select id into rx from prescriptions where encounter_id=e.id limit 1; return rx; end if;
 perform 1 from appointments where id=e.appointment_id and patient_id=e.patient_id and doctor_provider_id=e.doctor_provider_id and status='CONFIRMED' for update;
 if not found then raise exception 'A confirmed matching appointment is required'; end if;
 if e.status<>'IN_PROGRESS' or nullif(trim(e.chief_complaint),'') is null or (nullif(trim(e.diagnosis),'') is null and nullif(trim(e.clinical_notes),'') is null) then raise exception 'Complete consultation notes before signing'; end if;
 if p_medicines is null or jsonb_typeof(p_medicines)<>'array' or jsonb_array_length(p_medicines)>50 then raise exception 'Invalid medication list'; end if;
 perform p0_create_orders(e.id,coalesce(p_tests,array[]::uuid[]));
 if jsonb_array_length(p_medicines)>0 then
 if exists(select 1 from prescriptions where encounter_id=e.id) then raise exception 'A prescription already exists for this encounter; review it before signing'; end if;
 insert into prescriptions(patient_id,doctor_provider_id,appointment_id,encounter_id,clinical_notes) values(e.patient_id,e.doctor_provider_id,e.appointment_id,e.id,e.clinical_notes) returning id into rx;
 for m in select * from jsonb_array_elements(p_medicines) loop
 quantity:=(m->>'quantity_prescribed')::integer;
 if nullif(trim(m->>'medicine_name'),'') is null or quantity is null or quantity<=0 then raise exception 'Medicine name and explicit total prescribed quantity required'; end if;
 insert into prescription_items(prescription_id,medicine_name,strength,dose,route,frequency,duration,instructions,quantity_prescribed)
 values(rx,trim(m->>'medicine_name'),nullif(trim(m->>'strength'),''),nullif(trim(m->>'dose'),''),nullif(trim(m->>'route'),''),nullif(trim(m->>'frequency'),''),nullif(trim(m->>'duration'),''),nullif(trim(m->>'instructions'),''),quantity);
 end loop;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'PRESCRIPTION_ISSUED','prescriptions',rx,auth.uid());
 insert into care_gaps(patient_id,gap_type,source_table,source_id) values(e.patient_id,'MEDICINE_COLLECTION_PENDING','prescriptions',rx);
 end if;
 update encounters set status='COMPLETED',completed_at=now(),updated_at=now() where id=e.id;
 update appointments set status='COMPLETED',updated_at=now() where id=e.appointment_id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'CONSULTATION_COMPLETED','encounters',e.id,auth.uid());
 if e.follow_up_in_days>0 then insert into care_gaps(patient_id,gap_type,source_table,source_id,due_at) values(e.patient_id,'FOLLOW_UP_PENDING','encounters',e.id,now()+make_interval(days=>e.follow_up_in_days)); end if;
 return rx;
end $$;

create or replace function c1_choose_pharmacy(p_rx uuid,p_pharmacy uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p prescriptions; f prescription_fulfilments; begin
 select * into p from prescriptions where id=p_rx for update;
 if not found or not exists(select 1 from patient_profiles where id=p.patient_id and user_id=auth.uid()) then raise exception 'Prescription not authorized'; end if;
 if p.status<>'ACTIVE' then raise exception 'Prescription is not active'; end if;
 if not exists(select 1 from provider_profiles where id=p_pharmacy and provider_type='PHARMACY' and verification_status='APPROVED') then raise exception 'Approved pharmacy required'; end if;
 select * into f from prescription_fulfilments where prescription_id=p.id;
 if found then if f.pharmacy_provider_id=p_pharmacy then return f.id; else raise exception 'Prescription already sent to another pharmacy'; end if; end if;
 insert into prescription_fulfilments(prescription_id,pharmacy_provider_id) values(p.id,p_pharmacy) returning * into f;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(p.patient_id,'PRESCRIPTION_ROUTED','prescriptions',p.id,auth.uid(),jsonb_build_object('pharmacy_provider_id',p_pharmacy));
 return f.id;
end $$;

create or replace function c1_add_stock(p_name text,p_strength text,p_batch text,p_expiry date,p_quantity integer,p_price numeric,p_request uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path=public as $$
declare inv uuid; prior pharmacy_inventory; begin
 if not is_approved_provider('PHARMACY') then raise exception 'Approved pharmacy required'; end if;
 if p_request is null then raise exception 'Receipt request key required'; end if;
 select * into prior from pharmacy_inventory where receipt_key=p_request;
 if found then
 if prior.pharmacy_provider_id=my_provider_id() and prior.medicine_name=trim(p_name) and prior.strength is not distinct from nullif(trim(p_strength),'') and prior.batch_number=trim(p_batch) and prior.expiry_date=p_expiry and prior.received_quantity=p_quantity and prior.selling_price=p_price then return prior.id; else raise exception 'Receipt key conflict'; end if;
 end if;
 if nullif(trim(p_name),'') is null or nullif(trim(p_batch),'') is null or p_expiry is null or p_expiry<current_date or p_quantity is null or p_quantity<=0 or p_price is null or p_price<0 or p_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter medicine, batch, valid expiry, positive units and actual nonnegative unit price'; end if;
 insert into pharmacy_inventory(pharmacy_provider_id,medicine_name,strength,batch_number,expiry_date,quantity,selling_price,receipt_key,received_quantity) values(my_provider_id(),trim(p_name),nullif(trim(p_strength),''),trim(p_batch),p_expiry,p_quantity,p_price,p_request,p_quantity) returning id into inv;
 return inv;
end $$;
create or replace function c1_dispense(p_fulfilment uuid,p_item uuid,p_inventory uuid,p_quantity integer,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare f prescription_fulfilments; p prescriptions; i prescription_items; stock pharmacy_inventory; existing dispense_events; total integer; event_id uuid; begin
 select * into f from prescription_fulfilments where id=p_fulfilment for update;
 if not found or f.pharmacy_provider_id is distinct from my_provider_id() or not is_approved_provider('PHARMACY') then raise exception 'Pharmacy not authorized'; end if;
 select * into existing from dispense_events where request_key=p_request;
 if found then if existing.fulfilment_id=f.id and existing.prescription_item_id=p_item and existing.inventory_id=p_inventory and existing.quantity=p_quantity then return existing.id; else raise exception 'Idempotency key conflict'; end if; end if;
 if p_request is null or p_quantity is null or p_quantity<=0 then raise exception 'Positive quantity and request key required'; end if;
 select * into p from prescriptions where id=f.prescription_id for update;
 if p.status<>'ACTIVE' or f.status='DISPENSED' then raise exception 'Prescription not available for dispensing'; end if;
 select * into i from prescription_items where id=p_item and prescription_id=p.id;
 if not found or i.quantity_prescribed is null then raise exception 'Prescribed quantity must be confirmed by the doctor'; end if;
 select * into stock from pharmacy_inventory where id=p_inventory and pharmacy_provider_id=my_provider_id() for update;
 if not found or lower(trim(stock.medicine_name))<>lower(trim(i.medicine_name)) or lower(coalesce(stock.strength,''))<>lower(coalesce(i.strength,'')) then raise exception 'Inventory medicine/strength must exactly match prescription; no substitution'; end if;
 if stock.expiry_date is null or stock.expiry_date<current_date or stock.quantity<p_quantity or stock.selling_price is null or stock.selling_price<0 or stock.selling_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Unexpired priced stock with sufficient quantity required'; end if;
 select coalesce(sum(quantity),0) into total from dispense_events where prescription_item_id=i.id;
 if total+p_quantity>i.quantity_prescribed then raise exception 'Quantity exceeds prescription'; end if;
 update pharmacy_inventory set quantity=quantity-p_quantity,updated_at=now() where id=stock.id;
 insert into dispense_events(prescription_item_id,pharmacy_provider_id,quantity,price_paid,fulfilment_id,inventory_id,request_key)
 values(i.id,my_provider_id(),p_quantity,p_quantity*stock.selling_price,f.id,stock.id,p_request) returning id into event_id;
 update prescription_fulfilments set status='PARTIAL' where id=f.id;
 if not exists(select 1 from prescription_items x where x.prescription_id=p.id and (x.quantity_prescribed is null or x.quantity_prescribed>(select coalesce(sum(d.quantity),0) from dispense_events d where d.prescription_item_id=x.id))) then
 update prescription_fulfilments set status='DISPENSED',completed_at=now() where id=f.id;
 update care_gaps set status='CLOSED',closed_at=now() where source_table='prescriptions' and source_id=p.id and gap_type='MEDICINE_COLLECTION_PENDING' and status='OPEN';
 end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(p.patient_id,'MEDICINE_DISPENSED','dispense_events',event_id,auth.uid(),jsonb_build_object('prescription_id',p.id,'item_id',i.id,'quantity',p_quantity,'batch',stock.batch_number,'expiry',stock.expiry_date,'price_paid',p_quantity*stock.selling_price));
 return event_id;
end $$;

create or replace function c1_pharmacy_queue(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_approved_provider('PHARMACY') or p_offset<0 or p_offset>10000 then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select f.*,p.issued_at,pp.patient_code,pp.full_name,
 (select jsonb_agg(to_jsonb(i)||jsonb_build_object('dispensed',(select coalesce(sum(d.quantity),0) from dispense_events d where d.prescription_item_id=i.id))) from prescription_items i where i.prescription_id=p.id) items
 from prescription_fulfilments f join prescriptions p on p.id=f.prescription_id join patient_profiles pp on pp.id=p.patient_id where f.pharmacy_provider_id=my_provider_id() order by f.requested_at desc,f.id limit 20 offset p_offset) q),'[]');
end $$;

create or replace function c1_assign_followup(p_gap uuid,p_worker uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare g care_gaps; e encounters; task uuid; begin
 select * into g from care_gaps where id=p_gap for update;
 select * into e from encounters where id=g.source_id and g.source_table='encounters';
 if not found or e.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') or g.gap_type<>'FOLLOW_UP_PENDING' or g.status<>'OPEN' then raise exception 'Follow-up not authorized'; end if;
 if not exists(select 1 from provider_profiles where id=p_worker and provider_type='WORKER' and verification_status='APPROVED') then raise exception 'Approved worker required'; end if;
 if exists(select 1 from follow_up_tasks where care_gap_id=g.id) then raise exception 'Task already assigned'; end if;
 insert into follow_up_tasks(care_gap_id,patient_id,doctor_provider_id,worker_provider_id) values(g.id,g.patient_id,my_provider_id(),p_worker) returning id into task;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(g.patient_id,'FOLLOW_UP_ASSIGNED','follow_up_tasks',task,auth.uid());return task;
end $$;
create or replace function c1_worker_outcome(p_task uuid,p_status text,p_outcome text) returns void language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks; begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or t.worker_provider_id is distinct from my_provider_id() or not is_approved_provider('WORKER') then raise exception 'Task not authorized'; end if;
 if t.status in ('COMPLETED','AWAITING_VERIFICATION') or p_status not in ('CONTACTED','VISITED','ESCALATED','AWAITING_VERIFICATION') or nullif(trim(p_outcome),'') is null then raise exception 'Outcome required or task is awaiting verification/closed'; end if;
 update follow_up_tasks set status=p_status,outcome=trim(p_outcome),updated_at=now() where id=t.id;
 if p_status='ESCALATED' then update care_gaps set severity='HIGH' where id=t.care_gap_id and status='OPEN'; end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(t.patient_id,'FOLLOW_UP_'||p_status,'follow_up_tasks',t.id,auth.uid(),jsonb_build_object('outcome',p_outcome));
end $$;
create or replace function c1_verify_followup(p_task uuid) returns void language plpgsql security definer set search_path=public as $$
declare t follow_up_tasks; begin
 select * into t from follow_up_tasks where id=p_task for update;
 if not found or t.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Only assigned doctor may verify closure'; end if;
 if t.status='COMPLETED' then return; end if;
 if t.status<>'AWAITING_VERIFICATION' or nullif(trim(t.outcome),'') is null then raise exception 'Worker outcome required before verification'; end if;
 update follow_up_tasks set status='COMPLETED',verified_at=now(),verified_by=my_provider_id(),updated_at=now() where id=t.id;
 update care_gaps set status='CLOSED',closed_at=now() where id=t.care_gap_id and status='OPEN';
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(t.patient_id,'FOLLOW_UP_VERIFIED','follow_up_tasks',t.id,auth.uid());
end $$;
create or replace function c1_worker_queue(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_approved_provider('WORKER') or p_offset<0 or p_offset>10000 then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select t.*,p.patient_code,p.full_name,p.phone,g.due_at from follow_up_tasks t join patient_profiles p on p.id=t.patient_id join care_gaps g on g.id=t.care_gap_id where t.worker_provider_id=my_provider_id() order by t.assigned_at desc,t.id limit 20 offset p_offset) q),'[]');
end $$;

create or replace function c1_care_context(p_patient uuid,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid history offset'; end if;
 if not c1_can_patient(p_patient) then raise exception 'Patient context not authorized'; end if;
 return jsonb_build_object('patient_id',p_patient,'allergies','UNKNOWN: allergy history is not documented in this schema','scope','Dated records, 50 per section per page',
 'encounters',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,started_at,completed_at,chief_complaint,symptoms,diagnosis,clinical_notes,follow_up_in_days,status from encounters where patient_id=p_patient order by started_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'prescriptions',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.issued_at,p.status,p.clinical_notes,(select jsonb_agg(to_jsonb(i)) from prescription_items i where i.prescription_id=p.id) items,(select to_jsonb(f) from prescription_fulfilments f where f.prescription_id=p.id) fulfilment from prescriptions p where p.patient_id=p_patient order by issued_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'diagnostics',coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.test_name,o.ordered_at,o.status,o.routing_status,(select to_jsonb(r) from lab_results r where r.lab_order_id=o.id and r.status='COMPLETED' and r.verified_at is not null) result from lab_orders o where o.patient_id=p_patient order by o.ordered_at desc,o.id limit 50 offset p_offset) x),'[]'::jsonb),
 'health_records',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,record_type,record_date,source_type,original_filename,verification_status,created_at from health_records where patient_id=p_patient order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'care_gaps',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care_gaps where patient_id=p_patient order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from care_events where patient_id=p_patient order by created_at desc,id limit 50 offset p_offset) x),'[]'::jsonb),
 'follow_ups',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from follow_up_tasks where patient_id=p_patient order by assigned_at desc,id limit 50 offset p_offset) x),'[]'::jsonb));
end $$;

create or replace function c1_patient_directory(p_search text default '',p_offset integer default 0) returns table(id uuid,full_name text,patient_code text) language plpgsql stable security definer set search_path=public as $$
begin
 if not is_approved_provider('DOCTOR') or p_offset<0 or p_offset>10000 or length(p_search)>100 then raise exception 'Not authorized or invalid search'; end if;
 return query select p.id,p.full_name,p.patient_code from patient_profiles p where exists(select 1 from appointments a where a.patient_id=p.id and a.doctor_provider_id=my_provider_id() and a.status in ('CONFIRMED','COMPLETED'))
 and (p_search='' or strpos(lower(coalesce(p.full_name,'')||' '||p.patient_code),lower(p_search))>0) order by p.full_name,p.id limit 20 offset p_offset;
end $$;
create or replace function c1_next_step(p_patient uuid) returns setof care_gaps language sql stable security invoker set search_path=public as $$
 select * from care_gaps where patient_id=p_patient and status='OPEN' order by case severity when 'CRITICAL' then 0 when 'HIGH' then 1 else 2 end, due_at nulls last, created_at limit 1
$$;

-- Stop direct edits to signed encounters and counterfeit doctor/patient encounter links.
create policy c1_encounter_insert_guard on encounters as restrictive for insert to authenticated with check(status='IN_PROGRESS' and exists(select 1 from appointments a where a.id=appointment_id and a.patient_id=encounters.patient_id and a.doctor_provider_id=encounters.doctor_provider_id and a.status='CONFIRMED'));
create policy c1_encounter_update_guard on encounters as restrictive for update to authenticated using(status='IN_PROGRESS') with check(status='IN_PROGRESS');
do $c1$ declare c record; f record; begin
 for c in select column_name from information_schema.columns where table_schema='public' and table_name='encounters' loop execute format('revoke update(%I) on encounters from public,anon,authenticated',c.column_name); end loop;
 revoke update on encounters from public,anon,authenticated;
 grant update(chief_complaint,symptoms,temperature_c,pulse_bpm,systolic_bp,diastolic_bp,spo2_percent,weight_kg,diagnosis,clinical_notes,follow_up_in_days,updated_at) on encounters to authenticated;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'c1\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $c1$;
commit;
