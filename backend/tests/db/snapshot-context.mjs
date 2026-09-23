import assert from 'node:assert/strict';
import {db} from './migrations.mjs';
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=(s,a=[])=>db.query(s,a),scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
async function as(n,f){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);try{return await f()}finally{await db.exec('reset role')}}
let passed=0;async function test(name,f){try{await f();passed++;console.log('PASS '+name)}catch(e){throw Error(name+': '+e.message)}}
await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');
insert into patient_profiles(id,user_id,patient_code,full_name) values('${id(11)}','${id(1)}','PROV-A','Fixture A'),('${id(12)}','${id(2)}','PROV-B','Fixture B');
insert into provider_profiles(id,user_id,provider_type,full_name,verification_status) values('${id(13)}','${id(3)}','DOCTOR','Fixture doctor','APPROVED');
insert into appointments(id,patient_id,doctor_provider_id,scheduled_at,mode,status) values('${id(20)}','${id(11)}','${id(13)}',now(),'PHYSICAL','CONFIRMED');
insert into encounters(id,appointment_id,patient_id,doctor_provider_id,chief_complaint,clinical_notes) values('${id(21)}','${id(20)}','${id(11)}','${id(13)}','Source complaint','Original note');`);
await q("insert into health_records(id,patient_id,record_type,source_type,storage_path,original_filename) values($1,$2,'REPORT','PATIENT_UPLOAD','private-original','Actual original.pdf')",[id(40),id(11)]);

await test('snapshot preserves unknown current clinical status and actual episode provenance',async()=>{const r=await as(1,()=>scalar('select s1_snapshot_context($1)',[id(11)]));assert.match(r.current_state.active_medicines,/UNKNOWN/);assert.match(r.current_state.allergies,/documented/);assert.equal(r.episodes[0].encounter_id,id(21));assert.equal(r.episodes[0].nodes[0].state,'IN_PROGRESS');assert.equal(r.reviewed_documents.length,0)});
await test('another patient cannot read snapshot',()=>as(2,()=>assert.rejects(()=>q('select s1_snapshot_context($1)',[id(11)]))));
let treatment,ai;
await test('treatment permission does not authorize AI snapshot',async()=>{treatment=await as(3,()=>scalar("select a1_request_consent($1,'TREATMENT',array['ENCOUNTERS'],'Review episode history',now(),now()+interval '1 day')",[id(11)]));await as(1,()=>q("select a1_decide_consent($1,'GRANTED')",[treatment]));assert.equal((await as(3,()=>scalar('select s1_snapshot_context($1)',[id(11)]))).episodes.length,1);await as(3,()=>assert.rejects(()=>q('select a1_ai_context($1)',[id(11)]),/consent/))});
await test('AI snapshot category scope excludes episodes without encounter grant',async()=>{ai=await as(3,()=>scalar("select a1_request_consent($1,'AI_ASSISTANCE',array['DOCUMENTS'],'Summarize uploaded history',now(),now()+interval '1 day')",[id(11)]));await as(1,()=>q("select a1_decide_consent($1,'GRANTED')",[ai]));const r=await as(3,()=>scalar('select a1_ai_context($1)',[id(11)]));assert.equal(r.episodes.length,0);assert.equal(r.encounters.length,0);assert.equal(r.health_records.length,1)});
await test('revoked AI grant fails even with active treatment consent',async()=>{await as(1,()=>q("select a1_decide_consent($1,'REVOKED')",[ai]));await as(3,()=>assert.rejects(()=>q('select a1_ai_context($1)',[id(11)]),/consent/));assert.ok(await scalar("select count(*)::int from consent_audit where action='CONTEXT_READ'"))});
console.log(passed+' Snapshot context tests passed');await db.close();
