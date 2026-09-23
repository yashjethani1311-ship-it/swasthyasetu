import assert from 'node:assert/strict';
import {modelSelection} from '../supabase/functions/_shared/ai-orchestrator.mjs';
import {selectionRecords,selectionRequest} from '../supabase/functions/_shared/selection-privacy.mjs';
const records=[{source_id:'source',date:'2026-01-01',kind:'Consultation',text:'Patient Private Name phone 9999999999 ABHA 123 address Secret Lane; clinical narrative'}];
const projected=selectionRecords(records);assert.doesNotMatch(JSON.stringify(projected),/Private|9999999999|123|Secret|clinical narrative/);assert.equal(projected[0].source_id,'source');
const req=selectionRequest({question:'Show Private Name 9999999999 history',language:'English',role:'DOCTOR'});assert.doesNotMatch(JSON.stringify(req),/Private|9999999999/);
const r=await modelSelection(records,{question:'History',language:'English',role:'DOCTOR'},{provider:'own-model',key:'fixture',model:'fixture',url:'https://fixture.invalid'},async(u,o)=>{assert.doesNotMatch(o.body,/Private|9999999999|Secret/);return new Response(JSON.stringify({outcome:'SOURCES_FOUND',selected_source_ids:['source']}))});assert.equal(r.items[0].text,records[0].text);
const unsafe=await modelSelection(records,{question:'Prescribe a treatment'},{provider:'own-model'},()=>assert.fail());assert.equal(unsafe.outcome,'UNSUPPORTED_REQUEST');
for(const question of ['Summarize active prescribed medicines and instructions','What did my doctor prescribe?','What diagnosis was recorded last visit?','Show my previous diagnosis','When was my dose changed?','List recent care history']) {
 assert.notEqual(selectionRequest({question}).intent,'CLINICIAN_REQUIRED',question);
}
for(const question of ['Prescribe an antibiotic','Diagnose my symptoms','Change my dose','Should I increase my medicine dose?','Recommend a treatment','What medicine should I take?','Show my previous diagnosis and prescribe a treatment']) {
 assert.equal(selectionRequest({question}).intent,'CLINICIAN_REQUIRED',question);
}
console.log('4 minimum-necessary AI tests and 13 clinical intent regressions passed');

assert.match(selectionRequest({question:'मेरी पुरानी दवाइयाँ दिखाओ'}).question,/MEDICINE_HISTORY/);
console.log('PASS Hindi historical medicine intent survives privacy redaction');
