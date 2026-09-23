> Historical checkpoint details below. Current ordered feature chain continues through 009; see CONTINUE.md, FOUNDATION-CHECKPOINT.md and BACKEND-CONTRACTS.md. No migrations have been run live.

# Live schema reconciliation

Source: supplied schema_metadata CSV, not frontend assumptions.

32 public tables, 351 columns, 131 constraints, 72 indexes, 70 policies (including storage), 8 functions.

## Tables absent from 001–003 (16)

- collection_centre_tests
- collection_centres
- diagnostic_parameters
- diagnostic_reference_ranges
- diagnostic_tests
- encounters
- lab_machine_integrations
- lab_machine_payloads
- lab_observations
- lab_specimens
- lab_test_capabilities
- provider_availability_overrides
- provider_practices
- provider_schedules
- sample_custody_events
- sample_transports

## Added columns on existing tables (28)

- appointments.practice_id
- appointments.reason
- appointments.patient_note
- appointments.duration_minutes
- appointments.updated_at
- facilities.hfr_id
- facilities.identity_source
- facilities.registry_verified
- facilities.latitude
- facilities.longitude
- facilities.phone
- lab_orders.appointment_id
- lab_orders.encounter_id
- lab_orders.diagnostic_test_id
- lab_orders.collection_centre_id
- lab_orders.routing_mode
- lab_orders.routing_status
- lab_orders.patient_selected_lab
- lab_results.verified_at
- lab_results.doctor_reviewed_at
- lab_results.doctor_reviewed_by
- lab_results.ai_summary
- patient_profiles.identity_source
- patient_profiles.registry_verified
- prescriptions.encounter_id
- provider_profiles.identity_source
- provider_profiles.registry_verified
- provider_profiles.phone

## Other drift

- Demo registration RPCs and their sequence dependencies; identity_source / registry_verified fields.
- ABHA status constraint adds DEMO. The migration replaces only that old CHECK, transactionally; no table or row is dropped.
- Practice, schedule, encounter, catalog, machine, capability, specimen, custody and transport constraints, indexes and policies are captured in 004.
- Duplicate HPR/HFR unique indexes exist live and are preserved.
- Exported public triggers are empty. This does not establish whether the auth.users trigger exists: auth schema triggers were outside the query.
- Sequence settings/current values, storage buckets, numeric precision/type modifiers and function ownership were not exported. Existing settings remain untouched. Required missing sequences use default settings on fresh installations only.
- Policies and grants in 004 intentionally represent the live baseline, including known insecure access. Apply 005 before exposing the application.
- Do not rerun 001 or 004 after 005: older grants/policies would undo hardening.

## Installation

Existing live project: review/apply 004, then 005. Fresh Supabase: 001, 003, 004, 005 (002 is an optional operator template). Test on staging first. No migration is applied remotely by this task.
