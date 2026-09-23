import assert from 'node:assert/strict';
import fs from 'node:fs';
import {orchestrateRole,intentRoute} from '../supabase/functions/_shared/role-ai.mjs';
import {humanEvidence,isDisplayAnswer} from '../supabase/functions/_shared/answer-presentation.mjs';
const config={provider:'groq',key:'fixture',model:'fixture',fallback:{provider:'gemini',key:'fixture',model:'fixture'}};
const scope={patient_id:'patient-fixture'};
const rx={id:'rx',issued_at:'2026-09-22',status:'ACTIVE',patient_id:'secret-patient',clinical_notes:'private narrative',items:[{medicine_name:'Fixture medicine',strength:'25 mg',dose:'1 tablet',frequency:'twice daily',instructions:'with food'}]};
let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
const reply=(text,gemini=false)=>new Response(JSON.stringify(gemini?{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}:{choices:[{finish_reason:'stop',message:{content:text}}]}));
for(const [q,intent] of [['hii','CASUAL'],[[...crypto.getRandomValues(new Uint8Array(5))].map(n=>String.fromCharCode(97+n%26)).join('')+' arre yaaar','CASUAL'],['what is diabetes?','GENERAL_HEALTH'],['tell me a joke','OFF_TOPIC']])await test(`${q}: ${intent}, no patient DB`,async()=>{
 let calls=0;const r=await orchestrateRole({tool:'get_patient_snapshot',scope,question:q,config,readTool:()=>assert.fail('Database access forbidden'),transport:async()=>{calls++;return reply(JSON.stringify({action:'answer',text:'Hello! How can I help with your health today?'}));}});
 assert.equal(r.intent,'MODEL_CONVERSATION');assert.equal(r.tool,null);assert.equal(calls,1);assert.ok(isDisplayAnswer(r.answer.text));
});
async function run(q,options={}){
 let reads=0;const calls=[];const tool=intentRoute(q,'get_patient_snapshot',scope).tool;
 const data=tool==='get_recent_diagnostics'?[{id:'rx',test_name:'Fixture test',ordered_at:'2026-09-22',result:{status:'COMPLETED',verified_at:'2026-09-22',result_json:{value:7,unit:'mg/dL'}}}]:[rx];
 const r=await orchestrateRole({tool:'get_patient_snapshot',scope,question:q,config,readTool:async()=>{reads++;if(options.revoke&&reads>1)throw Error('REVOKED');return {tool,scope,actor_role:'PATIENT',purpose:'AI_ASSISTANCE',data,audit_reference:'internal-audit'};},transport:async(url,o)=>{
 if(url.endsWith('/models'))return new Response('{}');
 const selecting=!reads;
 if(selecting)return reply(JSON.stringify({action:'tool',tool,arguments:{}}),url.includes('googleapis'));
 calls.push(url.includes('googleapis')?'gemini':'groq');assert.doesNotMatch(o.body,/secret-patient|private narrative|patient-fixture|internal-audit/);
 if(options.allDown||options.groqDown&&!url.includes('googleapis'))return new Response('',{status:503});
 const text=options.raw?' {"source":"get_prescriptions"}':q.includes('meri')?'Aapke dated prescription mein Fixture medicine 25 mg — 1 tablet twice daily; with food darj hai.':tool==='get_recent_diagnostics'?'Your Fixture test result dated 2026-09-22 is 7 mg/dL.':'Your dated prescription lists Fixture medicine 25 mg — 1 tablet twice daily; with food.';
 return reply(JSON.stringify({action:'answer',text}),url.includes('googleapis'));
 }});return {r,reads,calls};
}
for(const q of ['can you tell about my daily medicine take','meri purani dawaiya kya thi','mera latest lab result summarize kro'])await test(`${q}: correct tool and natural answer`,async()=>{const {r,reads}=await run(q);assert.equal(r.tool,q.includes('lab')?'get_recent_diagnostics':'get_prescriptions');assert.ok(reads>=2);assert.ok(isDisplayAnswer(r.answer.text));assert.ok(isDisplayAnswer(r.items[0].display_text));if(q.includes('meri'))assert.match(r.answer.text,/Aapke/);});
await test('answer generation uses Gemini after Groq fails',async()=>{const {r,calls}=await run('my medicines',{groqDown:true});assert.deepEqual(calls,['groq','gemini']);assert.equal(r.answer_provider,'gemini');});
await test('both providers unavailable: readable nested prescription fallback',async()=>{const {r}=await run('my medicines',{allDown:true});assert.equal(r.answer_provider,'deterministic');assert.match(r.answer.text,/Fixture medicine 25 mg.*1 tablet.*twice daily.*with food/s);assert.ok(isDisplayAnswer(r.answer.text));});
await test('raw JSON from both models is rejected',async()=>{const {r}=await run('my medicines',{raw:true});assert.equal(r.answer_provider,'deterministic');assert.ok(isDisplayAnswer(r.answer.text));});
await test('revocation after answer generation blocks disclosure',async()=>{await assert.rejects(()=>run('my medicines',{revoke:true}),/REVOKED/);});
await test('diagnostic and care task fallbacks preserve values/date/due status',async()=>{const {r}=await run('my latest lab result',{allDown:true});assert.match(r.answer.text,/7.*mg\/dL/s);const text=humanEvidence({text:JSON.stringify({gap_type:'REPORT_REVIEW',status:'OPEN',due_at:'2026-09-23'}),date:'2026-09-22'});assert.match(text,/report review.*OPEN.*2026-09-23/s);assert.ok(isDisplayAnswer(text));});
await test('model safety response never reads records or gets replaced',async()=>{const text='Please discuss dose changes with your clinician. What concern are you having with the current dose?';const r=await orchestrateRole({question:'increase my medicine dose',readTool:()=>assert.fail(),config,transport:async()=>reply(JSON.stringify({action:'answer',text}))});assert.equal(r.answer.text,text);});
await test('UI has no raw source or audit rendering paths',async()=>{const ui=fs.readFileSync(new URL('../../frontend/src/components/SwasthyaCopilot.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/Raw source record|Audit #|\{item\.text\}|\{item\.kind\}|\{result\.provenance\}/);assert.match(ui,/readableText\(result.answer.text\)/);assert.match(ui,/readableText\(item.display_text\)/);});
console.log(`${count} focused AI response tests passed`);
