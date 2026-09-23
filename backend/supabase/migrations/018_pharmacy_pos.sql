-- 018: governed medicine classification, anonymous OTC POS and non-restocking returns.
begin;
create table medicine_catalog(id uuid primary key default gen_random_uuid(),name text not null,strength text,dosage_form text,classification text not null check(classification in ('RX','OTC','UNKNOWN')),source_reference text not null check(length(trim(source_reference)) between 3 and 1000),version integer not null default 1,approved_by uuid not null references auth.users(id),approved_at timestamptz not null default now());
create index p2_medicine_search on medicine_catalog(lower(name) text_pattern_ops,id);
alter table pharmacy_inventory add column medicine_catalog_id uuid references medicine_catalog(id);
create table pharmacy_stock_ledger(id bigint generated always as identity primary key,pharmacy_provider_id uuid not null references provider_profiles(id),inventory_id uuid not null references pharmacy_inventory(id),quantity_delta integer not null,quantity_after integer not null,source_kind text not null,actor_user_id uuid references auth.users(id),recorded_at timestamptz not null default now());
create index p2_ledger_owner on pharmacy_stock_ledger(pharmacy_provider_id,id desc);
create table pharmacy_sales(id uuid primary key default gen_random_uuid(),pharmacy_provider_id uuid not null references provider_profiles(id),sale_kind text not null default 'OTC' check(sale_kind='OTC'),total numeric(14,2) not null check(total>=0),payment_state text not null default 'UNPAID' check(payment_state in ('UNPAID','RECORDED')),request_key uuid not null unique,request_payload jsonb not null,created_at timestamptz not null default now());
create table pharmacy_sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid not null references pharmacy_sales(id),inventory_id uuid not null references pharmacy_inventory(id),medicine_catalog_id uuid not null references medicine_catalog(id),medicine_name text not null,strength text,batch_number text,expiry_date date not null,quantity integer not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0),unique(sale_id,inventory_id));
create table pharmacy_sale_receipts(id uuid primary key default gen_random_uuid(),sale_id uuid not null unique references pharmacy_sales(id),request_key uuid not null unique,method text not null check(method in ('CASH','CARD','UPI','BANK_TRANSFER')),reference text,amount numeric(14,2) not null,recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now());
create table pharmacy_returns(id uuid primary key default gen_random_uuid(),sale_item_id uuid not null references pharmacy_sale_items(id),quantity integer not null check(quantity>0),reason text not null check(length(trim(reason)) between 3 and 2000),request_key uuid not null unique,disposition text not null default 'QUARANTINED_NO_RESTOCK',refund_state text not null default 'PENDING_REVIEW',recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now());
do $$declare t text;begin foreach t in array array['medicine_catalog','pharmacy_stock_ledger','pharmacy_sales','pharmacy_sale_items','pharmacy_sale_receipts','pharmacy_returns'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
revoke all on sequence pharmacy_stock_ledger_id_seq from public,anon,authenticated;
insert into pharmacy_stock_ledger(pharmacy_provider_id,inventory_id,quantity_delta,quantity_after,source_kind) select pharmacy_provider_id,id,0,quantity,'BASELINE_BALANCE' from pharmacy_inventory;
create function p2_stock_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='INSERT' or new.quantity<>old.quantity then insert into pharmacy_stock_ledger(pharmacy_provider_id,inventory_id,quantity_delta,quantity_after,source_kind,actor_user_id) values(new.pharmacy_provider_id,new.id,new.quantity-case when tg_op='INSERT' then 0 else old.quantity end,new.quantity,case when tg_op='INSERT' then 'STOCK_RECEIPT' else 'STOCK_MOVEMENT' end,auth.uid());end if;return new;
end $$;
create trigger p2_stock_change after insert or update of quantity on pharmacy_inventory for each row execute function p2_stock_change();
create function p2_catalog_record(p_name text,p_strength text,p_form text,p_classification text,p_source text) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if auth.uid() is null or not is_admin() then raise exception 'Medicine governance required';end if;
 if nullif(trim(p_name),'') is null or length(p_name)>300 or length(coalesce(p_strength,''))>200 or length(coalesce(p_form,''))>200 then raise exception 'Valid medicine details required';end if;
 insert into medicine_catalog(name,strength,dosage_form,classification,source_reference,approved_by) values(trim(p_name),nullif(trim(p_strength),''),nullif(trim(p_form),''),p_classification,p_source,auth.uid()) returning id into rid;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'MEDICINE_CATALOG_RECORDED','medicine_catalog',rid::text);return rid;
end $$;
create function p2_link_inventory(p_inventory uuid,p_catalog uuid) returns void language plpgsql security definer set search_path=public as $$
declare stock pharmacy_inventory;med medicine_catalog;
begin
 select * into stock from pharmacy_inventory where id=p_inventory for update;
 if not found or stock.pharmacy_provider_id is distinct from my_provider_id() or not is_approved_provider('PHARMACY') then raise exception 'Inventory not authorized';end if;
 select * into med from medicine_catalog where id=p_catalog;
 if not found or lower(trim(stock.medicine_name))<>lower(trim(med.name)) or lower(trim(coalesce(stock.strength,'')))<>lower(trim(coalesce(med.strength,''))) then raise exception 'Catalog medicine/strength must match actual stock';end if;
 if stock.medicine_catalog_id is not null and stock.medicine_catalog_id<>p_catalog then raise exception 'Existing stock classification cannot be silently replaced';end if;
 update pharmacy_inventory set medicine_catalog_id=p_catalog where id=stock.id;
end $$;
create function p2_search_medicines(p_search text,p_offset integer default 0) returns setof medicine_catalog language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_search is null or length(p_search) not between 2 and 100 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Bounded medicine search required';end if;
 return query select * from medicine_catalog where starts_with(lower(name),lower(p_search)) order by lower(name),id limit 30 offset p_offset;
end $$;
create function p2_otc_sale(p_items jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare prior pharmacy_sales;stock pharmacy_inventory;med medicine_catalog;item jsonb;qty integer;total numeric:=0;sid uuid;
begin
 if not is_approved_provider('PHARMACY') or p_request is null then raise exception 'Approved pharmacy and request key required';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Actual stock lines required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,18));
 select * into prior from pharmacy_sales where request_key=p_request;
 if found then if prior.pharmacy_provider_id<>my_provider_id() or prior.request_payload<>p_items then raise exception 'Sale request conflict';end if;return prior.id;end if;
 if (select count(distinct x->>'inventory_id') from jsonb_array_elements(p_items)x)<>jsonb_array_length(p_items) then raise exception 'Duplicate inventory line';end if;
 perform 1 from pharmacy_inventory where id in(select (x->>'inventory_id')::uuid from jsonb_array_elements(p_items)x) order by id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into stock from pharmacy_inventory where id=(item->>'inventory_id')::uuid;
  if not found or stock.pharmacy_provider_id<>my_provider_id() or stock.expiry_date is null or stock.expiry_date<current_date or stock.selling_price is null or stock.selling_price<0 or stock.selling_price<>round(stock.selling_price,2) or stock.selling_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Eligible owned stock with actual price and expiry required';end if;
  select * into med from medicine_catalog where id=stock.medicine_catalog_id;
  if not found or med.classification<>'OTC' then raise exception 'Governed OTC classification required; Rx and unknown stock cannot be sold anonymously';end if;
  if (item->>'quantity') is null or (item->>'quantity')!~'^[1-9][0-9]{0,5}$' then raise exception 'Positive integer quantity required';end if;
  qty:=(item->>'quantity')::integer;if qty>stock.quantity then raise exception 'Insufficient stock';end if;
  total:=total+round(qty*stock.selling_price,2);
 end loop;
 insert into pharmacy_sales(pharmacy_provider_id,total,request_key,request_payload) values(my_provider_id(),total,p_request,p_items) returning id into sid;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into stock from pharmacy_inventory where id=(item->>'inventory_id')::uuid;qty:=(item->>'quantity')::integer;
  insert into pharmacy_sale_items(sale_id,inventory_id,medicine_catalog_id,medicine_name,strength,batch_number,expiry_date,quantity,unit_price) values(sid,stock.id,stock.medicine_catalog_id,stock.medicine_name,stock.strength,stock.batch_number,stock.expiry_date,qty,stock.selling_price);
  update pharmacy_inventory set quantity=quantity-qty,updated_at=now() where id=stock.id;
 end loop;
 return sid;
end $$;
create function p2_payment(p_sale uuid,p_method text,p_reference text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare s pharmacy_sales;r pharmacy_sale_receipts;rid uuid;
begin
 select * into s from pharmacy_sales where id=p_sale for update;
 if not found or s.pharmacy_provider_id is distinct from my_provider_id() or not is_approved_provider('PHARMACY') then raise exception 'Sale not authorized';end if;
 if p_request is null or (p_method<>'CASH' and nullif(trim(p_reference),'') is null) or length(coalesce(p_reference,''))>200 then raise exception 'Actual payment evidence required';end if;
 select * into r from pharmacy_sale_receipts where request_key=p_request or sale_id=p_sale;
 if found then if r.sale_id<>s.id or r.method is distinct from p_method or r.reference is distinct from p_reference then raise exception 'Payment receipt conflict';end if;return r.id;end if;
 insert into pharmacy_sale_receipts(sale_id,request_key,method,reference,amount,recorded_by) values(s.id,p_request,p_method,p_reference,s.total,auth.uid()) returning id into rid;
 update pharmacy_sales set payment_state='RECORDED' where id=s.id;return rid;
end $$;
create function p2_return(p_item uuid,p_quantity integer,p_reason text,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i pharmacy_sale_items;s pharmacy_sales;r pharmacy_returns;returned integer;rid uuid;
begin
 select * into i from pharmacy_sale_items where id=p_item;select * into s from pharmacy_sales where id=i.sale_id for update;
 if not found or s.pharmacy_provider_id is distinct from my_provider_id() or not is_approved_provider('PHARMACY') then raise exception 'Sale return not authorized';end if;
 if p_quantity is null or p_quantity<=0 or p_request is null then raise exception 'Positive return quantity and request key required';end if;
 select * into r from pharmacy_returns where request_key=p_request;
 if found then if r.sale_item_id<>i.id or r.quantity<>p_quantity or r.reason is distinct from trim(p_reason) then raise exception 'Return request conflict';end if;return r.id;end if;
 select coalesce(sum(quantity),0) into returned from pharmacy_returns where sale_item_id=i.id;
 if returned+p_quantity>i.quantity then raise exception 'Return exceeds sold quantity';end if;
 insert into pharmacy_returns(sale_item_id,quantity,reason,request_key,recorded_by) values(i.id,p_quantity,trim(p_reason),p_request,auth.uid()) returning id into rid;
 -- Medicines are quarantined for review, never automatically returned to sellable inventory.
 return rid;
end $$;
create function p2_sale(p_sale uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare s pharmacy_sales;
begin
 select * into s from pharmacy_sales where id=p_sale and pharmacy_provider_id=my_provider_id();if not found or not is_approved_provider('PHARMACY') then raise exception 'Sale not authorized';end if;
 return jsonb_build_object('sale',to_jsonb(s)-'request_key'-'request_payload','items',coalesce((select jsonb_agg(to_jsonb(i)) from pharmacy_sale_items i where sale_id=s.id),'[]'),'payment', (select to_jsonb(p)-'request_key' from pharmacy_sale_receipts p where sale_id=s.id),'returns',coalesce((select jsonb_agg(to_jsonb(r)-'request_key') from pharmacy_returns r join pharmacy_sale_items i on i.id=r.sale_item_id where i.sale_id=s.id),'[]'),'tax_semantics','Recorded selling price; tax breakdown not configured');
end $$;
create function p2_ledger(p_before bigint default null) returns setof pharmacy_stock_ledger language plpgsql stable security definer set search_path=public as $$
begin if not is_approved_provider('PHARMACY') then raise exception 'Pharmacy required';end if;return query select * from pharmacy_stock_ledger where pharmacy_provider_id=my_provider_id() and (p_before is null or id<p_before) order by id desc limit 100;end $$;
do $$declare r record;begin for r in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'p2_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.proname<>'p2_stock_change' then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;end $$;
commit;
