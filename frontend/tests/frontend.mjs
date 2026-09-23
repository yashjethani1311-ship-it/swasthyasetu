import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Helper to transpile TypeScript files on the fly
function transpile(filePath) {
  const code = fs.readFileSync(new URL(filePath, import.meta.url), 'utf8');
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX
    }
  }).outputText;
}

let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log('PASS ' + name);
}

// 1. Test i18n coverage
const i18nSource = fs.readFileSync(new URL('../src/lib/i18n.tsx', import.meta.url), 'utf8');

test('bilingual dictionary contains required patient, doctor, and hospital nav keys', () => {
  const requiredKeys = [
    'dashboard',
    'appointments',
    'prescriptions',
    'medicines',
    'diagnostics',
    'doctors',
    'facilities',
    'encounter',
    'opdQueue',
    'commandCentre',
    'reception',
    'patients',
    'staff',
    'beds',
    'emergency',
    'billing'
  ];

  for (const key of requiredKeys) {
    assert.match(i18nSource, new RegExp(`${key}:`), `Missing key ${key} in i18n translations`);
  }
});

test('prescriptions and medicines are distinct concepts in navigation and routing', () => {
  // Verify that medicines and prescriptions have distinct labels in both English and Hindi
  assert.match(i18nSource, /medicines:\s*['"]My Medicines['"]/);
  assert.match(i18nSource, /prescriptions:\s*['"]Prescriptions['"]/);
  assert.match(i18nSource, /medicines:\s*['"]मेरी दवाइयाँ['"]/);
  assert.match(i18nSource, /prescriptions:\s*['"]डॉक्टर की पर्ची['"]/);
});

// 2. Test Shell definitions and distinct layouts
const patientShellSource = fs.readFileSync(new URL('../src/components/shells/PatientShell.tsx', import.meta.url), 'utf8');
const doctorShellSource = fs.readFileSync(new URL('../src/components/shells/DoctorShell.tsx', import.meta.url), 'utf8');
const hospitalShellSource = fs.readFileSync(new URL('../src/components/shells/HospitalShell.tsx', import.meta.url), 'utf8');

test('role shells are dedicated and structurally distinct', () => {
  // Patient shell has consumer bottom bar and voice audio reader
  assert.match(patientShellSource, /Patient/);
  assert.match(patientShellSource, /listenCurrentPage/);
  assert.match(patientShellSource, /lg:hidden fixed bottom-0/);

  // Doctor shell has clinical workstation header, credentials badge and OPD quick shortcut
  assert.match(doctorShellSource, /Clinical Workstation/);
  assert.match(doctorShellSource, /specialization/);
  assert.match(doctorShellSource, /\/encounter/);

  // Hospital shell has enterprise HIS grouping and operational shift status
  assert.match(hospitalShellSource, /HIS \/ HMIS/);
  assert.match(hospitalShellSource, /hospitalNavGroups/);
  assert.match(hospitalShellSource, /Command & Front Desk/);
  assert.match(hospitalShellSource, /Clinical & Outpatient/);
  assert.match(hospitalShellSource, /Inpatient & Emergency/);
});

// 3. Test Truthful Empty States & Missing Backend Contracts
const hospitalBedsSource = fs.readFileSync(new URL('../src/pages/hospital/HospitalBedsPage.tsx', import.meta.url), 'utf8');
const hospitalModulesSource = fs.readFileSync(new URL('../src/pages/hospital/HospitalEnterpriseModulePage.tsx', import.meta.url), 'utf8');

test('hospital bed management binds the real h2_* admission contracts and invents no bed counts', () => {
  // Wired to the 014 admissions/beds contracts, not a placeholder schema
  assert.match(hospitalBedsSource, /h2_beds/);
  assert.match(hospitalBedsSource, /h2_admissions/);
  assert.match(hospitalBedsSource, /h2_admit/);
  assert.match(hospitalBedsSource, /h2_transfer/);
  assert.match(hospitalBedsSource, /h2_discharge/);
  // h2_admit is encounter-scoped (p_encounter) using real facility context
  assert.match(hospitalBedsSource, /p_encounter: encounterId/);
  assert.match(hospitalBedsSource, /p_facility: facilityId/);
  assert.match(hospitalBedsSource, /loadEncounters/);
  // Idempotency request UUIDs are generated for the write RPCs
  assert.match(hospitalBedsSource, /p_request: reqId\(\)/);
  // Unavailable backend degrades truthfully; no fabricated bed counts
  assert.match(hospitalBedsSource, /No bed counts are invented/);
  assert.doesNotMatch(hospitalBedsSource, /totalBeds:\s*\d+/);
});

test('hospital billing binds the real h3_* contracts, never bills an ENCOUNTER and never lists facility_invoices', () => {
  assert.match(hospitalModulesSource, /HospitalBillingPage/);
  const billingSource = fs.readFileSync(new URL('../src/pages/hospital/HospitalBillingPage.tsx', import.meta.url), 'utf8');
  // h3_invoice is DETAIL lookup only — the register is NOT a direct table listing
  assert.match(billingSource, /h3_invoice is DETAIL lookup only/);
  assert.doesNotMatch(billingSource, /from\('facility_invoices'\)/);
  // h3_issue supports ONLY APPOINTMENT / ADMISSION — never ENCOUNTER
  assert.match(billingSource, /h3_issue/);
  assert.match(billingSource, /p_source_kind: sourceKind/);
  assert.match(billingSource, /'APPOINTMENT' \| 'ADMISSION'/);
  assert.doesNotMatch(billingSource, /ENCOUNTER/);
  // Invoice lines use the exact shape { description, quantity, unit_price, tax_rate }
  assert.match(billingSource, /description: l\.description\.trim\(\)/);
  assert.match(billingSource, /quantity: Number\(l\.quantity\)/);
  assert.match(billingSource, /unit_price: Number\(l\.unit_price\)/);
  assert.match(billingSource, /tax_rate:/);
  assert.doesNotMatch(billingSource, /\{ description: l\.description\.trim\(\), amount:/);
  assert.match(billingSource, /p_request: reqId\(\)/);
  // Payment uses p_method + p_reference; void requires p_reason
  assert.match(billingSource, /h3_record_payment/);
  assert.match(billingSource, /p_method: payMode/);
  assert.match(billingSource, /p_reference:/);
  assert.match(billingSource, /h3_void/);
  assert.match(billingSource, /p_reason: voidReason\.trim\(\)/);
  // No authorized list RPC → truthful backend-required state, no invented totals
  assert.match(billingSource, /No amounts are invented/);
  assert.match(billingSource, /authorized invoice-list RPC/);
  // No hardcoded fake invoice rows
  assert.doesNotMatch(billingSource, /const\s+invoices\s*=\s*\[\s*\{/);
});

test('emergency, billing, and referral modules document exact database contracts', () => {
  assert.match(hospitalModulesSource, /public\.emergency_admissions/);
  assert.match(hospitalModulesSource, /public\.billing_invoices/);
  assert.match(hospitalModulesSource, /public\.facility_referrals/);
  assert.match(hospitalModulesSource, /ABDM INTEGRATION CONTRACT/);
});

// 4. Test Doctor Encounter and Consultation Workstation
const encounterSource = fs.readFileSync(new URL('../src/pages/EncounterPage.tsx', import.meta.url), 'utf8');

test('clinical encounter workspace organizes data into snapshot, vitals, orders, and copilot', () => {
  assert.match(encounterSource, /c1_finish_encounter/);
  assert.match(encounterSource, /a2_start_encounter/);
  assert.match(encounterSource, /quantity_prescribed/);
  assert.match(encounterSource, /c1_care_context/);
  assert.match(encounterSource, /SwasthyaCopilot/);
  assert.match(encounterSource, /Allergy history: Not documented in registry/);
});

test('integer quantity validation is enforced before completing consultation', () => {
  assert.match(encounterSource, /Number\.isSafeInteger/);
  assert.match(encounterSource, /Number\(m\.quantity_prescribed\) <= 0/);
});

// 5. Test AI Copilot Grounding Contract
const copilotSource = fs.readFileSync(new URL('../src/components/SwasthyaCopilot.tsx', import.meta.url), 'utf8');

test('swasthya copilot enforces grounding and truthful unavailable fallback without fake answers', () => {
  assert.match(copilotSource, /functions.invoke\('role-ai'/);
  assert.match(copilotSource, /tool: 'get_patient_snapshot'/);
  assert.match(copilotSource, /scope: patientId \? \{ patient_id: patientId \} : \{\}/);
  assert.doesNotMatch(copilotSource, /const isDocDiscovery/);
  assert.match(copilotSource, /Grounding Only/);
  assert.match(copilotSource, /Never invents diagnoses or prescriptions/);
  // Must handle 503 / unconfigured model without fake hallucinated responses
  assert.match(copilotSource, /Unable to answer this request/);
});

// 6. Patient Health Records depth + truthful verification (no fabricated extraction)
const recordsSource = fs.readFileSync(new URL('../src/pages/RecordsPage.tsx', import.meta.url), 'utf8');

test('health records bind to real schema and never fake clinical verification or extraction', () => {
  // Uses the real storage bucket + signed URL for the original document
  assert.match(recordsSource, /health-records/);
  assert.match(recordsSource, /createSignedUrl/);
  // Surfaces the real verification_status values
  assert.match(recordsSource, /UNVERIFIED/);
  assert.match(recordsSource, /VERIFIED/);
  assert.match(recordsSource, /REJECTED/);
  // Uploaded is explicitly distinguished from clinically verified
  assert.match(recordsSource, /not clinically verified/);
  // Extraction/OCR is documented as a backend requirement, not invented
  assert.match(recordsSource, /no extraction columns/);
  // No hardcoded fake record rows
  assert.doesNotMatch(recordsSource, /const\s+records\s*=\s*\[\s*\{/);
});

// 7. Patient Insurance depth + eligibility is never invented
const insuranceSource = fs.readFileSync(new URL('../src/pages/InsurancePage.tsx', import.meta.url), 'utf8');

test('insurance page binds to real policies and never invents eligibility, preauth or claims', () => {
  assert.match(insuranceSource, /insurance_policies/);
  assert.match(insuranceSource, /valid_to/);
  assert.match(insuranceSource, /Eligibility is never invented/);
  // Future-ready sections document exact missing contracts
  assert.match(insuranceSource, /insurance_eligibility_checks/);
  assert.match(insuranceSource, /preauth_requests/);
  assert.match(insuranceSource, /insurance_claims/);
  // No hardcoded fake policy rows
  assert.doesNotMatch(insuranceSource, /const\s+rows\s*=\s*\[\s*\{/);
});

// 8. Route role-safety: patient-only insurance must not open for other roles
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('route safety gates patient-only insurance behind the PATIENT role', () => {
  const insuranceCase = appSource.slice(appSource.indexOf("case '/insurance'"), appSource.indexOf('break', appSource.indexOf("case '/insurance'")));
  assert.match(insuranceCase, /profile\.role === 'PATIENT'/);
  assert.match(insuranceCase, /Personal insurance and scheme records are only available in the patient workspace/);
});

// 9. Lab keeps pathology / imaging / procedure workflows distinct; unsupported views stay unavailable
const labSource = fs.readFileSync(new URL('../src/pages/LabWorkspacePage.tsx', import.meta.url), 'utf8');

test('lab separates specimen, imaging and procedure workflows without faking unsupported modules', () => {
  // Specimen/collection belongs to the pathology worklist
  assert.match(labSource, /id: "specimens"/);
  assert.match(labSource, /lab_specimens/);
  // 016 — imaging and procedures read the real diagnostic_studies workflow and
  // never reuse specimen/sample handling
  assert.match(labSource, /id: "imaging"[^\n]*icon: Image/);
  assert.match(labSource, /id: "procedures"[^\n]*icon: Stethoscope/);
  assert.match(labSource, /diagnostic_studies/);
  assert.match(labSource, /never reuse specimen\/sample handling/);
  // 017 — critical results are the r2_* lifecycle, not merely abnormal observations
  assert.match(labSource, /r2_worklist/);
  assert.match(labSource, /r2_transition/);
  // Supported quality operations are available; unsupported audit UI stays labelled.
  assert.match(labSource, /id: "quality"[^\n]*enabled: true/);
  assert.match(labSource, /view === "quality" && <QualityAndRecollectionView/);
  assert.match(labSource, /id: "audit"[^\n]*enabled: false/);
});

// 10. Patient doctor discovery: PERSON != PLACE != AVAILABILITY, no live GPS, real radius/schedule
const doctorsSource = fs.readFileSync(new URL('../src/pages/DoctorsPage.tsx', import.meta.url), 'utf8');

test('doctor discovery separates person/place/availability, uses radius and never fakes distance or GPS', () => {
  // Multiple practices per doctor grouped under the person
  assert.match(doctorsSource, /Practice locations & availability/);
  assert.match(doctorsSource, /byProvider/);
  // Radius options 2/5/10/25 km
  assert.match(doctorsSource, /2 km/);
  assert.match(doctorsSource, /25 km/);
  // Distance only from real coordinates; never faked
  assert.match(doctorsSource, /haversineKm/);
  assert.match(doctorsSource, /Distance unavailable/);
  // Doctor live GPS is never used; availability comes from the bounded RPC at booking
  assert.match(doctorsSource, /live GPS is never used/i);
  assert.match(doctorsSource, /a2_available_slots/);
  assert.match(doctorsSource, /Next known session/);
  // No hardcoded fake doctor rows
  assert.doesNotMatch(doctorsSource, /const\s+doctors\s*=\s*\[\s*\{/);
});

// 11. Facility discovery binds to the real schema (regression: removed non-existent columns)
const facilitiesSource = fs.readFileSync(new URL('../src/pages/FacilitiesPage.tsx', import.meta.url), 'utf8');

test('facility discovery binds to real facilities columns and documents missing capability backend', () => {
  assert.match(facilitiesSource, /address_text/);
  assert.match(facilitiesSource, /latitude/);
  assert.match(facilitiesSource, /registry_verified/);
  // These columns do not exist in the schema and must not be queried
  assert.doesNotMatch(facilitiesSource, /is_active/);
  assert.doesNotMatch(facilitiesSource, /\bpincode\b/);
  // Capability/beds/wait are truthful backend requirements
  assert.match(facilitiesSource, /no service, specialty, capability/);
});

// 12. Patient Emergency/SOS never claims dispatch or guaranteed capacity
const emergencySource = fs.readFileSync(new URL('../src/pages/EmergencyPage.tsx', import.meta.url), 'utf8');
const appSource2 = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('emergency page is truthful about dispatch/capacity and the route is patient-gated', () => {
  assert.match(emergencySource, /112/);
  assert.match(emergencySource, /14555/);
  assert.match(emergencySource, /does not dispatch or guarantee an ambulance/);
  assert.match(emergencySource, /emergency_requests/);
  assert.match(emergencySource, /never claims an ambulance, bed, ICU slot or facility is guaranteed/);
  const emergencyCase = appSource2.slice(appSource2.indexOf("case '/emergency'"), appSource2.indexOf('break', appSource2.indexOf("case '/emergency'")));
  assert.match(emergencyCase, /profile\.role === 'PATIENT'/);
});

// 13. Worker field app: no hardcoded fake metrics; binds real queue/outcome contracts
const workerSource = fs.readFileSync(new URL('../src/pages/WorkerPage.tsx', import.meta.url), 'utf8');

test('worker overview removes all hardcoded fake metrics and derives counts from real tasks', () => {
  // Fabricated demo metrics must be gone
  assert.doesNotMatch(workerSource, /18 active · 3 high risk/);
  assert.doesNotMatch(workerSource, /Bairiya cluster/);
  assert.doesNotMatch(workerSource, /3 samples to collect/);
  assert.doesNotMatch(workerSource, /4 refills due/);
  // Overview is bound to the real worker queue tasks
  assert.match(workerSource, /tasks: WorkerTask\[\]/);
  assert.match(workerSource, /new Set\(tasks\.map/);
  assert.match(workerSource, /never shown as invented numbers/);
  // Real backend bindings preserved
  assert.match(workerSource, /c1_worker_queue/);
  assert.match(workerSource, /c1_worker_outcome/);
});

// 14. Doctor diagnostic review: pending queue + explicit critical-result acknowledgement
const diagnosticsSource = fs.readFileSync(new URL('../src/pages/DiagnosticsPage.tsx', import.meta.url), 'utf8');
const diagServiceSource = fs.readFileSync(new URL('../src/lib/diagnostics/service.ts', import.meta.url), 'utf8');

test('doctor diagnostic review separates ordinary report review from the r2_* critical-result lifecycle', () => {
  assert.match(diagServiceSource, /ABNORMAL_FLAGS/);
  assert.match(diagServiceSource, /export function awaitingDoctorReview/);
  // Ordinary review queue
  assert.match(diagnosticsSource, /Reports awaiting your review/);
  assert.match(diagnosticsSource, /abnormalOf/);
  // 017 — true critical results come from r2_worklist and advance only via r2_transition
  assert.match(diagnosticsSource, /criticalWorklist/);
  assert.match(diagnosticsSource, /criticalTransition/);
  assert.match(diagnosticsSource, /Critical result worklist/);
  // The old mislabeled "Acknowledge critical result" / "Confirm acknowledgement" copy is gone
  assert.doesNotMatch(diagnosticsSource, /Acknowledge critical result/);
  assert.doesNotMatch(diagnosticsSource, /Confirm acknowledgement/);
  // Ordinary report review is the real backend call, never a fabricated success
  assert.match(diagnosticsSource, /p0_review_report/);
  // Explicitly clarifies that an abnormal value is not by itself a critical result
  assert.match(diagnosticsSource, /not by itself a critical result/);
  assert.match(diagnosticsSource, /does not interpret results or assign a diagnosis/);
});

// 15. Hospital reception never fabricates an OPD token / check-in success
const receptionSource = fs.readFileSync(new URL('../src/pages/hospital/HospitalReceptionPage.tsx', import.meta.url), 'utf8');

test('hospital reception binds the real h1_* queue/check-in contracts and never fakes token issuance', () => {
  assert.doesNotMatch(receptionSource, /OPD Token issued/);
  assert.match(receptionSource, /from\('appointments'\)/);
  // 013 — live queue, department setup and real server-minted check-in token
  assert.match(receptionSource, /h1_queue/);
  assert.match(receptionSource, /h1_setup/);
  assert.match(receptionSource, /h1_check_in/);
  assert.match(receptionSource, /h1_queue_transition/);
  // h1_my_token is PATIENT-ONLY — reception/hospital must never call it
  assert.doesNotMatch(receptionSource, /h1_my_token/);
  // h1_check_in returns the queue UUID; the token is read from the reloaded
  // h1_queue row's token_number, never fabricated from the check-in return
  assert.match(receptionSource, /p_department: department \|\| null/);
  assert.match(receptionSource, /const rows = await loadQueue\(\)/);
  assert.match(receptionSource, /token_number/);
  // Check-in is not blocked when no department is chosen (only facility required)
  assert.match(receptionSource, /if \(!facilityId\) return/);
  assert.doesNotMatch(receptionSource, /if \(!facilityId \|\| !department\) return/);
  // Degrades truthfully when the contract is unavailable; no invented tokens
  assert.match(receptionSource, /No tokens are invented/);
});

// 17. Pharmacy POS + purchasing bind the real p2_* / p3_* contracts (018/019)
const pharmacySource = fs.readFileSync(new URL('../src/pages/PharmacyPage.tsx', import.meta.url), 'utf8');

test('pharmacy POS and purchasing bind real p2_*/p3_* sale, ledger and purchase contracts', () => {
  assert.match(pharmacySource, /p2_search_medicines/);
  // p2_sale is LOOKUP only; counter sales are created via p2_otc_sale
  assert.match(pharmacySource, /p2_otc_sale/);
  assert.match(pharmacySource, /p2_sale is LOOKUP only/);
  assert.match(pharmacySource, /"p2_sale", \{ p_sale: sale\.id \}/);
  // p2_otc_sale items are EXACTLY { inventory_id, quantity } — never a catalog id,
  // medicine id or unit price for sale creation
  assert.match(pharmacySource, /inventory_id: b\.item\.id/);
  assert.match(pharmacySource, /inventory_id: b\.product\.id/);
  assert.doesNotMatch(pharmacySource, /\bcatalog_id:/);
  assert.doesNotMatch(pharmacySource, /\bmedicine_id:/);
  assert.doesNotMatch(pharmacySource, /\bunit_price:/);
  // Payment uses p_method + p_reference + p_request
  assert.match(pharmacySource, /p2_payment/);
  assert.match(pharmacySource, /p_method: payMode/);
  assert.match(pharmacySource, /p_reference:/);
  // Ledger uses the p_before bigint cursor, not p_offset
  assert.match(pharmacySource, /p2_ledger/);
  assert.match(pharmacySource, /p_before: null/);
  assert.doesNotMatch(pharmacySource, /p2_ledger", \{ p_offset/);
  // Returns are item-level (p_item + p_quantity)
  assert.match(pharmacySource, /p2_return/);
  assert.match(pharmacySource, /p_item: returnItemId/);
  assert.match(pharmacySource, /p_quantity: Number\(returnQty\)/);
  // Purchasing: supplier needs a NON-EMPTY reference; order lines use a real
  // medicine_catalog_id + unit_cost; receive is line-level
  assert.match(pharmacySource, /p3_supplier/);
  assert.match(pharmacySource, /p_reference: supplierReference\.trim\(\)/);
  assert.match(pharmacySource, /p3_order/);
  assert.match(pharmacySource, /p_supplier: orderSupplier/);
  assert.match(pharmacySource, /p_reference: orderReference\.trim\(\)/);
  assert.match(pharmacySource, /medicine_catalog_id: orderCatalogId/);
  assert.match(pharmacySource, /unit_cost: Number\(orderPrice\)/);
  assert.doesNotMatch(pharmacySource, /medicine_name: orderMedicine/);
  assert.match(pharmacySource, /p3_receive/);
  assert.match(pharmacySource, /p_line: receiveLine/);
  assert.match(pharmacySource, /p_selling_price:/);
  assert.match(pharmacySource, /p3_purchases/);
  // Insights are derived from the real ledger, never estimated
  assert.match(pharmacySource, /No figures are estimated/);
});

// 18. Worker offline sync + assisted directory bind the real w1_* contracts (020)
test('worker offline sync and assisted directory bind real w1_* delegation contracts', () => {
  // Sync is driven ONLY by the structurally parsed w1_package.
  assert.match(workerSource, /parsePackage/);
  assert.match(workerSource, /activeDelegation/);
  assert.match(workerSource, /w1_package/);
  // w1_sync uses the package's authoritative task/patient/version — never the
  // raw note fields, never a timestamp as the version.
  assert.match(workerSource, /w1_sync/);
  assert.match(workerSource, /p_task: pkg\.task_id/);
  assert.match(workerSource, /p_patient: pkg\.patient_id/);
  assert.match(workerSource, /p_version: pkg\.version/);
  assert.match(workerSource, /p_request: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(workerSource, /p_version:\s*Date/);
  assert.doesNotMatch(workerSource, /Date\.parse\(note/);
  // Only REPORT_OUTCOME / BOOK_APPOINTMENT are allowed; VISIT_NOTE is never sent.
  assert.match(workerSource, /p_action: "REPORT_OUTCOME"/);
  assert.doesNotMatch(workerSource, /p_action:\s*["']VISIT_NOTE["']/);
  // A real active delegation id is required — a null delegation is never synced.
  assert.match(workerSource, /p_delegation: del\.delegation_id/);
  assert.doesNotMatch(workerSource, /p_delegation:\s*null/);
  // Without a valid delegation the note is held with a truthful state, never a
  // false success.
  assert.match(workerSource, /Explicit patient delegation required/);
  assert.match(workerSource, /NOT reported as synced/);
  // Assisted directory is w1_patient_directory only — never c1_patient_directory.
  assert.match(workerSource, /w1_patient_directory/);
  assert.doesNotMatch(workerSource, /"c1_patient_directory"/);
});

// 16. Hospital HMIS routes degrade safely for non-facility/admin roles
test('hospital HMIS routes are gated to facility and admin roles', () => {
  assert.match(appSource, /route\.startsWith\('\/hospital\/'\)/);
  assert.match(appSource, /profile\.role !== 'FACILITY'/);
  assert.match(appSource, /restricted to authorised facility and administrator workspaces/);
});

// 19. Admin 038 Identity Resolution & Non-merge Truthfulness
const adminGovSource = fs.readFileSync(new URL('../src/pages/AdminGovernancePage.tsx', import.meta.url), 'utf8');

test('admin identity resolution binds 038 x1_* contracts and displays strict non-merge notice', () => {
  assert.match(adminGovSource, /x1_candidates/);
  assert.match(adminGovSource, /x1_propose/);
  assert.match(adminGovSource, /x1_link/);
  assert.match(adminGovSource, /x1_unlink/);
  assert.match(adminGovSource, /x1_identity/);
  // Enforce Indian health data sovereignty: Never merge clinical records into one mutated entity
  assert.match(adminGovSource, /Alias reference only/);
  assert.match(adminGovSource, /Source records, consent and access remain bound to original patient identity/);
  assert.match(adminGovSource, /No clinical history was moved or combined/);
});

// 20. Admin 039 Integration Registry & Health Monitoring
test('admin integration registry binds 039 x2_* contracts with state verification', () => {
  assert.match(adminGovSource, /x2_health/);
  assert.match(adminGovSource, /x2_enable/);
  assert.match(adminGovSource, /x2_sync/);
  assert.match(adminGovSource, /x2_register/);
  assert.match(adminGovSource, /STATUS_UNKNOWN_CONFIRMATION_REQUIRED/);
});

// 21. NMC-Compliant A4 Printable Prescription
const rxPrintSource = fs.readFileSync(new URL('../src/components/clinical/PrintablePrescription.tsx', import.meta.url), 'utf8');

test('printable prescription strictly enforces "No allergy documented" and standard NMC structure', () => {
  assert.match(rxPrintSource, /No allergy documented/);
  // Must NOT use the colloquial/misleading "No allergies"
  assert.doesNotMatch(rxPrintSource, /['"]No allergies['"]/);
  assert.match(rxPrintSource, /Digital signature verification not available/);
  assert.doesNotMatch(rxPrintSource, /Telemedicine Practice Guidelines, India|Information Technology Act, 2000|Digitally Signed & Verified/);
  assert.match(rxPrintSource, /genericName/);
  assert.match(rxPrintSource, /dosageForm/);
  assert.match(rxPrintSource, /investigationsAdvised/);
});

// 22. Governed Printable Diagnostic Report (Pathology vs Imaging vs Procedure separation)
const diagPrintSource = fs.readFileSync(new URL('../src/components/clinical/PrintableDiagnosticReport.tsx', import.meta.url), 'utf8');

test('printable diagnostic report separates pathology specimen from imaging and procedure templates', () => {
  assert.match(diagPrintSource, /PATHOLOGY/);
  assert.match(diagPrintSource, /IMAGING/);
  assert.match(diagPrintSource, /PROCEDURE/);
  assert.match(diagPrintSource, /referenceRange/);
  assert.match(diagPrintSource, /sampleCondition/);
  assert.match(diagPrintSource, /clinicalIndication/);
});

// 23. Scalable Formulary Master vs Physical Inventory
const medMasterSource = fs.readFileSync(new URL('../src/components/clinical/MedicineMasterPicker.tsx', import.meta.url), 'utf8');
const diagMasterSource = fs.readFileSync(new URL('../src/components/clinical/DiagnosticMasterPicker.tsx', import.meta.url), 'utf8');

test('master catalog pickers isolate national formulary and test masters from physical facility batches', () => {
  assert.match(medMasterSource, /INDIAN_MEDICINE_MASTER/);
  assert.match(medMasterSource, /schedule_class/);
  assert.match(diagMasterSource, /MASTER_DIAGNOSTIC_CATALOG/);
  assert.match(diagMasterSource, /PATHOLOGY/);
  assert.match(diagMasterSource, /IMAGING/);
  assert.match(diagMasterSource, /PROCEDURE/);
});

// 24. Lab 034 Quality Control & Specimen Recollection
test('lab workspace binds 034 quality worklist, calibration and specimen recollection', () => {
  assert.match(labSource, /r3_quality_worklist/);
  assert.match(labSource, /r3_quality/);
  assert.match(labSource, /r3_recollect/);
  assert.match(labSource, /r3_capability/);
});

// 25. Pharmacy 035 Delivery Transitions & CHW 036 Escalation Assistance
test('pharmacy delivery binds 035 p4_* state machine and worker binds 036 w2_assist', () => {
  assert.match(pharmacySource, /p4_deliveries/);
  assert.match(pharmacySource, /p4_transition/);
  assert.match(pharmacySource, /p4_request/);
  assert.match(pharmacySource, /Return never automatically restocks/);
  assert.match(workerSource, /w2_assist/);
  assert.match(workerSource, /SAMPLE_LOGISTICS/);
  assert.match(workerSource, /MEDICINE_REFILL_REQUEST/);
});

const identityCode = transpile('../src/lib/identity.ts');
const { identityLabel } = await import('data:text/javascript;base64,' + Buffer.from(identityCode).toString('base64'));
test('demo and unknown identities never inherit registry verification from operational approval', () => {
  assert.equal(identityLabel('DEMO', false), 'Demo identity — not registry verified');
  assert.equal(identityLabel('DEMO', true), 'Demo identity — not registry verified');
  assert.equal(identityLabel(null, null), 'Registry verification not recorded');
  assert.equal(identityLabel('MANUAL', false), 'Registry verification not recorded');
  assert.equal(identityLabel('REGISTRY', true), 'Registry verified');
  assert.notEqual(identityLabel('DEMO', false, true), identityLabel('REGISTRY', true, true));
});

const receptionCode = transpile('../src/lib/reception.ts');
const { normalizeReceptionQueue, localServiceDate } = await import('data:text/javascript;base64,' + Buffer.from(receptionCode).toString('base64'));
test('live reception preserves queue IDs and completed state instead of inventing WAITING', () => {
  const row = normalizeReceptionQueue([{ queue_id: 'queue-1', state: 'COMPLETED', token_number: 1, patient_name: 'TEST DEMO' }])[0];
  assert.equal(row.id, 'queue-1');
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.token_number, '1');
  assert.equal(normalizeReceptionQueue([{ queue_id: 'queue-2' }])[0].status, 'UNKNOWN');
});
test('reception uses local service date across the UTC midnight boundary', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Kolkata';
    assert.equal(localServiceDate(new Date('2026-09-20T23:00:00Z')), '2026-09-21');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
const facilityCode = transpile('../src/lib/facility.ts').replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = {};');
const { selectOperationalFacility } = await import('data:text/javascript;base64,' + Buffer.from(facilityCode).toString('base64'));
test('facility selection accepts authorized staff and denies revoked or unknown access', () => {
  assert.equal(selectOperationalFacility([{ facility_id: 'staff-facility', role: 'CLINICIAN', operational_access: true }]), 'staff-facility');
  assert.equal(selectOperationalFacility([{ facility_id: 'revoked', operational_access: false }]), null);
  assert.equal(selectOperationalFacility([{ facility_id: 'unknown' }]), null);
});

const ledgerCode = transpile('../src/lib/pharmacy-ledger.ts');
test('encounter form print is a draft preview and never claims an active issued prescription', () => {
  const encounter = fs.readFileSync(new URL('../src/pages/EncounterPage.tsx', import.meta.url), 'utf8');
  assert.match(encounter, /status: 'DRAFT — encounter preview/);
  assert.doesNotMatch(encounter, /status: 'ACTIVE'/);
});
const { normalizeStockLedger } = await import('data:text/javascript;base64,' + Buffer.from(ledgerCode).toString('base64'));
test('stock movements preserve quantities and unknown fields without becoming paid sales', () => {
  const rows = normalizeStockLedger([{ id: 2, inventory_id: 'batch', quantity_delta: -2, quantity_after: 3, source_kind: 'STOCK_MOVEMENT', recorded_at: '2026-09-21T00:00:00Z' }, { id: 3 }]);
  assert.equal(rows[0].delta, -2);
  assert.equal(rows[0].balance, 3);
  assert.equal(rows[0].kind, 'STOCK_MOVEMENT');
  assert.equal(rows[1].delta, null);
  assert.equal(rows[1].kind, 'UNKNOWN');
  assert.equal('paid' in rows[0], false);
  assert.equal('total' in rows[0], false);
});
test('supplier selection uses authorized RPC results without reading revoked supplier tables', () => {
  assert.doesNotMatch(pharmacySource, /\.from\(["']pharmacy_suppliers["']\)/);
  assert.match(pharmacySource, /setOrderSupplier\(supplierId\)/);
  assert.match(pharmacySource, /r\.supplier_order_reference/);
});
test('confirmed registration can finish without weakening email confirmation or recreating users', () => {
  const access = fs.readFileSync(new URL('../src/pages/AccessPage.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(access, /disable email confirmation|delete this incomplete test user/);
  assert.match(access, /if \(!completing\) \{\s+const \{ data, error: signUpError \}/);
  assert.match(app, /hasRoleRecord === false[\s\S]*?<CompleteRegistration/);
});

test('patient medical profile never infers reconciled clinical facts from filenames or diagnoses', () => {
  const profile = fs.readFileSync(new URL('../src/pages/ProfilePage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /blood_group|emergency_contact_name|emergency_contact_phone|condMap|allergyRecords/);
  assert.match(profile, /No structured allergy information recorded/);
  assert.match(profile, /No structured chronic-condition record available/);
  assert.match(profile, /rx.status === 'ACTIVE'/);
});
test('provider discovery uses only server-bound care context with no table fallback', () => {
  const picker = fs.readFileSync(new URL('../src/components/ProviderPicker.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(picker, /\.from\(|facilityId|city\?:/);
  assert.match(picker, /d2_gap_workers/); assert.match(picker, /d2_rx_pharmacies/);
  assert.match(picker, /p_offset: offset/);
});
console.log(`${n} frontend design system and workflow tests passed`);
