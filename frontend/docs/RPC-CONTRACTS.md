# Frontend RPC contracts through 050

Generated from the complete isolated migration chain. All 207 authenticated-executable public non-trigger RPCs are included, including permission predicates. No anonymous execution is granted. Use the user JWT; never ship service-role/provider secrets. Service-only callbacks are excluded from frontend invocation.

SQL `uuid` maps to string; `timestamptz` to ISO timestamp string; `date` to YYYY-MM-DD; `numeric` may need decimal-safe handling; `bigint` IDs should be handled without unsafe JS-number arithmetic. `void` means no useful response body. `TABLE` and `SETOF` results are arrays. An empty array, null optional value, or UNKNOWN state is not success/normal/availability.

Shape notation: `Row(table)` means the exact column/type/nullability definition in [ROW-SCHEMAS.md](ROW-SCHEMAS.md); `Pick(table; fields)` includes only listed fields; `Omit(table; fields)` excludes listed fields. `[]` means an array; `|` denotes a branch; `?` means optional or nullable. Nested JSON medical payloads retain their source format, not a universal normalized medical schema. All row definitions are documented locally; SQL inspection is not required.

Errors: raised business-rule exceptions normally carry SQLSTATE P0001 via PostgREST. Permission-denied is 42501; cast/type failures may be 22xxx; constraint conflicts may be 23xxx. Treat error text as diagnostic detail, not a localization key or stable HTTP status. Do not show success on any error. Preserve the request key only for an exact retry; a changed payload uses a new key and current revision/version. Read back authoritative state after transitions.

Role labels describe permissions, not UI access grants. Every named exception listed below is a possible rejection including called helper validations; no frontend role selection can override them. State vocabulary includes related workflow values and is not permission to transition between every pair. [FRONTEND-FINAL-CONTRACTS.md](FRONTEND-FINAL-CONTRACTS.md) documents sequencing and the new backend blocks.

## a1_access_history

Arguments/defaults: `p_patient uuid, p_offset integer DEFAULT 0`

Role: Patient owner for decisions; approved connected clinician for requests; owner or purpose-authorized clinician for history.

Return shape: `TABLE(id uuid, action text, purpose text, created_at timestamp with time zone, actor_name text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Patient access history not authorized`

## a1_ai_context

Arguments/defaults: `p_patient uuid`

Role: Patient owner for decisions; approved connected clinician for requests; owner or purpose-authorized clinician for history.

Return shape: `SnapshotContext (see FRONTEND-FINAL-CONTRACTS.md)`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50, 30, 100, 10. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `AI_ASSISTANCE`, `TREATMENT`, `SNAPSHOT_PROJECTION_READ`, `COMPLETED`, `ENCOUNTERS`, `UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION`, `UNKNOWN_PRESCRIPTION_DOES_NOT_CONFIRM_CURRENT_USE`, `DOCUMENTS`, `CANCELLED`, `DOCTOR`, `GRANTED`, `PRESCRIPTIONS`, `DIAGNOSTICS`, `TIMELINE`, `FOLLOW_UPS`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`

Possible validation errors: `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`

## a1_decide_consent

Arguments/defaults: `p_consent uuid, p_decision text`

Role: Patient owner for decisions; approved connected clinician for requests; owner or purpose-authorized clinician for history.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `GRANTED`, `DENIED`, `REVOKED`, `REQUESTED`

Possible validation errors: `Only the patient may decide this request`; `Invalid decision`; `Consent transition not allowed`

## a1_has_consent

Arguments/defaults: `p_patient uuid, p_category text, p_purpose text, p_date timestamp with time zone`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `GRANTED`, `CONFIRMED`, `COMPLETED`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## a1_request_consent

Arguments/defaults: `p_patient uuid, p_purpose text, p_categories text[], p_reason text, p_valid_from timestamp with time zone, p_expires timestamp with time zone, p_records_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_records_until timestamp with time zone DEFAULT NULL::timestamp with time zone`

Role: Patient owner for decisions; approved connected clinician for requests; owner or purpose-authorized clinician for history.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `REQUESTED`, `CONFIRMED`, `COMPLETED`

Possible validation errors: `A connected approved doctor is required`; `Consent must expire within one year`

## a2_appointment_transition

Arguments/defaults: `p_appointment uuid, p_status text`

Role: Patient owner for booking; actual appointment patient/assigned approved doctor for transitions; doctor only for encounter start.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `REQUESTED`, `APPOINTMENT_`

Possible validation errors: `Appointment not authorized`; `Unsupported appointment transition`; `Doctor authorization required`; `Consultation has started; appointment cannot be changed`; `Appointment transition not allowed`

## a2_available_slots

Arguments/defaults: `p_practice uuid, p_mode text`

Role: Patient owner for booking; actual appointment patient/assigned approved doctor for transitions; doctor only for encounter start.

Return shape: `TABLE(scheduled_at timestamp with time zone, duration_minutes integer, consultation_fee numeric, practice_timezone text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHYSICAL`, `TELECONSULT`, `BOTH`, `DOCTOR`, `APPROVED`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`

Possible validation errors: `Authenticated valid slot request required`; `Practice is not available for this consultation type`

## a2_book_appointment

Arguments/defaults: `p_practice uuid, p_slot timestamp with time zone, p_mode text, p_reason text, p_note text, p_request uuid, p_expected_fee numeric DEFAULT NULL::numeric`

Role: Patient owner for booking; actual appointment patient/assigned approved doctor for transitions; doctor only for encounter start.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `REQUESTED`, `APPOINTMENT_REQUESTED`, `PHYSICAL`, `TELECONSULT`, `BOTH`, `DOCTOR`, `APPROVED`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`

Possible validation errors: `Patient and valid booking details required`; `Practice not found`; `Booking request key conflict`; `This slot is no longer available`; `Consultation fee changed; select a refreshed slot to confirm`; `Authenticated valid slot request required`; `Practice is not available for this consultation type`

## a2_start_encounter

Arguments/defaults: `p_appointment uuid`

Role: Patient owner for booking; actual appointment patient/assigned approved doctor for transitions; doctor only for encounter start.

Return shape: `Row(encounters)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CONFIRMED`, `IN_PROGRESS`, `CONSULTATION_STARTED`

Possible validation errors: `Doctor not authorized`; `Confirmed appointment required`

## a2_valid_timezone

Arguments/defaults: `p_zone text`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## a3_tool

Arguments/defaults: `p_tool text, p_scope jsonb DEFAULT '{}'::jsonb`

Role: Role is derived from authenticated database authority, selected tool and exact scope; see AI tool matrix.

Return shape: `{tool, actor_role, retrieved_at, data: ToolData[], scope, purpose:"AI_ASSISTANCE", provenance, uncertainty, audit_reference:bigint, freshness}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER' / 'MANAGER','RECEPTION','CLINICIAN' / 'MANAGER','RECEPTION' / 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 100, 50, 1, 30, 10, p_limit. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `INVALID_AI_TOOL_REQUEST`, `FACILITY_SCOPE_REQUIRED`, `MANAGER`, `FACILITY_SCOPE_NOT_AUTHORIZED`, `FACILITY`, `GRANTED`, `LAB`, `LAB_SCOPE_NOT_AUTHORIZED`, `PHARMACY`, `PHARMACY_SCOPE_NOT_AUTHORIZED`, `ADMIN_SCOPE_NOT_AUTHORIZED`, `ADMIN`, `AI_ASSISTANCE`, `AUTHORIZED_DATABASE_RPC`, `APPROVED`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `QC_UNKNOWN_REVIEW_REQUIRED`, `REJECTED`, `DISABLED`, `HEALTHY`, `DEGRADED`, `DOWN`, `FAILED`, `STALE`, `UNKNOWN`, `TRANSIENT`, `CONFIGURATION_OR_CONFIRMATION_REQUIRED`, `SUCCEEDED`, `FACILITIES_WITH_FRESH_CAPABILITY_EVIDENCE`, `SINGLE_SITE_PHARMACIES_WITH_RECORDED_USABLE_STOCK`, `RELEASED`, `SUPPRESSED_MINIMUM_CELL_SIZE`, `CURRENT_RECORDED_STATE_NOT_MONTH_COHORT`, `OPEN`, `DIAGNOSTICS`, `COMPLETED`, `DISPENSED`, `CLOSED`, `CANCELLED`, `ACKNOWLEDGED`, `OPEN_CAREGAPS`, `OVERDUE_DIAGNOSTIC_GAPS`, `PENDING_REPORT_REVIEWS`, `VERIFIED_FOLLOWUP_COMPLETION`, `MEDICINES_DISPENSED`, `OVERDUE_REFERRAL_GAPS`, `EPISODE_COMPLETION_WITHOUT_EXCEPTIONS`, `CLINICIAN_FLAGGED_STALE_CONTEXT`, `CRITICAL_ACKNOWLEDGEMENT_PENDING`, `UNFINISHED_QUEUE`, `AGGREGATE_PULSE_READ`, `DISTRICT`, `CURRENT_RECORDED_STATE_OF_FIXED_MONTH_COHORT`, `PATIENT_SCOPE_REQUIRED`, `TIMELINE`, `UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION`, `ENCOUNTERS`, `RECEPTION`, `CLINICIAN`, `UNKNOWN_CLINICIAN_REVIEW_REQUIRED`, `ADMITTED`, `PROVIDER_SCOPE_ONLY`, `DOCTOR`, `PROVIDER_ROLE_NOT_AUTHORIZED`, `PATHOLOGY`, `EXPIRY_UNKNOWN`, `EXPIRED`, `RECORDED_EXPIRY`, `WORKER`, `WORKER_SCOPE_NOT_AUTHORIZED`, `WORKER_TASK_NOT_AUTHORIZED`, `AWAITING_VERIFICATION`, `WAIT_FOR_CLINICIAN_REVIEW`, `NO_PENDING_ACTION`, `REVIEW_CURRENT_TASK_AND_VALID_DELEGATION`, `PENDING`, `AI_TOOL_UNAVAILABLE`, `TREATMENT`, `SNAPSHOT_PROJECTION_READ`, `UNKNOWN_PRESCRIPTION_DOES_NOT_CONFIRM_CURRENT_USE`, `DOCUMENTS`, `PRESCRIPTIONS`, `FOLLOW_UPS`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`, `LONGITUDINAL_READ`, `RECENTLY_RECORDED`, `SUSPENDED`, `REVOKED`

Possible validation errors: `INVALID_AI_TOOL_REQUEST`; `FACILITY_SCOPE_REQUIRED`; `FACILITY_SCOPE_NOT_AUTHORIZED`; `LAB_SCOPE_NOT_AUTHORIZED`; `PHARMACY_SCOPE_NOT_AUTHORIZED`; `ADMIN_SCOPE_NOT_AUTHORIZED`; `Approved lab required`; `Integration governance/facility scope required`; `Aggregate governance or own facility manager required`; `Completed calendar month within two years and explicit sourced geography required`; `PATIENT_SCOPE_REQUIRED`; `PROVIDER_SCOPE_ONLY`; `PROVIDER_ROLE_NOT_AUTHORIZED`; `WORKER_SCOPE_NOT_AUTHORIZED`; `WORKER_TASK_NOT_AUTHORIZED`; `AI_TOOL_UNAVAILABLE`; `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`; `Invalid history request`; `History not authorized`; `History consent required`; `Facility queue not authorized`; `Bed list not authorized`; `Admission list not authorized`; `Invalid worklist request`; `Invalid critical worklist request`; `Pharmacy purchase list not authorized`; `Administrator required`; `Invalid queue filter`

## a4_approve_retention

Arguments/defaults: `p_policy uuid`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `RETENTION_POLICY_APPROVED_METADATA_ONLY`

Possible validation errors: `Governance admin required`; `Independent retention policy approval required`

## a4_audit

Arguments/defaults: `p_before bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `Pick(audit_logs; id,actor_user_id,action,entity_type,entity_id,created_at)[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Governance audit query required`

## a4_incident

Arguments/defaults: `p_category text, p_summary text, p_request uuid`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OPEN`

Possible validation errors: `Authenticated incident report required`; `Incident request conflict`

## a4_incident_transition

Arguments/defaults: `p_incident uuid, p_state text, p_severity text, p_assigned uuid, p_revision integer, p_note text, p_request uuid`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `integer`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `ADMIN`, `OPEN`, `TRIAGED`, `INVESTIGATING`, `RESOLVED`, `CLOSED`, `INCIDENT_`

Possible validation errors: `Governance admin, assigned admin and disposition note required`; `Incident unavailable`; `Incident event conflict`; `Stale incident revision`; `Invalid incident transition`

## a4_incidents

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `Omit(governance_incidents; request_key)[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Authenticated incident access required`

## a4_model_history

Arguments/defaults: `p_model uuid`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `{evaluations:Row(ai_model_evaluations)[],approvals:Row(ai_model_approvals)[],hold:Row(ai_model_holds)?}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Model governance administrator required`

## a4_model_hold

Arguments/defaults: `p_model uuid, p_suspended boolean, p_expected integer, p_reason text`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `integer`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MODEL_GOVERNANCE_HOLD`

Possible validation errors: `Governance model decision required`; `Model unavailable`; `Stale model governance revision`

## a4_retention

Arguments/defaults: `p_class text, p_version integer, p_days integer, p_reference text`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CLINICAL_RECORDS`, `AUDIT_LOGS`, `AI_FEEDBACK`, `DOCUMENT_ORIGINALS`, `COMMUNICATION_RECEIPTS`, `RETENTION_POLICY_DRAFTED`

Possible validation errors: `Governance policy reference required`; `Immutable retention policy conflict`

## a4_retire_pathway

Arguments/defaults: `p_version uuid, p_reason text`

Role: Admin governance, except incident creation/own incident reads are available to authenticated reporters.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `RETIRED`, `PATHWAY_RETIRED`

Possible validation errors: `Governance retirement reason required`; `Approved pathway version required`

## c1_add_stock

Arguments/defaults: `p_name text, p_strength text, p_batch text, p_expiry date, p_quantity integer, p_price numeric, p_request uuid DEFAULT gen_random_uuid()`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Approved pharmacy required`; `Receipt request key required`; `Receipt key conflict`; `Enter medicine, batch, valid expiry, positive units and actual nonnegative unit price`

## c1_assign_followup

Arguments/defaults: `p_gap uuid, p_worker uuid`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `FOLLOW_UP_PENDING`, `OPEN`, `WORKER`, `APPROVED`, `FOLLOW_UP_ASSIGNED`

Possible validation errors: `Follow-up not authorized`; `Approved worker required`; `Task already assigned`

## c1_can_patient

Arguments/defaults: `p_patient uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CONFIRMED`, `COMPLETED`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## c1_care_context

Arguments/defaults: `p_patient uuid, p_offset integer DEFAULT 0`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `AuthorizedContext (see FRONTEND-FINAL-CONTRACTS.md)`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `TREATMENT`, `AI_ASSISTANCE`, `DOCTOR`, `GRANTED`, `ENCOUNTERS`, `PRESCRIPTIONS`, `COMPLETED`, `DIAGNOSTICS`, `DOCUMENTS`, `TIMELINE`, `FOLLOW_UPS`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`

Possible validation errors: `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`

## c1_choose_pharmacy

Arguments/defaults: `p_rx uuid, p_pharmacy uuid`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ACTIVE`, `PHARMACY`, `APPROVED`, `PRESCRIPTION_ROUTED`

Possible validation errors: `Prescription not authorized`; `Prescription is not active`; `Approved pharmacy required`; `Prescription already sent to another pharmacy`

## c1_dispense

Arguments/defaults: `p_fulfilment uuid, p_item uuid, p_inventory uuid, p_quantity integer, p_request uuid`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `ACTIVE`, `DISPENSED`, `PARTIAL`, `CLOSED`, `MEDICINE_COLLECTION_PENDING`, `OPEN`, `MEDICINE_DISPENSED`

Possible validation errors: `Pharmacy not authorized`; `Idempotency key conflict`; `Positive quantity and request key required`; `Prescription not available for dispensing`; `Prescribed quantity must be confirmed by the doctor`; `Inventory medicine/strength must exactly match prescription; no substitution`; `Unexpired priced stock with sufficient quantity required`; `Quantity exceeds prescription`

## c1_finish_encounter

Arguments/defaults: `p_encounter uuid, p_medicines jsonb, p_tests uuid[]`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `CONFIRMED`, `IN_PROGRESS`, `PRESCRIPTION_ISSUED`, `MEDICINE_COLLECTION_PENDING`, `CONSULTATION_COMPLETED`, `FOLLOW_UP_PENDING`, `CANCELLED`, `ORDERED`, `LAB_ORDERED`

Possible validation errors: `Encounter not authorized`; `A confirmed matching appointment is required`; `Complete consultation notes before signing`; `Invalid medication list`; `A prescription already exists for this encounter; review it before signing`; `Medicine name and explicit total prescribed quantity required`; `Encounter not authorized or closed`; `Care relationship not confirmed`; `Too many tests`; `Active catalog test required`

## c1_next_step

Arguments/defaults: `p_patient uuid`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `SETOF care_gaps`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OPEN`, `CRITICAL`, `HIGH`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## c1_patient_directory

Arguments/defaults: `p_search text DEFAULT ''::text, p_offset integer DEFAULT 0`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `TABLE(id uuid, full_name text, patient_code text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CONFIRMED`, `COMPLETED`

Possible validation errors: `Not authorized or invalid search`

## c1_pharmacy_queue

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `(Row(prescription_fulfilments) & {issued_at,patient_code,full_name,items:(Row(prescription_items)&{dispensed:number})[]?})[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Not authorized`

## c1_reads_prescription

Arguments/defaults: `p_rx uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `PHARMACY`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## c1_verify_followup

Arguments/defaults: `p_task uuid`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `AWAITING_VERIFICATION`, `CLOSED`, `OPEN`, `FOLLOW_UP_VERIFIED`

Possible validation errors: `Only assigned doctor may verify closure`; `Worker outcome required before verification`

## c1_worker_outcome

Arguments/defaults: `p_task uuid, p_status text, p_outcome text`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `COMPLETED`, `AWAITING_VERIFICATION`, `CONTACTED`, `VISITED`, `ESCALATED`, `HIGH`, `OPEN`, `FOLLOW_UP_`

Possible validation errors: `Task not authorized`; `Outcome required or task is awaiting verification/closed`

## c1_worker_queue

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Actual patient, assigned approved doctor, assigned pharmacy or assigned worker according to workflow. Never choose role from request JSON.

Return shape: `(Row(follow_up_tasks)&{patient_code,full_name,phone?,due_at?})[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`

Possible validation errors: `Not authorized`

## c2_activate

Arguments/defaults: `p_episode uuid, p_version uuid, p_attestation text`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `APPROVED`, `PENDING`, `PATHWAY_STEP_PENDING`, `PATHWAY_ACTIVATED`, `COMPLETED`, `CANCELLED`, `ACTIVE`

Possible validation errors: `Assigned episode clinician required`; `Approved version and clinician entry-criteria attestation required`

## c2_define

Arguments/defaults: `p_code text, p_title text, p_spec jsonb`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ENCOUNTERS`, `PRESCRIPTIONS`, `DIAGNOSTICS`, `FOLLOW_UPS`, `TIMELINE`, `PATIENT`, `DOCTOR`, `LAB`, `PHARMACY`, `WORKER`, `FACILITY`, `ENCOUNTER_COMPLETED`, `PRESCRIPTION_ISSUED`, `REPORT_PUBLISHED`, `REPORT_REVIEWED`, `MEDICINES_DISPENSED`, `FOLLOW_UP_VERIFIED`, `PATIENT_DECLINED`, `CLINICALLY_CANCELLED`, `TRANSFERRED`, `UNABLE_TO_COMPLETE`, `DUPLICATE_ERROR`, `DECEASED`, `PATHWAY_VERSION_DRAFTED`

Possible validation errors: `Pathway governance required`; `Valid versioned specification and explicit entry criteria required`; `Invalid pathway step definition`; `Unsupported pathway closure`; `Proof category does not match consent scope`; `Unknown pathway dependency`; `Cyclic pathway dependency`

## c2_prove

Arguments/defaults: `p_instance uuid, p_kind text, p_source uuid, p_request uuid`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `CLOSED`, `OPEN`, `ENCOUNTER_COMPLETED`, `PRESCRIPTION_ISSUED`, `REPORT_PUBLISHED`, `REPORT_REVIEWED`, `MEDICINES_DISPENSED`, `FOLLOW_UP_VERIFIED`, `ACTIVE`, `DISPENSED`, `CANCELLED`

Possible validation errors: `Assigned episode clinician required`; `Matching episode source completion evidence required`; `Proof request conflict`; `Pathway step already closed`; `Pathway dependencies incomplete`; `Unsupported proof source`

## c2_publish

Arguments/defaults: `p_version uuid`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `CLINICALLY_REVIEWED`, `PATHWAY_APPROVED`

Possible validation errors: `Pathway governance required`; `Clinically reviewed version required`

## c2_review

Arguments/defaults: `p_version uuid, p_note text`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CLINICALLY_REVIEWED`, `DRAFT`, `PATHWAY_CLINICALLY_REVIEWED`

Possible validation errors: `Approved clinician review and note required`; `Draft version required`

## c2_versions

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Approved clinician defines/reviews/activates/proves; admin publishes; approved clinician/admin reads definitions.

Return shape: `(Row(care_pathway_versions)&{code,title})[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`

Possible validation errors: `Pathway catalogue not authorized`

## c3_attempt

Arguments/defaults: `p_gap uuid, p_action text, p_outcome text, p_note text, p_request uuid`

Role: Actual care-gap participant; clinician for risk/disposition, active patient authorization where required.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OPEN`, `PATIENT_CONFIRMATION`, `RESOLUTION_ATTEMPT_RECORDED`, `DOCTOR`, `WORKER`, `COMPLETED`

Possible validation errors: `Care-gap resolution not authorized`; `Request key required`; `Resolution request conflict`; `Care gap is already closed`; `Patient must record own confirmation`

## c3_disposition

Arguments/defaults: `p_instance uuid, p_outcome text, p_reason text, p_source uuid, p_request uuid`

Role: Actual care-gap participant; clinician for risk/disposition, active patient authorization where required.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `PATIENT_DECLINED`, `TRANSFERRED`, `TRANSFER`, `DECEASED`, `DEATH_CERTIFICATE`, `VERIFIED`, `DUPLICATE_ERROR`, `CANCELLED`, `CLOSED`, `OPEN`, `PATHWAY_`, `COMPLETED`, `ACTIVE`

Possible validation errors: `Pathway disposition not authorized`; `Approved closure rule and explicit reason required`; `Appropriate human confirmation required`; `Disposition request conflict`; `Pathway step already closed`; `Verified transfer source required; external completion remains verification pending`; `Verified clinical source required`; `Matching original step required`

## c3_resolution

Arguments/defaults: `p_gap uuid`

Role: Actual care-gap participant; clinician for risk/disposition, active patient authorization where required.

Return shape: `{gap_id,status,due_at?,blocked_reason?,responsible_provider_id?,risk:{rule_version,score,clinical_urgency,overdue_hours,failed_attempts,unacknowledged_critical,vulnerable_context,stale_operational_data},allowed_operational_actions:string[],notice}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `TIMELINE`, `TREATMENT`, `FAILED`, `CRITICAL_RESULT_ACKNOWLEDGEMENT`, `OPEN`, `CRITICAL`, `HIGH`, `RESOLUTION_READ`, `REMINDER`, `RETRY`, `WORKER_CONTACT`, `ALTERNATE_SEARCH`, `ESCALATE`, `CLINICIAN_REVIEW`, `PATIENT_CONFIRMATION`, `WORKER`, `COMPLETED`

Possible validation errors: `Care-gap resolution not authorized`; `Timeline consent required`

## c3_risk_inputs

Arguments/defaults: `p_gap uuid, p_urgency text, p_vulnerable boolean, p_stale boolean, p_reason text`

Role: Actual care-gap participant; clinician for risk/disposition, active patient authorization where required.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `OPERATIONAL_RISK_INPUTS`

Possible validation errors: `Assigned clinician risk input required`; `Explicit risk inputs and reason required`

## c4_acknowledge

Arguments/defaults: `p_message uuid`

Role: Actual recipient manages preferences/acknowledgement; assigned source participant queues communication.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ACKNOWLEDGED`, `SENT`, `DELIVERED`, `NO_RESPONSE`

Possible validation errors: `Only recipient can acknowledge`; `Message has not been sent`

## c4_enqueue

Arguments/defaults: `p_kind text, p_source uuid, p_channel text, p_request uuid`

Role: Actual recipient manages preferences/acknowledgement; assigned source participant queues communication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPOINTMENT`, `CARE_GAP`, `REFERRAL`, `CRITICAL_RESULT`, `DOCTOR`, `LAB`

Possible validation errors: `Authenticated communication request required`; `Unsupported communication source`; `Actual communication source required`; `Critical communication source not authorized`; `Communication source not authorized`; `Recipient verified channel permission required`; `Communication request conflict`

## c4_messages

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Actual recipient manages preferences/acknowledgement; assigned source participant queues communication.

Return shape: `Pick(care_communications; id,source_kind,source_id,state,created_at,updated_at)[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Authenticated recipient required`

## c4_preference

Arguments/defaults: `p_channel text, p_destination text, p_valid_until timestamp with time zone`

Role: Actual recipient manages preferences/acknowledgement; assigned source participant queues communication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `SMS`, `EMAIL`

Possible validation errors: `Explicit valid communication contact and expiry required`

## c4_revoke

Arguments/defaults: `p_preference uuid`

Role: Actual recipient manages preferences/acknowledgement; assigned source participant queues communication.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CANCELLED`, `QUEUED`

Possible validation errors: `Contact owner required`

## create_patient_profile

Arguments/defaults: `p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_sex text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text`

Role: Authenticated user onboarding only their own account.

Return shape: `uuid`

Consent: No existing clinical history access granted by registration.

Facility: Provider onboarding can create an owned pending facility; this is not operational approval.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `YYYY`, `PATIENT`

Possible validation errors: `Authentication required`; `Patient profile already exists`

## d1_facilities

Arguments/defaults: `p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25`

Role: Authenticated directory reader; only approved sourced practices/facilities returned.

Return shape: `TABLE(facility_id uuid, name text, facility_type text, address text, city text, district text, state text, postal_code text, latitude double precision, longitude double precision, distance_km double precision, operating_state text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: p_limit. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `APPROVED`, `PHYSICAL`, `TELECONSULT`

Possible validation errors: `Invalid authenticated directory request`; `Unknown facility filter`; `Invalid discovery filters`; `Valid coordinates and radius required`; `Invalid consultation mode`; `Invalid fee range`; `Search is too long`

## d1_practices

Arguments/defaults: `p_filters jsonb DEFAULT '{}'::jsonb, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25`

Role: Authenticated directory reader; only approved sourced practices/facilities returned.

Return shape: `TABLE(practice_id uuid, doctor_id uuid, doctor_name text, hpr_id text, specialization text, practice_name text, facility_id uuid, address text, city text, district text, state text, postal_code text, latitude double precision, longitude double precision, distance_km double precision, mode text, consultation_fee numeric, timezone text, next_slot timestamp with time zone, availability_state text, checked_at timestamp with time zone)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, p_limit, 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `NEXT_KNOWN_SLOT`, `AVAILABILITY_UNKNOWN`, `TELECONSULT`, `PHYSICAL`, `DOCTOR`, `APPROVED`, `BOTH`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`

Possible validation errors: `Invalid authenticated directory request`; `Unknown practice filter`; `Invalid discovery filters`; `Valid coordinates and radius required`; `Invalid consultation mode`; `Invalid fee range`; `Search is too long`; `Authenticated valid slot request required`; `Practice is not available for this consultation type`

## e1_arrival

Arguments/defaults: `p_request uuid, p_queue uuid`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CANCELLED`, `SKIPPED`, `ARRIVED`, `FACILITY_CONFIRMED`, `EMERGENCY_PATIENT_ARRIVED`, `APPROVED`

Possible validation errors: `Destination reception required`; `Actual destination check-in required`; `Confirmed facility required`

## e1_candidates

Arguments/defaults: `p_request uuid, p_radius_km double precision DEFAULT 50, p_offset integer DEFAULT 0`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `{facility_id,name,distance_km,capability_state,recently_recorded_available_beds:number,bed_reserved:false}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `RECENTLY_RECORDED_CONFIRMATION_REQUIRED`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `AVAILABLE`, `APPROVED`

Possible validation errors: `Emergency candidates not authorized`

## e1_capability

Arguments/defaults: `p_facility uuid, p_code text, p_available boolean, p_until timestamp with time zone`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `UNKNOWN`, `APPROVED`

Possible validation errors: `Facility authority and bounded freshness required`

## e1_complete

Arguments/defaults: `p_request uuid`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `COMPLETED`, `DOCTOR`, `CLINICIAN`, `CLOSED`, `ARRIVED`, `EMERGENCY_COORDINATION_COMPLETED`, `APPROVED`, `CANCELLED`, `ACTIVE`

Possible validation errors: `Actual signed destination encounter required`; `Actual arrival required`

## e1_contact

Arguments/defaults: `p_request uuid, p_facility uuid`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `OPEN`

Possible validation errors: `Authorized contact destination required`; `Emergency request no longer open`

## e1_request

Arguments/defaults: `p_patient uuid, p_episode uuid, p_capabilities text[], p_latitude double precision, p_longitude double precision, p_reason text, p_request uuid`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `EMERGENCY_COORDINATION`, `ENCOUNTERS`, `IN_PROGRESS`, `FACILITY`, `EMERGENCY_COORDINATION_REQUESTED`, `COMPLETED`, `CANCELLED`, `ACTIVE`

Possible validation errors: `Patient or actual episode clinician required`; `Emergency episode patient mismatch`; `Explicit capability need and location required`; `Emergency request conflict`

## e1_respond

Arguments/defaults: `p_contact uuid, p_accept boolean, p_note text`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `ACCEPTED`, `REJECTED`, `REQUESTED`, `OPEN`, `FACILITY_CONFIRMED`, `EMERGENCY_RESPONSE`, `APPROVED`

Possible validation errors: `Destination facility response required`; `Emergency contact already decided`; `Fresh capability confirmation required`

## e1_transport_request

Arguments/defaults: `p_request uuid`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `text`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `REQUESTED`, `FACILITY_CONFIRMED`, `NOT_REQUESTED`, `FAILED`, `EXTERNAL_TRANSPORT_CONFIRMATION_REQUIRED`

Possible validation errors: `Transport request not authorized`; `Confirmed facility required before transport coordination`

## e1_worklist

Arguments/defaults: `p_facility uuid, p_offset integer DEFAULT 0`

Role: Authorized requesting patient/clinician or explicitly contacted facility manager/reception; service-only transport callbacks are separate.

Return shape: `{contact_id,contact_state,request_id,patient_id,required_capabilities:string[],latitude,longitude,reason,state,transport_state,created_at}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `APPROVED`

Possible validation errors: `Facility emergency worklist not authorized`

## g1_close_episode

Arguments/defaults: `p_episode uuid`

Role: Patient owner or approved connected purpose-authorized clinician; episode closure requires clinician and evidence.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `CANCELLED`, `CLOSED`, `CLOSED_WITH_EXCEPTIONS`, `EPISODE_CLOSED_WITH_EXCEPTIONS`, `EPISODE_COMPLETED`, `CONSULTATION`, `ENCOUNTERS`, `IN_PROGRESS`, `SUPERSEDED`, `DISPENSED`, `PARTIAL`, `PENDING`, `MEDICINE_FULFILMENT`, `PRESCRIPTIONS`, `PHARMACY`, `VERIFICATION_PENDING`, `ORDERED`, `DIAGNOSTIC_REVIEW`, `DIAGNOSTICS`, `PATIENT`, `FOLLOW_UP_PENDING`, `AWAITING_VERIFICATION`, `FOLLOW_UP`, `FOLLOW_UPS`, `WORKER`, `ACTIVE`

Possible validation errors: `Episode closure not authorized`; `Required care lacks completion evidence`

## g1_episode

Arguments/defaults: `p_episode uuid`

Role: Patient owner or approved connected purpose-authorized clinician; episode closure requires clinician and evidence.

Return shape: `{episode:Row(care_episodes),nodes:Row(care_nodes)[],dependencies:Row(care_dependencies)[]}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ENCOUNTERS`, `TREATMENT`, `GRANTED`, `CAREGRAPH_READ`

Possible validation errors: `Episode not authorized`

## g1_episodes

Arguments/defaults: `p_patient uuid, p_offset integer DEFAULT 0`

Role: Patient owner or approved connected purpose-authorized clinician; episode closure requires clinician and evidence.

Return shape: `SETOF care_episodes`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `EPISODE_LIST`, `TREATMENT`, `ENCOUNTERS`, `DOCTOR`, `CONFIRMED`, `COMPLETED`

Possible validation errors: `Episode list not authorized`

## g1_next_steps

Arguments/defaults: `p_episode uuid`

Role: Patient owner or approved connected purpose-authorized clinician; episode closure requires clinician and evidence.

Return shape: `{episode_id,steps:Row(care_nodes)[],scope}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `COMPLETED`, `CANCELLED`, `ENCOUNTERS`, `TREATMENT`, `GRANTED`, `CAREGRAPH_READ`

Possible validation errors: `Episode not authorized`

## h1_check_in

Arguments/defaults: `p_facility uuid, p_appointment uuid, p_department uuid, p_request uuid`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CONFIRMED`, `PHYSICAL`, `CLINICIAN`, `APPROVED`, `CHECK_IN`, `CHECKED_IN`

Possible validation errors: `Reception authorization required`; `Request key required`; `Check-in request conflict`; `Confirmed physical facility appointment required`; `Doctor facility membership required`; `Department belongs to another facility or is inactive`; `Appointment already checked in with different details`; `Consultation already started`; `Appointment is not scheduled for today`

## h1_department

Arguments/defaults: `p_facility uuid, p_name text`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DEPARTMENT_CREATED`

Possible validation errors: `Facility management required`

## h1_my_facilities

Arguments/defaults: `p_offset integer DEFAULT 0, p_limit integer DEFAULT 50`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `TABLE(facility_id uuid, facility_name text, facility_type text, role text, membership_state text, verification_status text, operational_access boolean)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION','CLINICIAN'. Facility IDs are checked server-side.

Pagination: Bounded query limits: p_limit. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OWNER`, `ACTIVE`, `MANAGER`, `RECEPTION`, `CLINICIAN`, `APPROVED`

Possible validation errors: `Valid authenticated facility context required`

## h1_my_token

Arguments/defaults: `p_appointment uuid`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `Omit(reception_queue; request_key,checked_in_by)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Patient token not authorized`

## h1_queue

Arguments/defaults: `p_facility uuid, p_date date, p_offset integer DEFAULT 0`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `TABLE(queue_id uuid, appointment_id uuid, patient_id uuid, patient_name text, doctor_id uuid, department_id uuid, token_number integer, state text, checked_in_at timestamp with time zone)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION','CLINICIAN' / 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CLINICIAN`, `APPROVED`

Possible validation errors: `Facility queue not authorized`

## h1_queue_transition

Arguments/defaults: `p_queue uuid, p_state text`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CHECKED_IN`, `WAITING`, `CANCELLED`, `CALLED`, `SKIPPED`, `QUEUE_TRANSITION`, `APPROVED`

Possible validation errors: `Reception authorization required`; `Invalid queue transition`; `Consultation already started`

## h1_set_member

Arguments/defaults: `p_facility uuid, p_user uuid, p_role text, p_active boolean`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CLINICIAN`, `DOCTOR`, `APPROVED`, `MEMBERSHIP_CHANGED`, `INACTIVE`

Possible validation errors: `Facility management required`; `Valid membership required`; `Approved doctor required for clinician membership`

## h1_setup

Arguments/defaults: `p_facility uuid, p_offset integer DEFAULT 0`

Role: Approved facility owner or active MANAGER/RECEPTION/CLINICIAN as checked; only patient owner reads own token. Setup/membership changes require manager authority.

Return shape: `{departments:Row(facility_departments)[],members:Row(facility_memberships)[]}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Facility setup not authorized`

## h2_admissions

Arguments/defaults: `p_facility uuid, p_offset integer DEFAULT 0`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `{id,patient_id,patient_name,doctor_provider_id,bed_id,status,admitted_at,discharged_at?}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION','CLINICIAN' / 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CLINICIAN`, `APPROVED`

Possible validation errors: `Admission list not authorized`

## h2_admit

Arguments/defaults: `p_facility uuid, p_encounter uuid, p_bed uuid, p_reason text, p_request uuid`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CLINICIAN`, `DOCTOR`, `ADMIT`, `AVAILABLE`, `OCCUPIED`, `ADMITTED`, `APPROVED`

Possible validation errors: `Facility clinician and request key required`; `Facility encounter not authorized`; `Facility bed not found`; `Admission request conflict`; `Bed availability requires fresh confirmation`

## h2_bed

Arguments/defaults: `p_facility uuid, p_department uuid, p_ward text, p_label text, p_state text`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `AVAILABLE`, `CLEANING`, `MAINTENANCE`, `OCCUPIED`, `ADMITTED`, `BED_STATE`, `APPROVED`

Possible validation errors: `Bed management not authorized`; `Operational bed state required`; `Invalid facility department`; `Occupied bed cannot be changed`

## h2_beds

Arguments/defaults: `p_facility uuid, p_offset integer DEFAULT 0`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `{id,department_id?,ward,label,state,updated_at,freshness}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION','CLINICIAN'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `CLINICIAN`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `RECENTLY_RECORDED`, `APPROVED`

Possible validation errors: `Bed list not authorized`

## h2_discharge

Arguments/defaults: `p_admission uuid, p_summary text, p_request uuid`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CLINICIAN`, `DOCTOR`, `DISCHARGE`, `ADMITTED`, `DISCHARGED`, `CLEANING`, `APPROVED`

Possible validation errors: `Assigned facility clinician required`; `Discharge summary and request key required`; `Discharge request conflict`; `Admission already discharged`

## h2_transfer

Arguments/defaults: `p_admission uuid, p_bed uuid, p_reason text, p_request uuid`

Role: Facility-authorized staff for read/setup; assigned approved clinician for clinical admission/transfer/discharge.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','CLINICIAN' / 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `CLINICIAN`, `TRANSFER`, `ADMITTED`, `AVAILABLE`, `CLEANING`, `OCCUPIED`, `BED_TRANSFER`, `APPROVED`

Possible validation errors: `Admission transfer not authorized`; `Transfer reason and request key required`; `Transfer request conflict`; `Invalid transfer`; `Destination bed not confirmed available`

## h3_invoice

Arguments/defaults: `p_invoice uuid`

Role: Authorized facility MANAGER/RECEPTION for billing operations; recorded payments do not establish external settlement.

Return shape: `{invoice:Omit(facility_invoices; request_payload,request_key),lines:Row(facility_invoice_lines)[],payments:Omit(facility_payments; request_key,recorded_by)[],payment_semantics}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `APPROVED`

Possible validation errors: `Invoice not authorized`

## h3_issue

Arguments/defaults: `p_facility uuid, p_source_kind text, p_source uuid, p_lines jsonb, p_request uuid`

Role: Authorized facility MANAGER/RECEPTION for billing operations; recorded payments do not establish external settlement.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `APPOINTMENT`, `CANCELLED`, `NO_SHOW`, `ADMISSION`, `PAID`, `ISSUED`, `INVOICE_ISSUED`, `APPROVED`

Possible validation errors: `Facility billing authorization required`; `Invoice request conflict`; `Unsupported invoice source`; `Source does not establish facility patient relationship`; `Invoice needs 1 to 100 actual charge lines`; `Invalid charge line`; `Invalid charge number`

## h3_record_payment

Arguments/defaults: `p_invoice uuid, p_amount numeric, p_method text, p_reference text, p_request uuid, p_refund_of uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text`

Role: Authorized facility MANAGER/RECEPTION for billing operations; recorded payments do not establish external settlement.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION' / 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PAYMENT`, `REFUND`, `MANAGER`, `RECEPTION`, `CASH`, `BANK_TRANSFER`, `CARD`, `UPI`, `VOID`, `PAID`, `PARTIALLY_PAID`, `ISSUED`, `APPROVED`

Possible validation errors: `Invoice payment not authorized`; `Invalid payment details`; `Actual payment reference required`; `Payment request conflict`; `Invoice is void`; `Payment exceeds invoice balance`; `Refund needs manager and reason`; `Original invoice payment required`; `Refund exceeds recorded payment`

## h3_void

Arguments/defaults: `p_invoice uuid, p_reason text`

Role: Authorized facility MANAGER/RECEPTION for billing operations; recorded payments do not establish external settlement.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `VOID`, `APPROVED`

Possible validation errors: `Manager and void reason required`; `Invoice with recorded money movements cannot be voided`

## h4_cancel_schedule

Arguments/defaults: `p_booking uuid, p_reason text`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `CANCELLED`, `PROCEDURE_ROOM_CANCELLED`, `APPROVED`

Possible validation errors: `Facility manager and cancellation reason required`

## h4_duty

Arguments/defaults: `p_facility uuid, p_user uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_request uuid`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `DUTY_RECORDED`, `APPROVED`

Possible validation errors: `Active facility manager and member with bounded shift required`; `Duty request conflict`; `Staff duty overlaps existing assignment`

## h4_operations

Arguments/defaults: `p_facility uuid, p_from timestamp with time zone, p_until timestamp with time zone`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `{duties:{id,user_id,starts_at,ends_at,membership_current}[],procedure_bookings:Omit(hospital_procedure_bookings; request_key)[],store_items:Row(hospital_store_items)[],admitted_in_window:number,discharged_in_window:number,notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `APPROVED`

Possible validation errors: `Facility manager and bounded operational window required`

## h4_room

Arguments/defaults: `p_facility uuid, p_name text`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `APPROVED`

Possible validation errors: `Facility manager and actual room name required`

## h4_schedule

Arguments/defaults: `p_room uuid, p_admission uuid, p_order uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_request uuid`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','CLINICIAN' / 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `CLINICIAN`, `ADMITTED`, `PROCEDURE`, `COMPLETED`, `CANCELLED`, `APPROVED`, `SCHEDULED`, `PROCEDURE_ROOM_RESERVED`

Possible validation errors: `Facility admission scheduling not authorized`; `Active admission and actual ordered procedure required`; `Current facility clinician and valid schedule required`; `Procedure request conflict`; `Clinician duty must cover procedure window`; `Procedure room, clinician or order already reserved`

## h4_store_item

Arguments/defaults: `p_facility uuid, p_code text, p_name text, p_unit text`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `STORE_ITEM_RECORDED`, `APPROVED`

Possible validation errors: `Facility store metadata required`; `Store item identity conflict`

## h4_store_move

Arguments/defaults: `p_item uuid, p_delta integer, p_reason text, p_reference text, p_request uuid, p_admission uuid DEFAULT NULL::uuid`

Role: Approved facility MANAGER for operations, roster, room and stores; assigned approved clinician for procedure scheduling/cancellation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `STORE_MOVEMENT_RECORDED`, `APPROVED`

Possible validation errors: `Facility store movement with source reference required`; `Store issue admission belongs to another facility`; `Store movement request conflict`; `Insufficient hospital store stock`

## i1_add_document

Arguments/defaults: `p_case uuid, p_record uuid`

Role: Patient owner or currently authorized facility billing/reception; service-only payer responses cannot be forged by clients.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DRAFT`, `MORE_INFORMATION`, `DENIED`

Possible validation errors: `Patient must authorize own supporting document`; `Supporting documents cannot change after submission preparation`

## i1_case

Arguments/defaults: `p_invoice uuid, p_policy uuid, p_kind text, p_amount numeric, p_request uuid`

Role: Patient owner or currently authorized facility billing/reception; service-only payer responses cannot be forged by clients.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `APPROVED`

Possible validation errors: `Facility billing authority required`; `Matching patient coverage and actual requested amount required`; `Payer case request conflict`

## i1_consent

Arguments/defaults: `p_case uuid, p_decision text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone`

Role: Patient owner or currently authorized facility billing/reception; service-only payer responses cannot be forged by clients.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `GRANTED`, `REQUESTED`, `REVOKED`, `PAYER_`, `PAYER_SUBMISSION`, `POLICY`, `INVOICE`, `EXPLICIT_DOCUMENTS`

Possible validation errors: `Patient authorization required`; `Invalid payer consent decision`; `Consent expiry required`

## i1_prepare

Arguments/defaults: `p_case uuid`

Role: Patient owner or currently authorized facility billing/reception; service-only payer responses cannot be forged by clients.

Return shape: `integer`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `GRANTED`, `READY_FOR_EXTERNAL_SUBMISSION`, `DRAFT`, `MORE_INFORMATION`, `DENIED`, `PREPARED`, `APPROVED`

Possible validation errors: `Payer submission not authorized`; `Active patient authorization required`; `Case cannot be submitted from current state`

## i1_read

Arguments/defaults: `p_case uuid`

Role: Patient owner or currently authorized facility billing/reception; service-only payer responses cannot be forged by clients.

Return shape: `{case:Omit(payer_cases; request_key),eligibility_state:"UNKNOWN_EXTERNAL_CHECK_REQUIRED",submission_boundary,documents:{record_id}[],events:{event_type,submission_version,external_reference?,created_at}[]}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `RECEPTION`, `GRANTED`, `PAYER_CASE_READ`, `PAYER_SUBMISSION`, `UNKNOWN_EXTERNAL_CHECK_REQUIRED`, `APPROVED`

Possible validation errors: `Payer case read not authorized`

## is_admin

Arguments/defaults: `(none)`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ADMIN`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## is_approved_provider

Arguments/defaults: `pt app_role DEFAULT NULL::app_role`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## k1_disable_batch

Arguments/defaults: `p_batch uuid, p_reason text`

Role: Authenticated catalog reader; ADMIN for import/disable.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CATALOG_BATCH_DISABLED`

Possible validation errors: `Catalog governance and reason required`

## k1_import

Arguments/defaults: `p_source text, p_version text, p_reference text, p_assurance text, p_effective date, p_rows jsonb, p_request uuid, p_dry_run boolean DEFAULT true`

Role: Authenticated catalog reader; ADMIN for import/disable.

Return shape: `{dry_run:true,valid:boolean,row_count:number,errors:{row:number,error:string}[],persisted:false} | {batch_id,row_count:number,enabled:boolean,duplicate:boolean}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: At most500 rows and1MB per call; default dry-run true creates no batch.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

Exact source/version/content replay returns same batch; conflicting content fails. New version appends immutable rows. Disable preserves evidence and exposes preceding enabled versions. Demo clinical/regulatory rules are rejected.

States/related constants: `DEMO`, `SOURCE_RECORDED`, `OBJECT_REQUIRED`, `UNKNOWN_FIELD`, `CODE_AND_GENERIC_REQUIRED`, `DUPLICATE_CODE`, `FIELD_TYPE_OR_LENGTH`, `ALIASES_ARRAY_REQUIRED`, `ALIASES_INVALID`, `DEMO_REGULATORY_CLAIM_FORBIDDEN`, `MEDICINE`, `MEDICINE_MASTER_IMPORTED`

Possible validation errors: `Catalog governance required`; `Source version, evidence, assurance and rows required`; `Import limited to 500 rows / 1 MB`; `Invalid import: %`; `Import source/version conflict`

## k1_medicines

Arguments/defaults: `p_query text DEFAULT ''::text, p_generic text DEFAULT NULL::text, p_brand text DEFAULT NULL::text, p_strength text DEFAULT NULL::text, p_form text DEFAULT NULL::text, p_active boolean DEFAULT true, p_include_demo boolean DEFAULT false, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30, p_id uuid DEFAULT NULL::uuid`

Role: Authenticated catalog reader; ADMIN for import/disable.

Return shape: `{items:(Row(medicine_master)&{source_name,source_version,source_reference,assurance,effective_date})[],next_after:uuid?,as_of,notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Ascending UUID keyset, default30/max100. next_after nullable. Latest enabled effective version per source-name/source-code, then filters. Include demo only explicitly.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

SOURCE_RECORDED is provenance recording, not independent clinical/regulatory verification. Missing reference rules remain unknown. No stock, price or capability inference.

States/related constants: `DEMO`

Possible validation errors: `Authentication required`; `Bounded search required`

## k2_bind

Arguments/defaults: `p_test uuid, p_master uuid`

Role: Authenticated catalog reader; ADMIN for import/binding.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `SOURCE_RECORDED`, `DIAGNOSTIC_MASTER_BOUND`

Possible validation errors: `Diagnostic governance required`; `Active sourced diagnostic and matching test category required`; `Existing diagnostic binding is immutable`

## k2_diagnostics

Arguments/defaults: `p_query text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_active boolean DEFAULT true, p_include_demo boolean DEFAULT false, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30, p_id uuid DEFAULT NULL::uuid`

Role: Authenticated catalog reader; ADMIN for import/binding.

Return shape: `{items:(Row(diagnostic_master)&{source_name,source_version,source_reference,assurance,effective_date})[],next_after:uuid?,as_of,notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Ascending UUID keyset, default30/max100. next_after nullable. Latest enabled effective version per source-name/source-code, then filters. Include demo only explicitly.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

SOURCE_RECORDED is provenance recording, not independent clinical/regulatory verification. Missing reference rules remain unknown. No stock, price or capability inference.

States/related constants: `PATHOLOGY`, `IMAGING`, `PROCEDURE`, `DEMO`

Possible validation errors: `Authentication required`; `Bounded categorized search required`

## k2_import

Arguments/defaults: `p_source text, p_version text, p_reference text, p_assurance text, p_effective date, p_rows jsonb, p_request uuid, p_dry_run boolean DEFAULT true`

Role: Authenticated catalog reader; ADMIN for import/binding.

Return shape: `{dry_run:true,valid:boolean,row_count:number,errors:{row:number,error:string}[],persisted:false} | {batch_id,row_count:number,enabled:boolean,duplicate:boolean}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: At most500 rows and1MB per call; default dry-run true creates no batch.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

Exact source/version/content replay returns same batch; conflicting content fails. New version appends immutable rows. Disable preserves evidence and exposes preceding enabled versions. Demo clinical/regulatory rules are rejected.

States/related constants: `DEMO`, `SOURCE_RECORDED`, `OBJECT_REQUIRED`, `UNKNOWN_FIELD`, `CODE_AND_NAME_REQUIRED`, `DUPLICATE_CODE`, `FIELD_TYPE_OR_LENGTH`, `ALIASES_ARRAY_REQUIRED`, `ALIASES_INVALID`, `PATHOLOGY`, `IMAGING`, `PROCEDURE`, `CATEGORY_REQUIRED`, `PANEL_ARRAY_REQUIRED`, `PANEL_INVALID`, `DEMO_CLINICAL_RULE_FORBIDDEN`, `DIAGNOSTIC`, `DIAGNOSTIC_MASTER_IMPORTED`

Possible validation errors: `Catalog governance required`; `Source version, evidence, assurance and rows required`; `Import limited to 500 rows / 1 MB`; `Invalid import: %`; `Import source/version conflict`

## l1_history

Arguments/defaults: `p_patient uuid, p_purpose text DEFAULT 'TREATMENT'::text, p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50`

Role: Patient owner or approved connected clinician with purpose/category/date-scoped consent.

Return shape: `SETOF clinical_source_versions`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: p_limit. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `TREATMENT`, `AI_ASSISTANCE`, `DOCTOR`, `GRANTED`, `LONGITUDINAL_READ`, `COMPLETED`, `CONFIRMED`

Possible validation errors: `Invalid history request`; `History not authorized`; `History consent required`

## m1_approve

Arguments/defaults: `p_evaluation uuid, p_note text`

Role: ADMIN model governance; evaluation/route resolution are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Administrator review required`; `Passing offline evaluation required`

## m1_deploy

Arguments/defaults: `p_capability text, p_language text, p_model uuid, p_expected_revision integer, p_reason text, p_fallback uuid DEFAULT NULL::uuid, p_external_fallback boolean DEFAULT false`

Role: ADMIN model governance; evaluation/route resolution are server-only.

Return shape: `integer`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `EXTERNAL`, `APPROVED`

Possible validation errors: `Administrator and deployment/rollback reason required`; `Approved matching capability/language evaluation required`; `External fallback requires explicit governance opt-in`; `Stale model route revision`

## m1_register

Arguments/defaults: `p_name text, p_version text, p_provider text, p_config_ref text, p_capabilities text[], p_languages text[], p_sha256 text DEFAULT NULL::text`

Role: ADMIN model governance; evaluation/route resolution are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OWN_MODEL`

Possible validation errors: `Administrator required`; `Model metadata and owned checkpoint hash required; configuration reference must not contain credentials`; `Immutable model version conflict`

## m1_registry

Arguments/defaults: `(none)`

Role: ADMIN model governance; evaluation/route resolution are server-only.

Return shape: `{models:Row(ai_model_versions)[],routes:Row(ai_model_routes)[]}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Administrator required`

## m2_candidates

Arguments/defaults: `p_limit integer DEFAULT 30`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `{id,state,feedback,created_at}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: p_limit. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PENDING_REVIEW`

Possible validation errors: `Governance reviewer required`

## m2_checkpoint

Arguments/defaults: `p_model uuid, p_run uuid`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OWN_MODEL`, `COMPLETED`, `APPROVED`

Possible validation errors: `Governance reviewer required`; `Completed matching owned-model checkpoint required`; `Immutable checkpoint lineage conflict`

## m2_dataset

Arguments/defaults: `p_name text, p_version text, p_examples uuid[]`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DATASET_VERSION_CREATED`, `APPROVED`

Possible validation errors: `Governance-approved dataset members required`; `Immutable dataset version conflict`; `Dataset contains withdrawn or unapproved examples`

## m2_feedback

Arguments/defaults: `p_interaction uuid, p_feedback text, p_training_opt_in boolean, p_request uuid`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `FEEDBACK_RECEIVED`

Possible validation errors: `Authenticated bounded feedback required`; `Feedback request conflict`

## m2_review

Arguments/defaults: `p_candidate uuid, p_deidentified jsonb, p_note text, p_identifiers_removed boolean`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PENDING_REVIEW`, `SOURCE_SELECTION`, `INTENT_CLASSIFICATION`, `LANGUAGE_DETECTION`, `DOCUMENT_EXTRACTION`, `GROUNDED_ANSWER`, `APPROVED`, `DEIDENTIFIED_EXAMPLE_APPROVED`

Possible validation errors: `Governance reviewer required`; `Active opt-in pending candidate required`; `Independent human reviewer required`; `Explicit de-identification review and bounded training example required`; `Invalid reviewed training task`

## m2_training

Arguments/defaults: `p_dataset uuid, p_recipe text`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OFFLINE_TRAINING_REQUESTED`, `APPROVED`

Possible validation errors: `Approved active dataset and offline recipe reference required`

## m2_withdraw

Arguments/defaults: `p_feedback uuid`

Role: Authenticated feedback owner; independent ADMIN reviewer/governor for review/datasets/training requests; export/training results are server-only.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WITHDRAWN`, `TRAINING_AUTHORIZATION_WITHDRAWN`

Possible validation errors: `Feedback owner required`

## my_provider_id

Arguments/defaults: `(none)`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `uuid`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## my_role

Arguments/defaults: `(none)`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `app_role`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_collection_queue

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `{id,test_name,diagnostic_test_id,status,ordered_at,collection_centre_id,patient_code,full_name,lab_specimens:Row(lab_specimens)[]?}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `FACILITY`, `LAB`

Possible validation errors: `Invalid request`

## p0_connected_patient

Arguments/defaults: `p_patient uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `CONFIRMED`, `COMPLETED`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_create_orders

Arguments/defaults: `p_encounter uuid, p_tests uuid[]`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `IN_PROGRESS`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `ORDERED`, `LAB_ORDERED`

Possible validation errors: `Encounter not authorized or closed`; `Care relationship not confirmed`; `Too many tests`; `Active catalog test required`

## p0_discover

Arguments/defaults: `p_test uuid, p_kind text, p_search text DEFAULT ''::text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_offset integer DEFAULT 0`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `TABLE(destination_id uuid, provider_id uuid, name text, kind text, address text, latitude double precision, longitude double precision, distance_km double precision, capability text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 20. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CENTRE`, `LAB`, `APPROVED`, `FACILITY`, `DIAGNOSTIC_LAB`, `SUPPORTED`, `UNKNOWN`

Possible validation errors: `Authentication required`; `Invalid search`; `Invalid coordinates`

## p0_link_order_test

Arguments/defaults: `p_order uuid, p_test uuid`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `ORDERED`, `LAB_ORDER_CATALOG_LINKED`

Possible validation errors: `Only the ordering approved doctor can link this test`; `Only an uncollected legacy order can be linked`; `Active catalog test required`

## p0_owns_centre

Arguments/defaults: `p_id uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `FACILITY`, `LAB`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_publish_report

Arguments/defaults: `p_result uuid`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `COMPLETED`, `VERIFIED`, `REPORT_READY`, `PROCESSING`, `PROCESSING_COMPLETED`, `LAB_REPORT_REVIEW_PENDING`, `LOW`, `HIGH`, `ABNORMAL`, `ROUTINE`, `OPEN`, `LAB_REPORT_COMPLETED`

Possible validation errors: `Not authorized`; `Verified observations required`; `Upload the verified report PDF first`

## p0_reads_order

Arguments/defaults: `p_id uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `LAB`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_reads_result

Arguments/defaults: `p_order uuid`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `COMPLETED`, `DOCTOR`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_report_path

Arguments/defaults: `p_result uuid`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `text`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_review_report

Arguments/defaults: `p_result uuid`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `CLOSED`, `LAB_REPORT_REVIEW_PENDING`, `OPEN`, `LAB_REPORT_REVIEWED`

Possible validation errors: `Only the ordering approved doctor can review`; `Verified published report required`

## p0_save_location

Arguments/defaults: `p_kind text, p_id uuid, p_address text, p_village text, p_city text, p_district text, p_state text, p_postal text, p_lat double precision, p_lon double precision`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `FACILITY`, `CENTRE`

Possible validation errors: `Approved provider and physical address required`; `Invalid coordinates`; `Invalid location type`; `Location not authorized`

## p0_select_destination

Arguments/defaults: `p_order uuid, p_kind text, p_destination uuid`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `ORDERED`, `CENTRE`, `APPROVED`, `FACILITY`, `LAB`, `COLLECTION_CENTRE`, `DESTINATION_SELECTED`, `DIAGNOSTIC_LAB`, `DIRECT_LAB`, `DIAGNOSTIC_DESTINATION_SELECTED`

Possible validation errors: `Order not authorized`; `Destination is already set or collection has started`; `Test definition/configuration required`; `Centre is not eligible`; `Laboratory is not eligible`; `Invalid destination type`

## p0_specimen_step

Arguments/defaults: `p_order uuid, p_action text, p_sample text DEFAULT NULL::text, p_lab uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_transporter text DEFAULT NULL::text, p_vehicle text DEFAULT NULL::text`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `COMPLETED`, `CANCELLED`, `COLLECT`, `COLLECTED`, `SAMPLE_COLLECTED`, `COLLECTION_CENTRE`, `PACK`, `PACKED`, `DISPATCH`, `APPROVED`, `IN_TRANSIT`, `DISPATCHED`, `RECEIVE`, `RECEIVED_AT_LAB`, `RECEIVED`, `DELIVERED`, `ACCEPT`, `ACCEPTED`, `PROCESS`, `PROCESSING`, `PROCESSING_STARTED`, `REJECT`, `REJECTED`, `SAMPLE_REJECTED`, `FACILITY`

Possible validation errors: `Order not found`; `Not authorized`; `Order is closed`; `Collection belongs to selected centre`; `Specimen already exists; recollection requires a new order`; `Test definition required`; `Scan or enter the matching sample ID`; `Transporter is required`; `Processing laboratory lacks capability`; `Invalid transition or missing rejection reason`

## p0_storage_allowed

Arguments/defaults: `p_name text, p_write boolean`

Role: Authenticated read-only permission/identity/validation predicate; returns only its scalar result, not permission to bypass the protected operation.

Return shape: `boolean`

Consent: The predicate reports current eligibility only. A later sensitive operation validates access again.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `VERIFIED`, `LAB`, `COMPLETED`, `DOCTOR`

Possible validation errors: Permission/type/constraint errors; predicates can return false/null.

## p0_verify_results

Arguments/defaults: `p_order uuid, p_sample text, p_values jsonb, p_source text DEFAULT 'MANUAL'::text, p_raw text DEFAULT NULL::text`

Role: Actual patient, assigned ordering doctor, destination laboratory or collection-centre owner according to operation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANUAL`, `LAB`, `PROCESSING`, `PARAMETERS`, `CSV`, `JSON`, `UNKNOWN`, `NUMBER`, `BOOLEAN`, `LOW`, `HIGH`, `NORMAL`, `VERIFIED`, `LAB_RESULTS_VERIFIED`

Possible validation errors: `Laboratory not authorized`; `Matching specimen must be in processing`; `Result already exists; published observations cannot be overwritten`; `Test definition/configuration required; document diagnostics require a dedicated reporting adapter`; `Invalid result input`; `Original imported payload is required (maximum 2 MB)`; `Unknown parameter`; `Required result missing: %`; `Invalid numeric value: %`; `Boolean result must be true or false`; `At least one actual result is required`

## p2_catalog_record

Arguments/defaults: `p_name text, p_strength text, p_form text, p_classification text, p_source text`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MEDICINE_CATALOG_RECORDED`

Possible validation errors: `Medicine governance required`; `Valid medicine details required`

## p2_ledger

Arguments/defaults: `p_before bigint DEFAULT NULL::bigint`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `SETOF pharmacy_stock_ledger`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Pharmacy required`

## p2_link_inventory

Arguments/defaults: `p_inventory uuid, p_catalog uuid`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Inventory not authorized`; `Catalog medicine/strength must match actual stock`; `Existing stock classification cannot be silently replaced`

## p2_otc_sale

Arguments/defaults: `p_items jsonb, p_request uuid`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `OTC`

Possible validation errors: `Approved pharmacy and request key required`; `Actual stock lines required`; `Sale request conflict`; `Duplicate inventory line`; `Eligible owned stock with actual price and expiry required`; `Governed OTC classification required; Rx and unknown stock cannot be sold anonymously`; `Positive integer quantity required`; `Insufficient stock`

## p2_payment

Arguments/defaults: `p_sale uuid, p_method text, p_reference text, p_request uuid`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `CASH`, `RECORDED`

Possible validation errors: `Sale not authorized`; `Actual payment evidence required`; `Payment receipt conflict`

## p2_return

Arguments/defaults: `p_item uuid, p_quantity integer, p_reason text, p_request uuid`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Sale return not authorized`; `Positive return quantity and request key required`; `Return request conflict`; `Return exceeds sold quantity`

## p2_sale

Arguments/defaults: `p_sale uuid`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `{sale:Omit(pharmacy_sales; request_key,request_payload),items:Row(pharmacy_sale_items)[],payment:Omit(pharmacy_sale_receipts; request_key)?,returns:Omit(pharmacy_returns; request_key)[],tax_semantics}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Sale not authorized`

## p2_search_medicines

Arguments/defaults: `p_search text, p_offset integer DEFAULT 0`

Role: Approved PHARMACY for own stock/POS; ADMIN records sourced legacy medicine classification; catalog read requires authentication.

Return shape: `SETOF medicine_catalog`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Bounded medicine search required`

## p3_order

Arguments/defaults: `p_supplier uuid, p_reference text, p_lines jsonb, p_request uuid`

Role: Approved PHARMACY managing only its own suppliers/purchases/receipts.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Owned supplier required`; `Valid purchase details required`; `Purchase request conflict`; `Positive integer purchase quantity required`; `Actual unit cost required`

## p3_purchases

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Approved PHARMACY managing only its own suppliers/purchases/receipts.

Return shape: `{id,supplier_id,supplier_order_reference,status,created_at,lines:(Row(pharmacy_purchase_lines)&{quantity_received:number})[]?}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Pharmacy purchase list not authorized`

## p3_receive

Arguments/defaults: `p_line uuid, p_quantity integer, p_batch text, p_expiry date, p_selling_price numeric, p_supplier_receipt text, p_request uuid`

Role: Approved PHARMACY managing only its own suppliers/purchases/receipts.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `CANCELLED`, `RECEIVED`, `PARTIALLY_RECEIVED`

Possible validation errors: `Purchase receipt not authorized`; `Actual supplier receipt and quantity required`; `Receipt request conflict`; `Purchase cancelled`; `Receipt exceeds ordered quantity`; `Receipt key already used outside this purchase`; `Approved pharmacy required`; `Receipt request key required`; `Receipt key conflict`; `Enter medicine, batch, valid expiry, positive units and actual nonnegative unit price`; `Inventory not authorized`; `Catalog medicine/strength must match actual stock`; `Existing stock classification cannot be silently replaced`

## p3_supplier

Arguments/defaults: `p_name text, p_reference text`

Role: Approved PHARMACY managing only its own suppliers/purchases/receipts.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Pharmacy required`; `Supplier reference already belongs to another name`

## p4_deliveries

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `Omit(pharmacy_deliveries; request_key)[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`

Possible validation errors: `Authorized delivery participant required`

## p4_reorder_level

Arguments/defaults: `p_inventory uuid, p_level integer`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `REORDER_LEVEL_RECORDED`

Possible validation errors: `Assigned pharmacy and actual reorder threshold required`

## p4_reporting

Arguments/defaults: `(none)`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `{stock_attention:{id,medicine_name,strength?,batch_number?,quantity,expiry_date?,updated_at,reorder_point?,low_stock:boolean,expiry_state}[],recent_receipts:{id,fulfilment_id,quantity,price_paid,dispensed_at}[],suppliers:{id,name,reference,active,created_at}[],notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 100, 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `EXPIRY_UNKNOWN`, `EXPIRED`, `EXPIRING_WITHIN_30_DAYS`, `RECORDED`

Possible validation errors: `Approved pharmacy required`

## p4_request

Arguments/defaults: `p_fulfilment uuid, p_mode text, p_address text, p_request uuid`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `APPROVED`, `PICKUP`, `DELIVERY`, `ACTIVE`, `REQUESTED`, `REQUEST`, `AUTHENTICATED_PATIENT_REQUEST`, `MEDICINE_RECEIPT`, `PRESCRIPTIONS`, `RECEIVED`, `COMPLETED`, `CANCELLED`, `IN_PROGRESS`, `PATIENT`, `MEDICINE_FULFILMENT`, `MEDICINE_RECEIPT_PENDING`, `CLOSED`, `PATIENT_CONFIRMED_RECEIPT`, `PATIENT_CANCELLED_DELIVERY`, `OPEN`

Possible validation errors: `Patient and active assigned pharmacy required`; `Delivery address or address-free pickup required`; `Delivery request conflict`; `Delivery choice must precede dispensing`

## p4_supplier_state

Arguments/defaults: `p_supplier uuid, p_active boolean, p_reason text`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `SUPPLIER_STATE_RECORDED`

Possible validation errors: `Pharmacy supplier change reason required`; `Supplier not authorized`

## p4_transition

Arguments/defaults: `p_delivery uuid, p_action text, p_evidence text, p_request uuid`

Role: Patient owner requests/acknowledges own fulfilment delivery; assigned approved PHARMACY manages fulfilment and own reporting.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PHARMACY`, `ACCEPT`, `REQUESTED`, `ACCEPTED`, `PREPARE`, `PREPARING`, `READY`, `DISPENSED`, `DISPATCH`, `DELIVERY`, `FAILED_ATTEMPT`, `DISPATCHED`, `REPORT_DELIVERY`, `DELIVERY_REPORTED`, `FAIL_ATTEMPT`, `CONFIRM_RECEIPT`, `PICKUP`, `RECEIVED`, `CANCEL`, `CANCELLED`, `RETURN_TO_PHARMACY`, `RETURNED_REVIEW_REQUIRED`, `MEDICINE_DELIVERY_`, `MEDICINE_RECEIPT`, `PRESCRIPTIONS`, `COMPLETED`, `IN_PROGRESS`, `PATIENT`, `MEDICINE_FULFILMENT`, `MEDICINE_RECEIPT_PENDING`, `CLOSED`, `PATIENT_CONFIRMED_RECEIPT`, `PATIENT_CANCELLED_DELIVERY`, `OPEN`, `ACTIVE`

Possible validation errors: `Delivery participant and actual evidence required`; `Delivery event conflict`; `Invalid delivery transition or missing stock-backed dispensing`

## q1_cancel

Arguments/defaults: `p_job uuid`

Role: Document-owning patient or approved clinician with DOCUMENTS consent; extraction worker results are service-only.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CANCELLED`, `DOCUMENT_EXTRACTION_REVOKED`, `DOCUMENT_EXTRACTION`, `DOCUMENTS`

Possible validation errors: `Patient document authorization required`

## q1_read

Arguments/defaults: `p_job uuid`

Role: Document-owning patient or approved clinician with DOCUMENTS consent; extraction worker results are service-only.

Return shape: `{job:Omit(document_extraction_jobs; request_key),draft:Row(document_extraction_drafts)?,reviews:Omit(document_extraction_reviews; request_key)[],notice}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCUMENTS`, `TREATMENT`, `DOCUMENT_EXTRACTION_READ`

Possible validation errors: `Document extraction read not authorized`

## q1_request

Arguments/defaults: `p_record uuid, p_request uuid`

Role: Document-owning patient or approved clinician with DOCUMENTS consent; extraction worker results are service-only.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCUMENT_EXTRACTION_AUTHORIZED`, `DOCUMENT_EXTRACTION`, `DOCUMENTS`

Possible validation errors: `Patient document authorization required`; `Original private document object required`; `Extraction request conflict`

## q1_review

Arguments/defaults: `p_draft uuid, p_fields jsonb, p_note text, p_patient_confirmed boolean, p_request uuid`

Role: Document-owning patient or approved clinician with DOCUMENTS consent; extraction worker results are service-only.

Return shape: `uuid`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `DOCUMENTS`, `TREATMENT`, `GRANTED`, `HUMAN_REVIEWED_TRANSCRIPTION`, `UNKNOWN`, `INSERT`, `DOCUMENT_EXTRACTION_REVIEWED`

Possible validation errors: `Document review requires connected clinician and scoped treatment consent`; `Explicit patient match, corrected fields and human review note required`; `Unsupported normalized document field`; `Review request conflict`

## r1_configure_test

Arguments/defaults: `p_test uuid, p_kind text, p_modality text DEFAULT NULL::text`

Role: ADMIN classifies test; assigned performing LAB and designated facility CLINICIAN have distinct study actions.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PATHOLOGY`, `IMAGING`, `PROCEDURE`, `DIAGNOSTIC_CLASSIFIED`

Possible validation errors: `Catalog governance required`; `Explicit workflow classification required`; `Test not found`

## r1_open_study

Arguments/defaults: `p_order uuid, p_author uuid`

Role: ADMIN classifies test; assigned performing LAB and designated facility CLINICIAN have distinct study actions.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `IMAGING`, `PROCEDURE`, `APPROVED`, `DOCTOR`, `CLINICIAN`, `DIAGNOSTIC_STUDY_OPENED`

Possible validation errors: `Assigned performing laboratory required`; `Explicit imaging/procedure order and performing facility required`; `Performing facility not authorized`; `Approved facility report author required`; `Study author already assigned`

## r1_study_step

Arguments/defaults: `p_study uuid, p_action text, p_payload jsonb, p_request uuid`

Role: ADMIN classifies test; assigned performing LAB and designated facility CLINICIAN have distinct study actions.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `DOCTOR`, `CLINICIAN`, `VERIFIED`, `PUBLISHED`, `DOCTOR_REVIEWED`, `SCHEDULE`, `ORDERED`, `SCHEDULED`, `ARRIVE`, `IMAGING`, `ARRIVED`, `PERFORM`, `PROCEDURE`, `STUDY_PERFORMED`, `PERFORMED`, `ATTACH_STUDY`, `STUDY_AVAILABLE`, `EXTERNAL_REFERENCE_UNVERIFIED`, `DRAFT`, `REPORT_DRAFTED`, `RESULT_RECORDED`, `VERIFY`, `STUDY_`, `APPROVED`

Possible validation errors: `Study not authorized`; `Valid study payload and request key required`; `Study request conflict`; `Verified study is immutable`; `Valid future schedule required`; `Only scheduled imaging arrival is supported`; `Study not ready to perform`; `Performed imaging and study reference required`; `Assigned author and actual report required`; `Assigned author must verify recorded report`; `Result already exists`; `Unsupported study action`

## r1_worklist

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: ADMIN classifies test; assigned performing LAB and designated facility CLINICIAN have distinct study actions.

Return shape: `(Row(diagnostic_studies)&{patient_id,test_name})[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `DOCTOR`, `CLINICIAN`, `APPROVED`

Possible validation errors: `Invalid worklist request`

## r2_detect

Arguments/defaults: `p_result uuid, p_finding text, p_request uuid`

Role: Assigned LAB validates/communicates; responsible approved DOCTOR acknowledges and records reviewed disposition.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `DOCTOR`, `CRITICAL_ACKNOWLEDGEMENT`, `DIAGNOSTICS`, `VERIFICATION_PENDING`, `CRITICAL_RESULT_ACKNOWLEDGEMENT`, `CRITICAL`, `OPEN`, `CRITICAL_RESULT_DETECTED`, `CONSULTATION`, `ENCOUNTERS`, `COMPLETED`, `IN_PROGRESS`, `CANCELLED`, `SUPERSEDED`, `DISPENSED`, `PARTIAL`, `PENDING`, `MEDICINE_FULFILMENT`, `PRESCRIPTIONS`, `PHARMACY`, `ORDERED`, `DIAGNOSTIC_REVIEW`, `PATIENT`, `FOLLOW_UP_PENDING`, `CLOSED`, `AWAITING_VERIFICATION`, `FOLLOW_UP`, `FOLLOW_UPS`, `WORKER`, `ACTIVE`

Possible validation errors: `Verified source and assigned clinical actor required`; `Actual critical finding and request key required`; `Critical finding request conflict`

## r2_transition

Arguments/defaults: `p_critical uuid, p_action text, p_channel text, p_note text, p_request uuid`

Role: Assigned LAB validates/communicates; responsible approved DOCTOR acknowledges and records reviewed disposition.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `DOCTOR`, `PHONE`, `IN_PERSON`, `EXTERNAL_RECORDED`, `DETECTED`, `VALIDATED`, `FAILED`, `NO_RESPONSE`, `ESCALATED`, `QUEUED`, `SENT`, `DELIVERED`, `CLOSED`, `ACKNOWLEDGED`, `COMPLETED`, `OPEN`, `CRITICAL_RESULT_`, `CANCELLED`, `ACTIVE`

Possible validation errors: `Critical result not authorized`; `Communication evidence and valid channel required`; `Critical action request conflict`; `Invalid critical result transition`; `Responsible clinician acknowledgement required`; `Communication channel required`; `Reviewed report and clinician disposition required`

## r2_worklist

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Assigned LAB validates/communicates; responsible approved DOCTOR acknowledges and records reviewed disposition.

Return shape: `{id,result_id,patient_id,finding,state,detected_at,acknowledged_at?,closed_at?}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `LAB`

Possible validation errors: `Invalid critical worklist request`

## r3_capability

Arguments/defaults: `p_test uuid, p_active boolean, p_centre uuid DEFAULT NULL::uuid`

Role: Approved LAB manages own equipment/QC/capability; ordering approved DOCTOR requests recollection.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `IMAGING`, `PROCEDURE`, `DIAGNOSTIC_CAPABILITY_RECORDED`, `APPROVED`, `FACILITY`

Possible validation errors: `Actual active test definition required`; `Approved lab required`; `Authorized collection centre and specimen test required`

## r3_machine

Arguments/defaults: `p_name text, p_manufacturer text, p_model text, p_protocol text, p_request uuid`

Role: Approved LAB manages own equipment/QC/capability; ordering approved DOCTOR requests recollection.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `LAB_MACHINE_REGISTERED`

Possible validation errors: `Approved lab and actual machine metadata required`; `Machine registration conflict`

## r3_quality

Arguments/defaults: `p_machine uuid, p_control text, p_assessment text, p_values jsonb, p_note text, p_observed timestamp with time zone, p_request uuid`

Role: Approved LAB manages own equipment/QC/capability; ordering approved DOCTOR requests recollection.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `LAB_QC_RECORDED`

Possible validation errors: `Assigned lab, actual QC values and explicit human assessment required`; `QC request conflict`

## r3_quality_worklist

Arguments/defaults: `(none)`

Role: Approved LAB manages own equipment/QC/capability; ordering approved DOCTOR requests recollection.

Return shape: `{machines:{id,machine_name,protocol,active,last_health_at?,valid_until?,integration_state,quality_state,last_qc_at?}[],rejected:{id,lab_order_id,sample_code,status,rejection_reason?,updated_at,replacement_order_id?}[],notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, 100, 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LAB`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `QC_UNKNOWN_REVIEW_REQUIRED`, `REJECTED`

Possible validation errors: `Approved lab required`

## r3_recollect

Arguments/defaults: `p_rejected uuid, p_reason text, p_request uuid`

Role: Approved LAB manages own equipment/QC/capability; ordering approved DOCTOR requests recollection.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `SAMPLE_REJECTED`, `REJECTED`, `IMAGING`, `PROCEDURE`, `ORDERED`, `RECOLLECTION_ORDERED`

Possible validation errors: `Ordering clinician and explicit recollection reason required`; `Recollection request conflict`; `Actual rejected pathology specimen and active test required`

## r4_consent

Arguments/defaults: `p_referral uuid, p_decision text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone`

Role: Source clinician creates/closes; patient decides referral consent; destination staff/clinician act within active consent and actual destination.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `REQUESTED`, `GRANTED`, `DENIED`, `REVOKED`, `REFERRAL_`, `REFERRAL`, `REFERRAL_REASON`, `DESTINATION_OUTCOME`

Possible validation errors: `Referral patient decision required`; `Invalid referral consent transition`; `Referral consent expiry within ninety days required`

## r4_create

Arguments/defaults: `p_episode uuid, p_facility uuid, p_department uuid, p_doctor uuid, p_reason text, p_urgency text, p_request uuid`

Role: Source clinician creates/closes; patient decides referral consent; destination staff/clinician act within active consent and actual destination.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `APPROVED`, `CLINICIAN`, `REFERRAL`, `ENCOUNTERS`, `PENDING`, `REFERRAL_COMPLETION_PENDING`, `REFERRAL_CREATED`, `COMPLETED`, `CANCELLED`, `ACTIVE`

Possible validation errors: `Source episode clinician required`; `Request key required`; `Verified destination and assigned clinician required`; `Destination department mismatch`; `Referral request conflict`

## r4_referrals

Arguments/defaults: `p_offset integer DEFAULT 0`

Role: Source clinician creates/closes; patient decides referral consent; destination staff/clinician act within active consent and actual destination.

Return shape: `{id,episode_id,patient_id,source_doctor_id,destination_facility_id,destination_department_id?,destination_doctor_id,urgency,state,consent_status,consent_until?,appointment_id?,outcome_encounter_id?,reason?,outcome_summary?,created_at}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION','CLINICIAN' / 'MANAGER','RECEPTION'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `GRANTED`, `CREATED`, `MANAGER`, `RECEPTION`, `CLINICIAN`, `APPROVED`

Possible validation errors: `Invalid referral list`

## r4_transition

Arguments/defaults: `p_referral uuid, p_state text, p_payload jsonb, p_request uuid`

Role: Source clinician creates/closes; patient decides referral consent; destination staff/clinician act within active consent and actual destination.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER','RECEPTION' / 'CLINICIAN'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `MANAGER`, `RECEPTION`, `CLINICIAN`, `GRANTED`, `SENT`, `CLOSED`, `ACCEPTED`, `REJECTED`, `CLARIFICATION`, `OUTCOME_RETURNED`, `RECEIVED`, `SCHEDULED`, `ARRIVED`, `ENCOUNTER_COMPLETED`, `CREATED`, `CONFIRMED`, `CANCELLED`, `SKIPPED`, `COMPLETED`, `OPEN`, `IN_PROGRESS`, `REFERRAL_`, `APPROVED`, `ACTIVE`

Possible validation errors: `Referral not authorized`; `Active patient referral consent required`; `Valid referral transition payload required`; `Referral action conflict`; `Appropriate referral actor required`; `Invalid referral state transition`; `Destination response reason required`; `Actual destination patient appointment required`; `Actual destination check-in required`; `Signed destination encounter required`; `Destination clinician outcome required`; `Actual returned outcome evidence required`

## register_demo_patient

Arguments/defaults: `p_full_name text, p_date_of_birth date DEFAULT NULL::date, p_sex text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_preferred_language text DEFAULT NULL::text`

Role: Authenticated user onboarding only their own account.

Return shape: `{patient_id,patient_code,demo_abha_id,already_registered:boolean}`

Consent: No existing clinical history access granted by registration.

Facility: Provider onboarding can create an owned pending facility; this is not operational approval.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `YYYY`, `DEMO`, `PATIENT`

Possible validation errors: `Authentication required`

## register_demo_provider

Arguments/defaults: `p_provider_type app_role, p_full_name text, p_registration_id text DEFAULT NULL::text, p_specialization text DEFAULT NULL::text, p_organization_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_address_text text DEFAULT NULL::text`

Role: Authenticated user onboarding only their own account.

Return shape: `{provider_id,already_registered:true} | {provider_id,facility_id:uuid?,demo_registry_id,already_registered:false}`

Consent: No existing clinical history access granted by registration.

Facility: Provider onboarding can create an owned pending facility; this is not operational approval.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `LAB`, `PHARMACY`, `WORKER`, `FACILITY`, `PENDING`, `DEMO`, `HOSPITAL`, `DIAGNOSTIC_LAB`

Possible validation errors: `Authentication required`; `Invalid provider type`; `Name is required`

## s1_snapshot_context

Arguments/defaults: `p_patient uuid, p_purpose text DEFAULT 'TREATMENT'::text`

Role: Patient owner or approved connected clinician with exact access-purpose consent.

Return shape: `SnapshotContext (see FRONTEND-FINAL-CONTRACTS.md)`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50, 30, 100, 10. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `TREATMENT`, `SNAPSHOT_PROJECTION_READ`, `COMPLETED`, `ENCOUNTERS`, `UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION`, `UNKNOWN_PRESCRIPTION_DOES_NOT_CONFIRM_CURRENT_USE`, `DOCUMENTS`, `CANCELLED`, `AI_ASSISTANCE`, `DOCTOR`, `GRANTED`, `PRESCRIPTIONS`, `DIAGNOSTICS`, `TIMELINE`, `FOLLOW_UPS`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`

Possible validation errors: `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`

## t1_replay

Arguments/defaults: `p_patient uuid, p_purpose text DEFAULT 'TREATMENT'::text, p_episode uuid DEFAULT NULL::uuid, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_key text DEFAULT NULL::text, p_limit integer DEFAULT 50`

Role: Patient owner or approved connected clinician with purpose/category/date consent; no admin clinical bypass.

Return shape: `{items:{event_key,patient_id,episode_id?,recorded_at,occurred_at?,actor_user_id?,facility_id?,source_entity,source_id,event_type,previous_state?,resulting_state?,verification_state?,safe_metadata:object,provenance}[],next_cursor:{recorded_at,event_key}?,order,notice}`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Keyset descending by recorded_at, event_key. Supply both next_cursor values together. Default50, max100. next_cursor may yield an empty last page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

Late evidence orders by recorded_at while occurred_at preserves actual event time. BASELINE means captured existing state; absent historical transitions are not reconstructed.

States/related constants: `TREATMENT`, `IMMUTABLE_SOURCE_EVIDENCE`, `CARE_REPLAY_READ`, `AI_ASSISTANCE`, `DOCTOR`, `GRANTED`, `ENCOUNTERS`, `PRESCRIPTIONS`, `COMPLETED`, `DIAGNOSTICS`, `DOCUMENTS`, `TIMELINE`, `FOLLOW_UPS`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`

Possible validation errors: `Bounded replay cursor required`; `Replay episode does not belong to patient`; `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`

## t2_external_completion

Arguments/defaults: `p_gap uuid, p_record uuid, p_note text, p_request uuid`

Role: Patient owner or purpose-authorized clinician; external completion claims require open gap and authorized source document.

Return shape: `uuid`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `OPEN`, `DOCUMENTS`, `TREATMENT`, `EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING`, `EXTERNAL_COMPLETION_REPORTED_UNVERIFIED`, `DOCTOR`, `WORKER`, `COMPLETED`

Possible validation errors: `Authorized open care gap and patient source document required`; `External evidence request conflict`

## t2_twin

Arguments/defaults: `p_episode uuid, p_purpose text DEFAULT 'TREATMENT'::text`

Role: Patient owner or purpose-authorized clinician; external completion claims require open gap and authorized source document.

Return shape: `CareTwin (see FRONTEND-FINAL-CONTRACTS.md for nested domain shapes)`

Consent: Patient owner or approved connected clinician; current grant must match purpose, category, source dates and expiry. TREATMENT never authorizes AI_ASSISTANCE. Revoke/expiry invalidates subsequent reads.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: One episode. Nodes/gaps/pathways/external claims capped100; diagnostics/prescriptions/referrals/followups/payer capped50; emergencies/critical capped30. Omitted records beyond caps require domain worklists.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

No diagnosis or disease simulation. External claims remain verification pending and never close care by themselves.

States/related constants: `TREATMENT`, `ENCOUNTERS`, `COMPLETED`, `CANCELLED`, `OPEN`, `TIMELINE`, `DIAGNOSTICS`, `PRESCRIPTIONS`, `CLOSED`, `REJECTED`, `FOLLOW_UPS`, `SETTLED`, `DENIED`, `APPOINTMENT`, `ADMISSION`, `ACKNOWLEDGED`, `OPERATIONAL_SOURCE_COMPLETED_SEPARATELY`, `EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING`, `DOCUMENTS`, `CURRENT_AUTHORIZED_SOURCE_PROJECTION`, `CARE_TWIN_READ`, `AI_ASSISTANCE`, `DOCTOR`, `GRANTED`, `CONTEXT_READ`, `PATIENT`, `CONFIRMED`, `UNKNOWN`, `HISTORICAL_SOURCE`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `RECENTLY_RECORDED`

Possible validation errors: `Episode unavailable`; `Episode encounter consent required`; `Invalid history offset`; `Invalid access purpose`; `Patient context not authorized`; `Patient consent required or expired`

## t3_pulse

Arguments/defaults: `p_state text, p_district text, p_month date, p_facility uuid DEFAULT NULL::uuid`

Role: ADMIN for district; authorized facility MANAGER for own facility only.

Return shape: `{scope:{state,district,facility_id?},window_start,window_end_exclusive,last_refreshed,data_freshness,minimum_cell_size:10,metrics:{metric,numerator:number?,denominator:number?,suppression_state}[],provenance,limitations,current_operations:{observed_at,time_basis,metrics:{metric,numerator:number?,denominator:number?,suppression_state}[],limitations}}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: One fixed completed calendar month within24months; no patient filters. Cohort minimum20; numerator and complement each minimum10. Suppressed counts both null.

Freshness: Current recorded source state for a historical appointment cohort, not a reconstruction of end-of-month state. last_refreshed is projection time.

No names, patient IDs, phone/address/ABHA. Threshold suppression is not a differential-privacy guarantee. Unmapped practices excluded; no inferred geography. Current capability/stock aggregate is separate from the historical cohort; provider stock maps only to single-site pharmacies.

States/related constants: `APPROVED`, `PHARMACY`, `FACILITIES_WITH_FRESH_CAPABILITY_EVIDENCE`, `SINGLE_SITE_PHARMACIES_WITH_RECORDED_USABLE_STOCK`, `RELEASED`, `SUPPRESSED_MINIMUM_CELL_SIZE`, `CURRENT_RECORDED_STATE_NOT_MONTH_COHORT`, `MANAGER`, `OPEN`, `DIAGNOSTICS`, `COMPLETED`, `DISPENSED`, `CLOSED`, `REJECTED`, `CANCELLED`, `ACKNOWLEDGED`, `OPEN_CAREGAPS`, `OVERDUE_DIAGNOSTIC_GAPS`, `PENDING_REPORT_REVIEWS`, `VERIFIED_FOLLOWUP_COMPLETION`, `MEDICINES_DISPENSED`, `OVERDUE_REFERRAL_GAPS`, `EPISODE_COMPLETION_WITHOUT_EXCEPTIONS`, `CLINICIAN_FLAGGED_STALE_CONTEXT`, `CRITICAL_ACKNOWLEDGEMENT_PENDING`, `UNFINISHED_QUEUE`, `AGGREGATE_PULSE_READ`, `DISTRICT`, `CURRENT_RECORDED_STATE_OF_FIXED_MONTH_COHORT`

Possible validation errors: `Aggregate governance or own facility manager required`; `Completed calendar month within two years and explicit sourced geography required`

## t4_join_intent

Arguments/defaults: `p_session uuid, p_request uuid`

Role: Actual teleconsult patient or assigned approved DOCTOR; ADMIN selects VIDEO route; issuance/callbacks are server-only.

Return shape: `{status:"PROVIDER_UNAVAILABLE",session_id} | {status:"ISSUANCE_REQUIRED",intent_id,expires_at}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

No credential is returned by this RPC. Call the authenticated teleconsult Edge endpoint to obtain a short-lived provider token. Service-role issuance context and master keys never reach the browser.

States/related constants: `ENDING`, `ENDED`, `FAILED`, `UNCONFIGURED`, `AVAILABLE`, `DEGRADED`, `PROVIDER_UNAVAILABLE`, `ISSUANCE_REQUIRED`, `TELECONSULT`, `CONFIRMED`, `DOCTOR`, `APPROVED`

Possible validation errors: `Authorized teleconsult participant required`; `Teleconsult join window closed`; `PROVIDER_UNAVAILABLE`; `Join request conflict`; `Join intent expired`; `Join request rate limit`

## t4_open

Arguments/defaults: `p_appointment uuid`

Role: Actual teleconsult patient or assigned approved DOCTOR; ADMIN selects VIDEO route; issuance/callbacks are server-only.

Return shape: `{session_id,state,provider_state,join_from,expires_at,recording_enabled:false,notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

Stable appointment/session identity. Opening alone does not create a provider room. Join policy: appointment minus15minutes until plus2hours; individual issuance intent expires within2minutes. No recording.

States/related constants: `PLATFORM`, `PATIENT`, `DOCTOR`, `SESSION_REQUESTED`, `TELECONSULT`, `CONFIRMED`, `APPROVED`

Possible validation errors: `Teleconsult appointment participant required`; `Teleconsult appointment expired`

## t4_request_end

Arguments/defaults: `p_session uuid`

Role: Current stored teleconsult participant.

Return shape: `text`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

Returns ENDING when an external room exists; joins are blocked immediately, but actual provider termination still needs trusted receipt. ENDED never completes the clinical appointment.

States/related constants: `ENDING`, `ENDED`, `END_REQUESTED`

Possible validation errors: `Teleconsult participant required`

## t4_route

Arguments/defaults: `p_integration uuid, p_facility uuid DEFAULT NULL::uuid`

Role: Actual teleconsult patient or assigned approved DOCTOR; ADMIN selects VIDEO route; issuance/callbacks are server-only.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `VIDEO`, `PLATFORM`, `TELECONSULT_ROUTE_RECORDED`

Possible validation errors: `Governance VIDEO integration in matching scope required`

## v1_review_provider

Arguments/defaults: `p_provider uuid, p_status text, p_reason text, p_notes text, p_request uuid`

Role: Provider owner submits evidence; ADMIN independently reviews. DEMO never means registry verified.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`, `REVOKED`

Possible validation errors: `Administrator required`; `Valid status, reason and request key required`; `Provider not found`; `Request key conflict`; `Invalid verification transition; restore requires re-review`; `Verification evidence metadata required`

## v1_submit_document

Arguments/defaults: `p_kind text, p_reference text, p_sha256 text, p_request uuid`

Role: Provider owner submits evidence; ADMIN independently reviews. DEMO never means registry verified.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Provider and request key required`; `Request key conflict`

## v1_verification_queue

Arguments/defaults: `p_status text DEFAULT 'PENDING'::text, p_offset integer DEFAULT 0`

Role: Provider owner submits evidence; ADMIN independently reviews. DEMO never means registry verified.

Return shape: `TABLE(provider_id uuid, provider_type app_role, full_name text, verification_status verification_status, identity_source text, registry_verified boolean, submitted_documents bigint, created_at timestamp with time zone)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`, `REVOKED`

Possible validation errors: `Administrator required`; `Invalid queue filter`

## w1_delegate

Arguments/defaults: `p_task uuid, p_actions text[], p_until timestamp with time zone`

Role: Patient grants delegation; approved assigned WORKER submits exact delegated actions and current task version.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `COMPLETED`, `WORKER`, `APPROVED`, `WORKER_DELEGATION_GRANTED`, `ASSISTED_CARE`

Possible validation errors: `Only the task patient may grant delegation`; `Delegation must expire within thirty days`; `Approved assigned worker required`

## w1_package

Arguments/defaults: `p_task uuid`

Role: Patient grants delegation; approved assigned WORKER submits exact delegated actions and current task version.

Return shape: `{task_id,patient_id,patient_name,status,version:number,delegations:{delegation_id,actions:string[],valid_until}[],retrieved_at,package_expires_at,storage_requirement}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `GRANTED`

Possible validation errors: `Assigned worker task required`

## w1_patient_directory

Arguments/defaults: `p_search text DEFAULT ''::text, p_offset integer DEFAULT 0`

Role: Patient grants delegation; approved assigned WORKER submits exact delegated actions and current task version.

Return shape: `TABLE(patient_id uuid, patient_name text, patient_code text)`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 30. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `COMPLETED`

Possible validation errors: `Assigned worker directory required`

## w1_revoke

Arguments/defaults: `p_delegation uuid`

Role: Patient grants delegation; approved assigned WORKER submits exact delegated actions and current task version.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `REVOKED`, `WORKER_DELEGATION_REVOKED`, `ASSISTED_CARE`

Possible validation errors: `Only patient may revoke delegation`

## w1_sync

Arguments/defaults: `p_task uuid, p_patient uuid, p_delegation uuid, p_action text, p_payload jsonb, p_version bigint, p_request uuid`

Role: Patient grants delegation; approved assigned WORKER submits exact delegated actions and current task version.

Return shape: `{receipt_id,status:"ACCEPTED"|"CONFLICT"|"REJECTED",result:{appointment_id?,task_id?,outcome_status?,current_version?,error?}}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `GRANTED`, `BOOK_APPOINTMENT`, `REPORT_OUTCOME`, `CONFLICT`, `TASK_VERSION_CHANGED`, `COMPLETED`, `REJECTED`, `TASK_COMPLETED`, `ACCEPTED`, `ACTION_VALIDATION_FAILED`, `REQUESTED`, `APPOINTMENT_REQUESTED`, `PHYSICAL`, `TELECONSULT`, `BOTH`, `DOCTOR`, `APPROVED`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`, `AWAITING_VERIFICATION`, `CONTACTED`, `VISITED`, `ESCALATED`, `HIGH`, `OPEN`, `FOLLOW_UP_`

Possible validation errors: `Assigned task patient does not match`; `Active explicit patient delegation required`; `Invalid sync request`; `Sync request conflict`; `Patient and valid booking details required`; `Practice not found`; `Booking request key conflict`; `This slot is no longer available`; `Consultation fee changed; select a refreshed slot to confirm`; `Authenticated valid slot request required`; `Practice is not available for this consultation type`; `Task not authorized`; `Outcome required or task is awaiting verification/closed`

## w2_area

Arguments/defaults: `p_code text, p_name text, p_district text, p_state text, p_source text`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER_AREA_RECORDED`

Possible validation errors: `Governed actual geography and source reference required`; `Area identity conflict`

## w2_assign_area

Arguments/defaults: `p_worker uuid, p_area uuid, p_active boolean`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `APPROVED`, `WORKER_AREA_ASSIGNMENT`

Possible validation errors: `Administrator and approved worker required`

## w2_assist

Arguments/defaults: `p_task uuid, p_delegation uuid, p_kind text, p_source uuid, p_note text, p_version bigint, p_request uuid`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `{receipt_id,status:"ACCEPTED"|"CONFLICT"|"REJECTED",result:{appointment_id?,task_id?,outcome_status?,current_version?,error?}}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `TEST_ASSISTANCE`, `SAMPLE_LOGISTICS`, `MEDICINE_REFILL_REQUEST`, `ESCALATION`, `REPORT_OUTCOME`, `ESCALATED`, `CONTACTED`, `ACCEPTED`, `GRANTED`, `BOOK_APPOINTMENT`, `CONFLICT`, `TASK_VERSION_CHANGED`, `COMPLETED`, `REJECTED`, `TASK_COMPLETED`, `ACTION_VALIDATION_FAILED`, `REQUESTED`, `APPOINTMENT_REQUESTED`, `PHYSICAL`, `TELECONSULT`, `BOTH`, `DOCTOR`, `APPROVED`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`, `AWAITING_VERIFICATION`, `VISITED`, `HIGH`, `OPEN`, `FOLLOW_UP_`

Possible validation errors: `Assigned task and bounded structured assistance required`; `Assistance source must belong to assigned patient/task`; `Assigned task patient does not match`; `Active explicit patient delegation required`; `Invalid sync request`; `Sync request conflict`; `Patient and valid booking details required`; `Practice not found`; `Booking request key conflict`; `This slot is no longer available`; `Consultation fee changed; select a refreshed slot to confirm`; `Authenticated valid slot request required`; `Practice is not available for this consultation type`; `Task not authorized`; `Outcome required or task is awaiting verification/closed`

## w2_resolve_conflict

Arguments/defaults: `p_receipt uuid, p_payload jsonb, p_version bigint, p_request uuid, p_discard boolean DEFAULT false`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `{resolution:"DISCARDED"} | ({receipt_id,status,result}&{resolution:string})`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 1, 300. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `CONFLICT`, `REJECTED`, `DISCARDED`, `RETRIED_ACCEPTED`, `ACCEPTED`, `RETRY_CONFLICT`, `RETRY_REJECTED`, `TEST_ASSISTANCE`, `SAMPLE_LOGISTICS`, `MEDICINE_REFILL_REQUEST`, `ESCALATION`, `REPORT_OUTCOME`, `ESCALATED`, `CONTACTED`, `GRANTED`, `BOOK_APPOINTMENT`, `TASK_VERSION_CHANGED`, `COMPLETED`, `TASK_COMPLETED`, `ACTION_VALIDATION_FAILED`, `REQUESTED`, `APPOINTMENT_REQUESTED`, `PHYSICAL`, `TELECONSULT`, `BOTH`, `DOCTOR`, `APPROVED`, `CANCELLED`, `NO_SHOW`, `UNAVAILABLE`, `AWAITING_VERIFICATION`, `VISITED`, `HIGH`, `OPEN`, `FOLLOW_UP_`

Possible validation errors: `Own unresolved sync conflict and distinct request key required`; `Conflict resolution request collision`; `Conflict already resolved`; `Structured assistance conflict retry must preserve reviewed intent`; `Assigned task and bounded structured assistance required`; `Assistance source must belong to assigned patient/task`; `Assigned task patient does not match`; `Active explicit patient delegation required`; `Invalid sync request`; `Sync request conflict`; `Patient and valid booking details required`; `Practice not found`; `Booking request key conflict`; `This slot is no longer available`; `Consultation fee changed; select a refreshed slot to confirm`; `Authenticated valid slot request required`; `Practice is not available for this consultation type`; `Task not authorized`; `Outcome required or task is awaiting verification/closed`

## w2_task_area

Arguments/defaults: `p_task uuid, p_area uuid`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DOCTOR`, `COMPLETED`, `WORKER_TASK_AREA_RECORDED`

Possible validation errors: `Assigned clinician and active worker area required`

## w2_worklist

Arguments/defaults: `p_area uuid DEFAULT NULL::uuid`

Role: ADMIN manages area; assigned clinician assigns task area; approved assigned WORKER reads/assists/retries with active delegation.

Return shape: `{areas:Row(worker_areas)[],tasks:{id,patient_id,patient_name,status,sync_version,updated_at,area_id?,gap_type,due_at?,severity,delegations:{id,actions:string[],valid_until}[]}[],notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 100, 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `WORKER`, `GRANTED`, `COMPLETED`

Possible validation errors: `Assigned worker area required`

## x1_candidates

Arguments/defaults: `(none)`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `{id,alias_patient_id,canonical_patient_id,alias_confirmed,canonical_confirmed,state,created_at,evidence_reference?,alias_patient_code,alias_name,canonical_patient_code,canonical_name}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Bounded query limits: 50. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Authenticated identity access required`

## x1_decide

Arguments/defaults: `p_candidate uuid, p_confirm boolean`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PROPOSED`, `REJECTED`, `UNLINKED`, `LINKED`, `OWNER_CONFIRMED`, `OWNER_WITHDREW`

Possible validation errors: `Source identity owner confirmation required`; `Identity proposal is no longer pending`

## x1_identity

Arguments/defaults: `p_patient uuid`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `{source_patient_id,canonical_reference,authorization_patient_id,notice}`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: No state enum returned.

Possible validation errors: `Own source identity or governance access required`

## x1_link

Arguments/defaults: `p_candidate uuid, p_note text`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LINKED`, `PROPOSED`

Possible validation errors: `Governance identity review required`; `Identity proposal missing`; `Both identity owners must explicitly confirm`; `Source identity changed; new reviewed proposal required`; `Identity alias cycle or existing canonical topology conflict`

## x1_propose

Arguments/defaults: `p_alias uuid, p_canonical uuid, p_evidence text, p_request uuid`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `PROPOSED`

Possible validation errors: `Governance duplicate evidence and distinct source identities required`; `Both source identities must exist`; `Identity proposal conflict`

## x1_unlink

Arguments/defaults: `p_candidate uuid, p_reason text`

Role: ADMIN proposes/reviews identity aliases; both patient owners consent; owner/admin can unlink. No permission expansion.

Return shape: `void`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `LINKED`, `UNLINKED`

Possible validation errors: `Governance unmerge reason required`; `Linked identity required`

## x2_enable

Arguments/defaults: `p_integration uuid, p_enabled boolean, p_expected integer, p_reason text`

Role: ADMIN registers/enables integrations; scoped facility MANAGER/admin requests synchronization/retry and reads health.

Return shape: `integer`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `CANCELLED`, `QUEUED`, `RUNNING`, `INTEGRATION_CONFIGURATION_CHANGED`

Possible validation errors: `Governance integration decision required`; `Stale integration revision`

## x2_health

Arguments/defaults: `p_facility uuid DEFAULT NULL::uuid`

Role: ADMIN registers/enables integrations; scoped facility MANAGER/admin requests synchronization/retry and reads health.

Return shape: `{id,kind,provider_name,environment,facility_id?,enabled,revision,health,auth_state,observed_at?,valid_until?,error_code?,last_successful_sync?,latest_sync_state?,truth_state,last_failed_sync?,latest_failure:{run_id,failure_class,retry_count,next_retry_at?,retryable:boolean,error_code?}?}[]`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 1, 100. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `DISABLED`, `HEALTHY`, `DEGRADED`, `DOWN`, `FAILED`, `STALE`, `UNKNOWN`, `TRANSIENT`, `MANAGER`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `CONFIGURATION_OR_CONFIRMATION_REQUIRED`, `SUCCEEDED`, `APPROVED`

Possible validation errors: `Integration governance/facility scope required`

## x2_register

Arguments/defaults: `p_kind text, p_provider text, p_environment text, p_origin text, p_config_ref text, p_facility uuid, p_request uuid`

Role: ADMIN registers/enables integrations; scoped facility MANAGER/admin requests synchronization/retry and reads health.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: No global facility access; entity ownership or scope is validated where applicable.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `INTEGRATION_REGISTERED_DISABLED`

Possible validation errors: `Governance registration requires HTTPS origin and secret-free configuration reference`; `Integration registration conflict`

## x2_retry

Arguments/defaults: `p_failed_run uuid, p_request uuid`

Role: ADMIN registers/enables integrations; scoped facility MANAGER/admin requests synchronization/retry and reads health.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Single mutation/scalar or bounded entity result; no pagination argument.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `MANAGER`, `FAILED`, `TRANSIENT`, `APPROVED`, `QUEUED`, `RUNNING`, `INTEGRATION_SYNC_QUEUED`

Possible validation errors: `Authorized current integration retry required`; `Retry request conflict`; `Retry terminal, exhausted or not yet eligible`; `Failed run already has retry`; `Authorized enabled integration required`; `Sync request conflict`; `Integration sync already pending`

## x2_sync

Arguments/defaults: `p_integration uuid, p_request uuid`

Role: ADMIN registers/enables integrations; scoped facility MANAGER/admin requests synchronization/retry and reads health.

Return shape: `uuid`

Consent: No blanket clinical access. Explicit participant/assignment or consent checks described by this RPC apply.

Facility: Active approved facility owner/membership; required role checks: 'MANAGER'. Facility IDs are checked server-side.

Pagination: Bounded query limits: 1. Exact offset/cursor arguments and defaults are above. A full page may have a following empty page.

Freshness: Timestamps describe recorded evidence. Missing/stale observations remain unknown; retrieval time never proves current clinical state.

States/related constants: `FAILED`, `MANAGER`, `QUEUED`, `RUNNING`, `INTEGRATION_SYNC_QUEUED`, `APPROVED`

Possible validation errors: `Use bounded retry; terminal failures require governance configuration review`; `Authorized enabled integration required`; `Sync request conflict`; `Integration sync already pending`


## Migration 052 context-bound discovery

No new medical profile storage is added. Blood group, emergency contact, reconciled allergies and chronic conditions have no canonical source and remain explicitly not recorded.

### d2_gap_workers

Arguments: `p_gap uuid, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0`

Return: `TABLE(id uuid, name text, detail text)`

Approved doctor responsible for the care-gap source encounter. Active patient delegation with REPORT_OUTCOME, or active membership at the approved encounter practice facility. Ten rows per page; stable name/ID order; p_offset 0..10000; literal search up to 100 characters. Current eligibility checked on each request. Pharmacy hours and stock require confirmation.

### d2_rx_pharmacies

Arguments: `p_rx uuid, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0`

Return: `TABLE(id uuid, name text, detail text)`

Patient who owns the active prescription. Approved PHARMACY facility owned by an approved pharmacy provider in the patient profile exact city and state. Missing location fails closed. Ten rows per page; stable name/ID order; p_offset 0..10000; literal search up to 100 characters. Current eligibility checked on each request. Pharmacy hours and stock require confirmation.

Worker assignment c1_assign_followup rechecks the same eligibility and rejects out-of-context worker IDs.
