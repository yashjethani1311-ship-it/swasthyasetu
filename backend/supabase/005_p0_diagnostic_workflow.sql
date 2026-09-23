-- 005: P0 workflow. Apply AFTER 004. No live data is deleted or reset.
begin;
set local search_path = public;

-- Fixed facility locations; never copied from provider GPS.
alter table public.facilities add column if not exists village text;
alter table public.facilities add column if not exists district text;
alter table public.facilities add column if not exists postal_code text;
alter table public.lab_orders add column if not exists destination_facility_id uuid references public.facilities(id);
alter table public.diagnostic_tests add column if not exists result_kind text not null default 'PARAMETERS' check (result_kind in ('PARAMETERS','DOCUMENT'));
create index if not exists p0_orders_patient_time on public.lab_orders(patient_id, ordered_at desc);
create index if not exists p0_orders_doctor_time on public.lab_orders(doctor_provider_id, ordered_at desc);
create index if not exists p0_orders_lab_time on public.lab_orders(lab_provider_id, ordered_at desc);
create index if not exists p0_orders_centre_time on public.lab_orders(collection_centre_id, ordered_at desc);
create index if not exists p0_gaps_source on public.care_gaps(source_table, source_id, gap_type, status);
create index if not exists p0_events_source on public.care_events(source_table, source_id, event_type);
create index if not exists p0_centres_facility on public.collection_centres(facility_id);
create index if not exists p0_facility_owner on public.facilities(owner_user_id, facility_type);

-- Table-level grants override column revocations. Remove BOTH before granting a safe subset.
do $p0$ declare r record; begin
 for r in select table_name,column_name from information_schema.columns where table_schema='public'
 and table_name in ('profiles','patient_profiles','provider_profiles','facilities','lab_orders','lab_results','lab_observations','lab_machine_payloads','lab_specimens','sample_transports','sample_custody_events','care_events','care_gaps') loop
 execute format('revoke insert (%I), update (%I), references (%I) on public.%I from public, anon, authenticated',r.column_name,r.column_name,r.column_name,r.table_name);
 end loop;
end $p0$;
revoke insert, update, delete, truncate, references, trigger on public.profiles, public.patient_profiles, public.provider_profiles, public.facilities, public.lab_orders, public.lab_results, public.lab_observations, public.lab_machine_payloads, public.lab_specimens, public.sample_transports, public.sample_custody_events, public.care_events, public.care_gaps from public, anon, authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(full_name,date_of_birth,sex,phone,city,state,preferred_language) on public.patient_profiles to authenticated;

create or replace function public.p0_owns_centre(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from collection_centres c join facilities f on f.id=c.facility_id
 join provider_profiles p on p.user_id=f.owner_user_id where c.id=p_id and c.active and f.owner_user_id=auth.uid()
 and f.verification_status='APPROVED' and p.verification_status='APPROVED' and p.provider_type in ('FACILITY','LAB'))
$$;
create or replace function public.p0_reads_order(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from lab_orders o where o.id=p_id and (
 exists(select 1 from patient_profiles p where p.id=o.patient_id and p.user_id=auth.uid())
 or (o.doctor_provider_id=my_provider_id() and is_approved_provider('DOCTOR'))
 or (o.lab_provider_id=my_provider_id() and is_approved_provider('LAB'))))
$$;
create or replace function public.p0_reads_result(p_order uuid) returns boolean language sql stable security definer set search_path=public as $$
 select p0_reads_order(p_order) and exists(select 1 from lab_orders o where o.id=p_order and
 ((o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')) or exists(select 1 from lab_results r where r.lab_order_id=p_order and r.status='COMPLETED' and r.verified_at is not null)))
$$;
-- Restrictive policies close old permissive OR paths without dropping historical policies.
create policy p0_order_read_guard on public.lab_orders as restrictive for select to authenticated using(public.p0_reads_order(id));
create policy p0_result_read_guard on public.lab_results as restrictive for select to authenticated using(public.p0_reads_result(lab_order_id));
create policy p0_observation_read_guard on public.lab_observations as restrictive for select to authenticated using(public.p0_reads_result(lab_order_id));
create or replace function public.p0_connected_patient(p_patient uuid) returns boolean language sql stable security definer set search_path=public as $$
 select is_approved_provider('DOCTOR') and exists(select 1 from appointments a where a.patient_id=p_patient and a.doctor_provider_id=my_provider_id() and a.status in ('CONFIRMED','COMPLETED'))
$$;
create policy p0_connected_doctor on public.patient_profiles for select to authenticated using(public.p0_connected_patient(id));

create or replace function public.p0_discover(p_test uuid, p_kind text, p_search text default '', p_lat double precision default null, p_lon double precision default null, p_offset integer default 0)
returns table(destination_id uuid, provider_id uuid, name text, kind text, address text, latitude double precision, longitude double precision, distance_km double precision, capability text)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_kind not in ('CENTRE','LAB') or p_offset<0 or p_offset>10000 or length(p_search)>150 then raise exception 'Invalid search'; end if;
 if (p_lat is null) <> (p_lon is null) or (p_lat is not null and not (p_lat between -90 and 90 and p_lon between -180 and 180)) then raise exception 'Invalid coordinates'; end if;
 return query with options as (
 select c.id dest, null::uuid provider, c.centre_name label, 'CENTRE'::text typ,
 concat_ws(', ',c.address_line,c.village,c.city,c.district,c.state,c.postal_code) addr,c.latitude lat,c.longitude lon,
 exists(select 1 from collection_centre_tests ct where ct.collection_centre_id=c.id and ct.diagnostic_test_id=p_test and ct.active) supports
 from collection_centres c join facilities f on f.id=c.facility_id join provider_profiles pp on pp.user_id=f.owner_user_id
 where p_kind='CENTRE' and c.active and f.verification_status='APPROVED' and pp.verification_status='APPROVED' and pp.provider_type in ('FACILITY','LAB')
 union all
 select f.id, pp.id, f.name,'LAB',concat_ws(', ',f.address_text,f.village,f.city,f.district,f.state,f.postal_code), f.latitude,f.longitude,
 exists(select 1 from lab_test_capabilities lc where lc.lab_provider_id=pp.id and lc.diagnostic_test_id=p_test and lc.active)
 from facilities f join provider_profiles pp on pp.user_id=f.owner_user_id
 where p_kind='LAB' and f.facility_type='DIAGNOSTIC_LAB' and f.verification_status='APPROVED' and pp.provider_type='LAB' and pp.verification_status='APPROVED'
 ), distances as (
 select *, case when p_lat is not null and lat between -90 and 90 and lon between -180 and 180 then
 6371.0088*2*asin(sqrt(least(1::double precision,power(sin(radians(lat-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(lat))*power(sin(radians(lon-p_lon)/2),2)))) end distance from options
 where p_search='' or strpos(lower(label||' '||addr),lower(p_search))>0
 ) select dest,provider,label,typ,addr,lat,lon,distance,case when supports then 'SUPPORTED' else 'UNKNOWN' end
 from distances order by supports desc,distance nulls last,label,dest limit 20 offset p_offset;
end $$;

create or replace function public.p0_select_destination(p_order uuid,p_kind text,p_destination uuid) returns void language plpgsql security definer set search_path=public as $$
declare o lab_orders; lab_id uuid; begin
 select * into o from lab_orders where id=p_order for update;
 if not found or not exists(select 1 from patient_profiles where id=o.patient_id and user_id=auth.uid()) then raise exception 'Order not authorized'; end if;
 if o.status <> 'ORDERED' or exists(select 1 from lab_specimens where lab_order_id=o.id) or o.lab_provider_id is not null or o.collection_centre_id is not null then raise exception 'Destination is already set or collection has started'; end if;
 if o.diagnostic_test_id is null then raise exception 'Test definition/configuration required'; end if;
 if p_kind='CENTRE' then
 if not exists(select 1 from collection_centres c join facilities f on f.id=c.facility_id join provider_profiles pp on pp.user_id=f.owner_user_id join collection_centre_tests ct on ct.collection_centre_id=c.id where c.id=p_destination and c.active and ct.active and ct.diagnostic_test_id=o.diagnostic_test_id and f.verification_status='APPROVED' and pp.verification_status='APPROVED' and pp.provider_type in ('FACILITY','LAB')) then raise exception 'Centre is not eligible'; end if;
 update lab_orders set collection_centre_id=p_destination,routing_mode='COLLECTION_CENTRE',routing_status='DESTINATION_SELECTED',patient_selected_lab=false where id=o.id;
 elsif p_kind='LAB' then
 select pp.id into lab_id from facilities f join provider_profiles pp on pp.user_id=f.owner_user_id join lab_test_capabilities lc on lc.lab_provider_id=pp.id where f.id=p_destination and f.facility_type='DIAGNOSTIC_LAB' and f.verification_status='APPROVED' and pp.provider_type='LAB' and pp.verification_status='APPROVED' and lc.diagnostic_test_id=o.diagnostic_test_id and lc.active;
 if lab_id is null then raise exception 'Laboratory is not eligible'; end if;
 update lab_orders set lab_provider_id=lab_id,destination_facility_id=p_destination,routing_mode='DIRECT_LAB',routing_status='DESTINATION_SELECTED',patient_selected_lab=true where id=o.id;
 else raise exception 'Invalid destination type'; end if;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(o.patient_id,'DIAGNOSTIC_DESTINATION_SELECTED','lab_orders',o.id,auth.uid(),jsonb_build_object('kind',p_kind,'destination_id',p_destination));
end $$;

create or replace function public.p0_create_orders(p_encounter uuid,p_tests uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare e encounters; t diagnostic_tests; oid uuid; tid uuid; begin
 select * into e from encounters where id=p_encounter for update;
 if not found or e.doctor_provider_id<>my_provider_id() or not is_approved_provider('DOCTOR') or e.status<>'IN_PROGRESS' then raise exception 'Encounter not authorized or closed'; end if;
 if not exists(select 1 from appointments a where a.id=e.appointment_id and a.patient_id=e.patient_id and a.doctor_provider_id=e.doctor_provider_id and a.status in ('CONFIRMED','COMPLETED')) then raise exception 'Care relationship not confirmed'; end if;
 if coalesce(cardinality(p_tests),0)>50 then raise exception 'Too many tests'; end if;
 foreach tid in array p_tests loop
 select * into t from diagnostic_tests where id=tid and active;
 if not found then raise exception 'Active catalog test required'; end if;
 if not exists(select 1 from lab_orders where encounter_id=e.id and diagnostic_test_id=t.id and status<>'CANCELLED') then
 insert into lab_orders(patient_id,doctor_provider_id,appointment_id,encounter_id,diagnostic_test_id,test_name,clinical_note,status)
 values(e.patient_id,e.doctor_provider_id,e.appointment_id,e.id,t.id,t.test_name,e.clinical_notes,'ORDERED') returning id into oid;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(e.patient_id,'LAB_ORDERED','lab_orders',oid,auth.uid());
 end if; end loop;
end $$;

create or replace function public.p0_link_order_test(p_order uuid,p_test uuid) returns void language plpgsql security definer set search_path=public as $$
declare o lab_orders; t diagnostic_tests; begin
 select * into o from lab_orders where id=p_order for update;
 if not found or o.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Only the ordering approved doctor can link this test'; end if;
 if o.diagnostic_test_id is not null or o.status<>'ORDERED' or exists(select 1 from lab_specimens where lab_order_id=o.id) or exists(select 1 from lab_results where lab_order_id=o.id) then raise exception 'Only an uncollected legacy order can be linked'; end if;
 select * into t from diagnostic_tests where id=p_test and active;
 if not found then raise exception 'Active catalog test required'; end if;
 update lab_orders set diagnostic_test_id=t.id,test_name=t.test_name where id=o.id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(o.patient_id,'LAB_ORDER_CATALOG_LINKED','lab_orders',o.id,auth.uid(),jsonb_build_object('original_test_name',o.test_name,'diagnostic_test_id',t.id));
end $$;

-- Minimal collection view: no diagnosis, note, demographics or report contents exposed to centre staff.
create or replace function public.p0_collection_queue(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset<0 or p_offset>10000 then raise exception 'Invalid request'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select o.id,o.test_name,o.diagnostic_test_id,o.status,o.ordered_at,o.collection_centre_id, p.patient_code,p.full_name,
 (select jsonb_agg(to_jsonb(s) order by s.created_at) from lab_specimens s where s.lab_order_id=o.id) lab_specimens
 from lab_orders o join patient_profiles p on p.id=o.patient_id where p0_owns_centre(o.collection_centre_id)
 order by o.ordered_at desc,o.id limit 20 offset p_offset) q),'[]'::jsonb);
end $$;

create or replace function public.p0_specimen_step(p_order uuid,p_action text,p_sample text default null,p_lab uuid default null,p_note text default null,p_transporter text default null,p_vehicle text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare o lab_orders; s lab_specimens; centre boolean; lab boolean; new_status text; ev text; specimen_id uuid; begin
 select * into o from lab_orders where id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 centre:=p0_owns_centre(o.collection_centre_id);
 lab:=coalesce(o.lab_provider_id=my_provider_id() and is_approved_provider('LAB'),false);
 if not coalesce(centre,false) and not lab then raise exception 'Not authorized'; end if;
 if o.status in ('COMPLETED','CANCELLED') then raise exception 'Order is closed'; end if;
 if p_action='COLLECT' then
 if not (centre or (lab and o.collection_centre_id is null)) then raise exception 'Collection belongs to selected centre'; end if;
 if exists(select 1 from lab_specimens where lab_order_id=o.id) then raise exception 'Specimen already exists; recollection requires a new order'; end if;
 if o.diagnostic_test_id is null or not exists(select 1 from diagnostic_tests where id=o.diagnostic_test_id and active) then raise exception 'Test definition required'; end if;
 insert into lab_specimens(lab_order_id,collection_centre_id,processing_lab_provider_id,specimen_type,status,collected_at)
 select o.id,o.collection_centre_id,o.lab_provider_id,t.specimen_type,'COLLECTED',now() from diagnostic_tests t where t.id=o.diagnostic_test_id returning id into specimen_id;
 update lab_orders set status='SAMPLE_COLLECTED',routing_status='COLLECTED' where id=o.id;
 insert into sample_custody_events(specimen_id,event_type,actor_user_id,to_location_type,to_location_id,notes) values(specimen_id,'COLLECTED',auth.uid(),case when centre then 'COLLECTION_CENTRE' else 'LAB' end,coalesce(o.collection_centre_id,o.lab_provider_id),nullif(trim(p_note),''));
 return specimen_id;
 end if;
 select * into s from lab_specimens where lab_order_id=o.id and sample_code=p_sample for update;
 if not found then raise exception 'Scan or enter the matching sample ID'; end if;
 if p_action='PACK' and centre and s.status='COLLECTED' then new_status:='PACKED';ev:='PACKED';
 elsif p_action='DISPATCH' and centre and s.status='PACKED' then
 if nullif(trim(p_transporter),'') is null then raise exception 'Transporter is required'; end if;
 if not exists(select 1 from lab_test_capabilities lc join provider_profiles p on p.id=lc.lab_provider_id where lc.lab_provider_id=p_lab and lc.diagnostic_test_id=o.diagnostic_test_id and lc.active and p.verification_status='APPROVED' and p.provider_type='LAB') then raise exception 'Processing laboratory lacks capability'; end if;
 new_status:='IN_TRANSIT';ev:='DISPATCHED';
 update lab_orders set lab_provider_id=p_lab where id=o.id;
 update lab_specimens set processing_lab_provider_id=p_lab where id=s.id;
 insert into sample_transports(specimen_id,status,transporter_name,vehicle_reference,pickup_at,notes) values(s.id,'IN_TRANSIT',trim(p_transporter),nullif(trim(p_vehicle),''),now(),nullif(trim(p_note),''));
 elsif p_action='RECEIVE' and lab and (s.status='IN_TRANSIT' or (s.status='COLLECTED' and o.collection_centre_id is null)) then
 new_status:='RECEIVED_AT_LAB';ev:='RECEIVED';
 update sample_transports st set status='DELIVERED',delivered_at=now(),updated_at=now() where st.specimen_id=s.id and st.status='IN_TRANSIT';
 elsif p_action='ACCEPT' and lab and s.status='RECEIVED_AT_LAB' then new_status:='ACCEPTED';ev:='ACCEPTED';
 elsif p_action='PROCESS' and lab and s.status='ACCEPTED' then new_status:='PROCESSING';ev:='PROCESSING_STARTED';
 elsif p_action='REJECT' and lab and s.status in ('RECEIVED_AT_LAB','ACCEPTED') and nullif(trim(p_note),'') is not null then new_status:='REJECTED';ev:='REJECTED';
 else raise exception 'Invalid transition or missing rejection reason'; end if;
 update lab_specimens set status=new_status,updated_at=now(),packed_at=case when p_action='PACK' then now() else packed_at end,
 dispatched_at=case when p_action='DISPATCH' then now() else dispatched_at end,received_at=case when p_action='RECEIVE' then now() else received_at end,
 processing_started_at=case when p_action='PROCESS' then now() else processing_started_at end,rejection_reason=case when p_action='REJECT' then p_note else rejection_reason end where id=s.id;
 update lab_orders set routing_status=new_status,status=case when p_action='PROCESS' then 'PROCESSING' when p_action='REJECT' then 'SAMPLE_REJECTED' else status end where id=o.id;
 insert into sample_custody_events(specimen_id,event_type,actor_user_id,from_location_type,from_location_id,to_location_type,to_location_id,notes,metadata)
 values(s.id,ev,auth.uid(),case when centre then 'COLLECTION_CENTRE' else 'LAB' end,case when centre then o.collection_centre_id else o.lab_provider_id end,
 'LAB',coalesce(p_lab,o.lab_provider_id),nullif(trim(p_note),''),jsonb_build_object('previous_status',s.status,'status',new_status));
 return s.id;
end $$;

create or replace function public.p0_verify_results(p_order uuid,p_sample text,p_values jsonb,p_source text default 'MANUAL',p_raw text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare o lab_orders; s lab_specimens; t diagnostic_tests; patient patient_profiles; param diagnostic_parameters; rr diagnostic_reference_ranges;
 v text; n numeric; flag_value text; range_text text; age_years numeric; payload_id uuid; result_id uuid; range_count integer; observations jsonb:='[]';
begin
 select * into o from lab_orders where id=p_order for update;
 if not found or o.lab_provider_id is distinct from my_provider_id() or not is_approved_provider('LAB') then raise exception 'Laboratory not authorized'; end if;
 select * into s from lab_specimens where lab_order_id=o.id and sample_code=p_sample and status='PROCESSING' for update;
 if not found then raise exception 'Matching specimen must be in processing'; end if;
 if exists(select 1 from lab_results where lab_order_id=o.id) then raise exception 'Result already exists; published observations cannot be overwritten'; end if;
 select * into t from diagnostic_tests where id=o.diagnostic_test_id and active;
 if not found or t.result_kind<>'PARAMETERS' or not exists(select 1 from diagnostic_parameters where test_id=t.id and active) then raise exception 'Test definition/configuration required; document diagnostics require a dedicated reporting adapter'; end if;
 if p_source not in ('MANUAL','CSV','JSON') or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>200000 then raise exception 'Invalid result input'; end if;
 if p_source<>'MANUAL' and (p_raw is null or octet_length(p_raw)>2097152 or length(p_raw)=0) then raise exception 'Original imported payload is required (maximum 2 MB)'; end if;
 if exists(select 1 from jsonb_object_keys(p_values) k where not exists(select 1 from diagnostic_parameters d where d.id::text=k and d.test_id=t.id and d.active)) then raise exception 'Unknown parameter'; end if;
 select * into patient from patient_profiles where id=o.patient_id;
 age_years:=case when patient.date_of_birth<=s.collected_at::date then (s.collected_at::date-patient.date_of_birth)/365.2425 end;
 if p_source<>'MANUAL' then insert into lab_machine_payloads(lab_order_id,source_type,raw_payload) values(o.id,p_source,jsonb_build_object('raw_text',p_raw,'sample_code',p_sample,'verified_by',my_provider_id())) returning id into payload_id; end if;
 for param in select * from diagnostic_parameters where test_id=t.id and active order by display_order,id loop
 v:=nullif(trim(p_values->>param.id::text),''); n:=null; flag_value:='UNKNOWN';range_text:='Reference range not configured';rr:=null;
 if param.required and v is null then raise exception 'Required result missing: %',param.parameter_name; end if;
 if v is null then continue; end if;
 if param.data_type='NUMBER' then
 if v !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' then raise exception 'Invalid numeric value: %',param.parameter_name; end if;
 n:=v::numeric;
 elsif param.data_type='BOOLEAN' and lower(v) not in ('true','false') then raise exception 'Boolean result must be true or false'; end if;
 -- No demographic/method match means no range. Tied equally specific ranges remain UNKNOWN.
 with candidates as (select r.*, ((r.lab_provider_id is not null)::int*8+(r.method is not null)::int*4+(r.sex is not null)::int*2+(r.min_age_years is not null or r.max_age_years is not null)::int) score
 from diagnostic_reference_ranges r where r.parameter_id=param.id and (r.lab_provider_id is null or r.lab_provider_id=o.lab_provider_id)
 and (r.method is null or r.method=t.method) and (r.sex is null or lower(r.sex)=lower(patient.sex))
 and (r.min_age_years is null or age_years>=r.min_age_years) and (r.max_age_years is null or age_years<=r.max_age_years))
 select count(*) into range_count from candidates where score=(select max(score) from candidates);
 if range_count=1 then
 select r.* into rr from diagnostic_reference_ranges r where r.parameter_id=param.id and (r.lab_provider_id is null or r.lab_provider_id=o.lab_provider_id)
 and (r.method is null or r.method=t.method) and (r.sex is null or lower(r.sex)=lower(patient.sex)) and (r.min_age_years is null or age_years>=r.min_age_years) and (r.max_age_years is null or age_years<=r.max_age_years)
 order by ((r.lab_provider_id is not null)::int*8+(r.method is not null)::int*4+(r.sex is not null)::int*2+(r.min_age_years is not null or r.max_age_years is not null)::int) desc limit 1;
 if rr.lower_limit is not null and rr.upper_limit is not null and rr.lower_limit>rr.upper_limit then rr:=null; end if;
 if rr.id is not null then
 range_text:=coalesce(nullif(rr.reference_text,''),case when rr.lower_limit is not null and rr.upper_limit is not null then rr.lower_limit||' - '||rr.upper_limit when rr.lower_limit is not null then '>= '||rr.lower_limit when rr.upper_limit is not null then '<= '||rr.upper_limit else 'Reference range not configured' end);
 if n is not null and (rr.lower_limit is not null or rr.upper_limit is not null) then flag_value:=case when n<rr.lower_limit then 'LOW' when n>rr.upper_limit then 'HIGH' else 'NORMAL' end; end if;
 end if; end if;
 insert into lab_observations(lab_order_id,parameter_id,parameter_code,parameter_name,raw_value,numeric_value,text_value,unit,reference_range,flag,source_type,machine_payload_id,verified,verified_by,verified_at)
 values(o.id,param.id,param.parameter_code,param.parameter_name,v,n,case when param.data_type<>'NUMBER' then v end,param.unit,range_text,flag_value,p_source,payload_id,true,my_provider_id(),now());
 observations:=observations||jsonb_build_array(jsonb_build_object('parameter_code',param.parameter_code,'parameter_name',param.parameter_name,'raw_value',v,'numeric_value',n,'unit',param.unit,'reference_range',range_text,'flag',flag_value,'reference_range_id',rr.id));
 end loop;
 if jsonb_array_length(observations)=0 then raise exception 'At least one actual result is required'; end if;
 insert into lab_results(lab_order_id,entered_by_lab_provider_id,result_json,status,verified_at)
 values(o.id,my_provider_id(),jsonb_build_object('test_name',o.test_name,'sample_code',s.sample_code,'source',p_source,'observations',observations,'verified_at',now()),'VERIFIED',now()) returning id into result_id;
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(o.patient_id,'LAB_RESULTS_VERIFIED','lab_results',result_id,auth.uid());
 return result_id;
end $$;

create or replace function public.p0_report_path(p_result uuid) returns text language sql stable security definer set search_path=public as $$
 select o.patient_id::text||'/'||o.id::text||'/'||r.id::text||'.pdf' from lab_results r join lab_orders o on o.id=r.lab_order_id
 where r.id=p_result and o.lab_provider_id=my_provider_id() and is_approved_provider('LAB') and r.verified_at is not null
$$;
create or replace function public.p0_storage_allowed(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from lab_results r join lab_orders o on o.id=r.lab_order_id where
 case when p_write then r.status='VERIFIED' and r.report_storage_path is null and p_name=o.patient_id::text||'/'||o.id::text||'/'||r.id::text||'.pdf' and o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')
 else (r.report_storage_path=p_name and p0_reads_result(o.id)) or (r.status='VERIFIED' and p_name=o.patient_id::text||'/'||o.id::text||'/'||r.id::text||'.pdf' and o.lab_provider_id=my_provider_id() and is_approved_provider('LAB')) end)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lab-reports','lab-reports',false,15728640,array['application/pdf']) on conflict(id) do update set public=false;
create policy p0_report_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'lab-reports' or public.p0_storage_allowed(name,false));
create policy p0_report_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'lab-reports' or public.p0_storage_allowed(name,true));
create policy p0_report_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'lab-reports') with check(bucket_id<>'lab-reports');
create policy p0_report_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'lab-reports');
create or replace function public.p0_publish_report(p_result uuid) returns void language plpgsql security definer set search_path=public as $$
declare r lab_results; o lab_orders; path text; begin
 select * into r from lab_results where id=p_result;
 select * into o from lab_orders where id=r.lab_order_id for update;
 if not found or o.lab_provider_id is distinct from my_provider_id() or not is_approved_provider('LAB') then raise exception 'Not authorized'; end if;
 select * into r from lab_results where id=p_result for update;
 if r.status='COMPLETED' then return; end if;
 if r.status<>'VERIFIED' or r.verified_at is null then raise exception 'Verified observations required'; end if;
 path:=p0_report_path(r.id);
 if not exists(select 1 from storage.objects where bucket_id='lab-reports' and name=path) then raise exception 'Upload the verified report PDF first'; end if;
 update lab_results set report_storage_path=path,status='COMPLETED' where id=r.id;
 update lab_orders set status='COMPLETED',routing_status='REPORT_READY' where id=o.id;
 update lab_specimens set status='COMPLETED',completed_at=now(),updated_at=now() where lab_order_id=o.id and status='PROCESSING';
 insert into sample_custody_events(specimen_id,event_type,actor_user_id) select id,'PROCESSING_COMPLETED',auth.uid() from lab_specimens where lab_order_id=o.id and status='COMPLETED';
 insert into care_gaps(patient_id,gap_type,severity,status,source_table,source_id)
 select o.patient_id,'LAB_REPORT_REVIEW_PENDING',case when exists(select 1 from lab_observations where lab_order_id=o.id and flag in ('LOW','HIGH','ABNORMAL')) then 'HIGH' else 'ROUTINE' end,'OPEN','lab_orders',o.id
 where not exists(select 1 from care_gaps where source_table='lab_orders' and source_id=o.id and gap_type='LAB_REPORT_REVIEW_PENDING' and status='OPEN');
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id) values(o.patient_id,'LAB_REPORT_COMPLETED','lab_orders',o.id,auth.uid());
end $$;
create or replace function public.p0_review_report(p_result uuid) returns void language plpgsql security definer set search_path=public as $$
declare r lab_results; o lab_orders; begin
 select * into r from lab_results where id=p_result;
 select * into o from lab_orders where id=r.lab_order_id for update;
 if not found or o.doctor_provider_id is distinct from my_provider_id() or not is_approved_provider('DOCTOR') then raise exception 'Only the ordering approved doctor can review'; end if;
 select * into r from lab_results where id=p_result for update;
 if r.status<>'COMPLETED' or r.verified_at is null or r.report_storage_path is null then raise exception 'Verified published report required'; end if;
 if r.doctor_reviewed_at is not null then return; end if;
 update lab_results set doctor_reviewed_at=now(),doctor_reviewed_by=my_provider_id() where id=r.id;
 update care_gaps set status='CLOSED',closed_at=now() where patient_id=o.patient_id and gap_type='LAB_REPORT_REVIEW_PENDING' and status='OPEN' and ((source_table='lab_orders' and source_id=o.id) or (source_table='lab_results' and source_id=r.id));
 insert into care_events(patient_id,event_type,source_table,source_id,actor_user_id,metadata) values(o.patient_id,'LAB_REPORT_REVIEWED','lab_results',r.id,auth.uid(),jsonb_build_object('lab_order_id',o.id));
end $$;

create or replace function public.p0_save_location(p_kind text,p_id uuid,p_address text,p_village text,p_city text,p_district text,p_state text,p_postal text,p_lat double precision,p_lon double precision) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_approved_provider() or nullif(trim(p_address),'') is null then raise exception 'Approved provider and physical address required'; end if;
 if (p_lat is null)<>(p_lon is null) or (p_lat is not null and not(p_lat between -90 and 90 and p_lon between -180 and 180)) then raise exception 'Invalid coordinates'; end if;
 if p_kind='FACILITY' then
 update facilities set address_text=p_address,village=p_village,city=p_city,district=p_district,state=p_state,postal_code=p_postal,latitude=p_lat,longitude=p_lon where id=p_id and owner_user_id=auth.uid();
 elsif p_kind='CENTRE' then
 update collection_centres c set address_line=p_address,village=p_village,city=p_city,district=p_district,state=p_state,postal_code=p_postal,latitude=p_lat,longitude=p_lon,updated_at=now() where c.id=p_id and exists(select 1 from facilities f where f.id=c.facility_id and f.owner_user_id=auth.uid());
 else raise exception 'Invalid location type'; end if;
 if not found then raise exception 'Location not authorized'; end if;
end $$;
create policy p0_owner_centre_read on collection_centres for select to authenticated using(exists(select 1 from facilities f where f.id=collection_centres.facility_id and f.owner_user_id=auth.uid()));

-- Existing published verified results are evidence for a pending review; no review is invented.
insert into care_gaps(patient_id,gap_type,severity,status,source_table,source_id)
select o.patient_id,'LAB_REPORT_REVIEW_PENDING',case when exists(select 1 from lab_observations ob where ob.lab_order_id=o.id and ob.verified and ob.flag in ('HIGH','LOW','ABNORMAL')) then 'HIGH' else 'ROUTINE' end,'OPEN','lab_orders',o.id
from lab_results r join lab_orders o on o.id=r.lab_order_id where r.status='COMPLETED' and r.verified_at is not null and r.report_storage_path is not null and r.doctor_reviewed_at is null
and not exists(select 1 from care_gaps g where g.gap_type='LAB_REPORT_REVIEW_PENDING' and g.status='OPEN' and ((g.source_table='lab_orders' and g.source_id=o.id) or (g.source_table='lab_results' and g.source_id=r.id)));

-- Restrict new RPCs to authenticated sessions. SECURITY DEFINER functions validate roles/relationships.
do $p0$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'p0\_%' escape '\' loop
 execute format('revoke all on function %s from public, anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $p0$;
commit;




