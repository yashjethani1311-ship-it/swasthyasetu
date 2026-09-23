import assert from 'node:assert/strict';
import {db} from './migrations.mjs';
const id=n=>`52000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=(s,a=[])=>db.query(s,a);
const scalar=async(s,a=[])=>Object.values((await q(s,a)).rows[0])[0];
async function as(n,fn){await db.exec('set role authenticated');await q("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);try{return await fn()}finally{await db.exec('reset role')}}
let passed=0;async function test(n,fn){await fn();passed++;console.log('PASS '+n)}
await db.exec(`insert into auth.users(id) select ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,35)n;
insert into patient_profiles(id,user_id,patient_code,city,state) values('${id(101)}','${id(1)}','D2-A','Pune','Maharashtra'),('${id(102)}','${id(2)}','D2-B',null,null);
insert into provider_profiles(id,user_id,provider_type,full_name,verification_status) values('${id(103)}','${id(3)}','DOCTOR','Doctor','APPROVED'),('${id(104)}','${id(4)}','DOCTOR','Other doctor','APPROVED');
insert into provider_profiles(id,user_id,provider_type,full_name,verification_status) select ('52000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<20 then 'WORKER'::app_role else 'PHARMACY'::app_role end,'Candidate '||n,'APPROVED' from generate_series(5,35)n;
insert into facilities(id,owner_user_id,name,facility_type,city,state,verification_status) values('${id(200)}','${id(3)}','Encounter clinic','CLINIC','Pune','Maharashtra','APPROVED');
insert into provider_practices(id,provider_id,facility_id,practice_name,consultation_mode) values('${id(201)}','${id(103)}','${id(200)}','Practice','PHYSICAL');
insert into facility_memberships(facility_id,user_id,staff_role) select '${id(200)}',('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'RECEPTION' from generate_series(5,16)n;
insert into appointments(id,patient_id,doctor_provider_id,practice_id,scheduled_at,mode,status) values('${id(202)}','${id(101)}','${id(103)}','${id(201)}',now(),'PHYSICAL','CONFIRMED');
insert into encounters(id,appointment_id,patient_id,doctor_provider_id,chief_complaint,clinical_notes,follow_up_in_days) values('${id(203)}','${id(202)}','${id(101)}','${id(103)}','Test','Test',7);
insert into facilities(owner_user_id,name,facility_type,city,state,verification_status) select ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Dispensing '||n,'PHARMACY','Pune','Maharashtra','APPROVED' from generate_series(20,31)n;
insert into facilities(owner_user_id,name,facility_type,city,state,verification_status) values('${id(32)}','Far away','PHARMACY','Delhi','Delhi','APPROVED'),('${id(33)}','Same city other state','PHARMACY','Pune','Other','APPROVED'),('${id(34)}','Not a pharmacy','CLINIC','Pune','Maharashtra','APPROVED');`);
await as(3,()=>q("select c1_finish_encounter($1,'[{\"medicine_name\":\"Test\",\"quantity_prescribed\":1}]',array[]::uuid[])",[id(203)]));
const gap=await scalar("select id from care_gaps where gap_type='FOLLOW_UP_PENDING'");
const rx=await scalar('select id from prescriptions');
const workers=(search='',offset=0)=>q('select * from d2_gap_workers($1,$2,$3)',[gap,search,offset]);
const pharmacies=(search='',offset=0)=>q('select * from d2_rx_pharmacies($1,$2,$3)',[rx,search,offset]);
await test('worker discovery denies unrelated doctor, patient and anonymous callers',async()=>{
 await as(4,()=>assert.rejects(()=>workers()));await as(1,()=>assert.rejects(()=>workers()));
 await db.exec('set role anon');try{await assert.rejects(()=>workers())}finally{await db.exec('reset role')}
});
await test('worker search is facility bounded with stable pages and literal wildcard search',async()=>{
 const a=(await as(3,()=>workers())).rows,b=(await as(3,()=>workers('',10))).rows;
 assert.equal(a.length,10);assert.equal(b.length,2);assert.equal(new Set([...a,...b].map(r=>r.id)).size,12);
 assert.equal((await as(3,()=>workers('Candidate 17'))).rows.length,0);
 assert.equal((await as(3,()=>workers('%'))).rows.length,0);
 await as(3,()=>assert.rejects(()=>workers('',-1)));await as(3,()=>assert.rejects(()=>workers('a'.repeat(101))));
});
await test('direct assignment rejects global provider and revoked membership',async()=>{
 await as(3,()=>assert.rejects(()=>q('select c1_assign_followup($1,$2)',[gap,id(117)])));
 await q('update facility_memberships set active=false where user_id=$1',[id(5)]);
 assert.equal((await as(3,()=>workers('Candidate 5'))).rows.length,0);
 await as(3,()=>assert.rejects(()=>q('select c1_assign_followup($1,$2)',[gap,id(105)])));
 await q('update facility_memberships set active=true where user_id=$1',[id(5)]);
 assert.ok(await as(3,()=>scalar('select c1_assign_followup($1,$2)',[gap,id(105)])));
});
await test('active patient delegation permits discovery and revocation removes eligibility',async()=>{
 const task=await scalar('select id from follow_up_tasks');
 await as(1,()=>q("select w1_delegate($1,array['REPORT_OUTCOME'],now()+interval '1 day')",[task]));
 await q('update facility_memberships set active=false where user_id=$1',[id(5)]);
 assert.equal((await as(3,()=>workers('Candidate 5'))).rows.length,1);
 await q("update worker_delegations set status='REVOKED'");
 assert.equal((await as(3,()=>workers('Candidate 5'))).rows.length,0);
});
await test('pharmacies require own active prescription and exact city/state facility',async()=>{
 await as(2,()=>assert.rejects(()=>pharmacies()));await as(3,()=>assert.rejects(()=>pharmacies()));
 const a=(await as(1,()=>pharmacies())).rows,b=(await as(1,()=>pharmacies('',10))).rows;
 assert.equal(a.length,10);assert.equal(b.length,2);assert.equal(new Set([...a,...b].map(r=>r.id)).size,12);
 for(const search of ['Far away','Candidate 33','Candidate 34','Candidate 35','%'])assert.equal((await as(1,()=>pharmacies(search))).rows.length,0);
 await as(1,()=>assert.rejects(()=>pharmacies('',10001)));
 await q('update patient_profiles set city=null where id=$1',[id(101)]);await as(1,()=>assert.rejects(()=>pharmacies(),/city and state/));
 await q("update patient_profiles set city='Pune' where id=$1",[id(101)]);
 await q("update prescriptions set status='CANCELLED' where id=$1",[rx]);await as(1,()=>assert.rejects(()=>pharmacies()));
});
console.log(`${passed} context discovery tests passed`);await db.close();
