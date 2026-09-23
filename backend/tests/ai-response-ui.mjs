import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const filename=new URL('../../frontend/src/components/SwasthyaCopilot.tsx',import.meta.url);
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function render(answer){
 const id='12345678-1234-1234-1234-123456789abc';
 const result={answer:{text:answer},items:[{source_id:id,kind:'get_prescriptions',date:'2026-09-22',text:'{"patient_id":"'+id+'"}',display_text:'Fixture medicine 25 mg — 1 tablet twice daily; with food.'}],audit_reference:id,provenance:'AUTHORIZED_DATABASE_RPC',freshness:'LIVE_STAGING_SNAPSHOT',notice:'INTERNAL_STATUS'};
 let hook=0;const state=['',false,result,'',[],[],[]];const exports={};
 const stub=({children})=>React.createElement('div',null,children);
 new Function('require','exports',js)(name=>{
  if(name==='react')return {...React,useState:()=>[state[hook++],()=>{}]};
  if(name==='react/jsx-runtime')return require(name);
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name==='./kit')return {Badge:stub,Button:stub,Card:stub};
  if(name==='@/lib/i18n')return {useLanguage:()=>({language:'English'})};
  if(name==='@/lib/utils')return {safeFormatDate:x=>x};
  if(name.includes('VoiceInputButton'))return {VoiceInputButton:stub};
  return {};
 },exports);
 return renderToStaticMarkup(React.createElement(exports.SwasthyaCopilot,{workflow:'PATIENT_HOME'}));
}
const html=render('Your dated prescription lists Fixture medicine 25 mg — 1 tablet twice daily; with food.');
assert.match(html,/Fixture medicine 25 mg/);assert.match(html,/View sources/);
for(const output of [html,render('Source get_prescriptions {"dose":"secret"}')])assert.doesNotMatch(output,/get_prescriptions|patient_id|12345678|AUTHORIZED_DATABASE_RPC|Audit #|Raw source record|LIVE_STAGING_SNAPSHOT|INTERNAL_STATUS|secret/);
console.log('2 rendered patient AI UI checks passed: sanitized sources and legacy raw-answer suppression');
