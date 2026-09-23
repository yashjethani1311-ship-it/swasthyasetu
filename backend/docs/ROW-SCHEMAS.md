# RPC row shape dictionary

These are row types, not permission to read underlying tables. Use only the fields named by the RPC return shape. Nullable missing clinical fields remain unknown. JSON/JSONB source content is flexible and is never inferred as verified merely because it parses.

## admission_actions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| admission_id | uuid | NO |
| request_key | uuid | NO |
| action | text | NO |
| actor_user_id | uuid | NO |
| payload | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_dataset_members

| Field | Database type | Nullable |
|---|---|---|
| dataset_id | uuid | NO |
| example_id | uuid | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_dataset_versions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| name | text | NO |
| version | text | NO |
| created_by | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_feedback

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| actor_user_id | uuid | NO |
| interaction_ref | uuid | NO |
| feedback | text | NO |
| training_opt_in | bool | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| withdrawn_at | timestamptz | YES |

Recorded constraints: No column-state CHECK constraint.

## ai_learning_candidates

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| feedback_id | uuid | NO |
| state | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['PENDING_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text, 'WITHDRAWN'::text])))`

## ai_learning_events

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| action | text | NO |
| source_id | uuid | NO |
| actor_user_id | uuid | YES |
| metadata | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_model_approvals

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| evaluation_id | uuid | NO |
| reviewed_by | uuid | NO |
| review_note | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_model_evaluations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| model_version_id | uuid | NO |
| suite_version | text | NO |
| results | jsonb | NO |
| passed | bool | NO |
| source_run | text | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_model_holds

| Field | Database type | Nullable |
|---|---|---|
| model_version_id | uuid | NO |
| suspended | bool | NO |
| reason | text | NO |
| revision | int4 | NO |
| updated_by | uuid | NO |
| updated_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_model_route_events

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| capability | text | NO |
| language | text | NO |
| previous_model | uuid | YES |
| model_version_id | uuid | NO |
| revision | int4 | NO |
| reason | text | NO |
| actor_user_id | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_model_routes

| Field | Database type | Nullable |
|---|---|---|
| capability | text | NO |
| language | text | NO |
| model_version_id | uuid | NO |
| fallback_version_id | uuid | YES |
| allow_external_fallback | bool | NO |
| revision | int4 | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK (((fallback_version_id IS NULL) OR (fallback_version_id <> model_version_id)))`

## ai_model_versions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| model_name | text | NO |
| version | text | NO |
| provider_kind | text | NO |
| config_ref | text | NO |
| capabilities | _text | NO |
| languages | _text | NO |
| artifact_sha256 | text | YES |
| created_by | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((cardinality(capabilities) > 0) AND (capabilities <@ ARRAY['SOURCE_SELECTION'::text, 'GROUNDED_ANSWER'::text, 'INTENT_CLASSIFICATION'::text, 'LANGUAGE_DETECTION'::text, 'DOCUMENT_EXTRACTION'::text])))`; `CHECK (((cardinality(languages) > 0) AND (languages <@ ARRAY['English'::text, 'Hindi'::text, 'Hinglish'::text, 'Auto'::text])))`; `CHECK ((provider_kind = ANY (ARRAY['OWN_MODEL'::text, 'EXTERNAL'::text])))`

## ai_tool_audit

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| actor_user_id | uuid | NO |
| tool_name | text | NO |
| actor_role | text | NO |
| record_count | int4 | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_training_checkpoints

| Field | Database type | Nullable |
|---|---|---|
| model_version_id | uuid | NO |
| training_run_id | uuid | NO |
| linked_by | uuid | NO |
| linked_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_training_examples

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| candidate_id | uuid | NO |
| deidentified_content | jsonb | NO |
| reviewed_by | uuid | NO |
| review_note | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## ai_training_runs

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| dataset_id | uuid | NO |
| recipe_ref | text | NO |
| state | text | NO |
| external_run | text | YES |
| artifact_sha256 | text | YES |
| requested_by | uuid | NO |
| created_at | timestamptz | NO |
| completed_at | timestamptz | YES |

Recorded constraints: `CHECK ((state = ANY (ARRAY['REQUESTED'::text, 'RUNNING'::text, 'COMPLETED'::text, 'FAILED'::text])))`

## appointments

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| scheduled_at | timestamptz | NO |
| mode | text | NO |
| status | text | NO |
| created_at | timestamptz | NO |
| practice_id | uuid | YES |
| reason | text | YES |
| patient_note | text | YES |
| duration_minutes | int4 | YES |
| updated_at | timestamptz | YES |
| booking_request_key | uuid | YES |
| consultation_fee | numeric | YES |
| practice_timezone | text | YES |

Recorded constraints: `CHECK ((mode = ANY (ARRAY['PHYSICAL'::text, 'TELECONSULT'::text])))`; `CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'CONFIRMED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text])))`

## audit_logs

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| actor_user_id | uuid | YES |
| action | text | NO |
| entity_type | text | NO |
| entity_id | text | YES |
| metadata | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## care_communications

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| recipient_user_id | uuid | NO |
| preference_id | uuid | NO |
| source_kind | text | NO |
| source_id | uuid | NO |
| template_code | text | NO |
| state | text | NO |
| queued_by | uuid | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| expires_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'ACKNOWLEDGED'::text, 'FAILED'::text, 'NO_RESPONSE'::text, 'CANCELLED'::text])))`

## care_dependencies

| Field | Database type | Nullable |
|---|---|---|
| node_id | uuid | NO |
| requires_node_id | uuid | NO |

Recorded constraints: `CHECK ((node_id <> requires_node_id))`

## care_episodes

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| encounter_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| status | text | NO |
| source_at | timestamptz | NO |
| created_at | timestamptz | NO |
| closed_at | timestamptz | YES |
| closure_outcome | text | YES |

Recorded constraints: `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'COMPLETED'::text])))`

## care_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| event_type | text | NO |
| source_table | text | YES |
| source_id | uuid | YES |
| actor_user_id | uuid | YES |
| metadata | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## care_gaps

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| gap_type | text | NO |
| severity | text | NO |
| status | text | NO |
| source_table | text | YES |
| source_id | uuid | YES |
| created_at | timestamptz | NO |
| closed_at | timestamptz | YES |
| due_at | timestamptz | YES |
| graph_node_id | uuid | YES |
| blocked_reason | text | YES |
| responsible_provider_id | uuid | YES |
| clinical_urgency | text | NO |
| vulnerable_context | bool | NO |
| stale_operational_data | bool | NO |
| risk_recorded_by | uuid | YES |
| risk_recorded_at | timestamptz | YES |
| closure_outcome | text | YES |

Recorded constraints: `CHECK ((clinical_urgency = ANY (ARRAY['ROUTINE'::text, 'HIGH'::text, 'CRITICAL'::text])))`

## care_node_events

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| node_id | uuid | NO |
| from_state | text | YES |
| to_state | text | NO |
| proof_kind | text | YES |
| proof_id | uuid | YES |
| actor_user_id | uuid | YES |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## care_nodes

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| episode_id | uuid | NO |
| kind | text | NO |
| category | text | NO |
| source_kind | text | NO |
| source_id | uuid | NO |
| state | text | NO |
| responsible_role | text | NO |
| occurred_at | timestamptz | YES |
| due_at | timestamptz | YES |
| proof_kind | text | YES |
| proof_id | uuid | YES |
| updated_at | timestamptz | NO |
| required | bool | NO |
| pathway_version_id | uuid | YES |

Recorded constraints: `CHECK ((state = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'VERIFICATION_PENDING'::text, 'COMPLETED'::text, 'CANCELLED'::text])))`

## care_pathway_steps

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| version_id | uuid | NO |
| step_key | text | NO |
| label | text | NO |
| required | bool | NO |
| category | text | NO |
| responsible_role | text | NO |
| deadline_seconds | int4 | NO |
| evidence_kind | text | NO |
| dependencies | _text | NO |
| allowed_closures | _text | NO |

Recorded constraints: `CHECK (((deadline_seconds >= 0) AND (deadline_seconds <= 31536000)))`

## care_pathway_versions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| pathway_id | uuid | NO |
| version | int4 | NO |
| specification | jsonb | NO |
| status | text | NO |
| reviewed_by | uuid | YES |
| review_note | text | YES |
| reviewed_at | timestamptz | YES |
| approved_by | uuid | YES |
| approved_at | timestamptz | YES |

Recorded constraints: `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CLINICALLY_REVIEWED'::text, 'APPROVED'::text, 'RETIRED'::text])))`

## care_pathways

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| code | text | NO |
| title | text | NO |
| created_by | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## care_referrals

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| episode_id | uuid | NO |
| patient_id | uuid | NO |
| source_doctor_id | uuid | NO |
| destination_facility_id | uuid | NO |
| destination_department_id | uuid | YES |
| destination_doctor_id | uuid | NO |
| reason | text | NO |
| urgency | text | NO |
| state | text | NO |
| consent_status | text | NO |
| consent_until | timestamptz | YES |
| consent_decided_at | timestamptz | YES |
| appointment_id | uuid | YES |
| outcome_encounter_id | uuid | YES |
| outcome_summary | text | YES |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((consent_status = ANY (ARRAY['REQUESTED'::text, 'GRANTED'::text, 'DENIED'::text, 'REVOKED'::text])))`; `CHECK (((length(TRIM(BOTH FROM reason)) >= 10) AND (length(TRIM(BOTH FROM reason)) <= 8000)))`; `CHECK ((state = ANY (ARRAY['CREATED'::text, 'SENT'::text, 'RECEIVED'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'CLARIFICATION'::text, 'SCHEDULED'::text, 'ARRIVED'::text, 'ENCOUNTER_COMPLETED'::text, 'OUTCOME_RETURNED'::text, 'CLOSED'::text, 'CANCELLED'::text])))`; `CHECK ((urgency = ANY (ARRAY['ROUTINE'::text, 'HIGH'::text, 'CRITICAL'::text])))`

## care_replay_evidence

| Field | Database type | Nullable |
|---|---|---|
| event_key | text | YES |
| patient_id | uuid | YES |
| episode_id | uuid | YES |
| category | text | YES |
| consent_date | timestamptz | YES |
| recorded_at | timestamptz | YES |
| occurred_at | timestamptz | YES |
| actor_user_id | uuid | YES |
| facility_id | uuid | YES |
| source_entity | text | YES |
| source_id | uuid | YES |
| event_type | text | YES |
| previous_state | text | YES |
| resulting_state | text | YES |
| verification_state | text | YES |
| safe_metadata | jsonb | YES |

Recorded constraints: No column-state CHECK constraint.

## clinical_source_versions

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| patient_id | uuid | NO |
| source_kind | text | NO |
| source_id | uuid | NO |
| revision | int4 | NO |
| category | text | NO |
| source_system | text | NO |
| source_provider_id | uuid | YES |
| source_facility_id | uuid | YES |
| occurred_at | timestamptz | YES |
| recorded_at | timestamptz | NO |
| verification_state | text | NO |
| original | jsonb | NO |
| capture_kind | text | NO |
| recorded_by | uuid | YES |
| supersedes_id | int8 | YES |

Recorded constraints: `CHECK ((capture_kind = ANY (ARRAY['BASELINE'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))`; `CHECK ((revision > 0))`

## collection_centre_tests

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| collection_centre_id | uuid | NO |
| diagnostic_test_id | uuid | NO |
| active | bool | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## collection_centres

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | YES |
| centre_code | text | NO |
| centre_name | text | NO |
| centre_type | text | NO |
| address_line | text | YES |
| village | text | YES |
| district | text | YES |
| city | text | YES |
| state | text | YES |
| postal_code | text | YES |
| latitude | float8 | YES |
| longitude | float8 | YES |
| phone | text | YES |
| active | bool | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((centre_type = ANY (ARRAY['PHC'::text, 'CHC'::text, 'SUB_CENTRE'::text, 'HEALTH_WELLNESS_CENTRE'::text, 'LAB_COLLECTION_CENTRE'::text, 'MOBILE_COLLECTION_UNIT'::text, 'HOSPITAL_COLLECTION_POINT'::text, 'OTHER'::text])))`

## communication_preferences

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| user_id | uuid | NO |
| channel | text | NO |
| destination | text | NO |
| verified_at | timestamptz | YES |
| verification_source | text | YES |
| valid_until | timestamptz | NO |
| revoked_at | timestamptz | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((channel = ANY (ARRAY['SMS'::text, 'EMAIL'::text])))`

## communication_receipts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| communication_id | uuid | NO |
| state | text | NO |
| provider_ref | text | YES |
| event_key | text | YES |
| evidence | jsonb | NO |
| actor_user_id | uuid | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## consent_audit

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| consent_id | uuid | YES |
| patient_id | uuid | NO |
| actor_user_id | uuid | NO |
| action | text | NO |
| purpose | text | YES |
| categories | _text | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## critical_result_actions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| critical_id | uuid | NO |
| request_key | uuid | NO |
| action | text | NO |
| channel | text | YES |
| note | text | NO |
| recipient_user_id | uuid | YES |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## critical_results

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| result_id | uuid | NO |
| patient_id | uuid | NO |
| responsible_doctor_id | uuid | NO |
| finding | text | NO |
| state | text | NO |
| request_key | uuid | NO |
| detected_by | uuid | NO |
| detected_at | timestamptz | NO |
| acknowledged_at | timestamptz | YES |
| acknowledged_by | uuid | YES |
| closed_at | timestamptz | YES |
| disposition | text | YES |

Recorded constraints: `CHECK (((length(TRIM(BOTH FROM finding)) >= 3) AND (length(TRIM(BOTH FROM finding)) <= 4000)))`; `CHECK ((state = ANY (ARRAY['DETECTED'::text, 'VALIDATED'::text, 'QUEUED'::text, 'SENT'::text, 'DELIVERED'::text, 'FAILED'::text, 'NO_RESPONSE'::text, 'ESCALATED'::text, 'ACKNOWLEDGED'::text, 'CLOSED'::text])))`

## diagnostic_master

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| import_batch_id | uuid | NO |
| source_code | text | NO |
| name | text | NO |
| category | text | NO |
| department | text | YES |
| specimen_type | text | YES |
| container | text | YES |
| minimum_volume | text | YES |
| preparation | text | YES |
| transport | text | YES |
| temperature | text | YES |
| stability | text | YES |
| methodology | text | YES |
| unit | text | YES |
| reference_rule | text | YES |
| critical_rule | text | YES |
| turnaround | text | YES |
| panel_components | _text | NO |
| aliases | _text | NO |
| active | bool | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((category = ANY (ARRAY['PATHOLOGY'::text, 'IMAGING'::text, 'PROCEDURE'::text])))`

## diagnostic_master_bindings

| Field | Database type | Nullable |
|---|---|---|
| test_id | uuid | NO |
| master_id | uuid | NO |
| bound_by | uuid | NO |
| bound_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## diagnostic_parameters

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| test_id | uuid | NO |
| parameter_code | text | NO |
| parameter_name | text | NO |
| unit | text | YES |
| data_type | text | NO |
| display_order | int4 | NO |
| required | bool | NO |
| active | bool | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((data_type = ANY (ARRAY['NUMBER'::text, 'TEXT'::text, 'BOOLEAN'::text, 'CHOICE'::text])))`

## diagnostic_reference_ranges

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| parameter_id | uuid | NO |
| sex | text | YES |
| min_age_years | numeric | YES |
| max_age_years | numeric | YES |
| lower_limit | numeric | YES |
| upper_limit | numeric | YES |
| reference_text | text | YES |
| method | text | YES |
| lab_provider_id | uuid | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## diagnostic_studies

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_order_id | uuid | NO |
| facility_id | uuid | NO |
| workflow_kind | text | NO |
| modality | text | YES |
| report_author_provider_id | uuid | NO |
| state | text | NO |
| scheduled_at | timestamptz | YES |
| performed_at | timestamptz | YES |
| study_reference | text | YES |
| reference_verification | text | YES |
| report_text | text | YES |
| measurements | jsonb | YES |
| verified_at | timestamptz | YES |
| result_id | uuid | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['ORDERED'::text, 'SCHEDULED'::text, 'ARRIVED'::text, 'STUDY_PERFORMED'::text, 'STUDY_AVAILABLE'::text, 'PERFORMED'::text, 'REPORT_DRAFTED'::text, 'RESULT_RECORDED'::text, 'VERIFIED'::text, 'PUBLISHED'::text, 'DOCTOR_REVIEWED'::text])))`; `CHECK ((workflow_kind = ANY (ARRAY['IMAGING'::text, 'PROCEDURE'::text])))`

## diagnostic_study_actions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| study_id | uuid | NO |
| request_key | uuid | NO |
| action | text | NO |
| payload | jsonb | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## diagnostic_tests

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| test_code | text | NO |
| test_name | text | NO |
| category | text | YES |
| specimen_type | text | YES |
| method | text | YES |
| description | text | YES |
| active | bool | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| result_kind | text | NO |
| workflow_kind | text | YES |
| modality | text | YES |

Recorded constraints: `CHECK ((result_kind = ANY (ARRAY['PARAMETERS'::text, 'DOCUMENT'::text])))`; `CHECK ((workflow_kind = ANY (ARRAY['PATHOLOGY'::text, 'IMAGING'::text, 'PROCEDURE'::text])))`

## dispense_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| prescription_item_id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| quantity | int4 | NO |
| price_paid | numeric | YES |
| dispensed_at | timestamptz | NO |
| fulfilment_id | uuid | YES |
| inventory_id | uuid | YES |
| request_key | uuid | YES |

Recorded constraints: `CHECK ((quantity > 0))`

## document_extraction_drafts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| job_id | uuid | NO |
| document_type | text | NO |
| raw_text | text | NO |
| extracted_fields | jsonb | NO |
| provider_event_key | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## document_extraction_jobs

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| record_id | uuid | NO |
| patient_id | uuid | NO |
| requested_by | uuid | NO |
| request_key | uuid | NO |
| state | text | NO |
| authorization_until | timestamptz | NO |
| provider | text | YES |
| model_version | text | YES |
| created_at | timestamptz | NO |
| completed_at | timestamptz | YES |

Recorded constraints: `CHECK ((state = ANY (ARRAY['CONFIGURATION_REQUIRED'::text, 'PROCESSING'::text, 'DRAFT_READY'::text, 'FAILED'::text, 'CANCELLED'::text])))`

## document_extraction_reviews

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| draft_id | uuid | NO |
| version | int4 | NO |
| normalized_fields | jsonb | NO |
| review_note | text | NO |
| reviewed_by | uuid | NO |
| request_key | uuid | NO |
| review_state | text | NO |
| source_authenticity | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## emergency_contacts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| request_id | uuid | NO |
| facility_id | uuid | NO |
| state | text | NO |
| response | text | YES |
| responded_by | uuid | YES |
| responded_at | timestamptz | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['REQUESTED'::text, 'ACCEPTED'::text, 'REJECTED'::text])))`

## emergency_requests

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| episode_id | uuid | YES |
| requested_by | uuid | NO |
| required_capabilities | _text | NO |
| latitude | float8 | NO |
| longitude | float8 | NO |
| reason | text | NO |
| state | text | NO |
| accepted_facility_id | uuid | YES |
| transport_state | text | NO |
| arrival_queue_id | uuid | YES |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)))`; `CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))`; `CHECK ((state = ANY (ARRAY['OPEN'::text, 'FACILITY_CONFIRMED'::text, 'ARRIVED'::text, 'CLOSED'::text])))`; `CHECK ((transport_state = ANY (ARRAY['NOT_REQUESTED'::text, 'REQUESTED'::text, 'CONFIRMED'::text, 'DISPATCHED'::text, 'ARRIVED'::text, 'FAILED'::text])))`

## emergency_transport_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| request_id | uuid | NO |
| event_key | text | NO |
| state | text | NO |
| source_reference | text | NO |
| original_payload | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## encounters

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| appointment_id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| status | text | NO |
| chief_complaint | text | YES |
| symptoms | text | YES |
| temperature_c | numeric | YES |
| pulse_bpm | int4 | YES |
| systolic_bp | int4 | YES |
| diastolic_bp | int4 | YES |
| spo2_percent | int4 | YES |
| weight_kg | numeric | YES |
| diagnosis | text | YES |
| clinical_notes | text | YES |
| follow_up_in_days | int4 | YES |
| started_at | timestamptz | NO |
| completed_at | timestamptz | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])))`; `CHECK (((follow_up_in_days IS NULL) OR (follow_up_in_days >= 0)))`; `CHECK (((spo2_percent IS NULL) OR ((spo2_percent >= 0) AND (spo2_percent <= 100))))`

## episode_pathways

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| episode_id | uuid | NO |
| version_id | uuid | NO |
| activated_by | uuid | NO |
| criteria_attestation | text | NO |
| activated_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## external_care_claims

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| gap_id | uuid | NO |
| patient_id | uuid | NO |
| record_id | uuid | NO |
| note | text | NO |
| reported_by | uuid | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## facilities

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| owner_user_id | uuid | YES |
| name | text | NO |
| facility_type | text | NO |
| registration_id | text | YES |
| address_text | text | YES |
| city | text | YES |
| state | text | YES |
| verification_status | verification_status | NO |
| created_at | timestamptz | NO |
| hfr_id | text | YES |
| identity_source | text | YES |
| registry_verified | bool | YES |
| latitude | float8 | YES |
| longitude | float8 | YES |
| phone | text | YES |
| village | text | YES |
| district | text | YES |
| postal_code | text | YES |

Recorded constraints: No column-state CHECK constraint.

## facility_capability_updates

| Field | Database type | Nullable |
|---|---|---|
| facility_id | uuid | NO |
| capability_code | text | NO |
| available | bool | YES |
| observed_at | timestamptz | NO |
| valid_until | timestamptz | NO |
| recorded_by | uuid | NO |

Recorded constraints: `CHECK ((capability_code ~ '^[A-Z0-9_]{2,80}$'::text))`; `CHECK ((valid_until > observed_at))`

## facility_departments

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| name | text | NO |
| active | bool | NO |

Recorded constraints: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 160)))`

## facility_invoice_lines

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| invoice_id | uuid | NO |
| description | text | NO |
| quantity | numeric | NO |
| unit_price | numeric | NO |
| tax_rate | numeric | NO |
| line_total | numeric | NO |

Recorded constraints: `CHECK ((line_total >= (0)::numeric))`; `CHECK ((quantity > (0)::numeric))`; `CHECK (((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric)))`; `CHECK ((unit_price >= (0)::numeric))`

## facility_invoices

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| patient_id | uuid | NO |
| source_kind | text | NO |
| source_id | uuid | NO |
| currency | text | NO |
| total | numeric | NO |
| status | text | NO |
| request_key | uuid | NO |
| request_payload | jsonb | NO |
| created_by | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((currency = 'INR'::text))`; `CHECK ((source_kind = ANY (ARRAY['APPOINTMENT'::text, 'ADMISSION'::text])))`; `CHECK ((status = ANY (ARRAY['ISSUED'::text, 'PARTIALLY_PAID'::text, 'PAID'::text, 'VOID'::text])))`; `CHECK ((total >= (0)::numeric))`

## facility_memberships

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| user_id | uuid | NO |
| staff_role | text | NO |
| active | bool | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((staff_role = ANY (ARRAY['MANAGER'::text, 'RECEPTION'::text, 'CLINICIAN'::text])))`

## facility_operation_events

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| facility_id | uuid | NO |
| actor_user_id | uuid | YES |
| action | text | NO |
| entity_id | uuid | NO |
| from_state | text | YES |
| to_state | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## facility_payments

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| invoice_id | uuid | NO |
| kind | text | NO |
| amount | numeric | NO |
| method | text | NO |
| external_reference | text | YES |
| reason | text | YES |
| refund_of | uuid | YES |
| request_key | uuid | NO |
| recorded_by | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: `CHECK ((amount > (0)::numeric))`; `CHECK (((kind = 'REFUND'::text) = (refund_of IS NOT NULL)))`; `CHECK ((kind = ANY (ARRAY['PAYMENT'::text, 'REFUND'::text])))`; `CHECK ((method = ANY (ARRAY['CASH'::text, 'BANK_TRANSFER'::text, 'CARD'::text, 'UPI'::text])))`

## facility_token_counters

| Field | Database type | Nullable |
|---|---|---|
| facility_id | uuid | NO |
| service_date | date | NO |
| last_token | int4 | NO |

Recorded constraints: `CHECK ((last_token > 0))`

## follow_up_tasks

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| care_gap_id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| worker_provider_id | uuid | NO |
| status | text | NO |
| outcome | text | YES |
| assigned_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| verified_at | timestamptz | YES |
| verified_by | uuid | YES |
| sync_version | int8 | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['ASSIGNED'::text, 'CONTACTED'::text, 'VISITED'::text, 'ESCALATED'::text, 'AWAITING_VERIFICATION'::text, 'COMPLETED'::text])))`

## gap_resolution_attempts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| gap_id | uuid | NO |
| action | text | NO |
| autonomy_level | int4 | NO |
| outcome | text | NO |
| note | text | NO |
| request_key | uuid | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((action = ANY (ARRAY['REMINDER'::text, 'RETRY'::text, 'WORKER_CONTACT'::text, 'ALTERNATE_SEARCH'::text, 'ESCALATE'::text, 'CLINICIAN_REVIEW'::text, 'PATIENT_CONFIRMATION'::text])))`; `CHECK ((autonomy_level = ANY (ARRAY[1, 2])))`; `CHECK (((length(TRIM(BOTH FROM note)) >= 3) AND (length(TRIM(BOTH FROM note)) <= 2000)))`; `CHECK ((outcome = ANY (ARRAY['QUEUED'::text, 'FAILED'::text, 'RECORDED'::text])))`

## governance_incident_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| incident_id | uuid | NO |
| from_state | text | YES |
| to_state | text | NO |
| note | text | NO |
| request_payload | jsonb | NO |
| revision | int4 | NO |
| actor_user_id | uuid | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## governance_incidents

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| reported_by | uuid | NO |
| category | text | NO |
| summary | text | NO |
| state | text | NO |
| severity | text | YES |
| assigned_admin | uuid | YES |
| revision | int4 | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((category = ANY (ARRAY['SECURITY'::text, 'PRIVACY'::text, 'CLINICAL_WORKFLOW'::text, 'INTEGRATION'::text, 'DATA_QUALITY'::text])))`; `CHECK ((severity = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))`; `CHECK ((state = ANY (ARRAY['OPEN'::text, 'TRIAGED'::text, 'INVESTIGATING'::text, 'RESOLVED'::text, 'CLOSED'::text])))`

## health_records

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| record_type | text | NO |
| record_date | date | YES |
| source_type | text | NO |
| storage_path | text | NO |
| original_filename | text | NO |
| mime_type | text | YES |
| verification_status | text | NO |
| verified_by | uuid | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((verification_status = ANY (ARRAY['UNVERIFIED'::text, 'VERIFIED'::text, 'REJECTED'::text])))`

## hospital_admissions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| patient_id | uuid | NO |
| encounter_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| bed_id | uuid | NO |
| status | text | NO |
| reason | text | NO |
| request_key | uuid | NO |
| admitted_at | timestamptz | NO |
| discharged_at | timestamptz | YES |
| discharge_summary | text | YES |
| discharged_by | uuid | YES |

Recorded constraints: `CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 2000)))`; `CHECK ((status = ANY (ARRAY['ADMITTED'::text, 'DISCHARGED'::text])))`

## hospital_beds

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| department_id | uuid | YES |
| ward | text | NO |
| label | text | NO |
| state | text | NO |
| updated_at | timestamptz | NO |
| updated_by | uuid | YES |

Recorded constraints: `CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 100)))`; `CHECK ((state = ANY (ARRAY['AVAILABLE'::text, 'OCCUPIED'::text, 'CLEANING'::text, 'MAINTENANCE'::text])))`; `CHECK (((length(TRIM(BOTH FROM ward)) >= 1) AND (length(TRIM(BOTH FROM ward)) <= 100)))`

## hospital_duties

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| user_id | uuid | NO |
| starts_at | timestamptz | NO |
| ends_at | timestamptz | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((ends_at > starts_at) AND (ends_at <= (starts_at + '24:00:00'::interval))))`

## hospital_procedure_bookings

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| room_id | uuid | NO |
| admission_id | uuid | NO |
| lab_order_id | uuid | NO |
| clinician_user_id | uuid | NO |
| starts_at | timestamptz | NO |
| ends_at | timestamptz | NO |
| state | text | NO |
| request_key | uuid | NO |
| cancellation_reason | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((ends_at > starts_at) AND (ends_at <= (starts_at + '12:00:00'::interval))))`; `CHECK ((state = ANY (ARRAY['SCHEDULED'::text, 'CANCELLED'::text])))`

## hospital_procedure_rooms

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| name | text | NO |
| active | bool | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## hospital_store_items

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| item_code | text | NO |
| name | text | NO |
| unit | text | NO |
| quantity | int4 | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((quantity >= 0))`

## hospital_store_movements

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| item_id | uuid | NO |
| quantity_delta | int4 | NO |
| reason | text | NO |
| source_reference | text | NO |
| admission_id | uuid | YES |
| request_key | uuid | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((quantity_delta <> 0))`

## insurance_policies

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| insurer_name | text | NO |
| policy_number | text | NO |
| valid_from | date | YES |
| valid_to | date | YES |
| sum_insured | numeric | YES |
| source_type | text | NO |
| verification_status | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## integration_observations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| integration_id | uuid | NO |
| config_revision | int4 | NO |
| auth_state | text | NO |
| health | text | NO |
| error_code | text | YES |
| observed_at | timestamptz | NO |
| valid_until | timestamptz | NO |
| source_reference | text | NO |
| event_key | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((auth_state = ANY (ARRAY['CONFIGURATION_REQUIRED'::text, 'CONFIGURED'::text, 'EXPIRED'::text, 'REVOKED'::text])))`; `CHECK ((health = ANY (ARRAY['OK'::text, 'DEGRADED'::text, 'DOWN'::text, 'UNKNOWN'::text])))`

## integration_sync_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| run_id | uuid | NO |
| state | text | NO |
| event_key | text | NO |
| source_reference | text | NO |
| processed_count | int4 | YES |
| error_code | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((processed_count >= 0))`

## integration_sync_runs

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| integration_id | uuid | NO |
| config_revision | int4 | NO |
| state | text | NO |
| request_key | uuid | NO |
| requested_by | uuid | NO |
| created_at | timestamptz | NO |
| started_at | timestamptz | YES |
| completed_at | timestamptz | YES |
| retry_of | uuid | YES |
| retry_count | int4 | NO |
| failure_class | text | YES |
| next_retry_at | timestamptz | YES |

Recorded constraints: `CHECK ((failure_class = ANY (ARRAY['TRANSIENT'::text, 'TERMINAL'::text])))`; `CHECK (((retry_count >= 0) AND (retry_count <= 3)))`; `CHECK ((state = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'CANCELLED'::text])))`

## lab_machine_health

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| machine_id | uuid | NO |
| state | text | NO |
| observed_at | timestamptz | NO |
| valid_until | timestamptz | NO |
| source_reference | text | NO |
| event_key | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['CONNECTED'::text, 'DISCONNECTED'::text, 'ERROR'::text, 'UNKNOWN'::text])))`

## lab_machine_integrations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_provider_id | uuid | NO |
| machine_name | text | NO |
| manufacturer | text | YES |
| model | text | YES |
| protocol | text | NO |
| active | bool | NO |
| created_at | timestamptz | NO |
| registration_request | uuid | YES |

Recorded constraints: `CHECK ((protocol = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])))`

## lab_machine_payloads

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_order_id | uuid | NO |
| machine_integration_id | uuid | YES |
| source_type | text | NO |
| raw_payload | jsonb | NO |
| received_at | timestamptz | NO |

Recorded constraints: `CHECK ((source_type = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])))`

## lab_observations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_order_id | uuid | NO |
| parameter_id | uuid | YES |
| parameter_code | text | NO |
| parameter_name | text | NO |
| raw_value | text | YES |
| numeric_value | numeric | YES |
| text_value | text | YES |
| unit | text | YES |
| reference_range | text | YES |
| flag | text | NO |
| source_type | text | NO |
| machine_payload_id | uuid | YES |
| verified | bool | NO |
| verified_by | uuid | YES |
| verified_at | timestamptz | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((flag = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'ABNORMAL'::text, 'UNKNOWN'::text])))`; `CHECK ((source_type = ANY (ARRAY['MANUAL'::text, 'CSV'::text, 'JSON'::text, 'API'::text, 'HL7'::text, 'ASTM'::text])))`

## lab_orders

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| lab_provider_id | uuid | YES |
| test_name | text | NO |
| clinical_note | text | YES |
| status | text | NO |
| ordered_at | timestamptz | NO |
| appointment_id | uuid | YES |
| encounter_id | uuid | YES |
| diagnostic_test_id | uuid | YES |
| collection_centre_id | uuid | YES |
| routing_mode | text | YES |
| routing_status | text | YES |
| patient_selected_lab | bool | NO |
| destination_facility_id | uuid | YES |
| workflow_kind | text | YES |

Recorded constraints: `CHECK ((workflow_kind = ANY (ARRAY['PATHOLOGY'::text, 'IMAGING'::text, 'PROCEDURE'::text])))`

## lab_quality_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| machine_id | uuid | NO |
| control_reference | text | NO |
| assessment | text | NO |
| observed_values | jsonb | NO |
| review_note | text | NO |
| recorded_by | uuid | NO |
| request_key | uuid | NO |
| observed_at | timestamptz | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((assessment = ANY (ARRAY['PASS'::text, 'FAIL'::text, 'UNKNOWN'::text])))`

## lab_recollections

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| rejected_order_id | uuid | NO |
| replacement_order_id | uuid | NO |
| reason | text | NO |
| ordered_by | uuid | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## lab_results

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_order_id | uuid | NO |
| entered_by_lab_provider_id | uuid | YES |
| result_json | jsonb | YES |
| report_storage_path | text | YES |
| status | text | NO |
| created_at | timestamptz | NO |
| verified_at | timestamptz | YES |
| doctor_reviewed_at | timestamptz | YES |
| doctor_reviewed_by | uuid | YES |
| ai_summary | jsonb | YES |

Recorded constraints: No column-state CHECK constraint.

## lab_specimens

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| sample_code | text | NO |
| lab_order_id | uuid | NO |
| collection_centre_id | uuid | YES |
| processing_lab_provider_id | uuid | YES |
| specimen_type | text | YES |
| status | text | NO |
| collected_at | timestamptz | YES |
| packed_at | timestamptz | YES |
| dispatched_at | timestamptz | YES |
| received_at | timestamptz | YES |
| processing_started_at | timestamptz | YES |
| completed_at | timestamptz | YES |
| rejection_reason | text | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['COLLECTION_PENDING'::text, 'COLLECTED'::text, 'PACKED'::text, 'IN_TRANSIT'::text, 'RECEIVED_AT_LAB'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'CANCELLED'::text])))`

## lab_test_capabilities

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| lab_provider_id | uuid | NO |
| diagnostic_test_id | uuid | NO |
| active | bool | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## master_import_batches

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| kind | text | NO |
| source_name | text | NO |
| source_version | text | NO |
| source_reference | text | NO |
| assurance | text | NO |
| effective_date | date | NO |
| content | jsonb | NO |
| request_key | uuid | NO |
| enabled | bool | NO |
| created_by | uuid | NO |
| created_at | timestamptz | NO |
| disabled_by | uuid | YES |
| disabled_at | timestamptz | YES |
| disabled_reason | text | YES |

Recorded constraints: `CHECK ((assurance = ANY (ARRAY['DEMO'::text, 'SOURCE_RECORDED'::text])))`; `CHECK ((kind = ANY (ARRAY['MEDICINE'::text, 'DIAGNOSTIC'::text])))`

## medicine_catalog

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| name | text | NO |
| strength | text | YES |
| dosage_form | text | YES |
| classification | text | NO |
| source_reference | text | NO |
| version | int4 | NO |
| approved_by | uuid | NO |
| approved_at | timestamptz | NO |

Recorded constraints: `CHECK ((classification = ANY (ARRAY['RX'::text, 'OTC'::text, 'UNKNOWN'::text])))`; `CHECK (((length(TRIM(BOTH FROM source_reference)) >= 3) AND (length(TRIM(BOTH FROM source_reference)) <= 1000)))`

## medicine_master

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| import_batch_id | uuid | NO |
| source_code | text | NO |
| generic_name | text | NO |
| brand_name | text | YES |
| composition | text | YES |
| strength | text | YES |
| dosage_form | text | YES |
| route | text | YES |
| pack_description | text | YES |
| manufacturer | text | YES |
| regulatory_classification | text | YES |
| nlem | bool | YES |
| jan_aushadhi_mapping | text | YES |
| aliases | _text | NO |
| active | bool | NO |
| updated_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## pathway_dispositions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| instance_id | uuid | NO |
| outcome | text | NO |
| reason | text | NO |
| source_id | uuid | YES |
| request_key | uuid | NO |
| actor_user_id | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## pathway_proof_receipts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| instance_id | uuid | NO |
| request_key | uuid | NO |
| proof_kind | text | NO |
| proof_id | uuid | NO |
| source_snapshot | jsonb | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## pathway_step_instances

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| activation_id | uuid | NO |
| step_id | uuid | NO |
| node_id | uuid | YES |
| closure_state | text | YES |
| closure_reason | text | YES |
| proof_kind | text | YES |
| proof_id | uuid | YES |
| closed_by | uuid | YES |
| closed_at | timestamptz | YES |

Recorded constraints: No column-state CHECK constraint.

## patient_consents

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| requester_provider_id | uuid | NO |
| requester_role | text | NO |
| purpose | text | NO |
| reason | text | NO |
| categories | _text | NO |
| records_from | timestamptz | YES |
| records_until | timestamptz | YES |
| valid_from | timestamptz | NO |
| expires_at | timestamptz | NO |
| status | text | NO |
| requested_at | timestamptz | NO |
| decided_at | timestamptz | YES |
| revoked_at | timestamptz | YES |

Recorded constraints: `CHECK (((cardinality(categories) > 0) AND (categories <@ ARRAY['ENCOUNTERS'::text, 'PRESCRIPTIONS'::text, 'DIAGNOSTICS'::text, 'DOCUMENTS'::text, 'TIMELINE'::text, 'FOLLOW_UPS'::text])))`; `CHECK ((expires_at > valid_from))`; `CHECK (((records_until IS NULL) OR (records_from IS NULL) OR (records_until >= records_from)))`; `CHECK ((purpose = ANY (ARRAY['TREATMENT'::text, 'AI_ASSISTANCE'::text])))`; `CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 1000)))`; `CHECK ((requester_role = 'DOCTOR'::text))`; `CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'GRANTED'::text, 'DENIED'::text, 'REVOKED'::text])))`

## patient_identity_candidates

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| alias_patient_id | uuid | NO |
| canonical_patient_id | uuid | NO |
| evidence_reference | text | NO |
| alias_fingerprint | text | NO |
| canonical_fingerprint | text | NO |
| alias_confirmed | bool | NO |
| canonical_confirmed | bool | NO |
| state | text | NO |
| created_by | uuid | NO |
| reviewed_by | uuid | YES |
| review_note | text | YES |
| request_key | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((alias_patient_id <> canonical_patient_id))`; `CHECK ((state = ANY (ARRAY['PROPOSED'::text, 'LINKED'::text, 'REJECTED'::text, 'UNLINKED'::text])))`

## patient_identity_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| candidate_id | uuid | NO |
| action | text | NO |
| note | text | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## patient_identity_links

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| candidate_id | uuid | NO |
| alias_patient_id | uuid | NO |
| canonical_patient_id | uuid | NO |
| active | bool | NO |
| linked_at | timestamptz | NO |
| unlinked_at | timestamptz | YES |

Recorded constraints: `CHECK ((alias_patient_id <> canonical_patient_id))`

## patient_profiles

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| user_id | uuid | NO |
| patient_code | text | NO |
| full_name | text | YES |
| date_of_birth | date | YES |
| sex | text | YES |
| phone | text | YES |
| city | text | YES |
| state | text | YES |
| preferred_language | text | YES |
| abha_number_masked | text | YES |
| abha_address | text | YES |
| abha_link_status | text | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| identity_source | text | YES |
| registry_verified | bool | YES |

Recorded constraints: `CHECK ((abha_link_status = ANY (ARRAY['NOT_LINKED'::text, 'VERIFICATION_PENDING'::text, 'VERIFIED'::text, 'DEMO'::text])))`

## payer_case_documents

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| case_id | uuid | NO |
| health_record_id | uuid | NO |
| added_by | uuid | NO |
| added_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## payer_case_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| case_id | uuid | NO |
| submission_version | int4 | NO |
| external_event_key | text | YES |
| event_type | text | NO |
| external_reference | text | YES |
| original_payload | jsonb | NO |
| actor_user_id | uuid | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## payer_cases

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| patient_id | uuid | NO |
| policy_id | uuid | NO |
| invoice_id | uuid | NO |
| kind | text | NO |
| requested_amount | numeric | NO |
| state | text | NO |
| consent_status | text | NO |
| consent_until | timestamptz | YES |
| submission_version | int4 | NO |
| approved_amount | numeric | YES |
| settled_amount | numeric | YES |
| decision_reason | text | YES |
| request_key | uuid | NO |
| created_by | uuid | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((consent_status = ANY (ARRAY['REQUESTED'::text, 'GRANTED'::text, 'REVOKED'::text])))`; `CHECK ((kind = ANY (ARRAY['PREAUTH'::text, 'CLAIM'::text])))`; `CHECK ((requested_amount > (0)::numeric))`; `CHECK ((state = ANY (ARRAY['DRAFT'::text, 'READY_FOR_EXTERNAL_SUBMISSION'::text, 'SUBMITTED'::text, 'MORE_INFORMATION'::text, 'APPROVED'::text, 'DENIED'::text, 'SETTLED'::text])))`

## pharmacy_deliveries

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| fulfilment_id | uuid | NO |
| patient_id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| mode | text | NO |
| delivery_address | text | YES |
| state | text | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| received_at | timestamptz | YES |

Recorded constraints: `CHECK ((mode = ANY (ARRAY['PICKUP'::text, 'DELIVERY'::text])))`; `CHECK ((state = ANY (ARRAY['REQUESTED'::text, 'ACCEPTED'::text, 'PREPARING'::text, 'READY'::text, 'DISPATCHED'::text, 'DELIVERY_REPORTED'::text, 'FAILED_ATTEMPT'::text, 'RECEIVED'::text, 'CANCELLED'::text, 'RETURNED_REVIEW_REQUIRED'::text])))`

## pharmacy_delivery_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| delivery_id | uuid | NO |
| action | text | NO |
| from_state | text | YES |
| to_state | text | NO |
| evidence | text | NO |
| request_key | uuid | NO |
| actor_user_id | uuid | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## pharmacy_inventory

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| medicine_name | text | NO |
| strength | text | YES |
| batch_number | text | YES |
| expiry_date | date | YES |
| quantity | int4 | NO |
| mrp | numeric | YES |
| selling_price | numeric | YES |
| updated_at | timestamptz | NO |
| receipt_key | uuid | YES |
| received_quantity | int4 | YES |
| medicine_catalog_id | uuid | YES |

Recorded constraints: `CHECK ((quantity >= 0))`; `CHECK ((received_quantity > 0))`

## pharmacy_purchase_lines

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| purchase_id | uuid | NO |
| medicine_catalog_id | uuid | NO |
| quantity_ordered | int4 | NO |
| unit_cost | numeric | NO |

Recorded constraints: `CHECK ((quantity_ordered > 0))`; `CHECK ((unit_cost >= (0)::numeric))`

## pharmacy_purchase_receipts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| purchase_line_id | uuid | NO |
| inventory_id | uuid | NO |
| quantity | int4 | NO |
| supplier_receipt_reference | text | NO |
| request_key | uuid | NO |
| request_payload | jsonb | NO |
| received_by | uuid | NO |
| received_at | timestamptz | NO |

Recorded constraints: `CHECK ((quantity > 0))`

## pharmacy_purchases

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| supplier_id | uuid | NO |
| supplier_order_reference | text | NO |
| status | text | NO |
| request_key | uuid | NO |
| request_payload | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['ORDERED'::text, 'PARTIALLY_RECEIVED'::text, 'RECEIVED'::text, 'CANCELLED'::text])))`

## pharmacy_reorder_levels

| Field | Database type | Nullable |
|---|---|---|
| inventory_id | uuid | NO |
| reorder_point | int4 | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((reorder_point >= 0))`

## pharmacy_returns

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| sale_item_id | uuid | NO |
| quantity | int4 | NO |
| reason | text | NO |
| request_key | uuid | NO |
| disposition | text | NO |
| refund_state | text | NO |
| recorded_by | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: `CHECK ((quantity > 0))`; `CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 2000)))`

## pharmacy_sale_items

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| sale_id | uuid | NO |
| inventory_id | uuid | NO |
| medicine_catalog_id | uuid | NO |
| medicine_name | text | NO |
| strength | text | YES |
| batch_number | text | YES |
| expiry_date | date | NO |
| quantity | int4 | NO |
| unit_price | numeric | NO |

Recorded constraints: `CHECK ((quantity > 0))`; `CHECK ((unit_price >= (0)::numeric))`

## pharmacy_sale_receipts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| sale_id | uuid | NO |
| request_key | uuid | NO |
| method | text | NO |
| reference | text | YES |
| amount | numeric | NO |
| recorded_by | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: `CHECK ((method = ANY (ARRAY['CASH'::text, 'CARD'::text, 'UPI'::text, 'BANK_TRANSFER'::text])))`

## pharmacy_sales

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| sale_kind | text | NO |
| total | numeric | NO |
| payment_state | text | NO |
| request_key | uuid | NO |
| request_payload | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((payment_state = ANY (ARRAY['UNPAID'::text, 'RECORDED'::text])))`; `CHECK ((sale_kind = 'OTC'::text))`; `CHECK ((total >= (0)::numeric))`

## pharmacy_stock_ledger

| Field | Database type | Nullable |
|---|---|---|
| id | int8 | NO |
| pharmacy_provider_id | uuid | NO |
| inventory_id | uuid | NO |
| quantity_delta | int4 | NO |
| quantity_after | int4 | NO |
| source_kind | text | NO |
| actor_user_id | uuid | YES |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## pharmacy_suppliers

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| name | text | NO |
| reference | text | NO |
| created_at | timestamptz | NO |
| active | bool | NO |

Recorded constraints: `CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 300)))`; `CHECK (((length(TRIM(BOTH FROM reference)) >= 1) AND (length(TRIM(BOTH FROM reference)) <= 300)))`

## platform_integrations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | YES |
| kind | text | NO |
| provider_name | text | NO |
| environment | text | NO |
| endpoint_origin | text | NO |
| config_ref | text | NO |
| enabled | bool | NO |
| revision | int4 | NO |
| created_by | uuid | NO |
| request_key | uuid | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((environment = ANY (ARRAY['SANDBOX'::text, 'PRODUCTION'::text])))`; `CHECK ((kind = ANY (ARRAY['ABDM_ABHA'::text, 'HPR_HFR'::text, 'HIS_HMIS'::text, 'LIS_RIS_PACS'::text, 'PHARMACY'::text, 'PAYER'::text, 'EMERGENCY'::text, 'VIDEO'::text, 'OCR'::text, 'AI'::text, 'COMMUNICATION'::text])))`

## prescription_fulfilments

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| prescription_id | uuid | NO |
| pharmacy_provider_id | uuid | NO |
| status | text | NO |
| requested_at | timestamptz | NO |
| completed_at | timestamptz | YES |

Recorded constraints: `CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'PARTIAL'::text, 'DISPENSED'::text])))`

## prescription_items

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| prescription_id | uuid | NO |
| medicine_name | text | NO |
| strength | text | YES |
| dose | text | YES |
| route | text | YES |
| frequency | text | YES |
| duration | text | YES |
| instructions | text | YES |
| quantity_prescribed | int4 | YES |

Recorded constraints: `CHECK ((quantity_prescribed > 0))`

## prescriptions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| appointment_id | uuid | YES |
| clinical_notes | text | YES |
| status | text | NO |
| issued_at | timestamptz | NO |
| encounter_id | uuid | YES |

Recorded constraints: `CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CANCELLED'::text, 'SUPERSEDED'::text, 'COMPLETED'::text])))`

## profiles

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| role | app_role | NO |
| full_name | text | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## provider_availability_overrides

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| provider_id | uuid | NO |
| practice_id | uuid | YES |
| starts_at | timestamptz | NO |
| ends_at | timestamptz | NO |
| availability_status | text | NO |
| reason | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((availability_status = ANY (ARRAY['AVAILABLE'::text, 'UNAVAILABLE'::text])))`; `CHECK ((ends_at > starts_at))`

## provider_practices

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| provider_id | uuid | NO |
| facility_id | uuid | YES |
| practice_name | text | NO |
| address_line | text | YES |
| city | text | YES |
| state | text | YES |
| postal_code | text | YES |
| latitude | float8 | YES |
| longitude | float8 | YES |
| phone | text | YES |
| consultation_mode | text | NO |
| active | bool | NO |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| timezone | text | NO |
| consultation_fee | numeric | YES |
| district | text | YES |

Recorded constraints: `CHECK (a2_valid_timezone(timezone))`; `CHECK (((consultation_fee >= (0)::numeric) AND ((consultation_fee)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))))`; `CHECK ((consultation_mode = ANY (ARRAY['PHYSICAL'::text, 'TELECONSULT'::text, 'BOTH'::text])))`

## provider_profiles

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| user_id | uuid | NO |
| provider_type | app_role | NO |
| full_name | text | NO |
| registration_id | text | YES |
| specialization | text | YES |
| organization_name | text | YES |
| verification_status | verification_status | NO |
| verification_notes | text | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |
| hpr_id | text | YES |
| city | text | YES |
| state | text | YES |
| latitude | float8 | YES |
| longitude | float8 | YES |
| identity_source | text | YES |
| registry_verified | bool | YES |
| phone | text | YES |

Recorded constraints: `CHECK ((provider_type = ANY (ARRAY['DOCTOR'::app_role, 'LAB'::app_role, 'PHARMACY'::app_role, 'WORKER'::app_role, 'FACILITY'::app_role])))`

## provider_schedules

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| provider_id | uuid | NO |
| practice_id | uuid | NO |
| day_of_week | int4 | NO |
| start_time | time | NO |
| end_time | time | NO |
| slot_minutes | int4 | NO |
| active | bool | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))`; `CHECK (((slot_minutes >= 5) AND (slot_minutes <= 240)))`; `CHECK ((end_time > start_time))`

## reception_queue

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| facility_id | uuid | NO |
| appointment_id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| department_id | uuid | YES |
| service_date | date | NO |
| token_number | int4 | NO |
| state | text | NO |
| request_key | uuid | NO |
| checked_in_by | uuid | NO |
| checked_in_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((state = ANY (ARRAY['CHECKED_IN'::text, 'WAITING'::text, 'CALLED'::text, 'SKIPPED'::text, 'IN_CONSULTATION'::text, 'COMPLETED'::text, 'CANCELLED'::text])))`

## referral_actions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| referral_id | uuid | NO |
| request_key | uuid | NO |
| from_state | text | YES |
| to_state | text | NO |
| payload | jsonb | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## retention_policy_versions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| record_class | text | NO |
| version | int4 | NO |
| retention_days | int4 | NO |
| policy_reference | text | NO |
| created_by | uuid | NO |
| approved_by | uuid | YES |
| approved_at | timestamptz | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK (((retention_days >= 1) AND (retention_days <= 36500)))`

## sample_custody_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| specimen_id | uuid | NO |
| event_type | text | NO |
| from_location_type | text | YES |
| from_location_id | uuid | YES |
| to_location_type | text | YES |
| to_location_id | uuid | YES |
| actor_user_id | uuid | YES |
| notes | text | YES |
| metadata | jsonb | NO |
| occurred_at | timestamptz | NO |

Recorded constraints: `CHECK ((event_type = ANY (ARRAY['CREATED'::text, 'COLLECTED'::text, 'PACKED'::text, 'HANDOVER'::text, 'DISPATCHED'::text, 'IN_TRANSIT'::text, 'RECEIVED'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'PROCESSING_STARTED'::text, 'PROCESSING_COMPLETED'::text, 'OTHER'::text])))`

## sample_transports

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| specimen_id | uuid | NO |
| status | text | NO |
| transporter_name | text | YES |
| vehicle_reference | text | YES |
| pickup_at | timestamptz | YES |
| delivered_at | timestamptz | YES |
| notes | text | YES |
| created_at | timestamptz | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['PENDING'::text, 'ASSIGNED'::text, 'PICKED_UP'::text, 'IN_TRANSIT'::text, 'DELIVERED'::text, 'FAILED'::text, 'CANCELLED'::text])))`

## teleconsult_events

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| session_id | uuid | NO |
| participant_id | uuid | YES |
| event_type | text | NO |
| actor_user_id | uuid | YES |
| provider_reference | text | YES |
| event_key | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## teleconsult_join_intents

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| session_id | uuid | NO |
| participant_id | uuid | NO |
| requested_by | uuid | NO |
| request_key | uuid | NO |
| expires_at | timestamptz | NO |
| state | text | NO |
| provider_reference | text | YES |
| created_at | timestamptz | NO |
| issued_at | timestamptz | YES |

Recorded constraints: `CHECK ((state = ANY (ARRAY['PENDING'::text, 'ISSUED'::text])))`

## teleconsult_participants

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| session_id | uuid | NO |
| user_id | uuid | NO |
| participant_role | text | NO |
| state | text | NO |
| joined_at | timestamptz | YES |
| left_at | timestamptz | YES |

Recorded constraints: `CHECK ((participant_role = ANY (ARRAY['PATIENT'::text, 'DOCTOR'::text])))`; `CHECK ((state = ANY (ARRAY['WAITING'::text, 'JOINED'::text, 'LEFT'::text])))`

## teleconsult_routes

| Field | Database type | Nullable |
|---|---|---|
| scope_key | text | NO |
| facility_id | uuid | YES |
| integration_id | uuid | NO |
| updated_by | uuid | NO |
| updated_at | timestamptz | NO |

Recorded constraints: `CHECK ((scope_key = COALESCE((facility_id)::text, 'PLATFORM'::text)))`

## teleconsult_sessions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| appointment_id | uuid | NO |
| patient_id | uuid | NO |
| doctor_provider_id | uuid | NO |
| integration_id | uuid | YES |
| integration_revision | int4 | YES |
| external_room_reference | text | YES |
| state | text | NO |
| provider_state | text | NO |
| join_from | timestamptz | NO |
| expires_at | timestamptz | NO |
| recording_enabled | bool | NO |
| created_at | timestamptz | NO |
| started_at | timestamptz | YES |
| ended_at | timestamptz | YES |

Recorded constraints: `CHECK ((provider_state = ANY (ARRAY['UNCONFIGURED'::text, 'AVAILABLE'::text, 'DEGRADED'::text, 'FAILED'::text])))`; `CHECK ((NOT recording_enabled))`; `CHECK ((state = ANY (ARRAY['UNCONFIGURED'::text, 'WAITING'::text, 'ACTIVE'::text, 'ENDING'::text, 'ENDED'::text, 'FAILED'::text])))`

## verification_documents

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| provider_id | uuid | NO |
| submitted_by | uuid | NO |
| request_key | uuid | NO |
| document_kind | text | NO |
| reference | text | NO |
| sha256 | text | YES |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((document_kind = ANY (ARRAY['REGISTRATION'::text, 'QUALIFICATION'::text, 'LICENSE'::text, 'OTHER'::text])))`; `CHECK (((length(reference) >= 3) AND (length(reference) <= 1000)))`; `CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text))`

## verification_reviews

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| provider_id | uuid | NO |
| request_key | uuid | NO |
| reviewer_id | uuid | YES |
| from_status | text | NO |
| to_status | text | NO |
| reason | text | NO |
| notes | text | YES |
| facility_states | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((length(notes) <= 4000))`; `CHECK (((length(reason) >= 3) AND (length(reason) <= 2000)))`

## worker_area_assignments

| Field | Database type | Nullable |
|---|---|---|
| worker_provider_id | uuid | NO |
| area_id | uuid | NO |
| active | bool | NO |
| assigned_by | uuid | NO |
| updated_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## worker_areas

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| area_code | text | NO |
| name | text | NO |
| district | text | NO |
| state | text | NO |
| source_reference | text | NO |
| created_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.

## worker_assistance_records

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| task_id | uuid | NO |
| source_kind | text | NO |
| source_id | uuid | NO |
| note | text | NO |
| sync_receipt_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((source_kind = ANY (ARRAY['TEST_ASSISTANCE'::text, 'SAMPLE_LOGISTICS'::text, 'MEDICINE_REFILL_REQUEST'::text, 'ESCALATION'::text])))`

## worker_conflict_resolutions

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| original_receipt_id | uuid | NO |
| replacement_receipt_id | uuid | YES |
| resolution | text | NO |
| request_key | uuid | NO |
| actor_user_id | uuid | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((resolution = ANY (ARRAY['RETRIED_ACCEPTED'::text, 'RETRY_CONFLICT'::text, 'RETRY_REJECTED'::text, 'DISCARDED'::text])))`

## worker_delegations

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| task_id | uuid | NO |
| patient_id | uuid | NO |
| worker_provider_id | uuid | NO |
| actions | _text | NO |
| status | text | NO |
| valid_until | timestamptz | NO |
| granted_by | uuid | NO |
| created_at | timestamptz | NO |
| revoked_at | timestamptz | YES |

Recorded constraints: `CHECK (((cardinality(actions) > 0) AND (actions <@ ARRAY['BOOK_APPOINTMENT'::text, 'REPORT_OUTCOME'::text])))`; `CHECK ((status = ANY (ARRAY['GRANTED'::text, 'REVOKED'::text])))`

## worker_sync_receipts

| Field | Database type | Nullable |
|---|---|---|
| id | uuid | NO |
| worker_provider_id | uuid | NO |
| patient_id | uuid | NO |
| task_id | uuid | NO |
| delegation_id | uuid | NO |
| authorization_method | text | NO |
| purpose | text | NO |
| request_key | uuid | NO |
| request_payload | jsonb | NO |
| status | text | NO |
| result | jsonb | NO |
| created_at | timestamptz | NO |

Recorded constraints: `CHECK ((status = ANY (ARRAY['ACCEPTED'::text, 'CONFLICT'::text, 'REJECTED'::text])))`

## worker_task_areas

| Field | Database type | Nullable |
|---|---|---|
| task_id | uuid | NO |
| area_id | uuid | NO |
| recorded_by | uuid | NO |
| recorded_at | timestamptz | NO |

Recorded constraints: No column-state CHECK constraint.
