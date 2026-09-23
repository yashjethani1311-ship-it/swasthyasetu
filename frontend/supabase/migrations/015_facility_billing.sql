-- 015: source-linked facility invoices and recorded payment/refund ledger.
begin;
create table facility_invoices(id uuid primary key default gen_random_uuid(),facility_id uuid not null references facilities(id),patient_id uuid not null references patient_profiles(id),source_kind text not null check(source_kind in ('APPOINTMENT','ADMISSION')),source_id uuid not null,currency text not null default 'INR' check(currency='INR'),total numeric(14,2) not null check(total>=0),status text not null default 'ISSUED' check(status in ('ISSUED','PARTIALLY_PAID','PAID','VOID')),request_key uuid not null unique,request_payload jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create index h3_invoice_facility on facility_invoices(facility_id,created_at desc,id);
create index h3_invoice_patient on facility_invoices(patient_id,created_at desc,id);
create table facility_invoice_lines(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references facility_invoices(id),description text not null,quantity numeric(12,3) not null check(quantity>0),unit_price numeric(12,2) not null check(unit_price>=0),tax_rate numeric(5,2) not null check(tax_rate between 0 and 100),line_total numeric(14,2) not null check(line_total>=0));
create table facility_payments(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references facility_invoices(id),kind text not null check(kind in ('PAYMENT','REFUND')),amount numeric(14,2) not null check(amount>0),method text not null check(method in ('CASH','BANK_TRANSFER','CARD','UPI')),external_reference text,reason text,refund_of uuid references facility_payments(id),request_key uuid not null unique,recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),check((kind='REFUND')=(refund_of is not null)));
create index h3_payment_invoice on facility_payments(invoice_id,recorded_at,id);
do $$declare t text;begin foreach t in array array['facility_invoices','facility_invoice_lines','facility_payments'] loop execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);end loop;end $$;
create function h3_issue(p_facility uuid,p_source_kind text,p_source uuid,p_lines jsonb,p_request uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare patient uuid;prior facility_invoices;payload jsonb;line jsonb;qty numeric;price numeric;tax numeric;total numeric:=0;rid uuid;
begin
 if not h1_staff(p_facility,array['MANAGER','RECEPTION']) or p_request is null then raise exception 'Facility billing authorization required';end if;
 payload:=jsonb_build_object('source_kind',p_source_kind,'source_id',p_source,'lines',p_lines);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,15));
 select * into prior from facility_invoices where request_key=p_request;
 if found then if prior.facility_id<>p_facility or prior.request_payload<>payload then raise exception 'Invoice request conflict';end if;return prior.id;end if;
 if p_source_kind='APPOINTMENT' then select a.patient_id into patient from appointments a join provider_practices p on p.id=a.practice_id where a.id=p_source and p.facility_id=p_facility and a.status not in ('CANCELLED','NO_SHOW');
 elsif p_source_kind='ADMISSION' then select patient_id into patient from hospital_admissions where id=p_source and facility_id=p_facility;
 else raise exception 'Unsupported invoice source';end if;
 if patient is null then raise exception 'Source does not establish facility patient relationship';end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Invoice needs 1 to 100 actual charge lines';end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  qty:=(line->>'quantity')::numeric;price:=(line->>'unit_price')::numeric;tax:=coalesce((line->>'tax_rate')::numeric,0);
  if nullif(trim(line->>'description'),'') is null or length(line->>'description')>500 or qty is null or qty<=0 or qty>100000 or qty<>round(qty,3) or price is null or price<0 or price>10000000 or price<>round(price,2) or tax<0 or tax>100 or tax<>round(tax,2) then raise exception 'Invalid charge line';end if;
  if qty::text in ('NaN','Infinity','-Infinity') or price::text in ('NaN','Infinity','-Infinity') or tax::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid charge number';end if;
  total:=total+round(qty*price*(1+tax/100),2);
 end loop;
 insert into facility_invoices(facility_id,patient_id,source_kind,source_id,total,request_key,request_payload,created_by,status) values(p_facility,patient,p_source_kind,p_source,total,p_request,payload,auth.uid(),case when total=0 then 'PAID' else 'ISSUED' end) returning id into rid;
 for line in select value from jsonb_array_elements(p_lines) loop
  qty:=(line->>'quantity')::numeric;price:=(line->>'unit_price')::numeric;tax:=coalesce((line->>'tax_rate')::numeric,0);
  insert into facility_invoice_lines(invoice_id,description,quantity,unit_price,tax_rate,line_total) values(rid,trim(line->>'description'),qty,price,tax,round(qty*price*(1+tax/100),2));
 end loop;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(p_facility,auth.uid(),'INVOICE_ISSUED',rid,'ISSUED');return rid;
end $$;
create function h3_record_payment(p_invoice uuid,p_amount numeric,p_method text,p_reference text,p_request uuid,p_refund_of uuid default null,p_reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare i facility_invoices;prior facility_payments;original facility_payments;balance numeric;refunded numeric;rid uuid;kind text:=case when p_refund_of is null then 'PAYMENT' else 'REFUND' end;
begin
 select * into i from facility_invoices where id=p_invoice for update;
 if not found or not h1_staff(i.facility_id,array['MANAGER','RECEPTION']) then raise exception 'Invoice payment not authorized';end if;
 if p_request is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') or p_method is null or p_method not in ('CASH','BANK_TRANSFER','CARD','UPI') or length(coalesce(p_reference,''))>200 or length(coalesce(p_reason,''))>2000 then raise exception 'Invalid payment details';end if;
 if p_method<>'CASH' and nullif(trim(p_reference),'') is null then raise exception 'Actual payment reference required';end if;
 select * into prior from facility_payments where request_key=p_request;
 if found then if prior.invoice_id<>i.id or prior.kind<>kind or prior.amount<>p_amount or prior.method<>p_method or prior.external_reference is distinct from p_reference or prior.refund_of is distinct from p_refund_of or prior.reason is distinct from p_reason then raise exception 'Payment request conflict';end if;return prior.id;end if;
 if i.status='VOID' then raise exception 'Invoice is void';end if;
 select coalesce(sum(case when p.kind='PAYMENT' then p.amount else -p.amount end),0) into balance from facility_payments p where p.invoice_id=i.id;
 if kind='PAYMENT' and balance+p_amount>i.total then raise exception 'Payment exceeds invoice balance';end if;
 if kind='REFUND' then
  if not h1_staff(i.facility_id,array['MANAGER']) or nullif(trim(p_reason),'') is null then raise exception 'Refund needs manager and reason';end if;
  select * into original from facility_payments where id=p_refund_of and invoice_id=i.id and facility_payments.kind='PAYMENT';
  if not found then raise exception 'Original invoice payment required';end if;
  select coalesce(sum(amount),0) into refunded from facility_payments where refund_of=p_refund_of;
  if refunded+p_amount>original.amount or p_amount>balance then raise exception 'Refund exceeds recorded payment';end if;
 end if;
 insert into facility_payments(invoice_id,kind,amount,method,external_reference,reason,refund_of,request_key,recorded_by) values(i.id,kind,p_amount,p_method,p_reference,p_reason,p_refund_of,p_request,auth.uid()) returning id into rid;
 balance:=balance+case when kind='PAYMENT' then p_amount else -p_amount end;
 update facility_invoices set status=case when balance=total then 'PAID' when balance>0 then 'PARTIALLY_PAID' else 'ISSUED' end where id=i.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id) values(i.facility_id,auth.uid(),kind||'_RECORDED',rid);return rid;
end $$;
create function h3_void(p_invoice uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare i facility_invoices;
begin
 select * into i from facility_invoices where id=p_invoice for update;
 if not found or not h1_staff(i.facility_id,array['MANAGER']) or p_reason is null or length(trim(p_reason)) not between 3 and 2000 then raise exception 'Manager and void reason required';end if;
 if i.status='VOID' then return;end if;
 if exists(select 1 from facility_payments where invoice_id=i.id) then raise exception 'Invoice with recorded money movements cannot be voided';end if;
 update facility_invoices set status='VOID' where id=i.id;
 insert into facility_operation_events(facility_id,actor_user_id,action,entity_id,to_state) values(i.facility_id,auth.uid(),'INVOICE_VOID: '||trim(p_reason),i.id,'VOID');
end $$;
create function h3_invoice(p_invoice uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i facility_invoices;
begin
 select * into i from facility_invoices where id=p_invoice;
 if not found or not(h1_staff(i.facility_id,array['MANAGER','RECEPTION']) or exists(select 1 from patient_profiles where id=i.patient_id and user_id=auth.uid())) then raise exception 'Invoice not authorized';end if;
 return jsonb_build_object('invoice',to_jsonb(i)-'request_payload'-'request_key','lines',coalesce((select jsonb_agg(to_jsonb(l)) from facility_invoice_lines l where invoice_id=i.id),'[]'),'payments',coalesce((select jsonb_agg(to_jsonb(p)-'request_key'-'recorded_by') from facility_payments p where invoice_id=i.id),'[]'),'payment_semantics','Operator-recorded payment evidence; no external settlement verification');
end $$;
do $$declare r record;begin for r in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'h3_%' loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;end $$;
commit;
