import assert from 'node:assert/strict';
import {normalizeWorkflow,AI_WORKFLOWS} from '../supabase/functions/_shared/ai-contract.mjs';
import {orchestrateCare} from '../supabase/functions/_shared/ai-orchestrator.mjs';
let n=0;async function test(name,fn){await fn();n++;console.log('PASS '+name)}
await test('legacy aliases normalize without granting a new role',()=>{assert.equal(normalizeWorkflow('CARE_HISTORY','DOCTOR'),'DOCTOR_CLINICAL');assert.equal(normalizeWorkflow('CARE_HISTORY','PATIENT'),'PATIENT_HEALTH');for(const w of ['CONSULTATION','ENCOUNTER'])assert.equal(normalizeWorkflow(w,'DOCTOR'),'DOCTOR_CLINICAL');assert.equal(normalizeWorkflow('PATIENT_HOME','PATIENT'),'PATIENT_HEALTH')});
await test('all unsupported role copilots return truthful unavailable',()=>{for(const [w,entry] of Object.entries(AI_WORKFLOWS))if(!entry.available)assert.throws(()=>normalizeWorkflow(w,entry.roles[0]),/UNAVAILABLE/)});
await test('invalid workflow and cross-role impersonation fail closed',()=>{assert.throws(()=>normalizeWorkflow('NOT_A_WORKFLOW','DOCTOR'),/INVALID/);assert.throws(()=>normalizeWorkflow('ENCOUNTER','PATIENT'),/NOT_AUTHORIZED/);assert.throws(()=>normalizeWorkflow('CARE_HISTORY','PHARMACY'),/NOT_AUTHORIZED/)});
await test('server role denies wrong-role workflow before calling provider',async()=>{let called=false;await assert.rejects(()=>orchestrateCare({patientId:'a',workflow:'DOCTOR_CLINICAL',retrieve:async()=>({patient_id:'a',actor_role:'PATIENT'}),config:{},transport:async()=>{called=true}}),/NOT_AUTHORIZED/);assert.equal(called,false)});
console.log(`${n} AI workflow contract tests passed`);
