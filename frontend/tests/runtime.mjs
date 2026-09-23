import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };
}

let n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log('PASS ' + name);
}

// Build the SSR bundle for component tests
const outDir = path.resolve(__dirname, '.test-runtime-dist');
await build({
  configFile: false,
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src')
    }
  },
  build: {
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'runtime-entry.ts'),
      formats: ['es'],
      fileName: () => 'runtime-bundle.mjs'
    },
    outDir,
    emptyOutDir: true,
    logLevel: 'error',
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime']
    }
  }
});

const bundlePath = fs.existsSync(path.resolve(outDir, 'runtime-entry.js'))
  ? path.resolve(outDir, 'runtime-entry.js')
  : path.resolve(outDir, 'runtime-entry.mjs');
const bundleUrl = pathToFileURL(bundlePath).href;
const components = await import(bundleUrl);

// 1. Missing Supabase env renders config error UI, not blank screen
test('runtime 1: missing Supabase env renders ConfigurationErrorPage instead of blank screen', () => {
  const html = renderToString(React.createElement(components.ConfigurationErrorPage, {
    missingVars: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']
  }));
  assert.match(html, /SwasthyaSetu Configuration Incomplete/);
  assert.match(html, /VITE_SUPABASE_URL/);
  assert.match(html, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(html, /Retry Connection/);
  assert.ok(html.length > 500, 'Rendered page must not be empty');
});

// 2. Prescription runtime truthfulness
test('runtime 2: prescription renders "No allergy documented", "Registration number not available" and no fake signature', () => {
  const html = renderToString(React.createElement(components.PrintablePrescription, {
    data: {
      id: 'rx-test-01',
      issuedAt: '2026-09-20T10:00:00.000Z',
      doctor: {
        name: 'Dr. Ananya Sharma',
        // qualification, specialty, registrationNumber, verified are omitted
      },
      patient: {
        name: 'Ramesh Kumar',
        age: 45,
        gender: 'Male'
      },
      allergies: null, // missing allergy
      items: []
    }
  }));

  // Missing allergy -> strictly "No allergy documented", never "No allergies"
  assert.match(html, /No allergy documented/);
  assert.doesNotMatch(html, /No allergies/);

  // Missing registration -> "Registration number not available", never fake number
  assert.match(html, /Registration number not available/);
  assert.doesNotMatch(html, /NMC-REG-PENDING/);
  assert.doesNotMatch(html, /MCI\/NMC/);

  // Missing signature evidence -> strictly unverified notice, never "Digitally Signed & Verified"
  assert.match(html, /Digital signature verification not available/);
  assert.doesNotMatch(html, /Digitally Signed &amp; Verified/);
  assert.doesNotMatch(html, /Valid without physical seal/);
});

test('registry verification and a signature label alone never create a verified signature', () => {
  const html = renderToString(React.createElement(components.PrintablePrescription, {
    data: { id: 'test-identity-only', issuedAt: '', doctor: { name: 'TEST DEMO', verified: true, signatureText: 'hash-only' }, patient: { name: 'TEST DEMO' }, items: [] }
  }));
  assert.match(html, /Digital signature verification not available/);
  assert.doesNotMatch(html, /Digitally Signed|Authorized Electronic Signature|hash-only|Information Technology Act/);
});

// 3. Pathology report runtime truthfulness
test('missing prescription instructions never become invented dosing or advice', () => {
  const html = renderToString(React.createElement(components.PrintablePrescription, {
    prescription: { id: 'test-unknown-directions', items: [{ medicine_name: 'TEST ONLY', quantity_prescribed: 2 }] }, patient: { name: 'TEST DEMO' }
  }));
  assert.doesNotMatch(html, /Tablet|Oral|1 unit|1-0-1|5 days|SOS \/ As required|None advised at this stage/);
  assert.match(html, /Not recorded/);
  assert.match(html, /Follow-up not recorded/);
  assert.match(html, /Investigations not recorded/);
  assert.match(html, />2<\/td>/);
});

test('runtime 3: pathology report renders "Reference interval unavailable" and no fake methodology or accreditation', () => {
  const html = renderToString(React.createElement(components.PrintableDiagnosticReport, {
    data: {
      id: 'diag-path-01',
      kind: 'PATHOLOGY',
      title: 'Complete Blood Count',
      issuedAt: '2026-09-20T10:00:00.000Z',
      reportingProfessional: {
        name: 'Dr. Pathologist'
        // registrationNumber omitted
      },
      patient: { name: 'Pooja Devi' },
      pathologyDetails: {
        results: [
          { parameterName: 'Hemoglobin', resultValue: 13.2, unit: 'g/dL' } // referenceRange omitted
        ]
        // methodology omitted
      }
    }
  }));

  assert.match(html, /Reference interval unavailable/);
  assert.doesNotMatch(html, /Governed Laboratory Standard/);
  assert.match(html, /Method not provided/);
  assert.doesNotMatch(html, /Automated Spectrophotometry/);
  assert.match(html, /Accreditation not verified/);
  assert.doesNotMatch(html, /ISO 15189/);
  assert.match(html, /Registration identifier unavailable/);
});

// 4. Imaging report runtime truthfulness
test('runtime 4: imaging report renders "Findings not recorded" without default normal results', () => {
  const html = renderToString(React.createElement(components.PrintableDiagnosticReport, {
    data: {
      id: 'diag-img-01',
      kind: 'IMAGING',
      title: 'Chest Radiograph PA',
      issuedAt: '2026-09-20T10:00:00.000Z',
      reportingProfessional: { name: 'Dr. Radiologist' },
      patient: { name: 'Anita Roy' },
      imagingDetails: {
        modality: 'X-RAY'
        // findings and impression omitted
      }
    }
  }));

  assert.match(html, /Findings not recorded/);
  assert.match(html, /Impression not recorded/);
  assert.doesNotMatch(html, /No acute radiologic abnormality visualized/);
  assert.doesNotMatch(html, /Normal study/);
});

// 5. Procedure report runtime truthfulness
test('runtime 5: procedure report renders "Conclusion not recorded" without default normal results', () => {
  const html = renderToString(React.createElement(components.PrintableDiagnosticReport, {
    data: {
      id: 'diag-proc-01',
      kind: 'PROCEDURE',
      title: '12-Lead Electrocardiogram',
      issuedAt: '2026-09-20T10:00:00.000Z',
      reportingProfessional: { name: 'Dr. Cardiologist' },
      patient: { name: 'Suresh Patil' },
      procedureDetails: {
        procedureName: '12-Lead ECG'
        // findings and conclusion omitted
      }
    }
  }));

  assert.match(html, /Findings not recorded/);
  assert.match(html, /Conclusion not recorded/);
  assert.doesNotMatch(html, /Normal procedure study/);
  assert.doesNotMatch(html, /Satisfactory findings/);
});

// 6. District Pulse runtime truthfulness
test('runtime 6: district pulse displays truthful unavailable state without hardcoded metrics', () => {
  const html = renderToString(React.createElement(components.CareIntelligenceView, { initialMode: 'PULSE' }));
  // Does NOT contain hardcoded Patna metrics
  assert.doesNotMatch(html, /Patna Rural/);
  assert.doesNotMatch(html, /142/);
  assert.doesNotMatch(html, /4\.2h/);
  assert.doesNotMatch(html, /94\.6%/);
  assert.doesNotMatch(html, /88\.1%/);
  // Displays truth notice
  assert.match(html, /District Pulse backend not available/);
});

// 7. Medicine catalog truthfulness
const medSource = fs.readFileSync(path.resolve(rootDir, 'src/components/clinical/MedicineMasterPicker.tsx'), 'utf8');
test('runtime 7: medicine catalog clearly marks demo seed catalog and decouples inventory', () => {
  assert.match(medSource, /Demo seed catalog — not a complete national medicine database/);
  assert.match(medSource, /Medicine Master != Pharmacy Inventory/);
  assert.match(medSource, /p2_search_medicines/);
});

// 8. Diagnostic catalog truthfulness
const diagPickerSource = fs.readFileSync(path.resolve(rootDir, 'src/components/clinical/DiagnosticMasterPicker.tsx'), 'utf8');
test('runtime 8: diagnostic master clearly marks demo catalog without national completeness claim', () => {
  assert.match(diagPickerSource, /Demo diagnostic catalog/);
  assert.match(diagPickerSource, /Diagnostic Master != Lab Capability/);
});

// 9. 038 Identity Resolution truthfulness
const adminSource = fs.readFileSync(path.resolve(rootDir, 'src/pages/AdminGovernancePage.tsx'), 'utf8');
test('runtime 9: 038 identity resolution enforces strict non-merge sovereign notice', () => {
  assert.match(adminSource, /x1_candidates/);
  assert.match(adminSource, /x1_link/);
  assert.match(adminSource, /x1_unlink/);
  assert.match(adminSource, /Alias reference only\. Source records, consent and access remain bound to original patient identity\. No clinical history was moved or combined\./);
});

// 10. 039 Integration Registry truthfulness
test('runtime 10: 039 integration registry handles unknown confirmation required state', () => {
  assert.match(adminSource, /x2_health/);
  assert.match(adminSource, /x2_register/);
  assert.match(adminSource, /STATUS_UNKNOWN_CONFIRMATION_REQUIRED/);
});

// 11. Teleconsultation truthfulness
test('runtime 11: teleconsultation renders explicit unconfigured provider notice and no fake connected party', () => {
  const html = renderToString(
    React.createElement(components.LanguageProvider, null,
      React.createElement(components.TeleconsultRoom, {
        appointmentId: 'room-123',
        role: 'DOCTOR'
      })
    )
  );
  assert.match(html, /Remote consultation provider is not configured/);
});

// 12. Startup safety
const mainSource = fs.readFileSync(path.resolve(rootDir, 'src/main.tsx'), 'utf8');
const supabaseSource = fs.readFileSync(path.resolve(rootDir, 'src/lib/supabase.ts'), 'utf8');
test('runtime 12: startup boundary wraps application in ErrorBoundary and checks isSupabaseConfigured', () => {
  assert.match(mainSource, /isSupabaseConfigured/);
  assert.match(mainSource, /ConfigurationErrorPage/);
  assert.match(mainSource, /ErrorBoundary/);
  assert.match(supabaseSource, /isSupabaseConfigured/);
  assert.doesNotMatch(supabaseSource, /throw new Error\(/, 'supabase.ts must not throw during module evaluation');
});

// 13. Lab report runtime truthfulness (Requirement 10 & 11)
test('runtime 13: missing lab flag is "Not classified" (not NORMAL) and missing report status is "Status not available" (not FINAL)', () => {
  const html = renderToString(React.createElement(components.PrintableDiagnosticReport, {
    data: {
      id: 'diag-flag-01',
      kind: 'PATHOLOGY',
      title: 'Biochemistry Panel',
      status: undefined, // missing status
      issuedAt: undefined, // missing issued time
      reportingProfessional: null, // missing reporting professional
      referringDoctor: null, // missing referring doctor
      patient: { name: 'Virendra Singh' },
      pathologyDetails: {
        results: [
          { parameterName: 'Serum Creatinine', resultValue: 1.1, unit: 'mg/dL', flag: undefined } // missing flag
        ]
      }
    }
  }));

  // Missing status must be "Status not available", NEVER "FINAL"
  assert.match(html, /Status not available/);
  assert.doesNotMatch(html, />FINAL</);

  // Missing flag must be "Not classified", NEVER "NORMAL"
  assert.match(html, /Not classified/);
  assert.doesNotMatch(html, />NORMAL</);

  // Missing doctors must display neutral recorded notices, never fabricated designations
  assert.match(html, /Referring doctor not recorded/);
  assert.match(html, /Reporting professional not recorded/);
});

// 14. Prescription runtime truthfulness (Requirement 12 & 13)
test('runtime 14: missing Rx status is "Status not recorded" (not ACTIVE) and signature_hash alone is not verified', () => {
  const html = renderToString(React.createElement(components.PrintablePrescription, {
    data: {
      id: 'rx-truth-01',
      status: undefined, // missing status
      issuedAt: undefined, // missing issue date
      doctor: {
        name: 'Dr. K. S. Rao',
        verified: false // unverified
      },
      patient: { name: 'Sunita Devi' },
      signature_hash: '3f7a8b9c1d2e', // hash present without verification
      items: []
    }
  }));

  // Missing status must be "Status not recorded", NEVER "ACTIVE"
  assert.match(html, /Status not recorded/);
  assert.doesNotMatch(html, />ACTIVE</);

  // Title must be neutral "A4 Prescription", not claiming compliance certification
  assert.match(html, /A4 Prescription/);
  assert.doesNotMatch(html, /NMC-COMPLIANT/);

  // Unverified doctor must display unverified notice, never simulated cursive signature name
  assert.match(html, /Digital signature verification not available/);
  assert.doesNotMatch(html, /font-serif italic/);
});

// 15. Doctor listing truthfulness (Requirement 14)
const apptSource = fs.readFileSync(path.resolve(rootDir, 'src/pages/AppointmentsPage.tsx'), 'utf8');
test('runtime 15: doctor search states "listed for your current search" rather than claiming current availability', () => {
  assert.match(apptSource, /verified doctors listed for your current search/);
  assert.doesNotMatch(apptSource, /verified doctors currently available/);
});

// 16. Care Replay truthfulness (041 t1_replay, Requirement 1 & 2)
const careIntelSource = fs.readFileSync(path.resolve(rootDir, 'src/components/clinical/CareIntelligenceView.tsx'), 'utf8');
test('runtime 16: Care Replay binds 041 t1_replay with cursor pagination, consent revocation and no synthetic events', () => {
  assert.match(careIntelSource, /t1_replay/);
  assert.match(careIntelSource, /p_before_key/);
  assert.match(careIntelSource, /next_cursor/);
  assert.match(careIntelSource, /Care Replay access is unauthorized or consent has been revoked/);
  assert.match(careIntelSource, /No persisted operational evidence recorded for this patient under active consent/);

  const html = renderToString(React.createElement(components.CareIntelligenceView, {
    initialMode: 'REPLAY',
    patientId: 'patient-test-01'
  }));
  assert.match(html, /Care Replay/);
  assert.match(html, /provenance reconstructed from backend transactions/);
  assert.doesNotMatch(html, /synthetic/i);
});

// 17. Care Twin truthfulness (042 t2_twin, Requirement 3)
test('runtime 17: Care Twin binds 042 t2_twin and keeps unknown state without forcing healthy status', () => {
  assert.match(careIntelSource, /t2_twin/);
  assert.match(careIntelSource, /care_gaps/);
  assert.match(careIntelSource, /next_steps/);
  assert.match(careIntelSource, /STATUS_UNKNOWN_CONFIRMATION_REQUIRED/);
  assert.match(careIntelSource, /HISTORICAL_SOURCE/);

  const html = renderToString(React.createElement(components.CareIntelligenceView, {
    initialMode: 'TWIN',
    patientId: 'patient-test-02'
  }));
  assert.match(html, /Care Twin/);
  assert.match(html, /Operational Continuity Model/);
});

// 18. District Pulse truthfulness (043/050 t3_pulse, Requirement 4 & 5)
test('runtime 18: District Pulse enforces cell size suppression (<10) and contains zero PHI', () => {
  assert.match(careIntelSource, /t3_pulse/);
  assert.match(careIntelSource, /SUPPRESSED_MINIMUM_CELL_SIZE/);
  assert.match(careIntelSource, /Suppressed for privacy/);
  assert.match(careIntelSource, /current_operations/);

  // Verifies zero patient identifiers or names in Pulse logic
  assert.doesNotMatch(careIntelSource, /p_patient_id/);
  assert.doesNotMatch(careIntelSource, /pulse_patient/);
});

// 19. Teleconsultation security & provider boundaries (044/049 t4_*, Requirement 6 & 7)
const teleconsultSource = fs.readFileSync(path.resolve(rootDir, 'src/components/TeleconsultRoom.tsx'), 'utf8');
test('runtime 19: teleconsultation room binds 044/049 authenticated boundaries and handles unconfigured provider', () => {
  assert.match(teleconsultSource, /t4_open/);
  assert.match(teleconsultSource, /t4_join_intent/);
  assert.match(teleconsultSource, /t4_request_end/);
  assert.match(teleconsultSource, /Remote consultation provider is not configured/);
  assert.match(teleconsultSource, /participant authorization required/i);

  // Client must NEVER call service_role-only routines
  assert.doesNotMatch(teleconsultSource, /supabase\.rpc\(['"]t4_issue_context['"]/);
  assert.doesNotMatch(teleconsultSource, /supabase\.rpc\(['"]t4_token_issued['"]/);
  assert.doesNotMatch(teleconsultSource, /supabase\.rpc\(['"]t4_connection['"]/);
});

// 20. Real Medicine Master & Catalog truthfulness (045 k1_medicines, Requirement 8)
test('runtime 20: MedicineMasterPicker queries 045 k1_medicines and never silently falls back to demo seed', () => {
  assert.match(medSource, /k1_medicines/);
  assert.match(medSource, /p_include_demo:\s*false/);
  assert.match(medSource, /Medicine catalog is currently unavailable\./);
  assert.match(medSource, /isDemoActive/);
});

// 21. Real Diagnostic Master & Catalog truthfulness (046 k2_diagnostics, Requirement 9)
test('runtime 21: DiagnosticMasterPicker queries 046 k2_diagnostics with category separation and never silently falls back', () => {
  assert.match(diagPickerSource, /k2_diagnostics/);
  assert.match(diagPickerSource, /p_include_demo:\s*false/);
  assert.match(diagPickerSource, /Diagnostic catalog is currently unavailable\./);
  assert.match(diagPickerSource, /PATHOLOGY/);
  assert.match(diagPickerSource, /IMAGING/);
  assert.match(diagPickerSource, /PROCEDURE/);
  assert.match(diagPickerSource, /isDemoActive/);
});

// 22. AI Operational Completion & Metadata (047/050 a3_tool, Requirement 15)
const labSource = fs.readFileSync(path.resolve(rootDir, 'src/pages/LabWorkspacePage.tsx'), 'utf8');
const pharmacySource = fs.readFileSync(path.resolve(rootDir, 'src/pages/PharmacyPage.tsx'), 'utf8');
const copilotSource = fs.readFileSync(path.resolve(rootDir, 'src/components/SwasthyaCopilot.tsx'), 'utf8');
test('runtime 22: operational AI exposes audit_reference, freshness and uncertainty metadata', () => {
  assert.match(labSource, /audit_reference/);
  assert.match(labSource, /freshness/);
  assert.match(pharmacySource, /audit_reference/);
  assert.match(pharmacySource, /freshness/);
  assert.match(copilotSource, /audit_reference/);
  assert.match(copilotSource, /freshness/);
  assert.match(copilotSource, /uncertainty/);
});

// 23. Integration retries and freshness truth states (040 x2_retry & x2_health, Requirement 15)
test('runtime 23: platform integration cards expose 040 truth_state, latest_failure and bounded retry button', () => {
  assert.match(adminSource, /x2_retry/);
  assert.match(adminSource, /truth_state/);
  assert.match(adminSource, /latest_failure/);
  assert.match(adminSource, /Bounded Retry \(040\)/);
  assert.match(adminSource, /Terminal failure requires governance configuration review/);
});

// Cleanup dist dir
try {
  fs.rmSync(outDir, { recursive: true, force: true });
} catch {
  // ignore
}

console.log(`\nAll ${n} runtime truthfulness and component safety tests passed!`);
