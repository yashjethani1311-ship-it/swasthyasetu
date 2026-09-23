# Checkpoint A progress — 2026-09-19

Status: PARTIAL. This is a tested foundation increment, not completion of Checkpoint A or of the full master request. Existing P0 and care-coordination functionality is preserved.

## Consent

Migration 007 adds patient_consents and consent_audit with RLS, no direct client mutation, and RPC-only patient decisions. A connected approved doctor may request specified resource categories, purpose, record dates and access validity. Patient grants, denies or revokes the exact request. Treatment and AI permissions are separate. Expiry is checked on every retrieval, with no cron dependency. Revoked requests cannot be re-granted; a new request is required.

Longitudinal history filters categories/dates before pagination. The prior unfiltered helper is internal and cannot be called by authenticated clients. Cross-provider prescription/event reads use the audited context boundary; current clinical authorship, patient ownership and assigned pharmacy/lab/worker workflows retain their existing operational authorization. Consent does not grant lab/pharmacy/worker global history access. It is currently a doctor/patient sharing workflow, not a complete multi-organization consent system.

Context reads and consent decisions are audited. Patient can view the actor and access purpose. This does NOT yet audit every legacy direct-table read in the product. Doctor event metadata is omitted from longitudinal sharing to avoid incidental detail outside the selected category. Document contents and cross-provider signed document access remain future work.

UI clears history/snapshot on access-change events, focus and visibility changes; it rechecks every 30 seconds. Server revocation takes effect on the next request. An already-disclosed screen or in-flight external model request cannot be recalled; offline-worker revocation propagation is not implemented. No clinical offline cache is introduced. The AI gateway checks permission again before returning a result.

## Model gateway

_shared/ai-orchestrator.mjs centralizes authorized retrieval, source building, model invocation, schema validation, prompt version, source revalidation and PHI-free observability hooks. It exposes no arbitrary SQL or clinical write tools. Only patient/doctor record selection is supported in this increment; other role copilots remain pending.

The existing custom selection gateway remains available. An optional actual OpenAI Responses adapter is now implemented using structured JSON output. Reference: https://developers.openai.com/api/docs/guides/structured-outputs . Structured output constrains format; it is not a clinical truth guarantee. Application validation rejects foreign/fabricated source IDs and returns original source text only.

Server configuration:
- AI_PROVIDER=openai-responses
- AI_API_KEY=<server-only provider credential>
- AI_MODEL=<explicit model supporting Responses structured outputs>
- SUPABASE_URL and SUPABASE_ANON_KEY as supplied by the Edge runtime

No default model is invented. No API key is included or requested from a local secret store. No real model call was made. The adapter is tested with mocked HTTP contracts. AI_PROVIDER=custom-selection preserves SNAPSHOT_PROVIDER_URL, SNAPSHOT_PROVIDER_KEY and SNAPSHOT_MODEL; free-form questions currently require the Responses adapter. OpenAI requests set store=false; this is not a claim of zero provider-side retention. Provider data controls must be configured before real patient data use.

A user can enter a record question. The model selects relevant permitted source excerpts; it does not generate a free-form clinical narrative, prescribe or execute actions. Missing records/refusal/unconfigured states are explicit. Hindi source/question text remains intact. Full summaries, comparisons, clinical explanations, role-specific tool requests, OCR and operational copilots remain incomplete.

## Appointment safety

Migration 008 adds practice timezone/fee and immutable booked fee/timezone snapshots. Existing Indian practice schedules default to Asia/Kolkata; doctors can confirm/change timezone and actual fee under Profile. Unknown fee stays NULL and is displayed as requiring confirmation; no price is invented. Existing booked fees remain unchanged by later practice edits.

Availability is generated on the server for the next 14 days, bounded to 300 slots, and excludes overlapping appointments and UNAVAILABLE overrides. It returns no patient identifiers. Booking validates approved doctor, active practice, approved linked facility, consultation mode, actual slot, current fee quote, timezone and schedule. Repeated request keys are idempotent. Doctor row locking serializes competing bookings. Appointment locks serialize start/cancel. Direct appointment mutations and direct encounter creation are revoked; existing client actions now use RPCs. Encounter completion still uses the atomic c1_finish_encounter transaction.

Remaining appointment work: rescheduling, walk-ins, reception/check-in/token/queue, departmental/verified staff association, richer overrides, discovery pagination and real concurrent-client E2E. Existing appointment discovery still has legacy broad public-provider/practice reads; availability itself is bounded. Future work must replace those reads with bounded search rather than expanding patient data visibility. Availability tests exercise transition orderings in one local engine; they are not a concurrent-client load test.

## Evidence

91 automated tests: previous 61 + 9 consent authorization + 12 AI gateway contract/evaluation + 9 appointment safety. Production Vite/TypeScript build passes. SQL uses isolated PGlite auth/storage fixtures. New UI smoke covers desktop/mobile Hindi consent, denied grant preserving pending status, server fee/timezone display, and a failed booking showing an error without success. No live Supabase, real Auth/PostgREST/Storage E2E, model quality evaluation, or spoken audio-quality validation has run.

## Next action

Continue Checkpoint A with verification consistency and governance: inspect existing facility/provider registration lifecycles and implement an atomic approval/suspension RPC so the two statuses cannot disagree after lifecycle actions. Add authorization tests and a functional admin surface. Then finish provenance/pathway foundations and differentiated role shells. Preserve the entire expanded master request in MASTER-REQUEST-2026-09-19.txt; checkpoints B–J remain pending. Do not modify D: or live Supabase.
