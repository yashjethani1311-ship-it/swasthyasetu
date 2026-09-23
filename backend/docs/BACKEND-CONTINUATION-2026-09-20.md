CONTINUE FROM THE EXACT CURRENT SAVED BACKEND STATE.

WORKSPACE:
C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\work\swasthyasetu-clean-core

DO NOT TOUCH:
- D:\SwasthyaSetu-antigravity
- D:\SwasthyaSetu-qoder-frontend
- D:\swasthyasetu-clean-core
- live Supabase
- .env / .env.local
- secrets

DO NOT:
- restart from migration 010
- redo 010–020
- re-audit completed work
- spend time on long planning
- write progress reports after every step

The previous MASTER BACKEND prompt remains binding.

CURRENT COMPLETED CHECKPOINT — PRESERVE IT:
004–009:
- schema reconciliation
- diagnostics P0
- care coordination
- consent
- appointment safety
- verification lifecycle
- AI gateway/contracts

010:
- longitudinal records + provenance

011:
- episode-linked CareGraph / NextStep foundation

012:
- bounded doctor/practice/facility discovery
- stored locations
- server-derived slots

013:
- facility reception
- persistent queue/token
- facility isolation

014:
- admissions
- beds
- transfer
- discharge

015:
- billing
- payments/refunds

016:
- imaging workflow
- procedure workflow

017:
- critical-result lifecycle
- acknowledgement/disposition

018:
- pharmacy POS / OTC sales
- payments
- returns
- stock ledger

019:
- suppliers
- purchase orders
- partial receipts

020:
- worker-safe patient lookup
- structured delegation
- sync receipts
- task version checks
- consent/delegation recheck

START FROM THE NEXT UNFINISHED BACKEND WORK.

==================================================
P0 — FIX FRONTEND-CONTRACT BLOCKERS FIRST
==================================================

1. SAFE FACILITY CONTEXT
Frontend must not need direct facility_memberships table access.

Add a safe authenticated RPC, for example:
h1_my_facilities()

Requirements:
- returns only facilities the current user is authorized for
- includes facility_id, facility name/type, role, membership state
- no cross-facility leakage
- RLS/security tests
- usable by Hospital/Lab/Pharmacy operational frontend where appropriate

Do not weaken RLS.

2. WORKER DELEGATION PACKAGE
Verify w1_package returns enough data for frontend to perform valid w1_sync:
- task_id
- patient_id
- version
- delegations[]
- delegation_id
- allowed actions
- valid_until

Ensure REPORT_OUTCOME can be performed with a valid delegation.
Do not allow null/invalid delegation bypass.

3. FRONTEND-CONTRACT VERIFICATION
Check exact signatures and semantics for:
h1_*
h2_*
h3_*
r1_*
r2_*
p2_*
p3_*
w1_*

Do not rename working RPCs unnecessarily.
Fix only genuine contract issues.

==================================================
NEXT MASTER BACKEND PRIORITIES
==================================================

1. CARE PATHWAY RULES ENGINE

Build a versioned care-pathway engine.

Need:
- pathway definitions
- pathway versions
- entry criteria
- required/optional steps
- dependencies
- deadlines/time windows
- responsible actor
- completion evidence
- cancellation/decline/transfer rules
- program-specific variations
- pathway activation per care episode

CareGraph nodes should derive from pathway rules where applicable.

Do not hardcode one disease-specific pathway into application logic.

==================================================
2. CAREGAP / RISK / RESOLUTION ENGINE
==================================================

Generalize CareGap beyond current narrow flows.

CareGap should represent:
- required action
- blocked reason
- responsible actor
- due time
- attempts
- escalation state
- resolution
- closure evidence

Build Risk Priority using explicit, auditable inputs:
- clinical urgency where supplied by clinicians
- overdue duration
- failed attempts
- critical-result state
- vulnerable workflow context
- stale/unknown operational data

Do NOT create autonomous diagnosis.

Build Resolution Engine:
- reminder
- retry
- worker assignment
- alternate facility search
- escalation
- clinician review
- patient confirmation
- closure

Respect autonomy levels:
Level 1 = routine operational automation
Level 2 = requires human/patient confirmation
Level 3 = never autonomous clinical decision

==================================================
3. PROOF OF CARE / CLOSURE
==================================================

Generalize closure evidence.

Support:
- report published
- doctor reviewed
- prescription issued
- pharmacy dispensed
- appointment/encounter completed
- worker outcome
- referral completed
- patient declined
- transferred
- unable to complete
- duplicate/error
- deceased where applicable

"Sent" or "scheduled" must NOT equal completed care.

==================================================
4. CLOSED-LOOP REFERRAL
==================================================

Build proper referral backend.

Lifecycle:
CREATED
→ SENT
→ RECEIVED
→ ACCEPTED / REJECTED / CLARIFICATION
→ SCHEDULED
→ ARRIVED
→ ENCOUNTER_COMPLETED
→ OUTCOME_RETURNED
→ CLOSED

Support:
- source clinician/facility
- destination facility/department/provider
- clinical reason
- urgency
- attachments/source references
- consent
- status history
- acknowledgement
- outcome
- transfer where relevant

No fake closure.

==================================================
5. INSURANCE / TPA / PREAUTH
==================================================

Build practical backend foundation for:
- patient coverage
- scheme/policy
- eligibility check record
- preauthorization
- requested amount
- supporting documents
- decision
- denial reason
- claim
- resubmission
- settlement

External insurer checks must remain clearly external/integration-required if no API exists.

Do not fabricate eligibility/approval.

==================================================
6. EMERGENCY COORDINATION
==================================================

Build truthful emergency coordination backend:
- emergency request
- patient/location reference
- required capability
- candidate facilities
- freshness of bed/resource/capability
- contact/confirmation attempts
- accepted/rejected/unknown
- ambulance/transport coordination state
- transfer/referral linkage
- escalation

Never claim ambulance dispatched or bed reserved unless confirmed by source system.

For stale high-acuity operational data:
Status Unknown — Confirmation Required

==================================================
7. DOCUMENT INTELLIGENCE BACKEND
==================================================

Build the document pipeline contracts:
- original document preserved
- document type
- source
- upload timestamp
- OCR/extraction job
- extracted structured fields
- confidence
- human verification
- corrections/versioning
- provenance
- normalized longitudinal inclusion

Do not mark OCR output as clinically verified automatically.

Provider/model implementation can remain pluggable.

==================================================
8. SWASTHYASNAPSHOT
==================================================

Deepen reusable snapshot generation.

Include, when authorized:
- active problems
- allergies
- recent vitals
- active medicines
- recent prescriptions
- recent diagnostics
- critical/pending reports
- open CareGaps
- current episode
- NextStep
- freshness/provenance

Use safe language:
"No allergy documented"
not
"No allergy exists"

==================================================
9. AI PLATFORM — EXTENSIBLE, OWN-MODEL READY
==================================================

Current AI gateway foundation must be evolved into a provider-independent tool-driven platform.

Architecture:

Auth
→ RBAC
→ Consent
→ Workflow context
→ Authorized tool registry
→ Retrieval
→ Model router
→ Output validation
→ Sources/provenance
→ Audit

Support model providers through adapters.

Current external model provider may remain optional.

Add first-class support for future:
SWASTHYASETU HEALTH MODEL (OWN MODEL)

Do NOT pretend we already trained a foundation model.

Design:
- model registry
- model versions
- capability metadata
- language support
- provider selection
- fallback policy
- evaluation scores
- rollback
- model status

Languages:
- English
- Hindi
- Hinglish
- Auto

AI must support grounded natural-language answers, not only source-id selection, while remaining source-backed.

Patient AI:
- records
- reports
- medicines
- appointments
- CareGraph
- NextStep

Doctor AI:
- clinical history
- trends
- pending diagnostics
- CareGaps
- source-backed summaries

Hospital AI:
- queues
- beds
- admissions
- operational bottlenecks

Lab AI:
- worklists
- specimen/study states
- critical results
- rejection/quality workflow

Pharmacy AI:
- stock
- expiry
- fulfilment
- purchasing

Worker AI:
- assigned tasks
- CareGaps
- next operational action
- translation/voice context

Admin AI:
- verification
- incidents
- audit
- integration health
- governance

AI MUST NOT:
- make final diagnosis
- sign prescription
- change dose
- substitute medicine
- autonomously change treatment
- make emergency clinical decisions

==================================================
10. SWASTHYASETU OWN-MODEL GROWTH PIPELINE
==================================================

Create backend architecture for gradual owned-model growth.

DO NOT implement unsafe online self-training.

Build:
- ai_feedback
- ai_learning_candidates
- de-identification/review state
- approved training examples
- dataset versions
- model training run metadata
- evaluation runs
- model checkpoints
- promotion/rollback states

Flow:
interaction
→ feedback/correction
→ learning candidate
→ review
→ approved dataset
→ offline training/fine-tuning
→ evaluation
→ gated deployment

External model output must NOT automatically become training data.

Do not automatically learn from untrusted user corrections.

Own model can initially target:
- intent classification
- language detection
- workflow routing
- medical entity extraction
- document classification
- tool selection
- summarization

Keep model serving interface compatible with the AI Gateway.

==================================================
11. COMMUNICATION LIFECYCLE
==================================================

Generalize communication state:

QUEUED
SENT
DELIVERED
ACKNOWLEDGED
FAILED
NO_RESPONSE

Sent != informed.

Use for:
- critical results
- referral
- reminders
- appointment communication
- care-gap escalation

==================================================
12. HOSPITAL DEEPENING
==================================================

Only add backend contracts still genuinely missing for:
- OT/procedures
- hospital stores/inventory
- richer staff/duty roster
- MIS/audit
- discharge summary linkage
- hospital pharmacy linkage
- emergency/referral linkage

Do not rebuild existing reception/ADT/billing.

==================================================
13. LAB DEEPENING
==================================================

Add backend foundations where still missing:
- diagnostic capabilities
- machine/analyzer registry
- integration state
- quality control
- rejection/recollection
- imaging/PACS metadata contracts
- audit

Do not duplicate existing pathology/imaging/procedure workflows.

==================================================
14. PHARMACY DEEPENING
==================================================

Add missing:
- online orders
- delivery/pickup
- invoices/receipts where not covered
- supplier lifecycle
- reporting
- low-stock/expiry worklists

Preserve stock-backed transactional integrity.

==================================================
15. WORKER DEEPENING
==================================================

Add:
- worker area/village assignment
- assigned geography
- sample/test assistance
- medicine/refill assistance
- escalation
- sync conflict handling
- idempotent offline action receipts

Do not create broad patient search access.

==================================================
16. ADMIN / GOVERNANCE
==================================================

Build:
- incidents
- integration health
- master data
- care pathway management
- AI governance
- verification history
- audit search
- model/version governance
- retention/security governance metadata

==================================================
17. IDENTITY MERGE / UNMERGE
==================================================

Build reversible identity merge/unmerge foundation:
- candidate duplicate detection metadata
- merge request
- review
- canonical identity
- alias/source preservation
- provenance
- reversible unmerge
- audit

Never silently destroy source identity history.

==================================================
18. INTEGRATION HUB
==================================================

Provider-independent integration registry for:
- ABDM/ABHA
- HPR/HFR
- HIS/HMIS
- LIS/RIS/PACS
- pharmacy systems
- insurers
- ambulance/emergency providers

Track:
- integration
- endpoint/provider
- authentication state metadata
- last sync
- health
- errors
- freshness

Do not fake external connectivity.

==================================================
19. CARE TWIN / CARE REPLAY / DISTRICT PULSE
==================================================

Build backend foundations only after core items above.

Care Replay:
- reconstruct timeline from immutable events

Care Twin:
- current operational representation of the care journey
- not a diagnostic simulator

District Pulse:
- aggregated/de-identified operational indicators
- CareGap burden
- delayed diagnostics
- follow-up completion
- resource freshness

No patient-level leakage.

==================================================
20. TESTING / SECURITY / PERFORMANCE
==================================================

For every new migration/RPC:

- role isolation
- patient isolation
- facility isolation
- consent boundaries
- cross-facility denial
- idempotency
- stale/version conflict
- revocation
- invalid transition
- no fake closure
- source provenance
- audit

Do not weaken existing RLS.

Run the COMPLETE regression suite, including all existing 001–020 tests.

Update package.json test command so ALL current backend tests are included.

==================================================
EXECUTION MODE
==================================================

DO NOT stop after one migration.

Work continuously:

inspect
→ implement
→ focused tests
→ continue

Spend tokens on CODE, not explanation.

Save continuously.

If session limit gets near:
STOP starting new large modules early enough to:

1. run complete regression
2. update CONTINUE.md
3. update MASTER-COVERAGE.md
4. create fresh source checkpoint ZIP
5. verify ZIP

Output ZIP:
C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs\swasthyasetu-backend-checkpoint-latest.zip

Exclude:
node_modules
dist
.git
.env
.env.local
credentials/secrets

FINAL RESPONSE ONLY:
- checkpoint ZIP path
- tests count/status
- build/typecheck status
- migrations added
- concise remaining master-backend gaps

START IMPLEMENTING NOW.
DO NOT REPLAN COMPLETED 010–020 WORK.