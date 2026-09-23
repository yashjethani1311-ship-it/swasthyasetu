import assert from 'node:assert/strict';
import { db } from './migrations.mjs';

const id = n => `54000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (s, a = []) => db.query(s, a);
const scalar = async (s, a = []) => Object.values((await q(s, a)).rows[0])[0];

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

await test('patient deletion cascades cleanly through profiles, patient_profiles, and consent_audit', async () => {
  const uId = id(1);
  const pId = id(101);

  await db.exec(`
    insert into auth.users(id, raw_user_meta_data) values ('${uId}', '{"requested_role":"PATIENT","full_name":"Test Patient"}');
    insert into patient_profiles(id, user_id, patient_code, full_name) values ('${pId}', '${uId}', 'SS-TEST-001', 'Test Patient');
    insert into consent_audit(id, patient_id, actor_user_id, action, purpose) values ('${id(201)}', '${pId}', '${uId}', 'REQUESTED', 'TREATMENT');
  `);

  assert.equal(await scalar('select count(*)::int from auth.users where id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from profiles where id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from patient_profiles where id = $1', [pId]), 1);
  assert.equal(await scalar('select count(*)::int from consent_audit where patient_id = $1', [pId]), 1);

  // Perform delete on auth.users (simulating Supabase Auth Dashboard deletion)
  await db.exec(`delete from auth.users where id = '${uId}';`);

  assert.equal(await scalar('select count(*)::int from auth.users where id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from profiles where id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from patient_profiles where id = $1', [pId]), 0);
  assert.equal(await scalar('select count(*)::int from consent_audit where patient_id = $1', [pId]), 0);
});

await test('facility owner deletion transitions facility status to SUSPENDED without trigger abort', async () => {
  const uId = id(2);
  const provId = id(102);
  const facId = id(301);

  await db.exec(`
    insert into auth.users(id, raw_user_meta_data) values ('${uId}', '{"requested_role":"DOCTOR","full_name":"Test Doctor"}');
    insert into provider_profiles(id, user_id, provider_type, full_name, verification_status)
      values ('${provId}', '${uId}', 'DOCTOR', 'Test Doctor', 'APPROVED');
    insert into facilities(id, owner_user_id, name, facility_type, verification_status)
      values ('${facId}', '${uId}', 'Test Facility', 'CLINIC', 'APPROVED');
  `);

  assert.equal(await scalar('select count(*)::int from facilities where id = $1', [facId]), 1);
  assert.equal(await scalar('select verification_status from facilities where id = $1', [facId]), 'APPROVED');

  // Deleting user triggers ON DELETE SET NULL on facilities.owner_user_id
  // Trigger v1_facility_state_guard must gracefully transition status to SUSPENDED rather than raising exception
  await db.exec(`delete from auth.users where id = '${uId}';`);

  assert.equal(await scalar('select count(*)::int from auth.users where id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from provider_profiles where id = $1', [provId]), 0);
  assert.equal(await scalar('select owner_user_id from facilities where id = $1', [facId]), null);
  assert.equal(await scalar('select verification_status from facilities where id = $1', [facId]), 'SUSPENDED');

  // Cleanup test facility
  await db.exec(`delete from facilities where id = '${facId}';`);
});

await test('user deletion cascades through teleconsult, memberships, duties, preferences, and AI audit', async () => {
  const uId = id(3);
  const provId = id(103);
  const facId = id(302);
  const sessId = id(401);

  await db.exec(`
    insert into auth.users(id, raw_user_meta_data) values ('${uId}', '{"requested_role":"WORKER","full_name":"Test Staff"}');
    insert into provider_profiles(id, user_id, provider_type, full_name, verification_status)
      values ('${provId}', '${uId}', 'WORKER', 'Test Staff', 'APPROVED');
    insert into facilities(id, owner_user_id, name, facility_type, verification_status)
      values ('${facId}', null, 'Independent Clinic', 'CLINIC', 'PENDING');
    insert into facility_memberships(facility_id, user_id, staff_role)
      values ('${facId}', '${uId}', 'CLINICIAN');
    insert into hospital_duties(facility_id, user_id, request_key, starts_at, ends_at)
      values ('${facId}', '${uId}', '${id(99)}', now(), now() + interval '8 hours');
    insert into communication_preferences(user_id, channel, destination, valid_until)
      values ('${uId}', 'EMAIL', 'test@example.com', now() + interval '30 days');
    insert into ai_tool_audit(actor_user_id, tool_name, actor_role, record_count)
      values ('${uId}', 'get_patient_snapshot', 'WORKER', 1);
    insert into verification_documents(provider_id, submitted_by, document_kind, reference, sha256, request_key)
      values ('${provId}', '${uId}', 'LICENSE', 'LIC-12345', '1111111111111111111111111111111111111111111111111111111111111111', '${id(98)}');
    insert into worker_areas(id, area_code, name, district, state, source_reference)
      values ('${id(501)}', 'DIST-001', 'District 1', 'District A', 'State B', 'Gov Ref');
    insert into worker_area_assignments(worker_provider_id, area_id, active, assigned_by)
      values ('${provId}', '${id(501)}', true, '${uId}');
  `);

  assert.equal(await scalar('select count(*)::int from facility_memberships where user_id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from hospital_duties where user_id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from communication_preferences where user_id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from ai_tool_audit where actor_user_id = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from verification_documents where submitted_by = $1', [uId]), 1);
  assert.equal(await scalar('select count(*)::int from worker_area_assignments where assigned_by = $1', [uId]), 1);

  // Perform delete on auth.users
  await db.exec(`delete from auth.users where id = '${uId}';`);

  assert.equal(await scalar('select count(*)::int from auth.users where id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from provider_profiles where id = $1', [provId]), 0);
  assert.equal(await scalar('select count(*)::int from facility_memberships where user_id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from hospital_duties where user_id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from communication_preferences where user_id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from ai_tool_audit where actor_user_id = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from verification_documents where submitted_by = $1', [uId]), 0);
  assert.equal(await scalar('select count(*)::int from worker_area_assignments where assigned_by = $1', [uId]), 0);

  // Cleanup test facility and worker area
  await db.exec(`delete from facilities where id = '${facId}'; delete from worker_areas where id = '${id(501)}';`);
});

console.log(`${passed} account deletion lifecycle tests passed`);
await db.close();
