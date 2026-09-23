import assert from 'node:assert/strict';
import { selectionRequest } from '../supabase/functions/_shared/selection-privacy.mjs';
import { intentRoute, orchestrateRole } from '../supabase/functions/_shared/role-ai.mjs';
import { clinicalSnapshot, relevantFacts, emptyRelevant } from '../supabase/functions/_shared/question-facts.mjs';
import { humanEvidence, isDisplayAnswer } from '../supabase/functions/_shared/answer-presentation.mjs';

console.log('--- STARTING FOCUSED APPOINTMENT, DIAGNOSIS, SNAPSHOT & RELEVANCE TESTS ---');

// 1. Appointment routing tests
const appointmentQueries = [
  'meri agli appointment kab aur kiske saath hai',
  'agli appointment kab hai',
  'doctor se agli meeting kab scheduled hai',
  'mera agla checkup kab hai',
  'when is my next consultation with the doctor',
  'upcoming appointment schedule',
  'doctor ko kab dikhana hai',
  'अगली अपॉइंटमेंट कब है?'
];

for (const q of appointmentQueries) {
  const req = selectionRequest({ question: q });
  assert.equal(req.intent, 'APPOINTMENT_HELP', `Failed intent for query: ${q}`);
  const route = intentRoute(q, 'get_patient_snapshot', { patient_id: 'p1' });
  assert.equal(route.tool, 'get_appointments', `Failed tool for query: ${q}`);
}
console.log('PASS: All appointment query paraphrases route to APPOINTMENT_HELP -> get_appointments');

// 2. Diagnosis routing & non-inference tests
const diagnosisQueries = [
  'mereko konsi bimari chl rahi hai',
  'kya mujhe koi bimari hai',
  'meri bimari kya hai',
  'konsi bimari documented hai',
  'what disease do I have',
  'which condition am I diagnosed with',
  'do I have any diagnosed disease',
  'मुझे कौन सी बीमारी है?'
];

for (const q of diagnosisQueries) {
  const req = selectionRequest({ question: q });
  assert.equal(req.intent, 'DIAGNOSIS', `Failed intent for query: ${q}`);
  const route = intentRoute(q, 'get_patient_snapshot', { patient_id: 'p1' });
  assert.equal(route.tool, 'get_patient_snapshot', `Failed tool for query: ${q}`);
}
console.log('PASS: All diagnosis query paraphrases route to DIAGNOSIS -> get_patient_snapshot');

// 3. Strict non-inference: Metformin + HbA1c + Telmisartan must NEVER produce a diagnosed disease if none documented
const contextOnlyMedsLabs = {
  tool: 'get_patient_snapshot',
  scope: { patient_id: 'p1' },
  actor_role: 'PATIENT',
  purpose: 'AI_ASSISTANCE',
  data: [{
    encounters: [{ id: 'e1', started_at: '2026-09-20', diagnosis: null, diagnosis_status: null }],
    prescriptions: [
      { id: 'rx1', issued_at: '2026-09-20', status: 'ACTIVE', items: [{ medicine_name: 'Metformin', strength: '500 mg' }, { medicine_name: 'Telmisartan', strength: '40 mg' }] }
    ],
    diagnostics: [
      { id: 'd1', ordered_at: '2026-09-20', test_name: 'HbA1c', result: { status: 'COMPLETED', verified_at: '2026-09-20', result_json: { value: 8.4, unit: '%' } } }
    ]
  }]
};

const factsNoDiag = relevantFacts(contextOnlyMedsLabs, 'DIAGNOSIS', 'mereko konsi bimari chl rahi hai');
assert.equal(factsNoDiag.length, 0, 'Must not extract diagnosis when encounter has no diagnosis');

const resNoDiag = await orchestrateRole({
  tool: 'get_patient_snapshot',
  scope: { patient_id: 'p1' },
  question: 'mereko konsi bimari chl rahi hai',
  readTool: async () => contextOnlyMedsLabs,
  config: { provider: 'deterministic' }
});

assert.match(resNoDiag.answer.text, /koi confirmed current diagnosis documented nahi hai|No confirmed current diagnosis/i);
assert.doesNotMatch(resNoDiag.answer.text, /Metformin|Telmisartan|Diabetes|Hypertension|HbA1c/i);
console.log('PASS: Strict non-inference verified — medicines & abnormal labs never infer a disease diagnosis');

// 4. Documented diagnosis is returned cleanly when recorded
const contextWithDocDiag = {
  tool: 'get_patient_snapshot',
  scope: { patient_id: 'p1' },
  actor_role: 'PATIENT',
  purpose: 'AI_ASSISTANCE',
  data: [{
    encounters: [{ id: 'e1', started_at: '2026-09-20', diagnosis: 'Type 2 Diabetes Mellitus', diagnosis_status: 'ACTIVE' }],
    prescriptions: [],
    diagnostics: []
  }]
};

const resWithDiag = await orchestrateRole({
  tool: 'get_patient_snapshot',
  scope: { patient_id: 'p1' },
  question: 'mereko konsi bimari chl rahi hai',
  readTool: async () => contextWithDocDiag,
  config: { provider: 'deterministic' }
});

assert.match(resWithDiag.answer.text, /Type 2 Diabetes Mellitus/);
console.log('PASS: Confirmed documented diagnosis surfaced correctly');

// 5. Question-specific fact selection
// Medicine question extracts ONLY medicines
const medFacts = relevantFacts({
  data: [{
    id: 'rx1',
    status: 'ACTIVE',
    items: [{ medicine_name: 'Paracetamol', strength: '650 mg', dose: '1 tablet', frequency: 'SOS' }]
  }]
}, 'MEDICINE_HISTORY', 'abhi meri konsi dawaiyan chl rahi hai');
assert.equal(medFacts.length, 1);
assert.equal(medFacts[0].kind, 'Prescription');

// Appointment question extracts ONLY appointments
const apptFacts = relevantFacts({
  data: [{
    id: 'apt1',
    scheduled_at: '2026-09-25T11:00:00Z',
    doctor_name: 'Dr. Princy Tolani',
    facility_name: 'Lifeline Clinic',
    status: 'CONFIRMED'
  }]
}, 'APPOINTMENT_HELP', 'meri agli appointment kab hai');
assert.equal(apptFacts.length, 1);
assert.equal(apptFacts[0].kind, 'Appointment');
const formattedAppt = humanEvidence(apptFacts[0]);
assert.match(formattedAppt, /Appointment on 2026-09-25T11:00:00Z with Dr. Princy Tolani at Lifeline Clinic \(confirmed\)/);
console.log('PASS: Question-specific fact selection isolates medicines and appointments');

// 6. Clinical snapshot structured formatting & noise suppression
const sampleCtx = {
  prescriptions: [
    { id: 'rx1', status: 'ACTIVE', items: [{ medicine_name: 'Metformin', strength: '500 mg', dose: '1 tablet', frequency: 'twice daily' }] }
  ],
  diagnostics: [
    { id: 'd1', test_name: 'HbA1c', result: { status: 'COMPLETED', verified_at: '2026-09-20', result_json: { observations: [{ parameter_name: 'HbA1c', raw_value: '7.1', unit: '%', flag: 'High' }] } } },
    { id: 'd2', test_name: 'Fasting glucose', result: { status: 'COMPLETED', verified_at: '2026-09-20', result_json: { value: 142, unit: 'mg/dL', flag: 'High' } } },
    { id: 'd3', test_name: 'Total cholesterol', result: { status: 'COMPLETED', verified_at: '2026-09-20', result_json: { value: 210, unit: 'mg/dL' } } }
  ],
  encounters: [
    { id: 'e1', started_at: '2026-09-20', chief_complaint: 'Routine follow-up', diagnosis: null }
  ],
  care_gaps: [
    { id: 'g1', gap_type: 'REPORT_REVIEW', status: 'OPEN', due_at: '2026-09-25' }
  ]
};

const snap = clinicalSnapshot(sampleCtx, 'English');
assert.match(snap.text, /CLINICAL SNAPSHOT/);
assert.match(snap.text, /Active medicines/);
assert.match(snap.text, /Metformin 500 mg — 1 tablet; twice daily/);
assert.match(snap.text, /HbA1c — 7\.1 % \(High\)/);
assert.match(snap.text, /Fasting glucose — 142 mg\/dL \(High\)/);
assert.match(snap.text, /Total cholesterol — 210 mg\/dL/);
assert.match(snap.text, /No confirmed diagnosis documented/);
assert.match(snap.text, /report review/);
assert.match(snap.text, /due 2026-09-25/);
// Must NOT contain repeated "Not documented" noise or raw JSON
assert.doesNotMatch(snap.text, /Status: IN_PROGRESS/);
assert.doesNotMatch(snap.text, /Complaint: Not documented/);
assert.doesNotMatch(snap.text, /Symptoms: Not documented/);
assert.doesNotMatch(snap.text, /Recorded diagnosis: Not documented/);
assert.doesNotMatch(snap.text, /strength: Not documented/);
assert.doesNotMatch(snap.text, /\{"observations"/);
assert.ok(isDisplayAnswer(snap.text), 'Clinical snapshot text must be valid display answer');
console.log('PASS: Doctor Clinical Snapshot renders structured sections without missing-field noise or raw JSON');

console.log('--- ALL 6 CORE CORRECTNESS SUITES PASSED ---');
