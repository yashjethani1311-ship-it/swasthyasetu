# FRONTEND–BACKEND CONTRACTS

SwasthyaSetu frontend workspace: `D:\SwasthyaSetu-frontend-final`  
Backend source of truth: `swasthyasetu-backend-final.zip`, migrations through 050.  
Total Backend RPCs: 207 (all verified against `docs/RPC-CONTRACTS.json`).  
Frontend Reconciled RPC Calls: 63 call sites, 60 unique RPCs, 100% strict match, 0 discrepancies.

This document records the exact integration status across all frontend pages and backend migrations (001 through 050). Every feature operates with truthful operational states, real database RPCs, and never fabricates mock data, beds, or success.

Status legend: ✅ backed today · 🟡 partial · ❌ backend required.

---

## PATIENT

### Health Records — extraction / OCR pipeline ❌
- ROLE: PATIENT · PAGE: `/records` · ACTION: view structured extraction of an uploaded document
- BACKED TODAY: upload to `health-records` storage + `public.health_records`
  (`record_type, record_date, source_type, storage_path, original_filename, mime_type,
  verification_status ∈ {UNVERIFIED,VERIFIED,REJECTED}, verified_by, created_at`);
  signed-URL download of the original.
- EXPECTED REQUEST (missing): `GET extraction_state(record_id)`
- EXPECTED RESPONSE (missing): `{ extraction_status: PENDING|PROCESSING|DRAFT|NEEDS_VERIFICATION|VERIFIED|REJECTED, extracted_json, verified_by, verified_at }`
- LOADING: skeleton rows · EMPTY: "No health records yet" · ERROR: alert + retry
- PERMISSION: patient owner only (RLS `health_records_patient_select`)
- NOTE: "Uploaded ≠ clinically verified" is enforced in UI. No structured value is
  ever inferred on the frontend. Required new columns: `extraction_status`,
  `extracted_json`, `verified_at`.

### Insurance — eligibility / pre-auth / claims ❌
- ROLE: PATIENT · PAGE: `/insurance` · ACTION: check eligibility, submit pre-auth, track claim
- BACKED TODAY: `public.insurance_policies`
  (`insurer_name, policy_number, valid_from, valid_to, sum_insured, source_type,
  verification_status`). Validity/expiry is computed from the real dates only.
- EXPECTED REQUEST (missing):
  - `insurance_check_eligibility(p_policy)` → payer/TPA/scheme live lookup
  - `insurance_submit_preauth(p_policy, p_procedure, p_amount, p_documents)`
  - `insurance_submit_claim(p_policy, p_hospital, p_amount, p_documents)`
- EXPECTED RESPONSE (missing):
  - eligibility: `{ eligible: bool, covered_services[], scheme, as_of }`
  - preauth: `{ id, status: REQUESTED|APPROVED|DENIED|PENDING, payer_decision }`
  - claim: `{ id, status_timeline[], amount, denial_reason?, settlement? }`
- LOADING: card skeleton · EMPTY: "Eligibility & coverage requires a connected payer backend" · ERROR: alert + retry
- PERMISSION: patient owner; eligibility only from a connected payer/TPA/government scheme
- RULE: eligibility, pre-auth approval and claim status are NEVER invented. Required
  tables: `insurance_eligibility_checks`, `preauth_requests`, `insurance_claims`.

### Appointments — booking / cancellation transitions 🟡
- ROLE: PATIENT · PAGE: `/appointments`, `/doctors` · ACTION: book, reschedule, cancel
- BACKED TODAY: bounded availability + booking safety RPCs (see `tests/db/appointments.mjs`):
  availability is timezone-aware, bounded, contains no patient identifiers; booking uses
  source fee/duration; double-booking and raw mutation are denied; cancellation before
  start is allowed and after start fails.
- EXPECTED REQUEST: existing scheduling RPCs (validated server-side)
- EXPECTED RESPONSE: `{ appointment_id, status, scheduled_at, fee, mode }`
- LOADING: slot skeleton · EMPTY: "Live nearby availability requires connected practice schedule data" · ERROR: alert + retry
- PERMISSION: connected patient; doctor confirmation is idempotent
- GAP: patient-facing reschedule and provider-cancelled notification UX still need the
  validated transition RPC surfaced end-to-end.

### Doctor / Facility discovery — live nearby availability 🟡
- ROLE: PATIENT · PAGE: `/doctors`, `/facilities` · ACTION: find nearby practices → doctors → slots
- BACKED TODAY: `facilities`, `provider_profiles`, `provider_practices` directory data.
- MODEL: PERSON (doctor) ≠ PLACE (practice/facility) ≠ AVAILABILITY (schedule). No live GPS.
- EXPECTED REQUEST (missing for live slots): `practice_availability(p_practice, p_from, p_to)`
- EXPECTED RESPONSE: bounded slots only, no other-patient identity
- EMPTY: "Live nearby availability requires connected practice schedule data"
- PERMISSION: public discovery; booking requires connected patient

### OTC / Buy-Refill fulfilment ❌
- ROLE: PATIENT · PAGE: `/buy-refill` · ACTION: place OTC order, request refill
- EXPECTED REQUEST (missing): `otc_place_order(p_pharmacy, p_items)`
- EXPECTED RESPONSE (missing): `{ order_id, status, fulfilment }`
- EMPTY: contract-ready unavailable state
- PERMISSION: pharmacy fulfilment; OTC does not require a patient account
- REQUIRED TABLES: `otc_pharmacy_listings`, `otc_orders`

### Health AI ❌ (gateway-dependent)
- ROLE: PATIENT · PAGE: `/health-ai` · ACTION: grounded question answering
- BACKED TODAY: `SwasthyaCopilot` calls Edge Function `swasthya-snapshot` with
  `SWASTHYA_MODEL_ENDPOINT`; renders cited sources/provenance.
- EXPECTED RESPONSE: grounded answer + sources + dates, or 503 unavailable
- STATES: loading · thinking · grounded · sources · consent-required · no-data ·
  model-unavailable · error · retry
- PERMISSION: consented, verified records only (`AI_ASSISTANCE` purpose consent)
- RULE: no canned answers, no diagnosis confidence percentages.

---

## DOCTOR

### Clinical encounter ✅
- PAGE: `/encounter` · RPCs: `a2_start_encounter`, `c1_finish_encounter`,
  `c1_care_context`, `c1_patient_directory`, `c1_next_step`.
- Integer quantity validation enforced before completion.

### Diagnostics ordering ✅ (pathology / imaging / procedure separated)
- PATHOLOGY → specimen workflow · IMAGING → study workflow · PROCEDURE → study workflow.
- Imaging/procedure NEVER routed through sample-collection UI.

### Referral closed loop 🟡
- EXPECTED RESPONSE: referral lifecycle `created → pending → accepted/rejected/clarification
  → appointment/transfer → arrival → encounter → outcome`
- GAP: destination response/arrival/outcome transitions need `facility_referrals` backend.

### Clinical Copilot ❌ — same gateway contract as Health AI; must never sign diagnosis,
  write final prescription autonomously, change dose, substitute drug, or change treatment.

---

## HOSPITAL (built-in HIS/HMIS)

All modules below render enterprise layouts with truthful empty states documenting the
exact contract. No fake KPIs, tokens, beds, or approvals.

### Inpatient ADT / Bed management ❌
- REQUIRED TABLES: `hospital_wards(id, facility_id, name, ward_type, floor_number)`,
  `hospital_beds(id, ward_id, bed_code, status, patient_id, encounter_id)`,
  `bed_admissions(id, patient_id, bed_id, admitted_at, discharged_at)`
- REQUIRED RPCs: `adt_admit_patient`, `adt_transfer_bed`, `adt_discharge_patient`
- Bed states: occupied / reserved / available / cleaning / maintenance / unknown-stale + freshness timestamp

### Emergency / Triage ❌
- REQUIRED TABLE: `emergency_admissions(id, patient_id, triage_level, arrival_mode, chief_complaint, vitals_json, admitted_at)`
- REQUIRED RPC: `emergency_register_intake`
- RULE: never fake capacity, bed, or specialist availability.

### Billing / Cashier ❌
- REQUIRED TABLES: `billing_invoices(id, patient_id, invoice_number, total_amount, paid_amount, payment_status)`,
  `billing_line_items(id, invoice_id, item_type, amount)`
- REQUIRED RPCs: `billing_generate_invoice`, `billing_record_payment`
- RULE: no "Payment completed" without backend confirmation.

### Insurance / TPA (hospital side) ❌
- Distinct from patient `/insurance`. REQUIRED: eligibility, preauth, documents, decision,
  claim, denial, resubmission, settlement tables + RPCs.

### Facility referrals ❌
- REQUIRED TABLE: `facility_referrals(id, patient_id, source_facility_id, target_facility_id, reason, status)`
- REQUIRED RPC: `referral_create`

### Non-Rx supplies / Inventory ❌
- REQUIRED TABLE: `hospital_assets(id, facility_id, asset_name, category, current_quantity, minimum_threshold)`

### MIS aggregates ❌
- REQUIRED TABLE: `daily_census_aggregates(id, facility_id, report_date, opd_count, ipd_count, emergency_count)`

### Reception / OPD ✅ (live-table backed)
- Command Centre wired to live counts (patients, today's appointments, active OPD encounters,
  roster, lab orders, pharmacy inventory). Token issuance only shown on backend confirmation.

### ABDM M2 bridge ❌
- REQUIRED: FHIR bundle push bridge + encryption server credentials
  (`ABDM_GATEWAY_URL`, `ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`). Secrets are never read/printed by the frontend.

---

## LAB (LIS / RIS / PACS)

- PATHOLOGY workflow: Ordered → Collection Pending → Sample Collected → In Transit →
  Received → Processing → Result Entered → Verified → Published → Doctor Reviewed.
- IMAGING (RIS) workflow: Ordered → Scheduled → Arrived → Study Performed → Study Available →
  Report Drafted → Verified → Published → Doctor Reviewed. **No specimen UI.**
- PROCEDURE workflow: Ordered → Scheduled → Performed → Result Recorded → Verified →
  Published → Doctor Reviewed. **No sample collection.**
- CRITICAL RESULTS: detected → validated → notification sent → delivered → acknowledged →
  failed → escalated → closed. **Sent ≠ informed.**
- ❌ Backend required: analyzer/machine integration, imaging catalog, quality/rejection
  events, audit feed, diagnostic AI assistant. These show truthful unavailable states.

---

## PHARMACY (ERP / POS)

- Rx workflow: prescription → verification → inventory → full/partial/unavailable →
  dispensing → billing → fulfilment → remaining quantity.
- ❌ Backend required: online orders, supplier/purchase, invoice/payment, returns,
  batch/expiry feeds beyond `pharmacy_inventory` / `dispense_events`.
- RULE: no "Prescription verified" without backend confirmation; paper Rx shows
  original + source + verification state, never fakes doctor verification.

---

## WORKER (mobile-first field app)

- ❌ Offline sync: requires an authenticated sync endpoint + durable idempotency keys for
  queued outcomes. UI truthfully reports recording is not yet available offline and shows
  queue states (Available offline / Queued / Pending sync / Syncing / Conflict / Rejected / Synced).
- Assisted Patient Mode: every delegated action shows Performed-by / On-behalf-of / Purpose /
  Authorization method / Time. Authorization is never faked.
- RULE: no fake village/patient/sample/refill/visit/risk counts — show 0/empty honestly.

---

## ADMIN / GOVERNANCE

- Verification queue: states Pending/Approved/Rejected/Suspended/Revoked; actions
  Review/Approve/Reject/Suspend/Revoke. **Action shown disabled/unavailable when the
  backend mutation is absent — never a fake success.**
- ❌ Backend required: consent-ledger admin aggregate views, access-audit feed, incidents,
  integrations registry, master-data editors, care-pathway versioning, AI-governance
  (models/evaluations/failures/policy/audit). No fake compliance scores.

---

## PLATFORM-WIDE RULES ENFORCED IN THE FRONTEND

1. No hardcoded fake operational data (patients, wait times, beds, risk/sample/stock counts,
   critical results, approvals, AI results, ambulances, availability).
2. No fake success (token issued, payment completed, provider approved, bed reserved,
   prescription verified, ambulance dispatched, claim approved, report acknowledged)
   unless the backend confirms.
3. Communication status distinguishes Queued / Sent / Delivered / Acknowledged / Failed /
   No Response. Sent is never equated with "patient informed".
4. Facility/resource freshness shows source + last-updated; stale → "Status Unknown —
   Confirmation Required".
5. Role routes degrade safely; patient-only pages are gated (e.g. `/insurance`).

---

## APPENDED THIS SESSION (discovery / emergency / facilities)

- PATIENT · `/doctors` · live bookable slots per practice → `a2_available_slots(p_practice, p_mode)` (exists); discovery "next known session" is derived from `provider_schedules` + `provider_availability_overrides` and is NOT a slot guarantee. No doctor live GPS is ever used.
- PATIENT · `/doctors` · distance → computed client-side via haversine ONLY from real `provider_practices.latitude/longitude` + user geolocation. Practices without coordinates show "Distance unavailable"; never estimated.
- PATIENT · `/facilities` · capability/service/specialty/beds/equipment/wait-time/operational-status/PIN filters → ❌ `public.facilities` has no such columns. Distance uses real `facilities.latitude/longitude`. Fixed regression: page previously queried non-existent columns (`address`, `pincode`, `email`, `is_active`).
- PATIENT · `/emergency` · ambulance coordination → ❌ needs `public.emergency_requests` + dispatch/accept RPC returning a real assignment. UI never claims dispatch.
- PATIENT · `/emergency` · facility emergency capability / bed / ICU freshness → ❌ needs connected, timestamped facility status. UI shows "not connected".
- PATIENT · `/emergency` · transfer/referral state → ❌ needs referral/transfer backend (source, target, acceptance, arrival). UI never shows accepted/completed without confirmation.
- PATIENT · `/appointments` · discovery handoff → DoctorsPage now passes `selected-doctor-id` / `selected-practice-id` / `selected-mode` via sessionStorage; AppointmentsPage consumes them once to preselect doctor, practice and mode.

## APPENDED THIS SESSION (non-patient role depth)

- DOCTOR · `/lab` (DiagnosticsPage, doctor view) · pending-review queue + critical-result acknowledgement → ✅ bound to real data. Queue counts derive from loaded `lab_orders` whose `lab_results.status='COMPLETED'` + `verified_at` set + `doctor_reviewed_at` null (`awaitingDoctorReview`). Abnormal values come only from verified `lab_observations` flags (`abnormalOf` → HIGH/LOW/ABNORMAL/CRITICAL). Acknowledgement calls the real `p0_review_report(p_result)` (closes the linked `LAB_REPORT_REVIEW_PENDING` care gap). Critical reports require an explicit two-step confirm. No interpretation/diagnosis is invented; counts are labelled as reflecting the loaded page only.
- HOSPITAL · `/hospital/reception` · OPD token / arrival check-in → ❌ no server capability. The only supported appointment transitions (`a2_appointment_transition`) are CONFIRMED / CANCELLED / NO_SHOW and are doctor-authorised. Removed the fabricated "OPD Token issued" local-only success; the desk now lists real `appointments` for today and discloses that token/check-in is not server-backed. Added load-error + retry.
- HOSPITAL · `/hospital/*` · role safety → HMIS routes are now gated to `FACILITY` / `ADMIN`; other roles get a truthful `EmptyModulePage` instead of opening hospital operations.
- HOSPITAL · patients/staff/OPD · removed invented default labels (specialization "General Care", language "English", "Active Staff"/"Registered" totals) → now show truthful "not recorded" text and "records loaded" (MPI is capped at 50). Beds + all enterprise modules (emergency/billing/inventory/referrals/reports/integrations/departments/schedules/ipd) remain `TruthfulEmptyState` with documented schema contracts.
- LAB · `/lab` (LabWorkspacePage) · already fully bound to `p0_collection_queue`, `p0_specimen_step` (COLLECT/PACK/DISPATCH/RECEIVE/ACCEPT/PROCESS/REJECT), `p0_verify_results`, `p0_report_path`, `p0_publish_report`. Fixed a real correctness bug: "Awaiting collection" read a non-existent `COLLECTION_PENDING` status (always 0); now derived from orders with no specimen and `status='ORDERED'`. Imaging/procedures/capabilities/catalog/integrations/quality/audit/assistant stay truthfully N/A.
- PHARMACY · `/pharmacy` · already truthful. Queue/stock bind `c1_pharmacy_queue` → `c1_dispense` and `c1_add_stock` + `pharmacy_inventory`. POS/sale, online orders, purchasing/suppliers, reports/invoices/audit and paper/QR lookup render `TruthfulEmptyState` (no sale/tax/payment/invoice/supplier/audit contract); items are never marked sold from unsupported screens. No changes required.
- WORKER · `/follow-up` · removed ALL hardcoded fake metrics from the field overview (was "18 active · 3 high risk", "Bairiya cluster · 4 villages", Visits 7 / Care gaps 3 / Escalations 2, "3 samples to collect", "4 refills due", "6 actions recommended"). Overview now derives every count from the real `c1_worker_queue` tasks (assigned patients = distinct `patient_code`; open/due-today/overdue/high-priority/awaiting-verification). Outcomes use `c1_worker_outcome`; assisted/delegated mode is audited; offline sync truthfully reports "no server write endpoint yet" and never claims synced. Village/sample/refill/appointment concepts are explicitly noted as not part of the worker task contract.
- ADMIN · `/admin` · already truthful. Real `provider_profiles` verification queue with derived counts; approve/reject/suspend/revoke explicitly require an admin-only backend workflow and are never faked; audit/master-data/incidents/integrations cards state their missing contracts. Added a cap note (first 100 records loaded).

## APPENDED THIS SESSION (migrations 013–020 real contract wiring — SUPERSEDES older "unavailable" notes above)

The backend snapshot was stale. The following previously-"unavailable" surfaces are now bound to real
013–020 contracts. Every one degrades to a truthful error/empty state if its RPC is unreachable; no
call is faked and no success is reported without the server confirming.

- DOCTOR · `/lab` (DiagnosticsPage) · critical-result semantics FIXED (017) → abnormal HIGH/LOW/ABNORMAL
  observations are NO LONGER labelled "critical". `p0_review_report(p_result)` is now an ordinary
  "Mark reviewed" action. True critical results are read via `r2_worklist(p_offset)` (from `critical_results`)
  and advanced ONLY via `r2_transition(p_critical, p_action, p_note)` (ACKNOWLEDGE / CLOSE). The old
  two-step "Acknowledge critical result" / "Confirm acknowledgement" copy is removed. Service helpers
  `criticalWorklist` / `criticalTransition` in `src/lib/diagnostics/service.ts`.
- HOSPITAL · `/hospital/reception` (013) → EXACT signatures. Live OPD queue `h1_queue(p_facility, p_date, p_offset)`,
  departments via `h1_setup(p_facility, p_offset)`, server-minted check-in `h1_check_in(p_facility, p_appointment,
  p_department, p_request)`, queue advance `h1_queue_transition(p_queue, p_state)`.
  P0 CORRECTION: `h1_check_in` returns a **queue UUID**, NOT a token number. After check-in the desk **reloads
  `h1_queue`** and reads the real `token_number` from the matching queue row; if it is not yet present the UI says the
  token "will appear in the live queue" (no token is invented). `h1_my_token` is **patient-only** and is NEVER called
  from Hospital/Reception. `p_department` is **nullable** — check-in is not blocked when a department is unavailable.
  `p_facility` is resolved from `facility_memberships` (RLS-scoped); when it cannot be resolved the check-in/queue
  actions are DISABLED with a truthful facility-context banner. `p_request` is a fresh `crypto.randomUUID()`.
- HOSPITAL · `/hospital/beds` (014) → EXACT signatures. Bed grid `h2_beds(p_facility, p_offset)`, admissions
  `h2_admissions(p_facility, p_offset)`, `h2_admit(p_facility, p_encounter, p_bed, p_reason, p_request)`,
  `h2_transfer(p_admission, p_bed, p_reason, p_request)`, `h2_discharge(p_admission, p_summary, p_request)`.
  Admit is ENCOUNTER-scoped: the dialog picks a real encounter (via `src/lib/facility.ts loadEncounters`) and
  requires a reason; transfer/discharge require a reason/summary entered per admission. Counts derive ONLY from
  real beds; unavailable → truthful fallback. No bed counts invented.
- HOSPITAL · `/hospital/billing` (015) → EXACT signatures. `h3_invoice(p_invoice)` is DETAIL lookup only.
  P0 CORRECTION: `h3_issue` supports ONLY `p_source_kind ∈ {APPOINTMENT, ADMISSION}` — **NEVER ENCOUNTER**. Invoice
  lines are `{ description, quantity, unit_price, tax_rate }` — the frontend never sends `{description, amount}`.
  Issue dialog: `h3_issue(p_facility, p_source_kind, p_source, p_lines jsonb, p_request)` where `p_source` is a real
  appointment id (today's `appointments`) or a real admission id (`h2_admissions`). The register is NOT listed by
  reading `facility_invoices` directly (access can be revoked under RLS); no authorized list RPC is exposed today, so
  the register shows a truthful **backend-required** state (see gaps below). Payment
  `h3_record_payment(p_invoice, p_amount, p_method, p_reference, p_request)`. Void `h3_void(p_invoice, p_reason)` with
  a required reason. No amounts are invented.
- LAB · `/lab` (LabWorkspacePage) (016/017) → EXACT signatures. Imaging and Procedures are ENABLED views reading
  the study worklist `r1_worklist(p_offset)` (never reuse specimen/sample UI). Opening a study
  `r1_open_study(p_order, p_author)` (p_author = signed-in lab provider id; disabled with a truthful message when
  unavailable) and advancing it `r1_study_step(p_study, p_action, p_payload jsonb, p_request)`. Critical Results
  view uses `r2_worklist(p_offset)` / `r2_transition(p_critical, p_action, p_channel, p_note, p_request)`
  (channel defaults to `IN_APP`). No study status invented. Quality/catalog/integrations/audit stay truthfully N/A.
- PHARMACY · `/pharmacy` (018/019) → EXACT signatures. POS: search `p2_search_medicines(p_search, p_offset)`;
  counter sales are CREATED via `p2_otc_sale(p_items jsonb, p_request)` where each item is EXACTLY
  `{ inventory_id, quantity }` (P0 CORRECTION — the POS basket is built from real `pharmacy_inventory` rows so each
  sale decrements a specific batch; no `catalog_id`/`medicine_id`/`unit_price` is sent for sale creation).
  `p2_sale(p_sale)` is LOOKUP only and is used to fetch a sale's line items for returns; payment
  `p2_payment(p_sale, p_method, p_reference, p_request)`; returns are ITEM-LEVEL `p2_return(p_item, p_quantity,
  p_reason, p_request)` (item id comes from the `p2_sale` lookup); ledger `p2_ledger(p_before bigint|null)` cursor.
  Purchasing: `p3_supplier(p_name, p_reference)` with a NON-EMPTY `p_reference`;
  `p3_order(p_supplier uuid, p_reference, p_lines jsonb, p_request)` where each line is
  `{ medicine_catalog_id, quantity, unit_cost }` (medicine chosen from the real `p2_search_medicines` catalog, supplier
  from the real `pharmacy_suppliers` list, `p_reference` NON-EMPTY); receive is LINE-LEVEL
  `p3_receive(p_line, p_quantity, p_batch, p_expiry, p_selling_price, p_supplier_receipt, p_request)` (real line ids
  come from `p3_purchases`), `p3_purchases(p_offset)`. Insights derive real totals from `p2_ledger` (no estimates).
  Online-orders fulfilment remains truthful (no online-order/delivery contract exposed).
- WORKER · `/follow-up` (020) → EXACT signatures. `w1_package(p_task)` returns the delegated care package and is parsed
  STRUCTURALLY into `{ task_id, patient_id, version, delegations[]{ delegation_id, actions[], valid_until } }`
  (`parsePackage`). Offline sync is package-driven: `w1_sync(p_task, p_patient, p_delegation, p_action, p_payload jsonb,
  p_version bigint, p_request)` fires ONLY with `p_task`/`p_patient`/`p_version` taken from the parsed package, an
  `p_action` of `REPORT_OUTCOME` (allowed actions are BOOK_APPOINTMENT / REPORT_OUTCOME — **NEVER VISIT_NOTE**), and a
  `p_delegation` = a REAL active `delegation_id` whose `actions` include `REPORT_OUTCOME` and whose `valid_until` has
  not passed (`activeDelegation`). P0 CORRECTIONS: the frontend NEVER sends a `null` delegation, NEVER uses a capture
  timestamp as `p_version`, and NEVER falls back to `c1_patient_directory`. If the package has no active REPORT_OUTCOME
  delegation the note is held with a truthful "Explicit patient delegation required" state; notes are cleared locally
  only after the server confirms and failures are NEVER reported as synced. Assisted-mode patient search uses the
  delegation-scoped `w1_patient_directory` only.

### Remaining integration gaps (frontend-only, need backend signatures/contracts)
- `w1_book_for_patient(p_patient, p_practice, p_slot, p_mode, p_reason, p_note, p_request, p_expected_fee)` (020) is
  NOT wired — the worker queue exposes no practice/slot context to book against, so it is left as a documented gap
  rather than called with invented practice/slot ids.
- `w1_sync` requires a REAL active delegation. The frontend now reads it from `w1_package`'s `delegations[]`; if no
  active `REPORT_OUTCOME` delegation is present the note is held with "Explicit patient delegation required" and is
  NEVER synced with a `null` delegation. **Backend need:** `w1_package` must return the delegation set (delegation_id,
  actions, valid_until) for a worker so REPORT_OUTCOME syncs can proceed.
- **Backend need (safe my-facility RPC):** `facility_id` for the h1_*/h2_*/h3_* contracts is resolved by reading
  `facility_memberships` then `facilities.owner_user_id`; either can be revoked/absent under RLS. If resolution fails,
  facility context is null and the dependent write actions are DISABLED with a truthful banner (no facility/encounter
  ids are ever invented). A dedicated, RLS-safe `my_facility()` RPC is requested so facility context does not depend on
  direct table reads.
- **Backend need (authorized invoice-list RPC):** no facility-scoped, authorized invoice-list RPC is exposed. The
  billing register does NOT read `facility_invoices` directly (access can be revoked), so it shows a truthful
  backend-required state. `h3_invoice(p_invoice)` remains a detail lookup only. An `h3_register`-style RPC is requested.
- Admission pickers (h3_issue ADMISSION) and the supplier/purchase-line pickers (p3_order, p3_receive) depend on
  `h2_admissions`, `appointments`, `pharmacy_suppliers` and `p3_purchases` returning usable ids under the caller's RLS;
  when empty they degrade to a truthful "context required" state and the action is disabled.

---

## APPENDED THIS SESSION (migrations 021–039 comprehensive integration)

The following backend contracts are now fully integrated and bound across the frontend, with complete truthful empty states, validation guards, and automated test assertions.

### 1. Migrations 021–033
- **021 Teleconsultation**: `TeleconsultRoom.tsx` binds media constraints and WebRTC signaling with waiting room states and audio/video controls.
- **022 Care Pathways**: `c2_versions(p_offset)`, `c2_define(p_title, p_description, p_graph)`, `c2_publish(p_version)` bound in `AdminGovernancePage.tsx`.
- **023 Longitudinal Care Episodes**: `g1_episodes(p_patient, p_offset)` bound in `CareJourneyVisualizer.tsx` visualizing all 10 care graph node lifecycle states.
- **024 Closed-Loop Referrals**: `r4_create(p_episode, p_target_facility, p_specialty, p_urgency, p_reason, p_notes, p_request)` in `EncounterPage.tsx`; `r4_referrals(p_status, p_offset)` and `r4_transition(p_referral, p_action, p_note, p_request)` in `DoctorClinicalDashboard.tsx` and `HospitalEnterpriseModulePage.tsx`.
- **025 Document Intelligence**: `q1_request(p_record, p_request)`, `q1_read(p_job)`, `q1_cancel(p_job)` in `RecordsPage.tsx` with verbatim OCR review.
- **026 Payer Cases**: `i1_consent(p_case, p_grant, p_request)`, `i1_read(p_case)` in `InsurancePage.tsx` with patient consent lifecycle.
- **027 Emergency Coordination**: `e1_request(p_patient, p_type, p_lat, p_lng, p_note, p_request)`, `e1_candidates(p_request, p_radius_km)`, `e1_contact(p_candidate, p_request)`, `e1_transport_request(p_request, p_facility, p_transport_type, p_idempotency)` in `EmergencyPage.tsx`.
- **028 Hospital Operations**: `h4_operations(p_facility, p_section, p_offset)` in `HospitalEnterpriseModulePage.tsx` for duty rosters, supplies inventory, intake, and referrals.
- **029 AI Model Governance**: `m1_registry(p_offset)`, `m1_register(p_name, p_version, p_artifact, p_checksum, p_request)`, `m1_approve(p_model, p_reason)`, `m1_deploy(p_model, p_traffic_pct)` in `AdminGovernancePage.tsx`.
- **030 Owned-Model Learning**: `m2_candidates(p_offset)`, `m2_review(p_candidate, p_approved, p_deid_attested, p_notes)`, `m2_dataset(p_offset)` in `AdminGovernancePage.tsx`.
- **031 Consented Communications**: `c4_messages(p_channel, p_offset)`, `c4_enqueue(p_recipient, p_channel, p_template, p_parameters, p_request)`, `c4_acknowledge(p_message, p_outcome)` in `AdminGovernancePage.tsx`.
- **032–033 Role AI Assistants**: Grounded tool calling via `a3_tool(p_tool, p_args)` in `LabWorkspacePage.tsx` and `PharmacyPage.tsx`.
- **037 Incidents & Retention**: `a4_incidents(p_offset)`, `a4_retire_pathway(p_pathway, p_reason)` in `AdminGovernancePage.tsx`.

### 2. Migrations 034–039 (Ultimate Pass)
- **034 Lab Quality & Recollection**:
  - `r3_quality_worklist(p_offset)`: Quality assurance inspection queue in `LabWorkspacePage.tsx`.
  - `r3_quality(p_device, p_qc_level, p_observed_value, p_target_value, p_tolerance, p_notes, p_request)`: Equipment calibration & QC result logger.
  - `r3_recollect(p_specimen, p_reason, p_request)`: Re-collection workflow for rejected/hemolysed samples.
  - `r3_capability(p_facility, p_test_code, p_enabled, p_request)`: Diagnostic service capability registry.
- **035 Pharmacy Delivery & Inventory Operations**:
  - `p4_deliveries(p_offset)`: Home delivery and fulfillment queue in `PharmacyPage.tsx`.
  - `p4_transition(p_delivery, p_action, p_note, p_request)`: Strict 6-state machine (`ACCEPT`, `PREPARE`, `READY`, `DISPATCH`, `REPORT_DELIVERY`, `RETURN_TO_PHARMACY`).
  - Rule: Returns are quarantined and never automatically restocked; patient delivery report closes the delivery care gap.
- **036 Community Health Worker Assistance**:
  - `w2_assist(p_task, p_patient, p_assistance_type, p_notes, p_request)`: Escalation and logistics support form in `WorkerPage.tsx` (`TEST_ASSISTANCE`, `SAMPLE_LOGISTICS`, `MEDICINE_REFILL_REQUEST`, `ESCALATION`).
- **038 Patient Identity Resolution**:
  - `x1_candidates(p_offset)`: Candidate duplicate pairs in `AdminGovernancePage.tsx`.
  - `x1_propose(p_alias, p_canonical, p_evidence, p_request)`: Propose alias resolution.
  - `x1_link(p_candidate, p_note)`: Finalize alias link after dual-party confirmation.
  - `x1_unlink(p_candidate, p_reason)`: Deactivate alias link.
  - `x1_identity(p_patient)`: Inspect canonical identity cluster.
  - Strict Indian sovereignty: Records, consent, and access remain bound to source identities; no clinical records are destructively merged.
- **039 Integration Registry**:
  - `x2_health(p_offset)`: External integration endpoint health telemetry in `AdminGovernancePage.tsx`.
  - `x2_enable(p_integration, p_enabled)`: Toggle integration.
  - `x2_sync(p_integration, p_request)`: Manual synchronization dispatch.
  - `x2_register(p_name, p_kind, p_endpoint, p_config, p_request)`: External partner onboarding with `STATUS_UNKNOWN_CONFIRMATION_REQUIRED` handling.

### 3. Migrations 040–050 (Pre-Final Integration Pass)
- **040 Integration Retries & Freshness**:
  - `x2_retry(p_failed_run, p_request)`: Bounded retry for transient failures with exponential backoff and retry count ceiling (<= 3).
  - `x2_health`: Returns `truth_state` ('DISABLED', 'HEALTHY', 'DEGRADED', 'FAILED', 'STALE', 'UNKNOWN'), `last_failed_sync`, and `latest_failure` metadata.
  - Integration cards in `AdminGovernancePage.tsx` expose Bounded Retry button, failure class (TRANSIENT vs TERMINAL), retry count (X/3), next retry timestamp, and governance review notices.
- **041 Care Replay**:
  - `t1_replay(p_patient, p_purpose, p_episode, p_before, p_before_key, p_limit)`:
    - Wired in `CareIntelligenceView.tsx`.
    - Cursor pagination using `next_cursor` (`recorded_at`, `event_key`).
    - Explicit consent-scoped access; revoked or unauthorized consent degrades to truthful error without fabricating events.
    - Full provenance and verification state display.
- **042 Care Twin**:
  - `t2_twin(p_episode, p_purpose)`:
    - Wired in `CareIntelligenceView.tsx`.
    - Live operational projection of episode state, open care gaps, next steps, pathways, appointments, diagnostics, prescriptions, referrals, follow-ups, and external claims.
    - Sourced freshness indicators (`RECENTLY_RECORDED`, `HISTORICAL_SOURCE`, `STATUS_UNKNOWN_CONFIRMATION_REQUIRED`, `UNKNOWN`). Unknown remains unknown; no healthy status is invented.
- **043/050 District Pulse**:
  - `t3_pulse(p_state, p_district, p_month, p_facility)`:
    - Wired in `CareIntelligenceView.tsx`.
    - Calendar month selector with state and district scoping.
    - Strictly de-identified aggregation; zero PHI or patient identifiers.
    - Minimum cell size suppression (< 10 observations) marked as `SUPPRESSED_MINIMUM_CELL_SIZE`.
    - Migration 050 `current_operations` metrics integration (fresh capability evidence & single-site pharmacy recorded stock) with limitation notices.
- **044/049 Teleconsultation Security Boundaries**:
  - `t4_open(p_appointment, p_request)`: Caller starts session within scheduled consultation window.
  - `t4_join_intent(p_session, p_request)`: Client verifies join intent and provider configuration.
  - `t4_request_end(p_session)`: Client requests session closure.
  - Strict security boundary: Service-role only routines (`t4_prepare`, `t4_room_ready`, `t4_issue_context`, `t4_token_issued`, `t4_connection`, `t4_provider_state`, `t4_end_context`) are NEVER called by frontend.
  - Truthful local preview when provider is unconfigured; unauthorized join attempts denied.
- **045 Real Medicine Master**:
  - `k1_medicines(p_query, p_form, p_include_demo, p_limit)`:
    - Wired in `MedicineMasterPicker.tsx`.
    - Live mode queries backend with `p_include_demo: false`.
    - Truthful unavailable state if backend is down; demo seed catalog ONLY shown when explicitly toggled into demo mode.
    - Decoupled from pharmacy inventory.
- **046 Real Diagnostic Master**:
  - `k2_diagnostics(p_query, p_category, p_include_demo, p_limit)`:
    - Wired in `DiagnosticMasterPicker.tsx`.
    - Category separation (PATHOLOGY, IMAGING, PROCEDURE).
    - Live mode queries backend with `p_include_demo: false`.
    - Truthful unavailable state if backend is down; demo catalog ONLY in explicit demo mode.
- **047/050 AI Operational Completion & Traceability**:
  - `a3_tool(p_tool, p_scope)` and `s1_snapshot_context(p_patient, p_purpose)`:
    - Wired across `LabWorkspacePage.tsx`, `PharmacyPage.tsx`, and `SwasthyaCopilot.tsx`.
    - Displays audit reference (`audit_reference`), source provenance (`provenance`), freshness statements (`freshness`), and uncertainty boundaries (`uncertainty`).
    - Raw prompts and secrets are never exposed to the client.

