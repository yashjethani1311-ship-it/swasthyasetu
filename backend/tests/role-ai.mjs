import assert from 'node:assert/strict';
import {orchestrateRole,TOOL_NAMES} from '../supabase/functions/_shared/role-ai.mjs';
const tool='get_inventory';const row={id:'stock-1',medicine_name:'Source medicine',quantity:0,updated_at:'2026-09-20'};
const context={tool,scope:{},actor_role:'PHARMACY',purpose:'AI_ASSISTANCE',provenance:'AUTHORIZED_DATABASE_RPC',retrieved_at:'2026-09-20',data:[row]};
const config={provider:'own-model',url:'https://fixture.invalid/select',model:'fixture-v1',key:'fixture'};
const run=(extra={})=>orchestrateRole({tool,question:'Stock kitna hai?',language:'Hinglish',config,readTool:async()=>context,transport:async()=>new Response(JSON.stringify({outcome:'SOURCES_FOUND',selected_source_ids:['get_inventory:stock-1']})),...extra});
let n=0;async function test(name,fn){await fn();n++;console.log('PASS '+name)}
await test('role answers use actual source quantities dates provenance and citations',async()=>{const r=await run();assert.match(r.answer.text,/Source medicine/);assert.match(r.answer.text,/quantity: 0/);assert.equal(r.answer.citations[0].date,'2026-09-20');assert.equal(r.provenance,'AUTHORIZED_DATABASE_RPC')});
await test('unknown tools and role impersonation are rejected before model access',async()=>{assert.ok(TOOL_NAMES.includes('get_referral_status'));await assert.rejects(()=>run({tool:'execute_sql'}),/INVALID/);await assert.rejects(()=>run({readTool:async()=>({...context,actor_role:'PATIENT'})}),/NOT_AUTHORIZED/)});
await test('revocation and source changes during model latency block disclosure',async()=>{let calls=0;await assert.rejects(()=>run({readTool:async()=>{if(++calls>1)throw Error('REVOKED');return context}}),/REVOKED/);calls=0;await assert.rejects(()=>run({readTool:async()=>++calls===1?context:{...context,data:[{...row,quantity:2}]}}),/SOURCE_OR_ACCESS_CHANGED/)});
await test('empty tools remain empty and never fabricate operational rows',async()=>{let called=false;const r=await run({readTool:async()=>({...context,data:[]}),transport:async()=>{called=true}});assert.equal(called,false);assert.equal(r.outcome,'NO_RELEVANT_RECORDS');assert.deepEqual(r.items,[])});
await test('clinical directives never become tool actions and audit excludes source content',async()=>{const events=[];const r=await run({observe:e=>events.push(e),transport:async()=>new Response(JSON.stringify({outcome:'UNSUPPORTED_REQUEST',selected_source_ids:[],action:'change dose'}))});assert.equal(r.outcome,'UNSUPPORTED_REQUEST');assert.doesNotMatch(JSON.stringify(events),/Source medicine|stock-1|Stock kitna/);assert.doesNotMatch(JSON.stringify(r),/change dose/)});
console.log(`${n} role AI orchestrator tests passed`);

const queries=[
 ['meri purani dawaiya kya thi','MEDICINE_HISTORY','get_prescriptions','Hinglish'],
 ['mera latest lab result summarize kro','LAB_SUMMARY','get_recent_diagnostics','Hinglish'],
 ['koi follow-up pending hai?','FOLLOW_UPS','get_open_caregaps','Hinglish'],
 ['find me doctor for cardio problem','DOCTOR_DISCOVERY','d1_practices','English'],
 ['where can I get this medicine?','PHARMACY_DISCOVERY','discover_pharmacies','English'],
 ['Prescribe an antibiotic','CLINICIAN_REQUIRED',null,'English'],
 ['मेरी आखिरी रिपोर्ट क्या कहती है?','LAB_SUMMARY','get_recent_diagnostics','Hindi'],
 ['Summarize my health','HEALTH_SUMMARY','get_patient_snapshot','English'],
 ['Find a hospital','FACILITY_DISCOVERY','d1_facilities','English'],
 ['Show my appointments','APPOINTMENT_HELP','get_appointments','English'],
 ['Show my records','RECORD_LOOKUP','get_longitudinal_history','English'],
 ['What did my doctor prescribe?','MEDICINE_HISTORY','get_prescriptions','English'],
 ['Show abnormal labs','DIAGNOSTIC_HISTORY','get_recent_diagnostics','English'],
];
for(const actor_role of ['PATIENT','DOCTOR'])for(const [question,intent,selected,language] of queries){
 await test(`${actor_role}: ${question}`,async()=>{
  let reads=0;const scope={patient_id:'selected-patient'};
  const r=await orchestrateRole({tool:'get_patient_snapshot',scope,question,language:language==='English'?'Hindi':'English',readTool:async(name,args)=>{
   reads++;assert.equal(name,selected);assert.deepEqual(args,scope);
   return {tool:name,scope:args,actor_role:/DISCOVERY/.test(intent)?'DIRECTORY':actor_role,purpose:'AI_ASSISTANCE',data:[],provenance:'FIXTURE'};
  },config:()=>assert.fail('Empty retrieval and refusal must not resolve model configuration'),transport:()=>assert.fail('No model for empty data')});
  assert.equal(r.intent,intent);assert.equal(r.selected_tool,selected);assert.equal(r.answer.language,language);assert.ok(r.provenance);assert.deepEqual(r.items,[]);
  assert.equal(reads,selected?1:0);
  assert.doesNotMatch(r.answer.text,/Sabhi verified follow-ups up-to-date|You do not have any disease/);
  if(intent==='FOLLOW_UPS')assert.equal(r.answer.text,'Available verified records me koi pending follow-up dikh nahi raha.');
 });
}
await test('doctor selected-patient medicine records remain grounded across authorization rereads',async()=>{
 const scope={patient_id:'selected-patient'};let reads=0;
 const r=await orchestrateRole({tool:'get_patient_snapshot',scope,question:'What did my doctor prescribe?',language:'Hindi',config,
 readTool:async(name,args)=>{reads++;assert.equal(name,'get_prescriptions');assert.deepEqual(args,scope);return {tool:name,scope:args,actor_role:'DOCTOR',purpose:'AI_ASSISTANCE',provenance:'FIXTURE',data:[{id:'rx',issued_at:'2026-01-01',medicine_name:'Recorded medicine'}]};},
 transport:async()=>new Response(JSON.stringify({outcome:'SOURCES_FOUND',selected_source_ids:['get_prescriptions:rx']}))});
 assert.ok(reads>=2);assert.match(r.answer.text,/Recorded medicine/);assert.equal(r.items[0].source_id,'get_prescriptions:rx');assert.equal(r.answer.language,'English');
});
const {createRoleToolReader}=await import('../supabase/functions/_shared/role-tool-reader.mjs');
await test('directory adapter uses bounded real RPCs and pharmacy type filter',async()=>{
 const calls=[];const reader=createRoleToolReader(async(name,args)=>{calls.push([name,args]);return []});
 await reader('d1_practices',{},'find me doctor for cardio problem');
 await reader('discover_pharmacies',{state:'Maharashtra'},'where can I get this medicine?');
 assert.deepEqual(calls,[['d1_practices',{p_filters:{specialization:'Cardiology'},p_offset:0,p_limit:10}],['d1_facilities',{p_filters:{state:'Maharashtra',type:'PHARMACY'},p_offset:0,p_limit:10}]]);
});
await test('directory results survive changing retrieval timestamps and retain provenance',async()=>{
 let reads=0;const readTool=createRoleToolReader(async()=>[{practice_id:'practice',doctor_name:'Verified fixture',checked_at:String(++reads)}]);
 const r=await orchestrateRole({tool:'get_patient_snapshot',question:'find me doctor for cardio problem',readTool,config,
 transport:async()=>new Response(JSON.stringify({outcome:'SOURCES_FOUND',selected_source_ids:['d1_practices:practice']}))});
 assert.ok(reads>=2);assert.equal(r.provenance,'d1_practices');assert.match(r.answer.text,/Verified fixture/);assert.equal(r.items.length,1);
});
const {groundedAnswer}=await import('../supabase/functions/_shared/model-router.mjs');
await test('empty wording follows intent and never turns directory absence into a diagnosis claim',async()=>{
 assert.doesNotMatch(groundedAnswer([],'NO_RELEVANT_RECORDS','English','find a doctor for heart disease').text,/no confirmed.*diagnosis/i);
 assert.doesNotMatch(groundedAnswer([],'NO_RELEVANT_RECORDS','English','What did my doctor prescribe?').text,/Searched practice directory/);
 assert.match(groundedAnswer([],'NO_RELEVANT_RECORDS','English','meri bimari kya hai').text,/Available verified records me koi confirmed current diagnosis dikh nahi raha/);
});
const fs=await import('node:fs');
await test('duplicated AI entrypoint and shared adapters are byte-identical',async()=>{
 const base=new URL('../supabase/functions/',import.meta.url),mirror=new URL('../../frontend/supabase/functions/',import.meta.url);
 for(const file of ['role-ai/index.ts',...fs.readdirSync(new URL('_shared/',base)).filter(f=>f.endsWith('.mjs')).map(f=>'_shared/'+f)]){
  assert.deepEqual(fs.readFileSync(new URL(file,base)),fs.readFileSync(new URL(file,mirror)),file);
 }
});
console.log(`${n} role AI tests passed in total`);
