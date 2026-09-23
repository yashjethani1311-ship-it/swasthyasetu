# Care coordination checkpoint

The local app now connects consultation completion, longitudinal history, authorized pharmacy dispensing and worker follow-up to persisted server-side transitions. Deployment and final product acceptance remain pending; see CONTINUE.md.

## Database deployment

Back up the target and validate in a disposable Supabase project first. On the supplied live-contract database, apply 004, then 005, then 006 in order. Do not replay 001 or 003 against production, and do not rerun legacy-grant reconciliation after security hardening. Each migration uses a transaction; no table reset is involved. 006 creates new feature tables and is applied once. Copying code does not apply SQL. The actual live database has not been accessed or changed in this task.

The supplied export omits auth trigger definitions, bucket settings and sequence state. Validate actual signup, role/profile creation, report bucket access and PostgREST joins before deployment. Local mocks cannot establish these production contracts.

## Care journey

1. Existing patient books doctor; doctor confirms and opens consultation.
2. Doctor records clinical notes, actual medicines with total quantities, catalog tests and follow-up days. Complete consultation invokes c1_finish_encounter atomically.
3. Patient opens prescriptions and sends a prescription to an approved pharmacy.
4. Pharmacy records actual received inventory, selects matching batch, confirms actual handed-over units and dispenses. Partial status persists; complete units close the collection gap. Price comes from recorded inventory.
5. Doctor opens Care history, searches a connected patient, and assigns an open consultation follow-up to an approved worker.
6. Worker records actual contact/visit/outcome or escalation and submits for verification. Assigned doctor verifies closure; patient's history shows completion and evidence events.
7. Patient/doctor refresh Care history to see source records, fulfilment, follow-ups and dated timeline. Older records can be paged.

## Snapshot provider configuration

`supabase/functions/swasthya-snapshot/index.ts` is an Edge handler; `grounding.mjs` is a provider-independent extraction/validation module. Configure server-side SUPABASE_URL and SUPABASE_ANON_KEY (platform-provided), SNAPSHOT_PROVIDER_URL (HTTPS), SNAPSHOT_PROVIDER_KEY, optional SNAPSHOT_MODEL. Never put the provider key or service-role key in VITE_*.

The configured model gateway must accept JSON `{task, model, records}` and return `{selected_source_ids: string[]}` with 1–12 unique IDs from the submitted records. Each record has source_id, date, kind and text. The task requests selection of important care sources; any generated free text is ignored. The gateway should use a real configured model, enforce its own rate limits and data-handling requirements, and return that contract. This repository contains the HTTP adapter; it does not contain credentials or an operating gateway.

The Edge handler authorizes source retrieval using the caller's bearer token through c1_care_context. No service-role read or source write occurs. Requests time out; redirects are rejected; oversized context and ungrounded IDs fail. If unconfigured, it returns 503 CONFIGURATION_REQUIRED. The UI reports unavailable rather than inventing a snapshot. The model has not been called in these tests.

Current output is AI-selected verbatim excerpts, not a generated clinical narrative. Allergy status is UNKNOWN. Uploaded document contents are not extracted. Dated trends and comprehensive lifetime context remain future work; snapshot context is bounded to the latest 50 records per section. Healthcare-source text is unchanged when the interface language changes.

## Test evidence and limits

`npm test`: 61 tests (11 adapters, 27 diagnostic/security, 15 care/security, 8 grounding). Build includes TypeScript checks. Care rollback and permissions are tested in an isolated PostgreSQL-compatible PGlite database. Auth and Storage schemas are test fixtures, not a production Supabase clone. UI tests use explicit isolated fixtures in tests/ui. They verify rendering and rejected-write behavior, not live data persistence. Real source persistence is tested at the database layer. Real Auth/PostgREST/storage signing/Edge deployment/concurrent-client E2E remain required.

Mobile browser checks: Hindi care history and pharmacy/worker forms, snapshot unavailable response, missing-stock disabled dispensing, rejected worker outcome retaining text. Prior P0 direct/rural tests and bilingual PDF visual checks are preserved. Browser speech invocation exists; spoken output quality and device-specific voices are not verified.
