import assert from "node:assert/strict";
import { db } from "./migrations.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uid = {
  patient: id(1),
  other: id(2),
  doctor: id(3),
  lab: id(4),
  centre: id(5),
  rogue: id(6),
};
const pid = {
  patient: id(11),
  other: id(12),
  doctor: id(13),
  lab: id(14),
  centre: id(15),
  rogue: id(16),
};
const q = (sql, args = []) => db.query(sql, args);
await db.exec(`insert into auth.users(id) values ${Object.values(uid)
  .map((x) => `('${x}')`)
  .join(",")};
insert into patient_profiles(id,user_id,patient_code,full_name,date_of_birth,sex) values('${pid.patient}','${uid.patient}','TEST-P1','Test patient','2000-01-01','FEMALE'),('${pid.other}','${uid.other}','TEST-P2','Other patient','2000-01-01','MALE');
insert into provider_profiles(id,user_id,provider_type,full_name,verification_status) values('${pid.doctor}','${uid.doctor}','DOCTOR','Test doctor','APPROVED'),('${pid.lab}','${uid.lab}','LAB','Test lab','APPROVED'),('${pid.centre}','${uid.centre}','FACILITY','Test centre','APPROVED'),('${pid.rogue}','${uid.rogue}','LAB','Unrelated lab','APPROVED');
insert into facilities(id,owner_user_id,name,facility_type,verification_status,latitude,longitude,city) values('${id(20)}','${uid.lab}','Test lab','DIAGNOSTIC_LAB','APPROVED',28,77,'TestCity'),('${id(21)}','${uid.centre}','Test facility','HOSPITAL','APPROVED',28.01,77,'TestVillage');
insert into collection_centres(id,facility_id,centre_code,centre_name,centre_type,latitude,longitude) values('${id(22)}','${id(21)}','TEST-C','Test collection','PHC',28.01,77);
insert into diagnostic_tests(id,test_code,test_name) values('${id(30)}','TEST-ONLY','Isolated test definition');
insert into diagnostic_parameters(id,test_id,parameter_code,parameter_name,unit,data_type,required) values('${id(31)}','${id(30)}','VALUE','Test parameter','unit','NUMBER',true);
insert into diagnostic_reference_ranges(parameter_id,sex,lower_limit,upper_limit,lab_provider_id) values('${id(31)}','MALE',1,2,'${pid.lab}'),('${id(31)}','FEMALE',10,20,'${pid.lab}');
insert into lab_test_capabilities(lab_provider_id,diagnostic_test_id) values('${pid.lab}','${id(30)}');
insert into collection_centre_tests(collection_centre_id,diagnostic_test_id) values('${id(22)}','${id(30)}');
insert into appointments(id,patient_id,doctor_provider_id,scheduled_at,mode,status) values('${id(40)}','${pid.patient}','${pid.doctor}',now(),'PHYSICAL','CONFIRMED');
insert into encounters(id,appointment_id,patient_id,doctor_provider_id) values('${id(41)}','${id(40)}','${pid.patient}','${pid.doctor}');`);
async function as(user, fn) {
  await db.exec("set role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
const fail = async (fn) => {
  await assert.rejects(fn);
};
await test("patient cannot self-promote to ADMIN", () =>
  as(uid.patient, () =>
    fail(() =>
      q("update profiles set role='ADMIN' where id=$1", [uid.patient]),
    ),
  ));
await test("provider cannot self-approve by insert", () =>
  as(uid.other, () =>
    fail(() =>
      q(
        "insert into provider_profiles(user_id,provider_type,full_name,verification_status) values($1,'LAB','X','APPROVED')",
        [uid.other],
      ),
    ),
  ));
await test("doctor creates catalog-bound order transactionally and retry is idempotent", async () => {
  await as(uid.doctor, () =>
    q("select p0_create_orders($1,$2)", [id(41), [id(30)]]),
  );
  await as(uid.doctor, () =>
    q("select p0_create_orders($1,$2)", [id(41), [id(30)]]),
  );
  assert.equal(
    (await q("select count(*)::int n from lab_orders")).rows[0].n,
    1,
  );
});
let order = (await q("select id from lab_orders")).rows[0].id;
await test("unrelated lab and patient cannot see unassigned order", async () => {
  for (const u of [uid.rogue, uid.other])
    assert.equal(
      (await as(u, () => q("select * from lab_orders"))).rows.length,
      0,
    );
});
await test("another patient cannot select destination", () =>
  as(uid.other, () =>
    fail(() =>
      q("select p0_select_destination($1,$2,$3)", [order, "LAB", id(20)]),
    ),
  ));
await test("capability-aware geographic search returns real calculated distance", async () => {
  const rows = (
    await as(uid.patient, () =>
      q("select * from p0_discover($1,$2,$3,$4,$5,$6)", [
        id(30),
        "CENTRE",
        "",
        28,
        77,
        0,
      ]),
    )
  ).rows;
  assert.equal(rows[0].capability, "SUPPORTED");
  assert.ok(rows[0].distance_km > 1 && rows[0].distance_km < 1.2);
});
await test("patient selects rural centre", () =>
  as(uid.patient, () =>
    q("select p0_select_destination($1,$2,$3)", [order, "CENTRE", id(22)]),
  ));
await test("centre queue excludes clinical notes", async () => {
  const r = (await as(uid.centre, () => q("select p0_collection_queue() q")))
    .rows[0].q;
  assert.equal(r.length, 1);
  assert.equal("clinical_note" in r[0], false);
});
const step = (u, action, sample = null, lab = null, note = null) =>
  as(u, () =>
    q("select p0_specimen_step($1,$2,$3,$4,$5,$6,$7)", [
      order,
      action,
      sample,
      lab,
      note,
      "Test transporter",
      "Test vehicle",
    ]),
  );
await test("centre collects exactly one specimen", async () => {
  await step(uid.centre, "COLLECT");
  await fail(() => step(uid.centre, "COLLECT"));
});
let sample = (await q("select sample_code from lab_specimens")).rows[0]
  .sample_code;
await test("wrong sample ID and skipped stage fail", async () => {
  await fail(() => step(uid.centre, "PACK", "wrong"));
  await fail(() => step(uid.centre, "DISPATCH", sample, pid.lab));
});
await test("pack, dispatch, receive, accept, process preserve custody", async () => {
  await step(uid.centre, "PACK", sample);
  await step(uid.centre, "DISPATCH", sample, pid.lab);
  await step(uid.lab, "RECEIVE", sample);
  await step(uid.lab, "ACCEPT", sample);
  await step(uid.lab, "PROCESS", sample);
  assert.equal(
    (await q("select count(*)::int n from sample_custody_events")).rows[0].n,
    6,
  );
});
await test("browser cannot overwrite specimen or custody", async () => {
  await as(uid.lab, () =>
    fail(() => q("update lab_specimens set status='COMPLETED'")),
  );
  await as(uid.centre, () =>
    fail(() => q("delete from sample_custody_events")),
  );
});
const verify = (u, v) =>
  as(u, () =>
    q("select p0_verify_results($1,$2,$3,$4,$5) id", [
      order,
      sample,
      { [id(31)]: v },
      "MANUAL",
      null,
    ]),
  );
await test("invalid numeric result and unrelated lab rejected", async () => {
  await fail(() => verify(uid.lab, "NaN"));
  await fail(() => verify(uid.rogue, "15"));
  assert.equal(
    (await q("select count(*)::int n from lab_results")).rows[0].n,
    0,
  );
});
let result;
await test("verification uses female range, preserves actual value", async () => {
  result = (await verify(uid.lab, "15")).rows[0].id;
  const ob = (await q("select * from lab_observations")).rows[0];
  assert.equal(ob.flag, "NORMAL");
  assert.equal(ob.raw_value, "15");
  assert.equal(ob.reference_range, "10 - 20");
});
await test("patient cannot read unpublished result", async () =>
  assert.equal(
    (await as(uid.patient, () => q("select * from lab_results"))).rows.length,
    0,
  ));
await test("verification retry cannot overwrite evidence", () =>
  fail(() => verify(uid.lab, "100")));
await test("publication requires stored PDF", () =>
  as(uid.lab, () => fail(() => q("select p0_publish_report($1)", [result]))));
const path = `${pid.patient}/${order}/${result}.pdf`;
await test("unrelated lab cannot upload or access another lab report", async () => {
  await as(uid.rogue, () =>
    fail(() =>
      q(
        "insert into storage.objects(bucket_id,name) values('lab-reports',$1)",
        [path],
      ),
    ),
  );
  await as(uid.lab, () =>
    q("insert into storage.objects(bucket_id,name) values('lab-reports',$1)", [
      path,
    ]),
  );
  assert.equal(
    (
      await as(uid.rogue, () =>
        q("select * from storage.objects where bucket_id='lab-reports'"),
      )
    ).rows.length,
    0,
  );
});
await test("publication completes report, creates one open gap; retry idempotent", async () => {
  for (let n = 0; n < 2; n++)
    await as(uid.lab, () => q("select p0_publish_report($1)", [result]));
  assert.equal(
    (await q("select count(*)::int n from care_gaps where status='OPEN'"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (await as(uid.patient, () => q("select * from lab_results"))).rows.length,
    1,
  );
});
await test("only ordering doctor can review; direct update denied", async () => {
  await as(uid.lab, () =>
    fail(() => q("select p0_review_report($1)", [result])),
  );
  await as(uid.doctor, () =>
    fail(() => q("update lab_results set doctor_reviewed_at=now()")),
  );
});
await test("review closes matching gap and writes exactly one event", async () => {
  for (let n = 0; n < 2; n++)
    await as(uid.doctor, () => q("select p0_review_report($1)", [result]));
  assert.equal(
    (await q("select count(*)::int n from care_gaps where status='OPEN'"))
      .rows[0].n,
    0,
  );
  assert.equal(
    (
      await q(
        "select count(*)::int n from care_events where event_type='LAB_REPORT_REVIEWED'",
      )
    ).rows[0].n,
    1,
  );
});
await db.exec(`insert into diagnostic_tests(id,test_code,test_name) values('${id(32)}','SECOND-TEST','Second isolated test');
insert into diagnostic_parameters(id,test_id,parameter_code,parameter_name,unit,data_type,required) values('${id(33)}','${id(32)}','VALUE2','Second parameter','unit','NUMBER',true);
insert into lab_test_capabilities(lab_provider_id,diagnostic_test_id) values('${pid.lab}','${id(32)}');
insert into appointments(id,patient_id,doctor_provider_id,scheduled_at,mode,status) values('${id(42)}','${pid.other}','${pid.doctor}',now()+interval '1 hour','PHYSICAL','CONFIRMED');
insert into encounters(id,appointment_id,patient_id,doctor_provider_id) values('${id(43)}','${id(42)}','${pid.other}','${pid.doctor}');`);
await test("direct route creates independent second patient order", async () => {
  await as(uid.doctor, () =>
    q("select p0_create_orders($1,$2)", [id(43), [id(32)]]),
  );
  order = (
    await q("select id from lab_orders where patient_id=$1", [pid.other])
  ).rows[0].id;
  await as(uid.other, () =>
    q("select p0_select_destination($1,$2,$3)", [order, "LAB", id(20)]),
  );
  assert.equal(
    (
      await q("select patient_selected_lab from lab_orders where id=$1", [
        order,
      ])
    ).rows[0].patient_selected_lab,
    true,
  );
});
await test("direct route collects, receives, accepts, processes with identity", async () => {
  await step(uid.lab, "COLLECT");
  sample = (
    await q("select sample_code from lab_specimens where lab_order_id=$1", [
      order,
    ])
  ).rows[0].sample_code;
  await step(uid.lab, "RECEIVE", sample);
  await step(uid.lab, "ACCEPT", sample);
  await step(uid.lab, "PROCESS", sample);
});
let directResult;
const raw = JSON.stringify({
  sample_id: sample,
  test_code: "SECOND-TEST",
  observations: [{ parameter_code: "VALUE2", value: 0, unit: "unit" }],
});
await test("missing reference range remains UNKNOWN and raw import preserved", async () => {
  directResult = (
    await as(uid.lab, () =>
      q("select p0_verify_results($1,$2,$3,$4,$5) id", [
        order,
        sample,
        { [id(33)]: "0" },
        "JSON",
        raw,
      ]),
    )
  ).rows[0].id;
  const ob = (
    await q("select * from lab_observations where lab_order_id=$1", [order])
  ).rows[0];
  assert.equal(ob.flag, "UNKNOWN");
  assert.equal(ob.reference_range, "Reference range not configured");
  assert.equal(ob.raw_value, "0");
  assert.equal(
    (
      await q(
        "select raw_payload from lab_machine_payloads where lab_order_id=$1",
        [order],
      )
    ).rows[0].raw_payload.raw_text,
    raw,
  );
});
await test("direct report publishes, isolates patients, closes own review gap", async () => {
  const p = `${pid.other}/${order}/${directResult}.pdf`;
  await as(uid.lab, () =>
    q("insert into storage.objects(bucket_id,name) values('lab-reports',$1)", [
      p,
    ]),
  );
  await as(uid.lab, () => q("select p0_publish_report($1)", [directResult]));
  assert.equal(
    (
      await as(uid.patient, () =>
        q("select * from lab_results where id=$1", [directResult]),
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await as(uid.patient, () =>
        q("select * from storage.objects where name=$1", [p]),
      )
    ).rows.length,
    0,
  );
  await as(uid.doctor, () => q("select p0_review_report($1)", [directResult]));
  assert.equal(
    (await q("select count(*)::int n from care_gaps where status='OPEN'"))
      .rows[0].n,
    0,
  );
});
await test("facility location changes do not mutate provider coordinates", async () => {
  await as(uid.lab, () =>
    q("select p0_save_location($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
      "FACILITY",
      id(20),
      "Entered test address",
      "Village",
      "City",
      "District",
      "State",
      "000000",
      12,
      78,
    ]),
  );
  assert.equal(
    (await q("select latitude from facilities where id=$1", [id(20)])).rows[0]
      .latitude,
    12,
  );
  assert.equal(
    (await q("select latitude from provider_profiles where id=$1", [pid.lab]))
      .rows[0].latitude,
    null,
  );
});
await test("unauthorized facility edit is rejected", () =>
  as(uid.rogue, () =>
    fail(() =>
      q("select p0_save_location($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [
        "FACILITY",
        id(20),
        "Wrong",
        null,
        null,
        null,
        null,
        null,
        12,
        78,
      ]),
    ),
  ));
console.log(`${passed} workflow/security tests passed`);
await db.close();
