SWASTHYASETU — FINAL BACKEND COMPLETION, HARDENING & FREEZE PASS

THIS IS THE FINAL MAJOR BACKEND SESSION.

DO NOT RESTART THE PROJECT.
DO NOT REWRITE COMPLETED MIGRATIONS.
DO NOT RE-AUDIT EVERYTHING BEFORE CODING.
DO NOT SPEND THE SESSION EXPLAINING A PLAN.
DO NOT MODIFY THE FRONTEND WORKSPACE.
DO NOT TOUCH LIVE SUPABASE.
DO NOT APPLY MIGRATIONS TO PRODUCTION.
DO THE WORK NOW.

==================================================
AUTHORITATIVE BACKEND WORKSPACE
==================================================

WORK ONLY HERE:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\work\swasthyasetu-clean-core

OUTPUT DIRECTORY:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs

LATEST BACKEND STATE ALREADY CONTAINS MIGRATIONS THROUGH AT LEAST:

039_integration_registry.sql

PRESERVE ALL EXISTING WORK.

DO NOT RENUMBER OR ALTER HISTORICAL MIGRATIONS UNLESS A NEW FORWARD
MIGRATION IS REQUIRED TO CORRECT A REAL DEFECT.

Prefer new migrations 040+.

==================================================
COMPLETED BACKEND — DO NOT REDO
==================================================

Treat these as existing foundations and preserve them:

004–012
- schema reconciliation
- diagnostics foundations
- care coordination
- consent
- appointment safety
- provider/facility verification
- central AI gateway/provider abstraction
- records/provenance
- CareGraph / NextStep
- doctor/practice/facility discovery

013–020
- reception/check-in/queue/token
- beds/admissions/transfers/discharge
- billing/payments/refunds
- imaging/procedure workflows
- critical result lifecycle
- pharmacy POS/OTC/payments/returns
- suppliers/purchase orders/receipts
- worker lookup/delegation/offline sync/task versioning

021–028
- safe frontend/facility context
- governed care pathways
- generalized risk/resolution/closure
- closed-loop referrals
- payer/insurance cases
- emergency coordination
- document intelligence / extraction / review
- Snapshot source deepening

029–031
- model governance
- owned-model learning pipeline
- communication lifecycle

032
- role-scoped AI tools

033
- hospital operations

034
- lab capability/equipment/QC/recollection

035
- pharmacy delivery

036
- worker operations

037
- governance/incidents/retention/model suspension

038
- reversible identity aliases / duplicate resolution

039
- integration registry / health / sync foundation

Existing tests have already passed substantial regression coverage.
Do NOT throw away working behavior.

==================================================
NON-NEGOTIABLE PRODUCT PRINCIPLES
==================================================

SwasthyaSetu is a consent-aware closed-loop healthcare coordination
platform.

Core reasoning:

Know the pathway.
Detect the gap.
Prioritize the risk.
Resolve the next step.
Verify completion.

Locked truth rules:

PERSON != PLACE != AVAILABILITY

COLLECTION CENTRE != PROCESSING LAB

PATHOLOGY != IMAGING != PROCEDURE

PRESCRIPTION != MEDICINES != PHARMACY FULFILMENT

MEDICINE MASTER != PHARMACY INVENTORY

DIAGNOSTIC MASTER != LAB CAPABILITY

SENT != DELIVERED != ACKNOWLEDGED != CLINICAL CLOSURE

OCR EXTRACTION != CLINICALLY VERIFIED TRUTH

AI OUTPUT != SOURCE OF TRUTH

DEMO ID != OFFICIAL REGISTRY VERIFIED ID

NO ALLERGY DOCUMENTED != NO ALLERGY EXISTS

UNKNOWN != NORMAL

UNKNOWN != FINAL

UNKNOWN != AVAILABLE

No fake success.
No invented medical data.
No inferred normal result.
No fabricated availability.

==================================================
P0 — FINISH 039 INTEGRATION REGISTRY
==================================================

FIRST:
inspect exact current migration 039 implementation and its tests.

Complete any unfinished integration contracts.

Support governed integration concepts such as:

- integration registry
- provider/system identifier
- integration type
- enabled/disabled
- configuration metadata WITHOUT secrets
- last observation
- health status
- freshness
- successful sync timestamp
- failed sync timestamp
- latest failure classification
- retryable vs terminal failure
- retry count
- next retry eligibility
- sync run
- sync event
- external provider correlation/reference
- stale state
- unknown state

Required truthful states should support backend semantics equivalent to:

HEALTHY
DEGRADED
STALE
FAILED
DISABLED
UNKNOWN

Do NOT fake external connectivity.

A configured integration is not automatically healthy.

A successful API request is not automatically successful clinical
completion.

Implement bounded retries where appropriate.

Use safe retry/idempotency semantics.

No infinite retry loop.

Add tests for:
- transient failure
- terminal failure
- stale integration
- disabled integration
- successful retry
- duplicate retry request
- secret fields never exposed
- facility/admin access boundaries

==================================================
P0 — CARE REPLAY
==================================================

Implement backend Care Replay.

Purpose:

reconstruct an authoritative chronological operational care journey
from immutable/provenanced events.

Do NOT build another editable clinical timeline table.

Care Replay should derive from real events including where available:

- registration / identity event
- consent granted / revoked / expired
- appointment
- check-in / queue
- consultation
- diagnostic order
- collection
- specimen custody
- processing
- result
- verification
- critical-result communication
- doctor review
- prescription
- pharmacy fulfilment
- referral
- worker action
- follow-up
- payer state
- emergency coordination
- care-gap state change
- closure
- communication
- document review
- identity-link event

Every replay item should preserve:

- event type
- timestamp
- actor
- patient / episode context
- source entity
- source ID
- provenance
- facility where applicable
- previous state
- resulting state
- verification state
- safe metadata
- sequence ordering

Replay must be consent-aware and role-scoped.

Admin must not automatically receive unrestricted clinical narrative.

Patient and authorized clinician views may differ.

No event rewriting.

Tests:
- deterministic chronology
- source linkage
- revoked access
- cross-patient isolation
- facility isolation
- duplicate events
- late-arriving evidence
- no clinical access expansion through replay

==================================================
P0 — CARE TWIN
==================================================

Implement operational Care Twin.

IMPORTANT:
This is NOT a diagnostic digital twin.
Do NOT simulate disease.
Do NOT predict diagnosis.

Care Twin = current consolidated operational care state.

For an authorized patient / episode show derived state for:

- current episode
- current pathway
- open CareGaps
- NextStep
- appointments
- active referrals
- diagnostic orders
- specimen/study/procedure status
- pending report review
- active prescription
- medicine fulfilment
- worker assistance
- payer case
- emergency coordination
- unresolved critical communication
- follow-up
- blockers
- freshness
- stale evidence
- verification pending
- closure state

Every field must be traceable to source IDs.

Expose freshness timestamps.

If evidence is stale:
return explicit stale/unknown semantics.

Never turn missing information into normal/complete.

Tests:
- source grounding
- stale data
- revoked consent
- open/closed gap distinction
- patient decline
- external completion pending verification
- transfer
- duplicate/error closure
- multi-episode isolation

==================================================
P0 — DISTRICT PULSE
==================================================

Implement backend aggregate District Pulse.

STRICT PRIVACY:

NO patient-level names
NO patient IDs
NO ABHA
NO phone
NO address
NO individual clinical narratives

Use de-identified/aggregate operational metrics only.

Support useful district/facility-area measures where sufficient data exists:

- open CareGaps
- delayed diagnostics
- delayed report reviews
- referral delay
- follow-up completion
- medicine fulfilment completion
- care pathway completion
- stale operational data
- critical-result acknowledgement delay
- appointment/queue pressure
- facility capability freshness
- stock availability aggregate where safe

Do NOT fabricate district values.

If minimum sample threshold is not met:
suppress metric.

Consider privacy threshold/k-anonymity style minimum cell size.

Return:
- metric
- numerator
- denominator where appropriate
- time window
- geography/facility scope
- last refreshed
- data freshness
- suppression state

Do not expose exact tiny-group information.

Tests:
- suppression threshold
- no PHI
- geography isolation
- role access
- empty dataset
- freshness
- aggregate correctness

==================================================
P0 — TELECONSULT BACKEND FOUNDATION
==================================================

Implement provider-independent teleconsult backend foundation.

Do NOT build video infrastructure from scratch.

Architecture:

SwasthyaSetu appointment
→ authorization
→ teleconsult session
→ provider adapter
→ secure join credential
→ waiting/joined/ended state

Required concepts:

- teleconsult session
- appointment link
- patient
- clinician
- authorized participants
- provider
- room external reference
- server-side token issuance boundary
- waiting state
- participant joined
- reconnect
- end
- expiry
- provider error
- audit timestamps

No third-party user login requirement.

API/provider secrets server-side only.

Browser must never receive provider master secret.

Only issue room token after:
- auth
- correct appointment
- role/participant authorization
- valid appointment mode
- valid time/session policy

No recording by default.

If recording is introduced later:
must require explicit consent + retention + audit.
Do not implement automatic recording now.

Provider adapter must support:
UNCONFIGURED
AVAILABLE
DEGRADED
FAILED

If no actual provider credentials:
return truthful provider-unavailable state.

Add tests for:
- wrong patient
- wrong doctor
- non-teleconsult appointment
- expired session
- duplicate room creation
- join token authorization
- room ended
- provider unavailable
- no secret leakage

==================================================
P0 — FINAL AI OPERATIONAL LAYER
==================================================

Audit current AI gateway + migration 032.

Complete only the real remaining gaps.

Architecture:

role/page/patient context
→ auth
→ RBAC
→ consent
→ approved tool
→ minimum necessary retrieval
→ grounded structured context
→ model provider
→ grounded response
→ source IDs
→ uncertainty
→ audit

No browser-direct OpenAI.

No arbitrary model SQL.

No raw patient record dump.

Do not send:
- name
- phone
- address
- ABHA
- unrelated medical history
unless strictly required for a permitted tool.

Build/finish approved AI tools for roles where missing:

PATIENT
- NextStep
- appointment state
- report explanation from verified report
- medicine fulfilment
- consent-safe record summary

DOCTOR
- Snapshot
- timeline
- lab trends
- pending reports
- referral
- medicine history
- care gaps

HOSPITAL
- queue/load
- beds
- admissions
- operational inventory
- referrals
- procedures

LAB
- worklist
- QC
- machines
- critical results
- recollection

PHARMACY
- inventory
- expiry
- low stock
- purchases
- delivery/fulfilment

WORKER
- assigned tasks
- care gaps
- visits
- escalation
- offline/sync state

ADMIN
- integration health
- incidents
- model health/governance
- aggregate operational metrics

Required answer metadata:
- source IDs
- source timestamps
- freshness
- uncertainty
- tool used
- model/provider route
- audit reference

AI must never:
- final diagnose
- prescribe
- change dose
- substitute medicine
- change treatment
- sign an order
- make final emergency clinical decision

Provider failure must degrade gracefully:

"Advanced AI temporarily unavailable"

Core product workflows must continue without external AI.

Add cost-aware routing foundation:
- deterministic tool lookup first
- small/owned model route where appropriate
- premium model only where justified
- provider fallback
- safe caching where allowed

Do not automatically use model responses as training data.

==================================================
P0 — MEDICINE MASTER BACKEND FOUNDATION
==================================================

The frontend currently only has a demo seed medicine directory.

Build a GOVERNED backend medicine catalog foundation so frontend does
not need hardcoded toy medicine data.

Do NOT claim to contain every medicine in India unless a complete,
licensed/source-verified dataset has actually been imported.

Create scalable catalog schema for:

- medicine catalog ID
- generic name
- brand name where sourced
- composition
- strength
- dosage form
- route
- pack description
- manufacturer where sourced
- regulatory classification ONLY when sourced
- NLEM flag ONLY when sourced
- Jan Aushadhi mapping ONLY when sourced
- aliases/search terms
- active/discontinued
- source/provenance
- source version
- effective date
- last updated
- import batch

Keep separate from pharmacy inventory.

Do NOT store batch/stock/price/expiry as medicine-master properties.

Provide:
- paginated search
- exact lookup
- generic search
- brand search
- strength/form filters
- active filter
- facility-independent catalog read

Import architecture:
- CSV/JSON governed importer
- validation
- provenance
- duplicate handling
- versioned source
- dry-run
- rollback/disable batch

If there is no trustworthy full dataset bundled:
create the infrastructure and demo seed import separately labelled DEMO.

Do not fabricate regulatory metadata.

Tests:
- pagination
- search
- duplicate source
- inactive medicine
- demo vs verified source
- catalog != inventory
- no stock implication

==================================================
P0 — DIAGNOSTIC MASTER BACKEND FOUNDATION
==================================================

Build governed diagnostic master.

Separate categories:

PATHOLOGY
IMAGING
PROCEDURE

Schema should support when sourced:

- diagnostic catalog ID
- code
- name
- category
- department
- specimen type
- container
- minimum volume
- fasting/preparation
- transport
- temperature
- stability/viability
- methodology
- unit
- reference rule
- critical rule
- turnaround metadata
- panel/components
- source/provenance
- version
- active state

Facility/lab capability MUST remain separate.

Correct architecture:

Diagnostic Master
→ facility/lab capability
→ local availability
→ price
→ schedule/TAT
→ order/booking

A catalog entry does not imply a lab can perform it.

No fabricated reference interval.

No fabricated critical value.

No fabricated preparation instructions.

If full trusted Indian dataset is not present:
implement infrastructure + clearly tagged demo seed only.

Tests:
- pathology/imaging/procedure separation
- catalog != capability
- provenance
- versioning
- pagination/search
- missing reference interval
- facility capability binding

==================================================
P1 — HOSPITAL FINAL DEEPENING
==================================================

Audit current hospital modules and fill only real backend gaps.

Target:
- command centre
- reception
- appointments
- OPD
- departments
- doctors/staff
- duty roster
- consultation fees
- beds/wards
- IPD/ADT
- emergency
- procedures/OT foundation
- diagnostics integration
- hospital pharmacy linkage
- billing
- payer linkage
- discharge
- stores/inventory
- ambulance/referral
- MIS/audit
- integrations
- AI operations

Do not build fake broad HIS modules when no workflow exists.

Use operational evidence.

==================================================
P1 — LAB FINAL DEEPENING
==================================================

Confirm complete backend support for:

PATHOLOGY:
ORDERED
COLLECTION_PENDING
SAMPLE_COLLECTED
IN_TRANSIT
RECEIVED_AT_LAB
PROCESSING
RESULT_ENTERED
VERIFIED
PUBLISHED
DOCTOR_REVIEWED

IMAGING:
ORDERED
SCHEDULED
ARRIVED
STUDY_PERFORMED
REPORT_DRAFTED
VERIFIED
PUBLISHED
DOCTOR_REVIEWED

PROCEDURE:
ORDERED
SCHEDULED
PERFORMED
RESULT_RECORDED
VERIFIED
DOCTOR_REVIEWED

Also:
- machines
- capability
- QC
- rejection
- recollection
- critical results
- chain of custody
- collection-centre vs processing-lab distinction
- device/integration state where applicable

==================================================
P1 — PHARMACY FINAL DEEPENING
==================================================

Confirm:
- prescription queue
- POS
- OTC
- stock-backed dispensing
- batches
- expiry
- purchases
- suppliers
- receipts
- payments
- returns
- delivery
- pickup
- receipt confirmation
- low stock
- reporting

Paper prescription workflow:
original prescription remains source evidence.

Never fake doctor verification.

No full patient history for pharmacy.

==================================================
P1 — WORKER FINAL DEEPENING
==================================================

Confirm:
- area
- village
- assignment
- home visit
- appointment assistance
- diagnostic/sample assistance
- medicine refill assistance
- escalation
- delegated action
- offline queue
- conflict retry
- sync receipt
- revocation
- doctor verification

Every delegated action must retain:

Performed by Worker X
on behalf of Patient Y
purpose
time
authorization/delegation evidence

==================================================
P1 — IDENTITY SAFETY
==================================================

Preserve migration 038 semantics:

identity link/alias != destructive merge.

No record movement.
No consent expansion.
No permission expansion.

Dual-owner consent where required.

Cycle prevention.

Reversible unlink.

If true merge/unmerge is ever added:
must be reversible and independently governed.
Do not silently convert current identity links into merge.

==================================================
P1 — SECURITY HARDENING
==================================================

This is mandatory before backend freeze.

Audit and test:

AUTH
- authenticated RPCs
- role checks
- session trust

RBAC
- patient
- doctor
- hospital
- lab
- pharmacy
- worker
- admin

RLS
- patient isolation
- facility isolation
- cross-tenant denial

CONSENT
- grant
- deny
- expiry
- revoke
- post-revocation access
- minimum necessary scope

AI
- tool allowlist
- source validation
- consent recheck
- prompt-injection/tool abuse resistance
- no arbitrary SQL
- no PHI leakage in logs

FILES/STORAGE
- private by default
- authorized access
- signed URL if used
- expiry

SECRETS
- no server secrets returned by RPC
- no model API key exposure
- no provider secret exposure

AUDIT
- high-risk actions
- who/when/why/source

IDEMPOTENCY
- repeated requests do not duplicate high-risk actions

FRESHNESS
- stale high-acuity operational data:
  STATUS_UNKNOWN_CONFIRMATION_REQUIRED or equivalent

COMMUNICATION
- Sent != Delivered != Acknowledged != Clinical Closure

Add negative tests:
- cross-patient
- cross-facility
- revoked consent
- wrong role
- replay abuse
- identity-link abuse
- AI tool misuse
- teleconsult unauthorized join
- integration secret exposure

Do not call this production secure.
The code should be hardened, but final real deployment still requires
security review/pentest/compliance validation.

==================================================
P1 — AUDIT LOG / PROVENANCE FINAL PASS
==================================================

Ensure important state changes retain:

- actor
- role
- facility
- patient/episode where applicable
- source
- source ID
- previous state
- resulting state
- timestamp
- request/idempotency key
- reason where required

No destructive silent state mutation.

==================================================
P1 — CLOSURE SEMANTICS
==================================================

Preserve explicit closure states:

COMPLETED
CLINICALLY_CANCELLED
PATIENT_DECLINED
TRANSFERRED
UNABLE_TO_COMPLETE
DUPLICATE_ERROR
DECEASED where applicable

Support:
EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING

Do not close because:
- message was sent
- shipment dispatched
- referral issued
- order created
- worker task assigned

Closure requires appropriate evidence.

==================================================
P1 — DATABASE QUALITY
==================================================

Audit new migrations for:

- safe foreign keys
- meaningful unique constraints
- bounded indexes
- timestamps
- state constraints
- no unsafe cascading deletion of clinical/audit records
- immutable evidence where appropriate
- pagination
- no unbounded admin query
- query plans/indexes for major worklists

Avoid giant JSON blobs when normalized structured data is required.

Use JSON only where flexibility is justified.

==================================================
P1 — EXACT FRONTEND CONTRACT DOCUMENT
==================================================

The frontend final pass will happen AFTER this backend freezes.

Create/update:

docs/RPC-CONTRACTS.md

and preferably:

docs/FRONTEND-FINAL-CONTRACTS.md

Document every frontend-consumable RPC from 001 through final migration.

For each:
- RPC name
- role
- args
- default args
- return shape
- important states
- consent requirements
- facility requirements
- pagination
- error semantics
- freshness semantics

Especially include new:
- integration
- replay
- twin
- pulse
- teleconsult
- medicine catalog
- diagnostic catalog
- AI tools

Frontend must not need to inspect SQL to guess contracts.

==================================================
P1 — COVERAGE MATRIX
==================================================

Create:

docs/FINAL-BACKEND-COVERAGE.md

Use honest states:

COMPLETE
PARTIAL
EXTERNAL API REQUIRED
EXTERNAL PROVIDER REQUIRED
DEMO ONLY
FUTURE ONLY
NOT IMPLEMENTED

Cover:

Identity
ABDM
Consent
Patient Record
Snapshot
Appointment
Doctor Discovery
Hospital
Lab
Pharmacy
Worker
Admin
Referral
Payer
Emergency
CareGraph
CareGap
NextStep
Resolution
Care Replay
Care Twin
District Pulse
AI
Teleconsult
Communications
Documents/OCR
Medicine Master
Diagnostic Master
Integration Hub
Security
Audit

Do not call an interface placeholder implemented.

==================================================
P0 — FULL REGRESSION
==================================================

Before stopping:

1. Ensure package.json main npm test includes EVERY test suite.

2. Run:
npm test

3. Run build/typecheck if project has it.

4. Fix all failures.

Do NOT remove tests.

Do NOT weaken expected assertions merely to make them green.

Add tests for every new migration.

Target:
all historical tests + all new tests PASS.

==================================================
P0 — FINAL CHECKPOINT / PACKAGE
==================================================

Before usage limit, even if some optional P2 work remains:

SAVE ALL FILES.

Update:
CONTINUE.md

Include:
- exact latest migration
- tests
- build status
- remaining known gaps
- no vague "almost done"

Create clean ZIP:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs\swasthyasetu-backend-final.zip

Exclude:
node_modules
.git
.env
.env.local
secrets
build temp files

Verify ZIP:
- extractable
- package.json present
- migrations present
- tests present
- docs present
- no secrets

==================================================
EXECUTION PRIORITY
==================================================

DO IN THIS ORDER:

1. inspect current 039 unfinished state
2. integration registry retry/health completion
3. Care Replay
4. Care Twin
5. District Pulse
6. teleconsult backend foundation
7. medicine master foundation
8. diagnostic master foundation
9. AI role/tool final gaps
10. security hardening
11. remaining hospital/lab/pharmacy/worker holes only if tests/audit reveal them
12. contract docs
13. coverage matrix
14. COMPLETE regression
15. build/typecheck
16. final ZIP

DO NOT START OPTIONAL POLISH BEFORE P0 ITEMS.

==================================================
IF SESSION LIMIT APPROACHES
==================================================

DO NOT LEAVE HALF-WRITTEN SQL.

Finish the current migration/test pair.

Then:

- save
- run relevant tests
- update CONTINUE.md
- package checkpoint ZIP

A verified checkpoint is more valuable than an unfinished additional
module.

==================================================
FINAL RESPONSE ONLY
==================================================

When done, reply only with:

LATEST MIGRATION:
<number/name>

TESTS:
<count/pass/fail>

BUILD:
<status>

COMPLETED THIS SESSION:
<short list>

TRUTHFUL REMAINING:
<short list, if any>

FINAL ZIP:
<absolute path>

START CODING NOW.
NO PLAN.
NO STATUS ESSAY.
MAXIMIZE IMPLEMENTED, TESTED CODE BEFORE THE SESSION LIMIT.