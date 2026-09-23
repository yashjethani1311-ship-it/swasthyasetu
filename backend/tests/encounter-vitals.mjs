import assert from 'node:assert/strict';
import { db } from './db/migrations.mjs';
import {
  normalizeSpO2,
  normalizePulse,
  normalizeSystolicBP,
  normalizeDiastolicBP,
  normalizeTemperature,
  normalizeWeight,
  normalizeFollowUpDays,
  normalizeRespiratoryRate,
  normalizeHeight,
  normalizeGlucose,
  validateAndNormalizeEncounterVitals,
  formatDatabaseError
} from '../src/lib/vitals.mjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s, a = []) => db.query(s, a);
const scalar = async (s, a = []) => Object.values((await q(s, a)).rows[0])[0];

async function as(n, fn) {
  await db.exec('set role authenticated');
  await q("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    console.error('FAIL ' + name + ': ' + e.message);
    process.exitCode = 1;
    throw Error(name + ': ' + e.message);
  }
};

console.log('--- UNIT TESTS: VITALS NORMALIZATION & VALIDATION ---');

// 1. SpO2 Normalization & Range Tests
await test('blank/unentered SpO2 strictly normalizes to NULL (never 0, "", or NaN)', () => {
  assert.equal(normalizeSpO2('').value, null);
  assert.equal(normalizeSpO2('').error, null);
  assert.equal(normalizeSpO2('   ').value, null);
  assert.equal(normalizeSpO2('   ').error, null);
  assert.equal(normalizeSpO2(null).value, null);
  assert.equal(normalizeSpO2(null).error, null);
  assert.equal(normalizeSpO2(undefined).value, null);
  assert.equal(normalizeSpO2(undefined).error, null);
});

await test('valid SpO2 normalizes correctly and strips units', () => {
  assert.deepEqual(normalizeSpO2('98'), { value: 98, error: null });
  assert.deepEqual(normalizeSpO2(98), { value: 98, error: null });
  assert.deepEqual(normalizeSpO2('98%'), { value: 98, error: null });
  assert.deepEqual(normalizeSpO2(' 98 % '), { value: 98, error: null });
  assert.deepEqual(normalizeSpO2('98.4'), { value: 98, error: null });
  assert.deepEqual(normalizeSpO2('98.6'), { value: 99, error: null });
});

await test('boundary SpO2 values (0 and 100) are valid and preserved', () => {
  assert.deepEqual(normalizeSpO2('0'), { value: 0, error: null });
  assert.deepEqual(normalizeSpO2(0), { value: 0, error: null });
  assert.deepEqual(normalizeSpO2('100'), { value: 100, error: null });
  assert.deepEqual(normalizeSpO2(100), { value: 100, error: null });
  assert.deepEqual(normalizeSpO2('100%'), { value: 100, error: null });
});

await test('invalid SpO2 values (< 0, > 100, non-numeric) produce human-readable errors', () => {
  const over = normalizeSpO2('105');
  assert.equal(over.value, null);
  assert.match(over.error, /SpO₂ must be between 0 and 100/i);

  const under = normalizeSpO2('-5');
  assert.equal(under.value, null);
  assert.match(under.error, /SpO₂ must be between 0 and 100/i);

  const nan = normalizeSpO2('invalid');
  assert.equal(nan.value, null);
  assert.match(nan.error, /SpO₂ must be a valid number/i);

  // Hindi localization
  const overHi = normalizeSpO2('105', true);
  assert.match(overHi.error, /SpO₂ 0 से 100 से अधिक नहीं हो सकता/);
});

// 2. Other Optional Vitals Normalization Tests
await test('all optional vitals strictly normalize blank/whitespace to NULL', () => {
  assert.equal(normalizePulse('').value, null);
  assert.equal(normalizeSystolicBP('').value, null);
  assert.equal(normalizeDiastolicBP('').value, null);
  assert.equal(normalizeTemperature('').value, null);
  assert.equal(normalizeWeight('').value, null);
  assert.equal(normalizeFollowUpDays('').value, null);
  assert.equal(normalizeRespiratoryRate('').value, null);
  assert.equal(normalizeHeight('').value, null);
  assert.equal(normalizeGlucose('').value, null);
});

await test('pulse rate normalizes, strips units, and enforces bounds', () => {
  assert.deepEqual(normalizePulse('72 bpm'), { value: 72, error: null });
  assert.deepEqual(normalizePulse(' 80 /min '), { value: 80, error: null });
  assert.match(normalizePulse('-10').error, /Pulse rate/);
  assert.match(normalizePulse('350').error, /Pulse rate/);
});

await test('blood pressure normalizes, checks systolic >= diastolic', () => {
  assert.deepEqual(normalizeSystolicBP('120 mmHg'), { value: 120, error: null });
  assert.deepEqual(normalizeDiastolicBP('80 mmHg', 120), { value: 80, error: null });
  // Diastolic exceeding systolic
  const reversed = normalizeDiastolicBP('130', 120);
  assert.match(reversed.error, /Diastolic blood pressure cannot exceed systolic/);
});

await test('temperature and weight normalize with rounding and bounds', () => {
  assert.deepEqual(normalizeTemperature('36.6 °C'), { value: 36.6, error: null });
  assert.deepEqual(normalizeTemperature('37.05'), { value: 37.1, error: null });
  assert.match(normalizeTemperature('15.0').error, /Temperature/);
  assert.match(normalizeTemperature('55.0').error, /Temperature/);

  assert.deepEqual(normalizeWeight('68.45 kg'), { value: 68.5, error: null });
  assert.match(normalizeWeight('-5').error, /Weight/);
});

await test('validateAndNormalizeEncounterVitals validates full payload and blocks invalid fields', () => {
  const valid = validateAndNormalizeEncounterVitals({
    temperature: '37.0',
    pulse: '72 bpm',
    systolic: '120',
    diastolic: '80',
    spo2: '98%',
    weight: '65 kg',
    followUpDays: '7'
  });
  assert.equal(valid.isValid, true);
  assert.deepEqual(valid.values, {
    temperature_c: 37.0,
    pulse_bpm: 72,
    systolic_bp: 120,
    diastolic_bp: 80,
    spo2_percent: 98,
    weight_kg: 65.0,
    follow_up_in_days: 7
  });

  // Invalid SpO2 with blank other vitals
  const invalidSpO2 = validateAndNormalizeEncounterVitals({
    spo2: '105',
    pulse: '',
    temperature: ''
  });
  assert.equal(invalidSpO2.isValid, false);
  assert.ok(invalidSpO2.errors.spo2);
  assert.equal(invalidSpO2.values.pulse_bpm, null);
  assert.equal(invalidSpO2.values.temperature_c, null);
});

await test('formatDatabaseError translates raw PostgreSQL constraints to friendly messages', () => {
  const rawSpO2 = 'new row for relation "encounters" violates check constraint "valid_spo2"';
  assert.equal(formatDatabaseError(rawSpO2), 'SpO₂ percentage must be between 0% and 100%.');
  assert.equal(formatDatabaseError(rawSpO2, true), 'SpO₂ का मान 0% और 100% के बीच होना चाहिए।');

  const rawFollowUp = 'new row for relation "encounters" violates check constraint "valid_follow_up"';
  assert.equal(formatDatabaseError(rawFollowUp), 'Follow-up in days must be 0 or greater.');

  const genericCheck = 'new row for relation "encounters" violates check constraint "some_check"';
  assert.match(formatDatabaseError(genericCheck), /out of the allowed physiological range/);
});

console.log('--- DATABASE INTEGRATION TESTS: ENCOUNTERS & VITALS ---');

// Setup fixture encounter in DB
await db.exec(`
  insert into auth.users(id) values ('${id(501)}'), ('${id(502)}') on conflict do nothing;
  insert into patient_profiles(id, user_id, patient_code, full_name)
    values ('${id(511)}', '${id(501)}', 'VIT-PAT', 'Vitals Test Patient') on conflict do nothing;
  insert into provider_profiles(id, user_id, provider_type, full_name, verification_status)
    values ('${id(512)}', '${id(502)}', 'DOCTOR', 'Dr. Vitals Expert', 'APPROVED') on conflict do nothing;
  insert into appointments(id, patient_id, doctor_provider_id, scheduled_at, mode, status)
    values ('${id(520)}', '${id(511)}', '${id(512)}', now(), 'PHYSICAL', 'CONFIRMED') on conflict do nothing;
  insert into encounters(id, appointment_id, patient_id, doctor_provider_id, chief_complaint, status)
    values ('${id(521)}', '${id(520)}', '${id(511)}', '${id(512)}', 'Routine checkup', 'IN_PROGRESS')
    on conflict do nothing;
`);

await test('DB: blank/null vitals save as NULL in encounters table', async () => {
  await as(502, () =>
    q(
      `update encounters set
        spo2_percent = null,
        pulse_bpm = null,
        systolic_bp = null,
        diastolic_bp = null,
        temperature_c = null,
        weight_kg = null,
        follow_up_in_days = null
       where id = $1`,
      [id(521)]
    )
  );

  const row = (await q('select * from encounters where id = $1', [id(521)])).rows[0];
  assert.equal(row.spo2_percent, null);
  assert.equal(row.pulse_bpm, null);
  assert.equal(row.systolic_bp, null);
  assert.equal(row.diastolic_bp, null);
  assert.equal(row.temperature_c, null);
  assert.equal(row.weight_kg, null);
  assert.equal(row.follow_up_in_days, null);
});

await test('DB: valid SpO2 (e.g. 98%) saves successfully', async () => {
  await as(502, () =>
    q('update encounters set spo2_percent = 98, pulse_bpm = 75, temperature_c = 36.8 where id = $1', [id(521)])
  );

  const row = (await q('select spo2_percent, pulse_bpm, temperature_c from encounters where id = $1', [id(521)])).rows[0];
  assert.equal(row.spo2_percent, 98);
  assert.equal(row.pulse_bpm, 75);
  assert.equal(Number(row.temperature_c), 36.8);
});

await test('DB: boundary values (0 and 100) for SpO2 save successfully', async () => {
  // Test lower boundary: 0
  await as(502, () => q('update encounters set spo2_percent = 0 where id = $1', [id(521)]));
  assert.equal(await scalar('select spo2_percent from encounters where id = $1', [id(521)]), 0);

  // Test upper boundary: 100
  await as(502, () => q('update encounters set spo2_percent = 100 where id = $1', [id(521)]));
  assert.equal(await scalar('select spo2_percent from encounters where id = $1', [id(521)]), 100);
});

await test('DB: invalid SpO2 (> 100) is rejected by trigger / constraint', async () => {
  await as(502, () =>
    assert.rejects(
      () => q('update encounters set spo2_percent = 105 where id = $1', [id(521)]),
      /SpO2/i
    )
  );
});

await test('DB: invalid SpO2 (< 0) is rejected by trigger / constraint', async () => {
  await as(502, () =>
    assert.rejects(
      () => q('update encounters set spo2_percent = -5 where id = $1', [id(521)]),
      /SpO2/i
    )
  );
});

await test('DB: defensive RPC c1_update_encounter_vitals normalizes strings, blanks, and valid ranges', async () => {
  // RPC with unit strings and blanks
  const res = await as(502, () =>
    scalar('select c1_update_encounter_vitals($1, $2::jsonb)', [
      id(521),
      JSON.stringify({
        spo2: '97%',
        pulse: '80 bpm',
        systolic: '118 mmHg',
        diastolic: '76 mmHg',
        temperature: '37.1 C',
        weight: '70.2 kg',
        followUpDays: '14'
      })
    ])
  );

  assert.equal(res.spo2_percent, 97);
  assert.equal(res.pulse_bpm, 80);
  assert.equal(res.systolic_bp, 118);
  assert.equal(res.diastolic_bp, 76);
  assert.equal(Number(res.temperature_c), 37.1);
  assert.equal(Number(res.weight_kg), 70.2);
  assert.equal(res.follow_up_in_days, 14);

  // RPC with empty strings converts to NULL
  const blankRes = await as(502, () =>
    scalar('select c1_update_encounter_vitals($1, $2::jsonb)', [
      id(521),
      JSON.stringify({
        spo2: '',
        pulse: '   ',
        temperature: null
      })
    ])
  );
  assert.equal(blankRes.spo2_percent, null);
  assert.equal(blankRes.pulse_bpm, null);
  assert.equal(blankRes.temperature_c, null);

  // RPC with out-of-range SpO2 is rejected defensively
  await as(502, () =>
    assert.rejects(
      () =>
        scalar('select c1_update_encounter_vitals($1, $2::jsonb)', [
          id(521),
          JSON.stringify({ spo2: '150' })
        ]),
      /SpO2/i
    )
  );
});

console.log(`\nAll ${passed} encounter vitals normalization and regression tests passed successfully!`);
await db.close();
