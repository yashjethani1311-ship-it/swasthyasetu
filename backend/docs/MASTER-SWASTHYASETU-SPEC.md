SWASTHYASETU — MASTER BACKEND EXECUTION PROMPT
CONTINUE FROM THE EXACT CURRENT CODEX CHECKPOINT

==================================================
0. WORKSPACE / SAFETY
==================================================

PRIMARY CODEX WORKSPACE:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\work\swasthyasetu-clean-core

CHECKPOINT OUTPUT DIRECTORY:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs

DO NOT TOUCH:

D:\swasthyasetu-clean-core
D:\SwasthyaSetu-antigravity
D:\SwasthyaSetu-antigravity-backup

DO NOT APPLY MIGRATIONS TO LIVE SUPABASE.

DO NOT MODIFY LIVE DATA.

DO NOT READ / PRINT / EXPORT / COMMIT:
.env
.env.local
credentials
service-role keys
database passwords

Frontend is being developed separately.

YOUR OWNERSHIP = BACKEND ONLY:

- Postgres schema
- migrations
- indexes
- RPC/functions
- RLS/security
- authorization
- workflow state machines
- transaction safety
- idempotency
- data contracts
- AI backend
- interoperability adapters
- audit/provenance
- backend tests
- compatibility types only where required

Do NOT spend session time redesigning frontend/CSS/pages.

==================================================
1. CRITICAL WORKING MODE — MAXIMUM SPEED
==================================================

This is a limited active coding session.

DO NOT:

- restart architecture
- rewrite working features unnecessarily
- perform long audits already completed
- write essays before coding
- report after every feature
- ask permission between safe backend tasks
- stop merely because one external API is unavailable
- create fake integrations
- create fake medical/operational data
- spend time polishing documentation before implementation

WORK LOOP:

READ EXISTING STATE
→ IMPLEMENT
→ TEST
→ FIX
→ SAVE
→ CONTINUE NEXT TASK

Use almost all available session time for actual implementation.

If something already works:
PRESERVE IT AND MOVE ON.

If external credentials/API are unavailable:
implement schema/contracts/adapter/tests/truthful unavailable state,
record blocker briefly,
MOVE ON.

==================================================
2. RESUME EXACTLY WHERE LAST CODEX STOPPED
==================================================

FIRST read the actual persisted workspace, especially:

- CONTINUE.md
- docs/MASTER-SWASTHYASETU-SPEC.md if present
- docs/MASTER-COVERAGE.md if present
- docs/CARE-CHECKPOINT.md if present
- docs/SCHEMA-RECONCILIATION.md if present
- latest change manifest
- supabase/migrations/
- backend tests
- AI gateway/provider code
- appointments backend
- consent backend
- diagnostics backend
- pharmacy backend
- worker/care coordination backend

VERIFY FILES.

Do NOT rely only on conversation memory.

KNOWN PRIOR CODEX PROGRESS THAT MAY ALREADY EXIST:

- migration 004 live schema reconciliation
- migration 005 P0 diagnostic workflow
- migration 006 care coordination
- migration 007 scoped patient consent
- appointment safety work / migration 008 if persisted
- diagnostic order creation
- rural collection-centre routing
- specimen collection/custody/transport
- processing/result verification
- private reports
- doctor report review
- CareGap creation/closure foundations
- atomic consultation completion
- signed consultation immutability
- stock-backed pharmacy dispensing
- partial fulfilment
- batch / expiry / actual stock price
- idempotent dispense/receipt behavior
- worker follow-up
- doctor-verified follow-up closure
- care history pagination
- SwasthyaSnapshot provider boundary
- scoped consent by purpose/category/date
- grant/deny/revoke/expiry enforcement
- treatment access does not automatically grant AI access
- central AI gateway/provider abstraction
- optional OpenAI Responses-compatible adapter
- source-ID validation
- authorization before model call
- recheck after model latency where required
- no fabricated AI fallback
- server-generated appointment availability
- schedule/mode/fee validation
- cancellation/start safeguards
- security tests

IF THESE EXIST:
DO NOT REDO THEM.

Build forward from them.

==================================================
3. MASTER PRODUCT DEFINITION
==================================================

SwasthyaSetu is NOT simply:

- a health-record app
- a hospital dashboard
- a pharmacy marketplace
- a lab portal
- an AI chatbot

It is:

A CONSENT-AWARE, INTEROPERABLE, CLOSED-LOOP
CARE COORDINATION AND CARE-RESOLUTION PLATFORM.

Tagline:

ONE PATIENT.
ONE CONNECTED CARE JOURNEY.
FROM ACCESS TO RECOVERY.

Core philosophy:

KNOW THE PATHWAY
→ DETECT THE GAP
→ PRIORITIZE THE RISK
→ RESOLVE THE NEXT STEP
→ VERIFY COMPLETION

Core intelligence:

Care Pathway Rules Engine
→ CareGraph
→ CareGap
→ Risk Priority
→ Resolution
→ NextStep
→ Proof of Care
→ Closure

Core role systems:

PATIENT
DOCTOR
HOSPITAL
LAB
PHARMACY
FRONTLINE WORKER
ADMIN/GOVERNANCE

Existing national/external systems remain integrations where appropriate:

ABHA
ABDM
HPR
HFR
FHIR
UHI
eSanjeevani
Ni-kshay
U-WIN
insurance/TPA systems
external HIS/LIS/PACS/ERP

But the prototype must also contain built-in operational modules
for Hospital, Lab, Pharmacy and Worker workflows.

==================================================
4. IDENTITY / REGISTRATION
==================================================

Preserve official identity paths:

PATIENT → ABHA

DOCTOR → HPR

HOSPITAL/CLINIC → HFR

LAB → HFR

PHARMACY → HFR where applicable

WORKER → applicable registry/authority or internal Worker ID

Two registration paths:

1. Continue with Official Registry/Identity
2. Demo Registration

If official API unavailable:
NEVER fake verification.

Demo identities may use:

DEMO-ABHA-###
DEMO-HPR-###
DEMO-HFR-HOSP-###
DEMO-HFR-LAB-###
DEMO-HFR-PHARMA-###
DEMO-WORKER-###

Demo identities MUST preserve:

identity_source = DEMO
registry_verified = false

Registration details are collected once.

Operational setup belongs later in role-specific modules.

==================================================
5. PROVIDER / FACILITY VERIFICATION — FIX EARLY
==================================================

CURRENT KNOWN ARCHITECTURE FAILURE:

facility may become APPROVED
while related provider_profile remains PENDING.

This MUST be fixed.

Implement robust verification lifecycle:

PENDING
APPROVED
REJECTED
SUSPENDED
REVOKED

Support:

- verification request
- verification documents metadata
- identity source
- HPR/HFR/demo state
- registry verification state
- admin reviewer
- reason
- notes
- timestamp
- suspension/revocation reason
- audit event

Normal users must NEVER self-approve.

Use either:

ONE AUTHORITATIVE VERIFICATION STATE

OR

ATOMIC SYNCHRONIZED VERIFICATION TRANSITIONS.

Do not leave two mutable independent states that can diverge.

Implement admin-safe transactional RPCs for:

approve
reject
suspend
revoke
restore/re-review where appropriate

Tests required.

==================================================
6. CONSENT — CENTRAL PLATFORM REQUIREMENT
==================================================

Consent is not a permanent checkbox.

Support:

patient
requester
requester role
purpose
resource categories
date scope
validity start/end
grant
deny
revoke
expiry
created time
revoked time
audit

Consent must affect:

doctor longitudinal history access
diagnostics access
pharmacy access where applicable
worker delegated access
AI context retrieval
external integrations
cached/offline contexts where possible

Examples of categories:

encounters
diagnostics
prescriptions
medications
allergies
vitals
documents
care history
insurance where appropriate

AI purpose is separate from treatment purpose.

Relationship alone does NOT automatically authorize full longitudinal history.

Revocation must block subsequent server reads.

Where previously accessed records have lawful clinical/legal retention,
do not falsely pretend they disappeared.

Enforce authorization server-side.

==================================================
7. PERSON != PLACE != AVAILABILITY
==================================================

THIS PRINCIPLE IS LOCKED.

Doctor is a PERSON.

Hospital/clinic/private practice is a PLACE.

Schedule defines WHEN the doctor practices at the place.

Availability defines operational availability.

NEVER store doctor live GPS as healthcare location.

Doctor model:

- identity
- HPR
- name
- specialization
- qualifications
- professional status

Practice model:

- doctor
- facility/practice
- address
- city
- district
- state
- PIN
- latitude
- longitude
- consultation mode
- consultation fee

Schedule:

- practice
- weekday/date
- start/end
- slot duration
- timezone

Overrides:

- leave
- unavailable
- extra session
- changed hours

Patient location is used for nearby discovery.

==================================================
8. DOCTOR / FACILITY DISCOVERY
==================================================

Build production-style bounded/paginated discovery backend.

Search doctors by:

- exact HPR
- name
- specialization
- facility
- service
- city
- district
- state
- PIN
- radius/distance
- consultation mode
- fee range where appropriate
- schedule
- future availability

Multiple practices per doctor MUST work.

Nearby search:

PATIENT LOCATION
→ VERIFIED PRACTICES / FACILITIES
→ DOCTORS AT THOSE PLACES
→ SCHEDULE
→ REAL AVAILABLE SLOT

Do NOT fabricate:

ratings
wait times
availability
distance
fees

If current operational availability is stale:

return semantics such as:

AVAILABILITY_UNKNOWN
CONFIRMATION_REQUIRED
NEXT_KNOWN_SLOT

Do not claim AVAILABLE_NOW without sufficiently fresh evidence.

Facility discovery must support:

Hospital
Clinic
PHC
CHC
HWC
Lab
Collection Centre

with:

capabilities
services
operating status
location
freshness
bounded pagination

==================================================
9. APPOINTMENT / QUEUE / CONSULTATION
==================================================

Preserve existing strong appointment safety.

Ensure complete lifecycle:

REQUESTED
CONFIRMED
RESCHEDULED
CHECKED_IN
IN_QUEUE
IN_CONSULTATION
COMPLETED
NO_SHOW
CANCELLED
PROVIDER_CANCELLED

Server must derive:

fee
duration
valid slots
schedule availability

Prevent:

double booking
unscheduled booking
stale fee booking
cancel-after-start
duplicate encounter creation
cross-patient leakage

Support hospital reception:

persistent check-in
token generation
queue state
queue order
reporting location
provider/facility association

NO fake local-state token issuance.

Appointment completion should link actual encounter evidence.

==================================================
10. LONGITUDINAL HEALTH RECORD / PROVENANCE
==================================================

Build a unified longitudinal record architecture.

Every meaningful record should support where applicable:

patient
event type
source record ID
source system
source facility
source provider
event date/time
recorded date/time
verification state
original representation/reference
normalized representation
freshness
author
provenance
superseded/reconciled state

Sources may include:

encounter
diagnosis/problem
prescription
medication
dispensing
lab
imaging
procedure
report review
allergy
vital
follow-up
worker outcome
uploaded document
external integration

Important semantics:

NO ALLERGY DOCUMENTED
!=
NO ALLERGY EXISTS

Unknown data remains unknown.

Preserve original source.

Normalized representation must never silently replace original evidence.

==================================================
11. HEALTH DOCUMENT / OCR / PAPER RECORD PIPELINE
==================================================

Architecture:

UPLOAD
→ IMMUTABLE ORIGINAL
→ CLASSIFICATION
→ OCR / DOCUMENT UNDERSTANDING
→ STRUCTURED EXTRACTION DRAFT
→ FIELD CONFIDENCE
→ HUMAN VERIFICATION
→ LONGITUDINAL RECORD

Supported document categories:

prescription
lab report
imaging report
discharge summary
consultation note
insurance/programme document
generic medical record

Uploaded document != clinically verified.

AI extraction != clinically verified.

Preserve:

original
classification
extraction version
model/provider
confidence
reviewer
corrections
provenance

If OCR/model API unavailable:
implement contracts and truthful unavailable state.

==================================================
12. CARE PATHWAY RULES ENGINE
==================================================

Implement versioned approved pathways.

Pathway definition should support:

- pathway ID/version
- applicable context
- event/node type
- dependencies
- required/optional event
- deadline/window
- actor responsibility
- acknowledgement requirement
- escalation rule
- completion evidence
- closure rule

AI MUST NOT invent clinical pathways.

Pathway changes must be governed/versioned.

==================================================
13. CAREGRAPH
==================================================

CareGraph represents live care dependencies.

Nodes can include:

consultation
diagnostic order
sample collection
lab processing
report
doctor review
prescription
dispensing
referral
follow-up
worker visit
insurance preauth
admission/discharge etc.

Node states should support:

REQUIRED
PENDING
SCHEDULED
IN_PROGRESS
COMPLETED
CANCELLED
DECLINED
TRANSFERRED
UNABLE_TO_COMPLETE
VERIFICATION_PENDING
FAILED

Edges/dependencies must be explicit.

CareGraph must represent:

WHAT HAPPENED

AND

WHAT STILL NEEDS TO HAPPEN.

==================================================
14. CAREGAP
==================================================

CareGap occurs when an expected/required event fails to progress.

Examples:

diagnostic not scheduled
sample not collected
sample lost
report not reviewed
prescription partially fulfilled
medicine unavailable
referral rejected
follow-up missed
patient unreachable
insurance preauth pending
external completion unverified

Support:

gap type
patient
care graph node
opened time
severity/risk input
responsible actor
reason
status
resolution attempts
escalation
closure evidence

CareGap closure must require valid evidence.

==================================================
15. RISK PRIORITY / RESOLUTION / NEXTSTEP
==================================================

Build operational prioritization foundation.

Risk Priority may consider:

approved pathway rules
time overdue
clinical/operational priority from authoritative source
repeated failure
vulnerability/context
unacknowledged critical result
care dependency impact

Do not let LLM assign uncontrolled clinical risk.

Resolution Engine should produce allowed operational actions.

NextStep is patient-facing projection of CareGraph.

NextStep should answer:

WHAT SHOULD I DO NOW?
WHERE?
BY WHEN?
WHY?
WHAT SHOULD I BRING?
WHO CAN HELP?

NextStep MUST NOT be created by merely combining unrelated
latest appointment/encounter/prescription records.

It must derive from the active care episode / CareGraph.

==================================================
16. PROOF OF CARE / CLOSURE
==================================================

Care completion must have evidence.

Support closure states:

COMPLETED
CLINICALLY_CANCELLED
PATIENT_DECLINED
TRANSFERRED
UNABLE_TO_COMPLETE
DUPLICATE_ERROR
DECEASED where applicable

Support:

EXTERNAL_COMPLETION_POSSIBLE_VERIFICATION_PENDING

Examples of proof:

verified lab report
doctor review
dispense event
encounter completion
worker outcome + clinician verification where required
referral destination encounter
discharge evidence

Avoid false completion.

==================================================
17. DOCTOR CLINICAL BACKEND
==================================================

Support doctor workstation with:

authorized patient context
SwasthyaSnapshot
timeline
health records
problems
allergies
vitals
past prescriptions
active/recent medicines
consultation notes
diagnostic ordering
report review
prescription
referral
follow-up
CareGap
AI context

Doctor cannot browse arbitrary patients.

Patient access should arise through valid relationship such as:

appointment
encounter
referral
care-team assignment

AND consent/authorization where required.

==================================================
18. DIGITAL PRESCRIPTION
==================================================

Prescription should maintain:

patient
doctor
encounter
medicine
strength
dose
frequency
duration
route where applicable
instructions
quantity
date
status
signing/verification metadata

Prescriptions are NOT My Medicines.

MY MEDICINES should be derived from:

prescribed medication
dispensing
quantity
remaining amount
reconciliation
current/recent state

Medication safety rules must come from validated/versioned data.

LLM must NOT invent:

interactions
contraindications
dosage limits
substitution safety

==================================================
19. DIAGNOSTIC MASTER / SEARCH
==================================================

Build scalable diagnostic catalog.

Fields may include:

canonical test name
aliases
category
discipline
specimen requirements
container
workflow_kind
result_kind
parameters
units
reference structures
modality
procedure type
capabilities

workflow_kind:

PATHOLOGY
IMAGING
PROCEDURE

Use:

indexes
bounded server search
pagination
typeahead-friendly RPC
import/ingestion architecture

Do not hardcode a tiny fake “complete catalog”.

==================================================
20. PATHOLOGY WORKFLOW
==================================================

Preserve existing P0 work and expand safely.

State flow:

ORDERED
→ COLLECTION_PENDING
→ SAMPLE_COLLECTED
→ IN_TRANSIT
→ RECEIVED_AT_LAB
→ ACCEPTED / REJECTED
→ PROCESSING
→ RESULT_ENTERED
→ VERIFIED
→ PUBLISHED
→ DOCTOR_REVIEWED

Support:

sample ID/barcode
collector
collection centre
specimen type
container
collection timestamp
packing
dispatch
custody
transport
receipt
accept/reject
rejection reason
recollection
processing
raw import
structured result
reference range
verification
published report
review
critical result

==================================================
21. IMAGING / RIS / PACS WORKFLOW
==================================================

DO NOT use specimen states for imaging.

Support:

X-RAY
CT
MRI
ULTRASOUND
MAMMOGRAPHY
other extensible modalities

State flow:

ORDERED
→ SCHEDULED
→ ARRIVED
→ STUDY_PERFORMED
→ IMAGES_AVAILABLE / STUDY_AVAILABLE
→ REPORT_DRAFTED
→ VERIFIED
→ PUBLISHED
→ DOCTOR_REVIEWED

Model:

order
modality
body region
facility
scheduled time
performed time
technician/operator where applicable
radiologist/report author
study identifier
external PACS/DICOM reference
report
verification
critical finding acknowledgement
provenance

Do NOT fake DICOM/PACS success.

Create adapter boundary.

==================================================
22. PROCEDURE / CARDIAC WORKFLOW
==================================================

DO NOT use SAMPLE_COLLECTED.

Support:

ECG
ECHO
HOLTER
other diagnostic procedures

State:

ORDERED
→ SCHEDULED
→ PERFORMED
→ RESULT_RECORDED
→ VERIFIED
→ PUBLISHED where applicable
→ DOCTOR_REVIEWED

Support result documents/measurements with provenance.

==================================================
23. CRITICAL RESULT PROTOCOL
==================================================

Critical result must support:

detected
validated
notification queued
sent
delivered
acknowledged
failed
escalated
closed

SENT != INFORMED.

Store:

who was notified
when
channel
delivery state
acknowledgement
escalation
responsible clinician/team

==================================================
24. LAB / LIS-RIS BACKEND
==================================================

Backend contracts must support frontend modules:

Command Centre
Incoming Orders
Collection Queue
Sample Collection
Specimens
Transport/Custody
Processing Worklist
Result Entry
Result Verification
Critical Results
Reports
Imaging/Radiology
Procedures/Cardiac
Collection Centres
Capabilities
Diagnostic Catalog
Machines/Integrations
Quality/Rejections
Audit
Lab AI

Support:

collection-centre ≠ processing-lab

facility capabilities
test availability
collection availability
machine/analyzer adapter boundary
quality/rejection records
worklist assignment
audit

==================================================
25. MEDICINE MASTER
==================================================

Build scalable medicine search architecture.

Fields:

generic
brand
composition
strength
dosage form
route
manufacturer/catalog ID
Rx/OTC classification where authoritative
aliases
search terms

Use bounded indexed search.

Provide ingestion/import architecture.

DO NOT claim database contains every medicine in India.

==================================================
26. PHARMACY ERP / POS BACKEND
==================================================

Preserve existing strong inventory-backed fulfilment.

Build backend for frontend modules:

Command Centre
Prescription Queue
Walk-in Prescription
Prescription Lookup
QR/Token Lookup architecture
Paper Prescription
POS/New Sale
OTC Sale
Online Orders
Inventory
Stock Receipt
Batches
Expiry
Low Stock
Suppliers
Purchases
Returns
Bills/Invoices
Payments
Delivery/Pickup
Reports
Audit
Pharmacy AI

Support:

inventory
stock ledger
batches
expiry
quantity
actual price
tax metadata where configured
supplier
purchase order
purchase receipt
return
sale
sale item
invoice
payment
refund/credit state
delivery/pickup
partial fulfilment
remaining units
idempotency
audit

Prescription fulfilment flow:

PRESCRIPTION
→ PHARMACY AUTHORIZATION
→ INVENTORY CHECK
→ FULL / PARTIAL / UNAVAILABLE
→ DISPENSE
→ BILL
→ DISPENSE EVENT
→ CAREGRAPH UPDATE

Paper prescription:

preserve original
record source
do NOT falsely claim doctor verification.

OTC sale must work without requiring a SwasthyaSetu patient account.

Pharmacy must NOT access full patient history.

==================================================
27. WORKER / RURAL FIELD-CARE BACKEND
==================================================

Support frontend modules:

Today
My Area/Villages
Assigned Patients
Home Visits
CareGaps
Assisted Patient Mode
Appointments
Tests/Samples
Medicine Assistance
Follow-ups
Escalations
Offline Queue
Sync
Worker AI

Model:

worker
area
village
assignment
patient assignment
task
visit
CareGap
contact attempt
outcome
escalation
authorization

Every delegated action MUST record:

worker
patient
action type
purpose
timestamp
authorization method
source task/assignment
result

Never encode delegated identity only as free text.

Prevent:

Worker selecting Patient B
while backend task belongs to Patient A.

Worker patient discovery must use WORKER-safe RPC/authorization,
NOT a doctor-only patient-directory RPC.

==================================================
28. OFFLINE / LOW CONNECTIVITY
==================================================

Implement backend architecture for:

offline task package
sync cursor/version
queued actions
idempotency key
retry
conflict
rejected action
authorization recheck
consent recheck
server acknowledgement

Design for future safe local storage.

Do not rely on plain localStorage as final healthcare offline architecture.

On sync:
revoked consent or lost authorization must be respected.

==================================================
29. HOSPITAL BUILT-IN HIS / HMIS
==================================================

SwasthyaSetu must provide a functional prototype HIS/HMIS.

External HIS integration is optional.

VERY IMPORTANT:

Hospital data must be FACILITY-SCOPED.

Do NOT solve blank screens by loosening global RLS.

Build:

FACILITY STRUCTURE
- organization/facility
- branch
- department
- service
- capability

STAFF
- facility membership
- doctor/staff association
- HPR reference
- department
- role
- roster
- schedule
- leave
- consultation fee

PATIENT IDENTITY
- ABHA mapping
- UHID/MRN mapping where appropriate
- facility-specific patient relationship

RECEPTION
- patient lookup
- registration
- walk-in
- online appointment
- check-in
- token
- queue

OPD
- department
- doctor
- queue
- consultation state

IPD / ADT
- admission
- ward
- room
- bed
- transfer
- discharge

BED MANAGEMENT
- bed
- state
- occupancy
- reservation
- cleaning
- maintenance
- last updated / freshness

EMERGENCY
- arrival/intake
- triage state
- capability
- transfer/referral

DIAGNOSTICS
- hospital orders
- internal/external lab linkage

HOSPITAL PHARMACY
- hospital fulfilment linkage

BILLING
- charge
- charge item
- invoice
- payment
- refund/status

INSURANCE / TPA
- coverage
- preauth
- claim
- document
- decision/status

OT / PROCEDURES
- foundation/data contract

DISCHARGE
- discharge summary metadata
- medicines
- pending tests
- follow-up
- referrals

INVENTORY/STORES
- foundation

AMBULANCE / REFERRAL
- coordination

MIS / AUDIT
- operational events

INTEGRATIONS
- adapter status

HOSPITAL AI
- operations-context tool contracts

Do NOT attempt a giant commercial ERP.
Build coherent functional prototype architecture.

==================================================
30. INSURANCE / GOVERNMENT SCHEME
==================================================

Do not invent eligibility.

Model:

patient coverage
policy/scheme
payer
TPA
coverage period
eligibility state
source
verification
network relation
preauthorization
preauth documents
preauth decision
claim
claim line/state
claim documents
denial reason
resubmission
settlement

Government scheme/external eligibility should use adapter boundary.

==================================================
31. CLOSED-LOOP REFERRAL
==================================================

Referral must NOT be merely a PDF.

Flow:

DOCTOR CREATES REFERRAL
→ DESTINATION RECEIVES
→ ACCEPT / REJECT / CLARIFICATION
→ APPOINTMENT / TRANSFER COORDINATED
→ PATIENT ARRIVES
→ ENCOUNTER OCCURS
→ OUTCOME RETURNS
→ CAREGRAPH UPDATED

Model referral failure reasons:

no capacity
service unavailable
doctor unavailable
patient cannot travel
financial barrier
wrong destination
destination rejection
patient selected alternative
unknown/no response

Support rerouting.

==================================================
32. EMERGENCY COORDINATION
==================================================

Emergency backend should support:

patient/request location
required care type
nearby appropriate facilities
fresh capability data
bed/resource state
specialist/duty state
ambulance request/coordination
facility contact
acceptance/confirmation
transfer state
arrival

Nearest hospital is not always correct hospital.

Matching can consider:

specialty
equipment
emergency capability
bed/resource availability
operating hours
distance/travel feasibility
patient need

For stale high-acuity resource data return:

STATUS_UNKNOWN_CONFIRMATION_REQUIRED

Never guarantee:

ambulance
bed
specialist
facility acceptance

without verified state.

==================================================
33. FACILITY DATA FRESHNESS
==================================================

Operational data requires freshness metadata.

Examples:

bed
ICU
equipment
emergency capability
duty specialist
pharmacy stock
diagnostic availability

Store:

source
updated_at
verified_at where applicable
freshness state

If unsafe/stale:
do not present as definitely available.

==================================================
34. COMMUNICATION LIFECYCLE
==================================================

Support communication state:

QUEUED
SENT
DELIVERED
ACKNOWLEDGED
FAILED
NO_RESPONSE

SENT != INFORMED.

Link communications to:

patient
CareGap
referral
critical result
appointment
worker task
other source event

Support retries/escalations.

==================================================
35. SWASTHYASNAPSHOT
==================================================

Snapshot must work for ANY authorized patient.

Use actual authorized sources:

encounters
diagnoses/problems
prescriptions
medications
dispensing
diagnostics
imaging
procedures
report reviews
allergies
vitals
follow-ups
CareGaps
worker outcomes
uploaded/imported records

Return grounded structured output:

important conditions
recent encounters
active/recent medicines
documented allergy state
relevant diagnostics/trends
pending tests
pending reviews
follow-ups
CareGaps
source IDs
dates
provenance
uncertainty

Unknown remains unknown.

Unverified uploaded document must not become verified clinical evidence.

==================================================
36. PLATFORM-WIDE ACTUAL AI BACKEND
==================================================

AI is a PRIMARY CAPABILITY.

NO CANNED RESPONSES.
NO FAKE “AI INSIGHTS”.
NO KEYWORD RULES LABELED AI.

Architecture:

ROLE
+ CURRENT WORKFLOW/PAGE
+ ENTITY/PATIENT
→ AUTH
→ RBAC
→ CONSENT
→ AUTHORIZED RETRIEVAL
→ AUTHORIZED TOOLS
→ STRUCTURED CONTEXT
→ MODEL PROVIDER
→ STRUCTURED VALIDATION
→ SOURCE VALIDATION
→ AUTHORIZATION RECHECK
→ RESPONSE WITH PROVENANCE/UNCERTAINTY

Complete central:

provider interface
model configuration
OpenAI/custom adapter boundary
authenticated gateway
workflow registry
role registry
context builder
tool registry
structured outputs
citation/source validation
model unavailable state
evaluation hooks
safe observability

NORMALIZE WORKFLOW NAMES.

Current frontend may use or eventually need:

PATIENT_HOME / PATIENT_HEALTH
CONSULTATION / DOCTOR_CLINICAL
HOSPITAL_OPERATIONS
LAB_DIAGNOSTIC
PHARMACY_OPERATIONS
WORKER_FIELD
ADMIN_GOVERNANCE

Existing backend may currently support:
CARE_HISTORY
ENCOUNTER

Create a clean canonical mapping/versioned contract
rather than breaking existing working tests.

Role AIs:

PATIENT HEALTH AI
- explain authorized history
- explain NextStep
- organize patient context
- safe language simplification

DOCTOR CLINICAL COPILOT
- summarize
- retrieve sources
- compare past data
- identify workflow-relevant context
- support report review

HOSPITAL OPERATIONS AI
- queue/workload/resource operational context

LAB AI
- workflow/rejection/quality/operational context

PHARMACY AI
- inventory/fulfilment/shortage context

WORKER AI
- assigned tasks/authorized field context

ADMIN AI
- governance/incident/integration operational context

AI MAY NOT AUTONOMOUSLY:

final diagnosis
prescribe
change dose
substitute medicine
change treatment
make emergency clinical decisions
sign clinical record

==================================================
37. MASTER DATA / TERMINOLOGY
==================================================

Create extensible master-data architecture for:

diagnostics
medicines
specializations
departments
facility types
services
capabilities
document types
care pathway definitions
closure reasons
rejection reasons
communication channels/statuses

Preserve original terminology where external data is mapped.

Support aliases/mapping provenance.

==================================================
38. INTEROPERABILITY / INTEGRATION HUB
==================================================

Adapter boundaries for:

ABHA
ABDM
HPR
HFR
FHIR
HL7
HIS/HMIS
LIS
RIS
PACS
Pharmacy ERP/POS
Insurance/TPA
Analyzer/device
eSanjeevani
UHI
Ni-kshay
U-WIN

Do NOT fake successful integration.

Each adapter should expose where useful:

adapter name
configured state
connection state
last successful sync
last error
original payload reference
normalized payload
mapping version
provenance

FHIR/semantic normalization should preserve originals.

==================================================
39. IDENTITY MATCHING / DUPLICATES
==================================================

Support duplicate patient handling foundations.

Possible reasons:

name variation
phone change
legacy identifier
incomplete demographic
incorrect mapping

Merge must be:

audited
reversible where possible

Support:

candidate match
review
merge
source identities
unmerge/correction

Do not silently destroy source identity history.

==================================================
40. ADMIN / GOVERNANCE
==================================================

Backend contracts for frontend:

Verification Queue
Provider Governance
Facility Governance
Registry Status
Consent Ledger
Access Audit
Incidents
Integration Health
Master Data
Care Pathways
AI Governance
Care Replay
Care Twin
District Pulse foundation

Implement practical current prototype portions first:

verification actions
audit
incidents
integration state
master data
pathway versions
AI evaluations/configuration metadata

Do not waste session trying to fully implement long-term analytics
before core transactional workflows.

==================================================
41. CARE TWIN / CARE REPLAY / DISTRICT PULSE
==================================================

Build foundations only after core care graph works.

CARE TWIN:
operational representation of current care journey.

CARE REPLAY:
auditable chronological reconstruction of:
events
state transitions
decisions
communications
consent/access
resolution attempts

DISTRICT PULSE:
aggregate operational analytics using appropriately de-identified/
authorized data.

Do not overclaim population intelligence in prototype.

==================================================
42. AUTONOMY BOUNDARIES
==================================================

LEVEL 1 — may be automated operationally:

reminders
retries
task creation
approved routine searches
communication retry
pre-approved logistical coordination

LEVEL 2 — requires patient/human confirmation:

changing referral destination
changing diagnostic destination
reservation
recollection decisions where human confirmation required
major rerouting

LEVEL 3 — NEVER autonomous:

final diagnosis
prescription
dose change
medicine substitution
treatment modification
emergency clinical decisions
clinical signing

==================================================
43. KNOWN CURRENT FRONTEND / PRODUCT GAPS THAT
BACKEND MUST EVENTUALLY SUPPORT
==================================================

Frontend is being built separately, but backend contracts must support:

PATIENT:
- NextStep
- visual Care Journey
- location doctor discovery
- facilities discovery
- appointments
- prescriptions
- My Medicines
- Buy/Refill
- diagnostics
- reports/records
- consent
- insurance
- emergency
- AI
- Hindi/voice

DOCTOR:
- patient context
- Snapshot
- timeline
- records
- medicines
- allergies
- vitals
- diagnostics
- pathology/imaging/procedure ordering
- pending report review
- critical result acknowledgement
- prescription
- referral
- follow-up
- Copilot

HOSPITAL:
- Command Centre
- Reception
- Appointments
- OPD
- Patients
- Departments
- Staff
- Rosters
- Beds/Wards
- IPD/ADT
- Emergency/Triage
- Diagnostics
- Hospital Pharmacy
- Billing
- Insurance/TPA
- OT/Procedures
- Discharge
- Inventory
- Ambulance/Referrals
- MIS/Audit
- Integrations
- AI

LAB:
- Command Centre
- Incoming Orders
- Collection
- Specimens
- Custody
- Processing
- Result Entry
- Verification
- Critical Results
- Reports
- Imaging
- Procedures
- Collection Centres
- Capabilities
- Catalog
- Machines
- Quality
- Audit
- AI

PHARMACY:
- Command Centre
- Prescription Queue
- Walk-in
- Lookup
- Paper Rx
- POS
- OTC
- Online Orders
- Inventory
- Receipts
- Batches
- Expiry
- Suppliers
- Purchases
- Returns
- Invoices
- Payments
- Delivery
- Reports
- Audit
- AI

WORKER:
- Today
- Villages
- Patients
- Visits
- CareGaps
- Assisted Mode
- Appointments
- Diagnostics
- Samples
- Medicines
- Follow-ups
- Escalations
- Offline Queue
- Sync
- AI

ADMIN:
- Verification
- Governance
- Consent Ledger
- Audit
- Incidents
- Integrations
- Master Data
- Pathways
- AI Governance
- Care Twin/Replay/Pulse

==================================================
44. KNOWN CURRENT BUGS / CONTRACT MISMATCHES
==================================================

Backend should be designed so these can be corrected cleanly.

Known frontend audit findings include:

- medicine UI may expect quantity_dispensed while actual dispense event uses quantity
- prescription status is being confused with fulfilment status
- frontend AI workflow names do not fully match backend AI workflow names
- worker patient directory currently may rely on doctor-oriented access assumptions
- delegated worker actions need structured identity/purpose fields
- hospital needs proper facility-scoped data
- hospital check-in/token must persist server-side
- imaging/procedure workflows cannot share pathology specimen state machine
- doctor discovery must be practice/location/schedule based
- care journey must not join unrelated “latest” records

Do NOT blindly change stable existing columns simply to copy a frontend bug.

Provide correct canonical backend contracts.

Backward-compatible views/RPC mappings may be added if appropriate.

==================================================
45. SECURITY / PRIVACY ACCEPTANCE TESTS
==================================================

Tests MUST continuously cover:

PATIENT:
- Patient A cannot access Patient B.

DOCTOR:
- unrelated doctor cannot browse patient
- valid relationship alone does not bypass required consent
- revoked consent blocks future history access

FACILITY:
- Hospital A cannot access Hospital B scoped data
- facility staff membership required

LAB:
- unassigned lab cannot access order/report
- lab cannot browse complete unrelated patient history

PHARMACY:
- pharmacy cannot access full history
- only authorized prescription fulfilment
- one pharmacy cannot alter another pharmacy's inventory/dispense

WORKER:
- worker cannot browse unrelated patients
- task patient cannot be switched silently
- offline action rechecks authorization

ADMIN:
- normal account cannot self-approve
- only authorized governance action

AI:
- authorization denial prevents model call
- revoked consent prevents returned result
- fabricated source ID rejected
- stale context invalidated where required
- clinical model prose cannot create signed diagnosis/prescription

DATA:
- signed clinical record cannot be silently mutated
- report remains private until publish rules satisfied
- failed transactions roll back atomically
- retry is idempotent where required
- audit evidence exists

==================================================
46. TRANSACTION / IDEMPOTENCY REQUIREMENTS
==================================================

Use transaction-safe server operations for critical workflows.

Examples:

consultation completion
appointment booking
check-in/token
specimen transition
result verification
report publication
dispensing
stock receipt
worker outcome
care-gap closure
verification approval
referral state transition
insurance/preauth transition

Retries must not duplicate:

encounters
prescriptions
orders
dispensing
stock
CareGaps
audit events
tokens
worker outcomes

Changed payload with same idempotency key should fail safely.

==================================================
47. PERFORMANCE / SCALE
==================================================

Avoid full-table browser queries.

Use:

indexes
bounded RPCs
pagination
server filters
search indexes
cursor/offset where safe
facility-scoped queries

Large catalogs must use server-side search.

Location search should use suitable indexed/geospatial approach
available in current Postgres environment.

Do not prematurely optimize every table,
but avoid obvious prototype-only full scans.

==================================================
48. TESTING STRATEGY
==================================================

For each backend block:

SCHEMA
→ RPC/SERVICE
→ AUTHORIZATION
→ TRANSACTION
→ IDEMPOTENCY
→ NEGATIVE SECURITY TEST
→ HAPPY PATH TEST
→ SAVE
→ NEXT BLOCK

Prefer deterministic backend/database tests.

Do not weaken/delete existing tests just to pass.

Run focused tests after each block.

Full suite periodically, not after every 2-line change.

==================================================
49. IMPLEMENTATION PRIORITY — DO NOT RANDOMLY JUMP
==================================================

Use this priority unless a dependency requires another order:

P0 — PRESERVE / FINISH CURRENT FOUNDATION

1. inspect exact saved checkpoint
2. fix verification-state consistency
3. fix/canonicalize known contract mismatches
4. complete longitudinal/provenance foundation
5. strengthen CareGraph/CareGap/NextStep foundation
6. normalize AI role/workflow contract

P1 — DISCOVERY / PATIENT-DOCTOR FLOW

7. doctor/practice/location search
8. multiple practices
9. schedule/availability
10. facility discovery
11. persistent queue/check-in

P2 — HOSPITAL HMIS

12. facility scoping
13. departments/staff
14. OPD/reception
15. beds/IPD/ADT
16. billing/insurance foundation
17. emergency/referral foundation

P3 — LAB

18. imaging workflow
19. procedure workflow
20. critical-result lifecycle
21. capability/catalog/device/QC contracts

P4 — PHARMACY

22. ERP/POS
23. suppliers/purchase
24. sale/invoice/payment
25. delivery/returns/reporting

P5 — WORKER

26. areas/assignments
27. assisted-patient authorization
28. structured delegated actions
29. offline/sync/idempotency

P6 — CARE INTELLIGENCE

30. pathway rules
31. CareGraph dependencies
32. risk priority
33. resolution
34. proof/closure
35. Snapshot deepening

P7 — DOCUMENT/AI/INTEGRATION

36. OCR/document pipeline
37. platform-wide AI role tools
38. integration hub
39. government programme adapter contracts

P8 — GOVERNANCE / ADVANCED

40. admin deeper governance
41. Care Replay
42. Care Twin
43. District Pulse foundations

==================================================
50. SPEED OPTIMIZATION RULES
==================================================

DO NOT spend 15 minutes writing a plan.

Within the first few minutes:
understand persisted state,
identify exact next migration/task,
START IMPLEMENTING.

Do not regenerate files that are already correct.

Prefer extending existing patterns.

Group related schema changes into coherent migrations.

Do not create one migration for every tiny field.

Keep migrations forward-safe.

Do not apply to live DB.

When a huge module cannot be completed in one session:
finish one coherent vertical backend slice,
test it,
save exact resume point,
move to next highest-value slice only if time remains.

==================================================
51. CONTINUOUS RECOVERY — VERY IMPORTANT
==================================================

THE SESSION MAY END WITHOUT WARNING.

Important work MUST NEVER EXIST ONLY IN CHAT MEMORY.

After every major coherent backend block:

- SAVE source files immediately
- SAVE migration immediately
- SAVE tests immediately
- update CONTINUE.md with a very short exact resume point

Do this silently.

DO NOT wait for the final minute to save.

==================================================
52. CHECKPOINT ZIP — MANDATORY BEFORE SESSION END
==================================================

Do not wait until the final seconds.

Once a substantial amount of work is complete,
and again when usage/context seems close to ending:

STOP STARTING LARGE NEW FEATURES.

Finish current atomic unit.

Then:

1. save all files
2. run relevant focused tests
3. run broader backend tests
4. run full test suite if time allows
5. run build if time allows
6. update CONTINUE.md
7. update docs/MASTER-COVERAGE.md
8. update change manifest
9. create a fresh source checkpoint ZIP
10. verify ZIP exists and is non-empty

REQUIRED ZIP PATH:

C:\Users\Yash\Documents\Codex\2026-09-18\files-pasted-by-the-user-you\outputs\swasthyasetu-backend-checkpoint-latest.zip

INCLUDE:

src/
supabase/
tests/
docs/
functions/ if present
scripts required by project
package files
CONTINUE.md
coverage/status files
change manifest

EXCLUDE:

node_modules/
dist/
.git/
.env
.env.local
credentials
secrets
temporary cache

If safe and quick, verify archive listing after creation.

==================================================
53. MASTER COVERAGE MATRIX
==================================================

Maintain a concise machine-readable/readable status matrix for major requirements.

Allowed statuses:

IMPLEMENTED
PARTIAL
NOT_IMPLEMENTED
EXTERNAL_API_REQUIRED
FUTURE_ONLY
BLOCKED

Do NOT mark a feature IMPLEMENTED merely because:

- table exists
- interface exists
- UI exists
- placeholder exists
- adapter interface exists

IMPLEMENTED means the requested backend workflow actually works
with authorization and relevant tests.

==================================================
54. FINAL RESPONSE — DO NOT WASTE TOKENS
==================================================

At session end DO NOT write a long report.

Return only:

1. CHECKPOINT ZIP PATH
2. CONTINUE.md PATH
3. tests/build status in one short line
4. exact next backend resume point

Example:

CHECKPOINT:
...\outputs\swasthyasetu-backend-checkpoint-latest.zip

RESUME:
...\work\swasthyasetu-clean-core\CONTINUE.md

STATUS:
112 tests passing; build passing.

NEXT:
Continue Hospital facility-scoped OPD/IPD backend from migration 010.

==================================================
55. START
==================================================

START NOW.

READ THE ACTUAL SAVED CHECKPOINT.

DO NOT RESTART.

DO NOT SPEND SESSION EXPLAINING.

DO NOT WAIT FOR ME.

BUILD AS MUCH OF THE REAL SWASTHYASETU BACKEND AS POSSIBLE.

IMPLEMENT
→ TEST
→ FIX
→ SAVE
→ CONTINUE

AND CREATE THE SOURCE CHECKPOINT ZIP BEFORE THE SESSION ENDS.