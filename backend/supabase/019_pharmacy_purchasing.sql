-- 019: pharmacy suppliers, purchase orders and partial stock receipts.
begin;
create table pharmacy_suppliers(id uuid primary key default gen_random_uuid(),pharmacy_provider_id uuid not null references provider_profiles(id),name text not null check(length(trim(name)) between 1 and 300),reference text not null check(length(trim(reference)) between 1 and 300),created_at timestamptz not null default now(),unique(pharmacy_provider_id,reference));
create table pharmacy_purchases(id uuid primary key default gen_random_uuid(),pharmacy_provider_id uuid not null references provider_profiles(id),supplier_id uuid not null references pharmacy_suppliers(id),supplier_order_reference text not null,status text not null default 'ORDERED' check(status in ('ORDERED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),request_key uuid not null unique,request_payload jsonb not null,created_at timestamptz not null default now());
create table pharmacy_purchase_lines(id uuid primary key default gen_random_uuid(),purchase_id uuid not null references pharmacy_purchases(id),medicine_catalog_id uuid not null references medicine_catalog(id),quantity_ordered integer not null check(quantity_ordered>0),unit_cost numeric(12,2) not null check(unit_cost>=0),unique(purchase_id,medicine_catalog_id));
create table pharmacy_purchase_receipts(id uuid primary key default gen_random_uuid(),purchase_line_id uuid not null references pharmacy_purchase_lines(id),inventory_id uuid not null references pharmacy_inventory(id),quantity integer not null check(quantity>0),supplier_receipt_reference text not null,request_key uuid not null unique,request_payload jsonb not null,received_by uuid not null references auth.users(id),received_at timestamptz not null default now());
create index p3_purchase_owner on pharmacy_purchases(pharmacy_provider_id,created_at desc,id);
create index p3_receipt_line on pharmacy_purchase_receipts(purchase_line_id);
do $$declare t text;begin foreach t in array array['pharmacy_suppliers','pharmacy_purchases','pharmacy_purchase_lines','pharmacy_purchase_receipts'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function p3_supplier(p_name text,p_reference text) returns uuid language plpgsql security definer set search_path=public as $$
declare s pharmacy_suppliers;rid uuid;
begin
 if not is_approved_provider('PHARMACY') then raise exception 'Pharmacy required';end if;
 insert into pharmacy_suppliers(pharmacy_provider_id,name,reference) values(my_provider_id(),trim(p_name),trim(p_reference)) on conflict(pharmacy_provider_id,reference) do nothing returning id into rid;
 if rid is null then select * into s from pharmacy_suppliers where pharmacy_provider_id=my_provider_id() and reference=trim(p_reference);if s.name<>trim(p_name) then raise exception 'Supplier reference already belongs to another name';end if;rid:=s.id;end if;return rid;
end $$;
create function p3_order(p_supplier uuid,p_reference text,p_lines jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare prior pharmacy_purchases;line jsonb;payload jsonb;rid uuid;qty integer;cost numeric;
begin
 if not is_approved_provider('PHARMACY') or not exists(select 1 from pharmacy_suppliers where id=p_supplier and pharmacy_provider_id=my_provider_id()) then raise exception 'Owned supplier required';end if;
 if p_request is null or p_reference is null or length(trim(p_reference)) not between 1 and 300 or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Valid purchase details required';end if;
 payload:=jsonb_build_object('supplier_id',p_supplier,'reference',trim(p_reference),'lines',p_lines);perform pg_advisory_xact_lock(hashtextextended(p_request::text,19));select * into prior from pharmacy_purchases where request_key=p_request;
 if found then if prior.pharmacy_provider_id<>my_provider_id() or prior.request_payload<>payload then raise exception 'Purchase request conflict';end if;return prior.id;end if;
 insert into pharmacy_purchases(pharmacy_provider_id,supplier_id,supplier_order_reference,request_key,request_payload) values(my_provider_id(),p_supplier,trim(p_reference),p_request,payload) returning id into rid;
 for line in select value from jsonb_array_elements(p_lines) loop
  if (line->>'quantity') is null or (line->>'quantity')!~'^[1-9][0-9]{0,5}$' then raise exception 'Positive integer purchase quantity required';end if;qty:=(line->>'quantity')::integer;cost:=(line->>'unit_cost')::numeric;
  if cost is null or cost<0 or cost<>round(cost,2) or cost::text in ('NaN','Infinity','-Infinity') then raise exception 'Actual unit cost required';end if;
  insert into pharmacy_purchase_lines(purchase_id,medicine_catalog_id,quantity_ordered,unit_cost) values(rid,(line->>'medicine_catalog_id')::uuid,qty,cost);
 end loop;return rid;
end $$;
create function p3_receive(p_line uuid,p_quantity integer,p_batch text,p_expiry date,p_selling_price numeric,p_supplier_receipt text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare l pharmacy_purchase_lines;p pharmacy_purchases;m medicine_catalog;r pharmacy_purchase_receipts;received integer;stock uuid;rid uuid;payload jsonb;
begin
 select * into l from pharmacy_purchase_lines where id=p_line;select * into p from pharmacy_purchases where id=l.purchase_id for update;
 if not found or p.pharmacy_provider_id is distinct from my_provider_id() or not is_approved_provider('PHARMACY') then raise exception 'Purchase receipt not authorized';end if;
 if p_request is null or p_quantity is null or p_quantity<=0 or p_supplier_receipt is null or length(trim(p_supplier_receipt)) not between 1 and 300 then raise exception 'Actual supplier receipt and quantity required';end if;
 payload:=jsonb_build_object('quantity',p_quantity,'batch',p_batch,'expiry',p_expiry,'selling_price',p_selling_price,'supplier_receipt',trim(p_supplier_receipt));select * into r from pharmacy_purchase_receipts where request_key=p_request;
 if found then if r.purchase_line_id<>l.id or r.request_payload<>payload then raise exception 'Receipt request conflict';end if;return r.id;end if;
 if p.status='CANCELLED' then raise exception 'Purchase cancelled';end if;
 select coalesce(sum(quantity),0) into received from pharmacy_purchase_receipts where purchase_line_id=l.id;
 if received+p_quantity>l.quantity_ordered then raise exception 'Receipt exceeds ordered quantity';end if;
 if exists(select 1 from pharmacy_inventory where receipt_key=p_request) then raise exception 'Receipt key already used outside this purchase';end if;
 select * into m from medicine_catalog where id=l.medicine_catalog_id;
 stock:=c1_add_stock(m.name,m.strength,p_batch,p_expiry,p_quantity,p_selling_price,p_request);perform p2_link_inventory(stock,m.id);
 insert into pharmacy_purchase_receipts(purchase_line_id,inventory_id,quantity,supplier_receipt_reference,request_key,request_payload,received_by) values(l.id,stock,p_quantity,trim(p_supplier_receipt),p_request,payload,auth.uid()) returning id into rid;
 update pharmacy_purchases set status=case when not exists(select 1 from pharmacy_purchase_lines x where x.purchase_id=p.id and x.quantity_ordered>(select coalesce(sum(quantity),0) from pharmacy_purchase_receipts where purchase_line_id=x.id)) then 'RECEIVED' else 'PARTIALLY_RECEIVED' end where id=p.id;return rid;
end $$;
create function p3_purchases(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_approved_provider('PHARMACY') or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Pharmacy purchase list not authorized';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.supplier_id,p.supplier_order_reference,p.status,p.created_at,(select jsonb_agg(to_jsonb(l)||jsonb_build_object('quantity_received',(select coalesce(sum(quantity),0) from pharmacy_purchase_receipts where purchase_line_id=l.id))) from pharmacy_purchase_lines l where l.purchase_id=p.id) lines from pharmacy_purchases p where p.pharmacy_provider_id=my_provider_id() order by created_at desc,id limit 30 offset p_offset)x),'[]');
end $$;
revoke all on function p3_supplier(text,text),p3_order(uuid,text,jsonb,uuid),p3_receive(uuid,integer,text,date,numeric,text,uuid),p3_purchases(integer) from public,anon,authenticated;
grant execute on function p3_supplier(text,text),p3_order(uuid,text,jsonb,uuid),p3_receive(uuid,integer,text,date,numeric,text,uuid),p3_purchases(integer) to authenticated;
commit;

