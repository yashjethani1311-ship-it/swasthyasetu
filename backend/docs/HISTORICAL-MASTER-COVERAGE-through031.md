# Master backend coverage

Current local implementation through migration 031. No migrations were applied to live Supabase. IMPLEMENTED means the stated local backend contract, not live deployment or complete production certification.

| Requirement | Status | Evidence / remaining scope |
|---|---|---|
| Live schema reconciliation | IMPLEMENTED | 004; source metadata reconciled; no live execution |
| Diagnostic pathology workflow | IMPLEMENTED | 005; direct/rural custody, verification, publication, review tests |
| Atomic consultation and signing | IMPLEMENTED | 006; transactional completion and immutability tests |
| Authorized stock-backed dispensing | IMPLEMENTED | 006; source batch/price, quantity, partial fulfilment, idempotency |
| Worker follow-up | IMPLEMENTED | 006; assigned outcomes and doctor-verified closure |
| Provider/facility verification lifecycle | IMPLEMENTED | 009; admin RPCs, synchronized owned places, evidence metadata, 11 tests; branch governance excluded |
| Official registry verification | EXTERNAL_API_REQUIRED | No live HPR/HFR/ABHA validation; demo remains unverified |
| Consent | PARTIAL | 007 purpose/category/date grants; 020 worker action delegation; 024 referral sharing; 025 payer consent; 027 extraction authorization; 030 training withdrawal; 031 channel consent. Broad external interoperability pending. |
| Appointments | PARTIAL | 008 verified schedules/availability/booking; 013 persistent queue. General rescheduling and teleconsult room contracts pending. |
| Longitudinal provenance | IMPLEMENTED | 010 immutable source revisions with purpose/category/date filters; 027 reviewed extraction revisions. Identity reconciliation remains separate. |
| Document OCR pipeline | PARTIAL | 027 immutable originals, extraction adapter jobs/drafts, reviewed versioned transcriptions. No live OCR adapter configured. |
| Care pathway rules | PARTIAL | 022 versioned clinical review/admin approval, episode activation, dependencies, deadlines and evidence. Entry criteria require clinician attestation; automated clinical rules and retirement governance pending. |
| CareGraph | IMPLEMENTED | 011/022 episode-linked graph, immutable transitions, dependencies, required/optional steps and evidence-based closure. |
| CareGap and proof closure | PARTIAL | 022 proof snapshots; 023 explicit declined/cancelled/transferred/unable/error/deceased dispositions; 024 referral outcome closure. Not every domain has pathway proof adapters. |
| Risk resolution and NextStep | PARTIAL | 023 auditable operational risk inputs/attempts, governed human dispositions. 028 consent-filtered readiness. No autonomous clinical decisions or actual reminders sent. |
| Doctor clinical backend | PARTIAL | Encounters/orders/prescriptions/history; structured allergy/vital/referral gaps |
| Medicine reconciliation | PARTIAL | Prescribing and dispensing; current use not inferred |
| Discovery | PARTIAL | 012 bounded stored-coordinate practice/facility search and server slots. No national-scale spatial load testing. |
| Diagnostic master | PARTIAL | Catalog/capabilities exist; scalable terminology ingestion pending |
| Imaging RIS/PACS | PARTIAL | 016 separate imaging author/performer workflow, verified reporting, external study reference. Actual DICOM/PACS adapter missing. |
| Procedures/cardio | PARTIAL | 016 scheduled/performed/reported/verified procedure flow. OT room/staff scheduling remains. |
| Critical result acknowledgement | IMPLEMENTED | 017 source-verified critical lifecycle, responsible doctor acknowledgement and reviewed-result disposition required to close. External channels remain adapter-required. |
| Pharmacy ERP/POS | PARTIAL | 018 governed OTC POS, stock ledger, payments, quarantined returns; 019 supplier PO/partial receipts. Online pickup/delivery and deeper reporting remain. |
| Worker delegated/offline | PARTIAL | 020 safe assigned-patient directory, scoped packages/delegations, idempotent sync/version conflicts. Geography, assistance types and client encrypted offline store remain. |
| Hospital HMIS | PARTIAL | 013 facility membership/reception/queue; 014 beds/ADT/transfer/discharge; 015 invoices/payments/refunds; 021 facility context. Stores, OT, rosters/MIS remain. |
| Insurance/TPA | PARTIAL | 025 consented policy/invoice-linked preauth/claim cases/documents, resubmission versions and trusted external evidence callbacks. Real eligibility/insurer adapter missing. |
| Closed-loop referral | PARTIAL | 024 consented source/destination workflow through actual arrival, signed encounter, returned outcome and source closure. External referrals/rerouting and attachment bundles remain. |
| Emergency coordination | PARTIAL | 026 capability freshness/contact/acceptance, trusted transport evidence, actual arrival/encounter proof. No live ambulance dispatch or bed reservation. |
| Communication lifecycle | PARTIAL | 031 verified recipient channel permission, outbox, provider receipts, authenticated recipient acknowledgement and revocation. External transport adapter not configured. |
| Snapshot/central AI | PARTIAL | 028 consented episode/reviewed-document context. Owned/OpenAI/custom adapters, four language modes, source-backed localized narration with original excerpts. No free-form clinical synthesis, reconciled active lists or actual model run. |
| All-role AI tools | PARTIAL | Patient/doctor gateway available; operational role retrieval registry is next. No unrestricted SQL or action tools. |
| Integration hub | EXTERNAL_API_REQUIRED | External services not connected; full adapter hub pending |
| Identity merge/unmerge | NOT_IMPLEMENTED | Reversible provenance-preserving matching pending |
| Governance | PARTIAL | 009 verification, 022 pathway review, 029 model evaluation/promotion/rollback, 030 opt-in reviewed offline learning. Incident/retention/integration operations remain. |
| Care Twin/Replay/Pulse | FUTURE_ONLY | Episode graph and immutable source/event prerequisites implemented. Dedicated safe aggregate/projection contracts remain. |
| Full real Supabase E2E | NOT_IMPLEMENTED | Local deterministic PostgreSQL/PGlite and adapter tests cover current backend. Real Auth/Storage/Edge/network concurrency regression has not been executed. |
| Owned-model growth | PARTIAL | 029/030 registry, evaluation gates, promotion/rollback, opt-in candidates, independent de-identification review, immutable datasets, offline runs/checkpoint lineage and withdrawal blocks. No actual model trained; previously exported copies require operator deletion. |
| Teleconsultation rooms | NOT_IMPLEMENTED | Provider-independent room/join-token lifecycle is requested after core foundations. |
