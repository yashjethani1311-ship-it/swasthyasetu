-- Migration 054: Account Deletion Lifecycle Hardening
-- Ensures safe cascading and trigger transitions so user account deletions
-- via Supabase Auth (Dashboard or API) succeed cleanly without FK constraint violations.

begin;

-- 1. Consent audit and consents lifecycle
alter table public.consent_audit
  drop constraint if exists consent_audit_actor_user_id_fkey,
  add constraint consent_audit_actor_user_id_fkey
    foreign key (actor_user_id) references public.profiles(id) on delete cascade;

alter table public.consent_audit
  drop constraint if exists consent_audit_patient_id_fkey,
  add constraint consent_audit_patient_id_fkey
    foreign key (patient_id) references public.patient_profiles(id) on delete cascade;

alter table public.consent_audit
  drop constraint if exists consent_audit_consent_id_fkey,
  add constraint consent_audit_consent_id_fkey
    foreign key (consent_id) references public.patient_consents(id) on delete cascade;

alter table public.patient_consents
  drop constraint if exists patient_consents_patient_id_fkey,
  add constraint patient_consents_patient_id_fkey
    foreign key (patient_id) references public.patient_profiles(id) on delete cascade;

alter table public.patient_consents
  drop constraint if exists patient_consents_requester_provider_id_fkey,
  add constraint patient_consents_requester_provider_id_fkey
    foreign key (requester_provider_id) references public.provider_profiles(id) on delete cascade;

-- 2. Clinical source versions provenance lifecycle (auto-created on profile mutations)
alter table public.clinical_source_versions
  drop constraint if exists clinical_source_versions_patient_id_fkey,
  add constraint clinical_source_versions_patient_id_fkey
    foreign key (patient_id) references public.patient_profiles(id) on delete cascade;

alter table public.clinical_source_versions
  drop constraint if exists clinical_source_versions_recorded_by_fkey,
  add constraint clinical_source_versions_recorded_by_fkey
    foreign key (recorded_by) references auth.users(id) on delete set null;

alter table public.clinical_source_versions
  drop constraint if exists clinical_source_versions_source_provider_id_fkey,
  add constraint clinical_source_versions_source_provider_id_fkey
    foreign key (source_provider_id) references public.provider_profiles(id) on delete set null;

alter table public.clinical_source_versions
  drop constraint if exists clinical_source_versions_source_facility_id_fkey,
  add constraint clinical_source_versions_source_facility_id_fkey
    foreign key (source_facility_id) references public.facilities(id) on delete set null;

-- 3. Facility staff and duty associations
alter table public.facility_memberships
  drop constraint if exists facility_memberships_user_id_fkey,
  add constraint facility_memberships_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.facility_memberships
  drop constraint if exists facility_memberships_facility_id_fkey,
  add constraint facility_memberships_facility_id_fkey
    foreign key (facility_id) references public.facilities(id) on delete cascade;

alter table public.hospital_duties
  drop constraint if exists hospital_duties_user_id_fkey,
  add constraint hospital_duties_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.hospital_duties
  drop constraint if exists hospital_duties_facility_id_fkey,
  add constraint hospital_duties_facility_id_fkey
    foreign key (facility_id) references public.facilities(id) on delete cascade;

-- 4. Teleconsult associations
alter table public.teleconsult_participants
  drop constraint if exists teleconsult_participants_user_id_fkey,
  add constraint teleconsult_participants_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.teleconsult_join_intents
  drop constraint if exists teleconsult_join_intents_requested_by_fkey,
  add constraint teleconsult_join_intents_requested_by_fkey
    foreign key (requested_by) references auth.users(id) on delete cascade;

alter table public.teleconsult_join_intents
  drop constraint if exists teleconsult_join_intents_participant_id_fkey,
  add constraint teleconsult_join_intents_participant_id_fkey
    foreign key (participant_id) references public.teleconsult_participants(id) on delete cascade;

-- 5. User preferences and AI audit
alter table public.communication_preferences
  drop constraint if exists communication_preferences_user_id_fkey,
  add constraint communication_preferences_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.ai_tool_audit
  drop constraint if exists ai_tool_audit_actor_user_id_fkey,
  add constraint ai_tool_audit_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete cascade;

-- 6. Verification documents and reviews
alter table public.verification_documents
  drop constraint if exists verification_documents_submitted_by_fkey,
  add constraint verification_documents_submitted_by_fkey
    foreign key (submitted_by) references auth.users(id) on delete cascade;

alter table public.verification_documents
  drop constraint if exists verification_documents_provider_id_fkey,
  add constraint verification_documents_provider_id_fkey
    foreign key (provider_id) references public.provider_profiles(id) on delete cascade;

alter table public.verification_reviews
  drop constraint if exists verification_reviews_reviewer_id_fkey,
  add constraint verification_reviews_reviewer_id_fkey
    foreign key (reviewer_id) references auth.users(id) on delete cascade;

alter table public.verification_reviews
  drop constraint if exists verification_reviews_provider_id_fkey,
  add constraint verification_reviews_provider_id_fkey
    foreign key (provider_id) references public.provider_profiles(id) on delete cascade;

-- 7. Worker delegation & task assignments
alter table public.worker_delegations
  drop constraint if exists worker_delegations_granted_by_fkey,
  add constraint worker_delegations_granted_by_fkey
    foreign key (granted_by) references auth.users(id) on delete cascade;

alter table public.worker_delegations
  drop constraint if exists worker_delegations_worker_provider_id_fkey,
  add constraint worker_delegations_worker_provider_id_fkey
    foreign key (worker_provider_id) references public.provider_profiles(id) on delete cascade;

alter table public.worker_area_assignments
  drop constraint if exists worker_area_assignments_assigned_by_fkey,
  add constraint worker_area_assignments_assigned_by_fkey
    foreign key (assigned_by) references auth.users(id) on delete cascade;

alter table public.worker_area_assignments
  drop constraint if exists worker_area_assignments_worker_provider_id_fkey,
  add constraint worker_area_assignments_worker_provider_id_fkey
    foreign key (worker_provider_id) references public.provider_profiles(id) on delete cascade;

alter table public.worker_task_areas
  drop constraint if exists worker_task_areas_recorded_by_fkey,
  add constraint worker_task_areas_recorded_by_fkey
    foreign key (recorded_by) references auth.users(id) on delete cascade;

alter table public.worker_conflict_resolutions
  drop constraint if exists worker_conflict_resolutions_actor_user_id_fkey,
  add constraint worker_conflict_resolutions_actor_user_id_fkey
    foreign key (actor_user_id) references auth.users(id) on delete cascade;

-- 8. Facility state guard update
-- Ensure unassigned or deleted facility owners gracefully suspend facility state rather than aborting transaction
create or replace function public.v1_facility_state_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare s public.verification_status;
begin
 if new.owner_user_id is null then
   new.verification_status := 'SUSPENDED';
   return new;
 end if;
 select verification_status into s from provider_profiles where user_id=new.owner_user_id for share;
 if s is null then
   if new.verification_status='APPROVED' then raise exception 'Approved facility requires an accountable provider'; end if;
 else
   if tg_op='UPDATE' and new.verification_status<>s then raise exception 'Use provider verification transition'; end if;
   new.verification_status:=s;
 end if;
 if new.identity_source='DEMO' and new.registry_verified then raise exception 'Demo identity is not registry verified'; end if;
 return new;
end $function$;

commit;
