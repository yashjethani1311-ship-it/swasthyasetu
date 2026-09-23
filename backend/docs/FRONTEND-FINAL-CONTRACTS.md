# Frontend backend handoff through 050

This is the isolated backend source contract, not a deployment or a claim that every feature is wired into the separately developed frontend. [RPC-CONTRACTS.md](RPC-CONTRACTS.md) enumerates every authenticated RPC with exact arguments/defaults, return shapes, authority, pagination, states and errors. [ROW-SCHEMAS.md](ROW-SCHEMAS.md) expands referenced row types and their nullability. [RPC-CONTRACTS.json](RPC-CONTRACTS.json) is the machine-readable index. Never use a service-role key in the browser.

## Shared behavior

Use the user's Supabase JWT for frontend RPCs. Server authority comes from current approval, membership, assignment, ownership and consent, not the page's chosen role. Permission predicates are hints, not durable authorization. Treat every sensitive RPC as authoritative. No optimistic clinical completion: show persisted state after success, preserve a stable request key for an identical retry, and fetch the latest revision/version before a changed action. A UUID response identifies a persisted row or receipt; it is not necessarily clinical completion.

Unknown/null is not normal, final, active medicine use, availability or external verification. Every timestamp is ISO format unless the argument is a calendar date. Never label retrieval time as observation time. Preserve original source IDs and dates. Do not combine identity aliases into clinical history or transfer consent between them.

Patient owner access and clinician access differ. Clinicians need current TREATMENT consent for clinical history and separate AI_ASSISTANCE consent for model tools. Categories are ENCOUNTERS, PRESCRIPTIONS, DIAGNOSTICS, DOCUMENTS, TIMELINE and FOLLOW_UPS; each source's date must be in the granted window. Facility operational authority is separate from patient longitudinal consent. Pharmacy sees assigned fulfilment, worker sees assigned task data, and admin governance does not grant general clinical narrative access.

## Named JSON shapes

The following notation uses the exact row dictionary. Optional nested values are null when absent; arrays are empty unless explicitly marked nullable. Fields without a suffix inherit their corresponding stored column type.

`AuthorizedContext`:

```text
{
 patient_id, allergies:string, actor_role:"PATIENT"|"DOCTOR", access_purpose,
 retrieved_at, scope:string,
 encounters: {id,started_at,completed_at?,chief_complaint?,symptoms?,diagnosis?,clinical_notes?,follow_up_in_days?,status}[],
 prescriptions: {id,issued_at,status,clinical_notes?,items:Row(prescription_items)[]?,fulfilment:Row(prescription_fulfilments)?}[],
 diagnostics: {id,test_name,ordered_at,status,routing_status?,result:Row(lab_results)?}[],
 health_records: {id,record_type,record_date?,source_type,original_filename?,verification_status,created_at}[],
 care_gaps:Row(care_gaps)[],events:Row(care_events)[],follow_ups:Row(follow_up_tasks)[]
}
```

Clinician `events` omit `metadata`. Only published/completed verified results enter this history; a missing result is not a normal result. Each base section is limited to50 records per page. Prescription items are recorded source items, not a reconciled active-medicine list.

`SnapshotContext` extends `AuthorizedContext`:

```text
{
 current_state:{active_problems,active_medicines,allergies,vitals},
 reviewed_documents:{id,version,normalized_fields:object,review_state,source_authenticity,created_at,record_id,source_at,reviewed_by}[],
 episodes:{id,encounter_id,source_at,status,closure_outcome?,closed_at?,nodes:{id,kind,state,responsible_role,due_at?,occurred_at,updated_at,required,proof_kind?,proof_id?,ready:boolean}[]}[],
 dated_vitals:{id,started_at,temperature_c?,pulse_bpm?,systolic_bp?,diastolic_bp?,spo2_percent?,weight_kg?}[],
 snapshot_scope:string,audit_reference:uuid,freshness:string
}
```

Document review confirms transcription, not original authenticity or current treatment. Dated vitals come only from completed encounters with ENCOUNTERS consent. Maximum30 latest document reviews,10 episodes,100 nodes per episode and50 dated vital rows. Current allergies and active medicines remain explicitly unreconciled/unknown.

`CareTwin` from `t2_twin`:

```text
{
 episode:{id,patient_id,encounter_id,status,closure_outcome?,source_at,closed_at?},
 nodes:(Pick(care_nodes;id,kind,category,state,required,responsible_role,source_kind,source_id,occurred_at,updated_at,due_at,proof_kind,proof_id)&{ready:boolean}&Freshness)[],
 care_gaps:(Pick(care_gaps;id,graph_node_id,gap_type,status,due_at,severity,blocked_reason,closure_outcome,created_at,closed_at,risk_recorded_at)&Freshness)[],
 next_steps: same node shape[],
 pathways:{activation_id,version_id,activated_at,definition_state}[],
 appointments:{id,scheduled_at,mode,status}[],
 diagnostics:DiagnosticTwin[],
 prescriptions:{id,status,issued_at,fulfilment:{id,status,requested_at,completed_at?}?,receipt:{id,state,mode,updated_at,received_at?}?}[],
 referrals:({id,state,urgency,destination_facility_id,created_at,updated_at}&Freshness)[],
 follow_ups:({id,status,updated_at,verified_at?,sync_version,assistance_observation_count:number}&Freshness)[],
 payer_cases:({id,kind,state,updated_at,submission_version}&Freshness)[],
 emergencies:({id,state,transport_state,accepted_facility_id?,created_at}&Freshness)[],
 critical_results:({id,state,detected_at,acknowledged_at?,closed_at?,result_id}&Freshness)[],
 external_claims:{id,gap_id,record_id,reported_at,state}[],
 as_of,provenance,scope,notice
}
Freshness = {source_updated_at:timestamp?,freshness:"UNKNOWN"|"HISTORICAL_SOURCE"|"STATUS_UNKNOWN_CONFIRMATION_REQUIRED"|"RECENTLY_RECORDED",freshness_policy_seconds:number}
```

The diagnostic nested fields are generated from actual specimen/study/result evidence; see the `DiagnosticTwin` subsection below. Normal operational freshness uses7days; unresolved critical/emergency evidence uses15minutes. A stale status is not a declaration that care failed. Pathways/external claims/nodes/gaps cap100, ordinary domain lists50, emergency/critical30. Use domain worklists for larger histories. This is operational consolidation, not a diagnostic simulation.

### DiagnosticTwin

```text
{
 id,test_name,workflow_kind?,status,routing_status?,ordered_at,updated_at,
 specimens:{id,status,updated_at,processing_lab_provider_id?,collection_centre_id?}[]?,
 study:{id,state,updated_at,facility_id}?,
 result:{id,status,verified_at,doctor_reviewed_at?,pending_review:boolean}?,
 source_updated_at,freshness,freshness_policy_seconds
}
```

Result appears only when verified, published/completed and a private report path exists. This projection does not contain clinical result values or infer that a missing result is normal.

## Workflow sequence

Appointments: discover actual `d1_practices` then read `a2_available_slots`, submit `a2_book_appointment`, and use validated `a2_appointment_transition`. PERSON, PLACE and AVAILABILITY remain separate. Doctor `a2_start_encounter` returns an actual encounter; `c1_finish_encounter` atomically signs the consultation and its submitted prescription/orders. Do not independently toggle encounter and appointment completion.

Hospital: `h1_my_facilities` selects explicit authorized context, `h1_setup`/membership manage setup, `h1_check_in` issues persisted idempotent tokens, and `h1_queue` reads a facility/day worklist. Actual encounter transitions drive consultation completion. `h2_*` handles sourced bed/admission/transfer/discharge; beds older than4hours are confirmation-required. `h3_*` records actual invoice/payment/refund evidence without asserting external settlement. `h4_*` handles duties, procedure reservations and non-medicine stores; a reservation is not a performed procedure. Store quantities do not dispense medicines.

Pathology: order → destination selection → specimen collection/custody/transport → laboratory receipt/processing → entered result → verified result → private report publication → ordering-doctor review. Collection centres do not verify processing-lab results. Report verification and publication are separate. Use `p0_*` RPCs and the report path returned by `p0_report_path`; upload into the private `lab-reports` bucket before publication. Missing reference intervals remain UNKNOWN.

Imaging/procedures: explicitly classify source test with `r1_configure_test`. `r1_open_study` binds actual order, facility and designated report author. IMAGING uses SCHEDULE, ARRIVE, PERFORM, ATTACH_STUDY, DRAFT, VERIFY; PROCEDURE omits specimen/arrival semantics and uses performed/result-recorded states. Published source reports and doctor review close appropriate obligations. An external study reference is unverified unless supported by a real integration. `r3_*` records separate connectivity and human QC evidence and source-linked recollection after rejected pathology specimens.

Critical results: `r2_detect` derives a real verified source; `r2_transition` records validation, communication, clinician acknowledgement and reviewed disposition. SENT is neither acknowledgement nor closure. No client can forge external receipt callbacks.

Pharmacy: patient selects `c1_choose_pharmacy`; pharmacy reads assigned `c1_pharmacy_queue`. `c1_add_stock`, `c1_dispense`, `p2_*` POS and `p3_*` purchasing use actual stock/batch/expiry/source quantities and prices. `p4_request` creates pickup/delivery intent. READY requires actual dispensing; DISPATCHED/DELIVERY_REPORTED do not close receipt. Patient CONFIRM_RECEIPT is evidence for RECEIVED. Returned medicine remains quarantined; no automatic restock. The paper-prescription intake/verification workflow is not complete; never represent an uploaded paper prescription as doctor-verified.

Worker: use exact-patient delegated lookup, `w1_package`, active delegation and task version. Queue locally only with encryption and eviction on logout/revocation; this backend does not implement a client offline store. `w1_sync` persists ACCEPTED/CONFLICT/REJECTED receipts. `w2_resolve_conflict` creates a reviewed retry with a new key and current version; it never silently overwrites source data. Structured `w2_assist` observations request assistance/refill/escalation; they do not prescribe, book without delegation, or verify clinical completion. Clinician `c1_verify_followup` supplies final verification.

Care coordination: `g1_episode`/`g1_next_steps`, governed `c2_*` pathway activation/proof, `c3_*` risk/attempt/disposition and source events persist the closed loop. Required prerequisites must actually be COMPLETED; CANCELLED is not completion. Explicit dispositions distinguish COMPLETED, CLINICALLY_CANCELLED, PATIENT_DECLINED, TRANSFERRED, UNABLE_TO_COMPLETE, DUPLICATE_ERROR and DECEASED. `t2_external_completion` records EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING against an authorized uploaded document, without closing the gap.

Referrals/payer/emergency: `r4_*` requires referral consent and actual destination encounter evidence before closure. `i1_*` prepares versioned cases/documents; external payer evidence uses service-only callbacks and never automatically records invoice payment. `e1_*` discovers fresh recorded capability, contacts actual facilities, records acceptance and actual arrival/encounter closure; transport REQUESTED is not dispatch. Clinical emergency decisions remain with qualified people.

## Replay, Pulse and identity

`t1_replay` is reverse recorded chronology. Render oldest-first only after explicitly reversing the desired loaded range. Persist/use both cursor fields; `occurred_at` can predate `recorded_at` for late evidence. Stable `event_key` deduplicates pagination; related event sources can still describe the same care transition. Baseline capture is not reconstructed historic evidence. Replay never grants broader clinical access.

`t3_pulse` returns only approved role/scope aggregates. The historical cohort uses sourced practice state/district and a complete calendar month in the past24months. Counts release only with denominator≥20, numerator≥10 and complement≥10; suppressed numerator AND denominator are null, including empty/zero cells. Do not replace suppressed values with zero or calculate complementary values in the UI.

`current_operations` is a separate current-state projection:

```text
{observed_at,time_basis:"CURRENT_RECORDED_STATE_NOT_MONTH_COHORT",
 metrics:{metric,numerator:number?,denominator:number?,suppression_state}[],limitations}
```

It measures fresh capability evidence and single-site pharmacies with at least one recorded positive unexpired inventory line. Fresh evidence does not mean availability; one line does not mean a prescription can be filled. Multi-site provider inventory is excluded because it cannot be assigned to a physical location safely. Do not plot these as historical month-end values. This is threshold suppression, not formal differential privacy.

`x1_*` identity links are reversible aliases only. Source patient IDs, records, original consent and access remain unchanged. Both owners must consent before governed linkage; a source identity change invalidates stale proposals. `canonical_reference` is not a replacement authorization patient ID.

## Governed catalogs

`k1_medicines` and `k2_diagnostics` are facility-independent catalogs; they imply no stock, pricing, lab capability or local availability. The legacy `medicine_catalog` remains a separate sourced POS classification linked to actual stock. No automatic substitution or RX/OTC classification is inferred from a new medicine-master row.

Medicine source rows: required `source_code`, `generic_name`; optional brand_name, composition, strength, dosage_form, route, pack_description, manufacturer, regulatory_classification, nlem(boolean/null), jan_aushadhi_mapping, aliases(string[]), active(boolean). Unknown keys, inventory/price/expiry fields, invalid types and duplicate source codes fail validation. DEMO cannot assert regulatory/NLEM/JanAushadhi claims.

Diagnostic source rows: required `source_code`, `name`, `category` PATHOLOGY/IMAGING/PROCEDURE; optional department, specimen_type, container, minimum_volume, preparation, transport, temperature, stability, methodology, unit, reference_rule, critical_rule, turnaround (source text), panel_components(source-code string[]), aliases(string[]), active(boolean). DEMO cannot assert reference/critical/preparation rules. Rules are retained as source text, not automatically executable clinical logic. Panels reference source codes; they do not automatically order child tests. `k2_bind` maps an existing explicitly classified local test to a sourced active master of the same category; it creates no capability or clinical-rule override.

Use `scripts/catalog-import.mjs manifest.json rows.csv|json output.json` to produce a dry-run RPC payload. Manifest fields: kind(MEDICINE/DIAGNOSTIC), source, version, reference, assurance(DEMO/SOURCE_RECORDED), effective_date, request_key. CSV aliases/panel_components are JSON arrays; booleans are literal true/false. Output creation refuses to overwrite an existing file. Send the payload with an admin JWT, inspect valid/errors, then explicitly repeat with p_dry_run=false and the same immutable source version/content. No database connection or credential is read by this local preparation script.

New versions append. Duplicate identical source/version returns the old batch; changed content under the same version fails. `k1_disable_batch` records a reason and preserves all source rows; readers fall back per source/code to previous enabled effective rows. A partial version does not delete omitted codes—explicitly import active=false to discontinue one. DEMO is excluded by default. SOURCE_RECORDED means evidence recorded, not independently verified, licensed-complete or nationally exhaustive. No real dataset was imported by this pass.

## Teleconsult Edge boundary

Call POST `/functions/v1/teleconsult` with user bearer JWT and `{appointment:uuid,request:uuid,action:"JOIN"|"END"}`. A room belongs to an actual CONFIRMED TELECONSULT appointment and its actual patient/approved doctor. Join policy is scheduled_at−15minutes through scheduled_at+2hours; issued intents expire within2minutes. Request IDs are immutable per participant/session. No recording is enabled.

JOIN returns `{session_id,participant_id,role,token,expires_at,recording_enabled:false}` only after current authorization, provider issuance and a second authorization check. END returns `{session_id,state:"ENDED"}` only after an actual provider receipt or when no external room existed. If termination fails, persisted ENDING still blocks new joins; a trusted operator/adapter retries cleanup. Never treat the video state as consultation completion. Direct RPC `t4_request_end` may return ENDING.

Unconfigured/unavailable provider returns HTTP503 `{error:"PROVIDER_UNAVAILABLE"}`. Wrong participant returns403 NOT_AUTHORIZED; missing bearer returns401; malformed request returns400; oversized body returns413. No token is persisted or logged. Browser gets only short-lived room credentials, never provider master key, config reference or service-role secret.

Admin `x2_register(kind=VIDEO)` plus `t4_route` chooses an enabled scoped integration. Server configuration references resolve `${CONFIG_REF}_URL` and `${CONFIG_REF}_KEY`. Actual external adapter must implement HTTPS POST `/rooms`, `/join-credentials`, `/rooms/end` with the tested idempotency, expiry and no-recording contract in `_shared/teleconsult.mjs`. Room returns `{room_reference}`; credential returns `{token,reference,expires_at}`; termination returns `{state:"ENDED",reference}`. These are provider-neutral adapter contracts, not a claim of compatibility with a particular commercial video API. No provider is configured. Connection/provider callbacks require independently authenticated trusted server code; no public unauthenticated callback route exists.

## AI tool contract and privacy

POST `/functions/v1/role-ai`: `{tool,scope,question?,language?}` with user JWT. Languages English/Hindi/Hinglish/Auto. Scope admits patient_id, facility_id, task_id or the Pulse state/district/month fields only where that exact tool permits them. `a3_tool` derives role, validates scope, reads bounded source records and persists an audit row. Tool output is the envelope documented in RPC-CONTRACTS; `data` is always an array. The following maps every data variant:

| Role | Tool | Data item shape |
|---|---|---|
| PATIENT/DOCTOR | get_patient_snapshot | SnapshotContext |
| PATIENT/DOCTOR | get_recent_diagnostics, get_diagnostic_trends, get_pending_report_reviews | AuthorizedContext.diagnostics item; pending filters verified published result without doctor_reviewed_at |
| PATIENT/DOCTOR | get_prescriptions | AuthorizedContext.prescriptions item |
| PATIENT/DOCTOR | get_medicine_fulfilment | {id,issued_at,status,fulfilment} |
| PATIENT/DOCTOR | get_appointments | {id,scheduled_at,mode,status,created_at} |
| PATIENT/DOCTOR | get_open_caregaps | Row(care_gaps), excluding CLOSED |
| PATIENT/DOCTOR | get_nextstep | SnapshotContext episode node where ready and not completed/cancelled |
| PATIENT/DOCTOR | get_caregraph | SnapshotContext episode |
| PATIENT/DOCTOR | get_longitudinal_history | Row(clinical_source_versions), purpose-filtered |
| PATIENT/DOCTOR | get_active_medicines | {state:"UNKNOWN_REQUIRES_CLINICIAN_RECONCILIATION",notice} |
| PATIENT/DOCTOR | get_followup_state | Row(follow_up_tasks) |
| PATIENT/DOCTOR | get_referral_status | {id,state,urgency,created_at,updated_at,destination_facility_id,appointment_id?,outcome_encounter_id?} |
| FACILITY | get_hospital_queue | h1_queue row minus patient_id/patient_name |
| FACILITY | get_admissions, get_discharge_pending | h2_admissions row minus patient_id/patient_name; pending adds discharge_readiness=UNKNOWN_CLINICIAN_REVIEW_REQUIRED |
| FACILITY | get_beds | h2_beds row |
| FACILITY | get_facility_workload | {id,queue_records_in_first_page,admission_records_in_first_page,scope}; counts are not hospital totals |
| FACILITY manager | get_hospital_procedures | {id,state,starts_at,ends_at,created_at} |
| FACILITY manager | get_hospital_stores | {id,item_code,name,unit,quantity,updated_at} |
| FACILITY manager | get_hospital_referrals | {id,state,urgency,created_at,updated_at}; active destination consent required |
| LAB | get_pathology_worklist | {id,test_name,status,routing_status,ordered_at} |
| LAB | get_study_worklist | {id,lab_order_id,test_name,state,workflow_kind,created_at,updated_at} |
| LAB/DOCTOR | get_critical_worklist | r2_worklist row minus patient_id/finding |
| LAB | get_lab_quality, get_lab_machines | r3_quality_worklist.machines item |
| LAB | get_recollection_worklist | r3_quality_worklist.rejected item minus sample_code/rejection_reason |
| PHARMACY | get_inventory, get_low_stock, get_expiry | {id,medicine_name,strength?,batch_number?,expiry_date?,quantity,selling_price?,updated_at,expiry_state}; low_stock legacy tool means zero, use p4_reporting for configured thresholds |
| PHARMACY | get_pharmacy_fulfilment | {id,status,requested_at,completed_at?} |
| PHARMACY | get_purchases | p3_purchases item |
| PHARMACY | get_sales_summary | {id,total,created_at} |
| PHARMACY | get_pharmacy_delivery | {id,mode,state,created_at,updated_at,received_at?}, no address |
| WORKER | get_assigned_tasks, get_worker_delegations, get_worker_next_action | {id,status,sync_version,assigned_at,updated_at,care_gap:{id,gap_type,status,due_at?}?,delegations:{id,actions,valid_until}[],next_action} |
| WORKER | get_worker_sync | {id,task_id,status,purpose,created_at} |
| ADMIN | get_verification_queue | v1_verification_queue row minus full_name |
| ADMIN | get_model_governance | m1_registry object |
| ADMIN | get_integration_health | x2_health item, no endpoint/config secret |
| ADMIN | get_governance_incidents | {id,category,state,severity?,revision,created_at,updated_at}, no incident narrative |
| ADMIN | get_district_pulse | t3_pulse object, thresholds unchanged |

The model receives only source IDs, dates, kinds and a narrow allowlist of numeric/status selection signals. It does not receive raw narratives, uploaded filenames, direct identifiers, the raw typed question or full tool JSON. A deterministic local question-to-intent mapping precedes selection; this limits semantic/free-form question capability deliberately. Original authorized source excerpts remain server-side and are returned only after source/access recheck. No model-generated clinical prose is treated as evidence. Answers are localized narration around original-language dated excerpts, not full medical translation or autonomous diagnosis.

Successful answer includes items with source_id/date/kind/text, outcome, answer with citations/language/mode, request_id, tool/role where applicable, audit_reference, freshness, retrieved/generated time, model_route(provider/model_version_id/revision), fallback_used and uncertainty where available. Empty relevant data returns NO_RELEVANT_RECORDS; clinical action requests return UNSUPPORTED_REQUEST. Provider/configuration failure degrades to an unavailable error; core RPC workflows do not depend on AI.

An evaluated owned model is a first-class primary route. Server `${CONFIG_REF}_MODEL` may override the serving model identifier without changing the governed version. A single fallback retry requires an approved matching fallback, explicit external-fallback governance when external, and server `AI_ALLOW_GOVERNED_FALLBACK=true`. Consent/source/route are rechecked before fallback and before disclosure. Invalid or forged model output never triggers fallback. No patient-response caching is implemented. No automatic training from chats; opted-in, independently reviewed deidentified examples use the separate offline governance pipeline. No actual model was trained or evaluated against a clinical production dataset here.

## Integration and production handoff

`x2_health` returns HEALTHY/DEGRADED/STALE/FAILED/DISABLED/UNKNOWN truth_state alongside observed auth/health and sync metadata. Enabled does not mean connected. `x2_retry` allows at most3 transient retries with persisted exponential eligibility; terminal failure requires governed configuration revision. Same request key returns the same run. Service-only observations/callbacks need real authenticated external evidence. Runtime credentials are never stored in integration rows.

Use the migration chain documented in CONTINUE and the coverage matrix for staging review. Do not blindly run001–003 against a live schema already reconciled by004. This pass did not apply anything to production. Real Supabase Auth/Storage/Edge behavior, independent security review, PostgreSQL concurrency/load plans, licensed datasets and external provider adapters remain deployment work. The separately built frontend must wire these contracts without displaying backend architecture as product copy.
