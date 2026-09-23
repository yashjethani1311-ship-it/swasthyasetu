-- 049: explicit server termination boundary and removal of anonymous execution on authenticated onboarding.
begin;
create function t4_end_context(p_session uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare s teleconsult_sessions;i platform_integrations;begin
 select * into s from teleconsult_sessions where id=p_session for share;select * into i from platform_integrations where id=s.integration_id;
 if s.id is null or s.state<>'ENDING' or s.external_room_reference is null or i.id is null then raise exception 'Pending provider termination required';end if;
 -- Cleanup remains possible after integration disable/revision change; no credential or new room can be issued.
 return jsonb_build_object('session_id',s.id,'room_reference',s.external_room_reference,'config_ref',i.config_ref,'idempotency_key','end:'||s.id);
end $$;
revoke all on function t4_end_context(uuid) from public,anon,authenticated;
grant execute on function t4_end_context(uuid) to service_role;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('create_patient_profile','register_demo_patient','register_demo_provider','my_role','my_provider_id','is_admin','is_approved_provider') loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
create or replace function r1_worklist(p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or p_offset is null or p_offset not between 0 and 10000 then raise exception 'Invalid worklist request';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select s.*,o.patient_id,o.test_name from diagnostic_studies s join lab_orders o on o.id=s.lab_order_id where (o.lab_provider_id=my_provider_id() and is_approved_provider('LAB') and exists(select 1 from facilities where id=s.facility_id and owner_user_id=auth.uid())) or (s.report_author_provider_id=my_provider_id() and is_approved_provider('DOCTOR') and h1_staff(s.facility_id,array['CLINICIAN'])) order by s.created_at,s.id limit 50 offset p_offset)x),'[]');
end $$;
-- Pin application schema before temporary schema for every existing definer routine.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef loop execute format('alter function %s set search_path=public,pg_temp',f.signature);end loop;
end $$;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p where p.pronamespace='public'::regnamespace and p.prorettype='trigger'::regtype loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;end $$;
commit;
