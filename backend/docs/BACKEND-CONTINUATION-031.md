CONTINUE FROM THE EXACT CURRENT SAVED BACKEND STATE.

WORKSPACE:
C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\work\swasthyasetu-clean-core

DO NOT TOUCH:
- D:\SwasthyaSetu-antigravity
- D:\SwasthyaSetu-qoder-frontend
- D:\swasthyasetu-clean-core
- live Supabase
- .env
- .env.local
- secrets

DO NOT:
- restart from migration 010
- redo migrations 021–031
- re-audit already completed work
- write long plans
- stop after one migration
- spend tokens on narration instead of code

THE PREVIOUS MASTER BACKEND PROMPT REMAINS BINDING.

CURRENT COMPLETED CHECKPOINT — PRESERVE IT:

004–009
- schema reconciliation
- diagnostics P0
- care coordination
- consent
- appointment safety
- verification lifecycle
- AI gateway/contracts

010
- longitudinal records + provenance

011
- episode CareGraph / NextStep foundation

012
- doctor/practice/facility geo discovery
- server-derived slots

013
- reception
- persistent queue/token
- facility isolation

014
- admissions
- beds
- transfer
- discharge

015
- billing
- payments/refunds

016
- imaging workflow
- procedure workflow

017
- critical-result lifecycle

018
- pharmacy POS / OTC sales
- payments
- returns
- stock ledger

019
- suppliers
- purchase orders
- partial receipts

020
- worker delegation
- worker-safe patient lookup
- sync receipts
- task-version and consent checks

021
- safe frontend facility-context support

022
- governed/versioned care pathways

023
- generalized risk/resolution/closure

024
- closed-loop referrals

025
- payer / insurance case foundation

026
- emergency coordination

027
- document intelligence / extraction / review

028
- Snapshot source deepening

029
- model governance
- evaluation gates
- promotion / rollback

030
- owned-model learning pipeline
- opt-in
- de-identification review
- offline training evidence
- withdrawal protections

031
- communication lifecycle foundation
- QUEUED / SENT / DELIVERED / ACKNOWLEDGED / FAILED / NO_RESPONSE
- communication must not equal clinical closure

START FROM THE NEXT UNFINISHED WORK.

==================================================
P0 FIRST — FINISH 031 AND FULL REGRESSION
==================================================

1. Ensure tests/db/communications.mjs is included in package.json npm test.
2. Run focused communication tests.
3. Run COMPLETE regression across all current migrations/tests.
4. Fix only genuine regressions.
5. Update package.json so every current backend test is included.

Do this first before adding more migrations.

==================================================
1. AI OPERATIONAL LAYER
==================================================

The AI gateway, provider abstraction, model governance and own-model learning architecture already exist.

Now deepen the actual role AI.

Build an extensible tool registry.

The model must not have unrestricted database access.

Each tool must enforce:
- authentication
- RBAC
- consent
- current role
- current patient/facility/workflow
- minimum necessary data
- provenance
- freshness where applicable

PATIENT AI tools:
- get_patient_snapshot
- get_recent_diagnostics
- get_prescriptions
- get_medicine_fulfilment
- get_appointments
- get_open_caregaps
- get_nextstep
- get_caregraph

DOCTOR AI tools:
- authorized patient snapshot
- longitudinal history
- diagnostic trends
- pending report reviews
- critical-result worklist
- active medicines
- CareGaps
- referral status
- follow-up state

HOSPITAL AI tools:
- queues
- admissions
- beds
- discharge pending
- operational alerts
- facility workload

LAB AI tools:
- pathology worklist
- imaging/procedure worklist
- critical results
- rejected/recollection items
- capability/integration health where implemented

PHARMACY AI tools:
- inventory
- low stock
- expiry
- fulfilment
- purchase state
- sales summary where authorized

WORKER AI tools:
- assigned tasks only
- active delegations
- CareGaps
- pending follow-ups
- offline/sync state
- next operational action

ADMIN AI tools:
- verification
- incidents
- integration health
- audit
- master-data/governance state

AI output requirements:
- grounded natural-language answer
- source IDs
- dates
- provenance
- uncertainty
- permission/consent failure states
- model/provider unavailable state

Languages:
- English
- Hindi
- Hinglish
- Auto

No canned fake AI.

AI MUST NOT:
- make final diagnosis
- autonomously prescribe
- change dose
- substitute medicine
- change treatment
- make emergency clinical decisions
- sign clinician actions

==================================================
2. HOSPITAL DEEPENING
==================================================

Do NOT rebuild reception / ADT / billing.

Add only genuinely missing backend contracts for:

- OT / procedure scheduling
- hospital stores / inventory
- staff/duty roster
- discharge summary linkage
- hospital pharmacy linkage
- hospital diagnostics linkage
- insurance / TPA linkage
- referral / transfer linkage
- emergency operational linkage
- MIS / audit queries

Preserve facility isolation.

==================================================
3. LAB DEEPENING
==================================================

Add:

- diagnostic capability registry
- collection capability
- machine/analyzer registry
- analyzer/integration status
- quality control events
- rejection / recollection
- imaging/PACS metadata contracts
- audit trail
- stale machine/integration freshness state

Do not duplicate pathology/imaging/procedure lifecycle already built.

==================================================
4. PHARMACY DEEPENING
==================================================

Add:

- online orders
- pickup / delivery
- fulfilment status
- delivery attempts
- low-stock worklist
- expiry worklist
- richer purchase/supplier reporting
- invoice/receipt reporting where genuinely missing
- returns reporting
- audit

Preserve stock-backed transactional integrity.

==================================================
5. WORKER DEEPENING
==================================================

Add:

- worker geography/area/village assignment
- village/area scoped worklists
- sample/test assistance
- medicine/refill assistance
- escalation
- offline conflict handling
- sync conflict resolution states
- idempotent receipts
- task/package/delegation integrity

Do not create broad patient-search access.

==================================================
6. ADMIN / GOVERNANCE
==================================================

Build/complete:

- incident management
- integration health
- master-data governance
- care-pathway management
- AI governance operations
- model/version governance
- evaluation history
- audit search
- verification history
- retention/security governance metadata

Admin mutations must be atomic, audited and role-protected.

==================================================
7. IDENTITY MERGE / UNMERGE
==================================================

Build reversible identity merge foundation:

- duplicate candidate metadata
- merge request
- review
- canonical identity
- preserved source IDs
- provenance
- alias history
- reversible unmerge
- audit trail

Never destroy source identity history.

==================================================
8. INTEGRATION HUB
==================================================

Create provider-independent integration registry for:

- ABDM / ABHA
- HPR / HFR
- HIS / HMIS
- LIS / RIS / PACS
- pharmacy systems
- insurers
- ambulance/emergency providers

Track:
- integration/provider
- environment
- authentication state metadata
- last sync
- health
- errors
- freshness
- retry state

No fake external success.

==================================================
9. CARE REPLAY / CARE TWIN / DISTRICT PULSE
==================================================

Only after core items above.

CARE REPLAY:
- reconstruct care journey from immutable events

CARE TWIN:
- current operational state of patient journey
- not a diagnostic simulator

DISTRICT PULSE:
- de-identified aggregated operational indicators
- open CareGaps
- overdue diagnostics
- follow-up completion
- referral delays
- operational freshness
- no patient-level leakage

==================================================
10. TELECONSULTATION BACKEND FOUNDATION
==================================================

Add backend contracts for secure in-app teleconsultation.

Do NOT build video infrastructure itself from scratch.

Need:
- teleconsult appointment linkage
- consultation room entity
- room state
- patient/doctor authorization
- join token issuance boundary
- waiting/joined/ended states
- call start/end timestamps
- connection/audit metadata
- provider-independent video adapter interface
- no third-party end-user login required

No recording by default.

Recording, if added later, must require:
- explicit consent
- retention policy
- access controls
- audit

Keep video provider pluggable:
- WebRTC/provider adapter
- no provider-specific logic in frontend contracts

==================================================
11. OWN-MODEL GROWTH — KEEP EXTENSIBLE
==================================================

Do NOT pretend a full custom foundation model already exists.

Preserve SwasthyaSetu Health Model as a first-class future model provider.

Ensure:
- model registry
- checkpoint registry
- dataset versions
- training runs
- evaluation gates
- promotion
- rollback
- withdrawal blocking
- feedback candidates
- reviewed training examples

No uncontrolled online learning.

Do not train from raw user chats automatically.

==================================================
12. TESTING / SECURITY / HARDENING
==================================================

For every new migration/RPC test:

- patient isolation
- role isolation
- facility isolation
- consent
- revocation
- idempotency
- stale version
- invalid state transition
- cross-facility denial
- no fake closure
- provenance
- audit
- least privilege

Run complete regression regularly.

==================================================
13. FINAL CHECKPOINT
==================================================

Before session limit:

1. run complete npm test
2. run build/typecheck
3. update CONTINUE.md
4. update MASTER-COVERAGE.md
5. create and verify:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs\swasthyasetu-backend-checkpoint-latest.zip

Exclude:
node_modules
dist
.git
.env
.env.local
credentials
secrets

FINAL RESPONSE ONLY:
- ZIP path
- total tests/status
- build/typecheck status
- migrations added
- concise remaining backend gaps

START CODING NOW.
DO NOT REPLAN COMPLETED 021–031 WORK.