# Application audit (before P0 changes)

Source: supplied live schema metadata and the extracted application. These are code/schema findings; no live records were queried and no migration was executed remotely.

| Severity | Finding | Evidence | Planned correction |
|---|---|---|---|
| CRITICAL | Self role escalation | profiles_self_update permits any owned-row columns; authenticated has table UPDATE | Revoke broad and column writes, grant only name update |
| CRITICAL | Unassigned clinical orders exposed | lab can view available orders allows lab_provider_id IS NULL with no role condition | Restrictive authorization policy; no general unassigned queue |
| CRITICAL | Reports readable/uploadable by unrelated labs | storage lab policies check only approved LAB role | Restrictive object authorization tied to order and immutable result path |
| CRITICAL | Provider/facility self approval at INSERT; identity flags writable | owner-only INSERT checks and broad grants | Remove direct registration writes; use existing demo RPCs; restrict profile/identity writes |
| HIGH | Lab result INSERT not tied to assigned order; lab UPDATE can rewrite verified values and review fields | lab_results policies | Revoke clinical mutations; validated RPCs with row locks |
| HIGH | Sample collection has no physical specimen/custody transaction | LabWorkspace collectSample updates only order status | Validated specimen state machine and append-only custody |
| HIGH | Verification/report/gap/event writes can partially fail | completeReport deletes observations then performs separate browser writes; care failures ignored | Atomic verification and publication RPCs; recoverable PDF publication |
| HIGH | Reference selection ignores demographics/method, numeric invalid values can reach PDF | getApplicableRange chooses first range | Server selects valid range, ambiguity remains UNKNOWN; finite numeric validation |
| HIGH | Imported sample/test/unit identity is not checked; original CSV discarded | handleMachineFile maps normalized names and stores parsed payload | Strict adapter mapping and exact raw text preservation; human verification |
| HIGH | No doctor report-review workflow | /lab maps DOCTOR to placeholder; no review RPC in export | Authorized idempotent review RPC + report view |
| HIGH | Doctor orders are free-text, not catalog linked | Encounter createLabOrders omits diagnostic_test_id | Catalog selection and encounter-bound order RPC |
| HIGH | Doctor cannot read connected patient demographics under current RLS | patient_profiles only self/admin SELECT | Care-linked approved doctor policy |
| MEDIUM | Dashboard requests nonexistent columns | care_gaps.description and priority absent live | Query actual gap_type/severity and display evidence-backed label |
| MEDIUM | No destination/location discovery or facility setup | Diagnostics read-only; Profile only practice setup | Paginated capability-aware discovery and owner facility location editor |
| MEDIUM | Result shape mismatch loses names/text values | lab writes code/name/value; patient reads parameter_code/parameter_name/raw_value | Canonical structured observations with legacy read compatibility |
| MEDIUM | Unbounded reads in diagnostics/catalog/discovery | page queries lack pagination | Bounded order/catalog/discovery queries |
| MEDIUM | Consultation/prescription evidence is not atomic | encounter code ignores denied care_events/care_gaps inserts | Resolved locally in 006 via c1_finish_encounter; rollback and immutable signing tested |
| LOW | Build fails before app compilation | ignoreDeprecations=6.0 with installed TypeScript 5.x | Correct compiler setting |
| LOW | Hindi common labels missing | Hindi translations omit common section | Add plain Hindi labels |
| LOW | Account-check error hidden behind loading | App checks null role record before accountError | Prioritize error display |
| LOW | Duplicate HPR/HFR indexes | live index metadata | Preserve; maintenance decision outside reconciliation |

## Scope and metadata limitations

The export does not contain storage bucket settings, sequence counters/options, auth schema triggers, owners, or numeric type modifiers. Their absence is not evidence of absence in production. The baseline explicitly documents this. P0 provisions private lab report storage without inspecting or exposing objects. No clinical data is seeded.

Update 2026-09-19: local migration 006 implements atomic consultation completion, authorized inventory-backed dispensing and verified worker follow-up. The snapshot provider boundary is implemented but unconfigured. OCR, real external integrations and final live E2E remain pending. See CARE-CHECKPOINT.md and CONTINUE.md; this update does not repeat the audit.
