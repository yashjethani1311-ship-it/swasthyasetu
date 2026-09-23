import {planSemanticTools} from './semantic-planner.mjs';
import {conversationBrain} from './conversation-brain.mjs';
import {relevantFacts,emptyRelevant,clinicalSnapshot} from './question-facts.mjs';
import {generateRecordAnswer,humanEvidence} from './answer-presentation.mjs';
import {sourceRecords} from '../swasthya-snapshot/grounding.mjs';
import {selectionRequest} from './selection-privacy.mjs';
import {modelSelection} from './ai-orchestrator.mjs';
import {LANGUAGES,groundedAnswer,detectLanguage,generateGeneralHealthAnswer} from './model-router.mjs';
const registry={
 DIRECTORY:['d1_practices','d1_facilities','discover_pharmacies'],
 PATIENT:['get_patient_snapshot','get_recent_diagnostics','get_prescriptions','get_medicine_fulfilment','get_appointments','get_open_caregaps','get_nextstep','get_caregraph','get_longitudinal_history','get_diagnostic_trends','get_pending_report_reviews','get_active_medicines','get_followup_state','get_referral_status'],
 DOCTOR:['get_patient_snapshot','get_recent_diagnostics','get_prescriptions','get_medicine_fulfilment','get_appointments','get_open_caregaps','get_nextstep','get_caregraph','get_longitudinal_history','get_diagnostic_trends','get_pending_report_reviews','get_active_medicines','get_followup_state','get_referral_status','get_critical_worklist'],
 FACILITY:['get_hospital_queue','get_admissions','get_beds','get_discharge_pending','get_facility_workload','get_hospital_procedures','get_hospital_stores','get_hospital_referrals'],
 LAB:['get_lab_quality','get_lab_machines','get_recollection_worklist','get_pathology_worklist','get_study_worklist','get_critical_worklist'],
 PHARMACY:['get_pharmacy_delivery','get_inventory','get_low_stock','get_expiry','get_pharmacy_fulfilment','get_purchases','get_sales_summary'],
 WORKER:['get_assigned_tasks','get_worker_delegations','get_worker_sync','get_worker_next_action'],
 ADMIN:['get_integration_health','get_governance_incidents','get_district_pulse','get_verification_queue','get_model_governance'],
};
export const ROLE_TOOLS=Object.freeze(Object.fromEntries(Object.entries(registry).map(([k,v])=>[k,Object.freeze(v)])));
export const TOOL_NAMES=Object.freeze([...new Set(Object.values(registry).flat())]);
export const INTENT_TO_TOOL=Object.freeze({DIAGNOSIS:'get_patient_snapshot',HEALTH_SUMMARY:'get_patient_snapshot',MEDICINES:'get_prescriptions',MEDICINE_HISTORY:'get_prescriptions',LAB_SUMMARY:'get_recent_diagnostics',DIAGNOSTIC_HISTORY:'get_recent_diagnostics',FOLLOW_UPS:'get_open_caregaps',DOCTOR_DISCOVERY:'d1_practices',FACILITY_DISCOVERY:'d1_facilities',PHARMACY_DISCOVERY:'discover_pharmacies',APPOINTMENT_HELP:'get_appointments',RECORD_LOOKUP:'get_longitudinal_history',CLINICIAN_REQUIRED:null,CASUAL:null,GENERAL_HEALTH:null,OFF_TOPIC:null});
export function intentRoute(question,tool,scope={}){
 const {intent}=selectionRequest({question});
 const clinical=registry.PATIENT.includes(tool)||Boolean(scope.patient_id)||!tool;
 return {intent,tool:['CLINICIAN_REQUIRED','CASUAL','GENERAL_HEALTH','OFF_TOPIC'].includes(intent)?null:(clinical||/DISCOVERY$/.test(intent)?INTENT_TO_TOOL[intent]??(intent==='AUTHORIZED_HISTORY'?'get_patient_snapshot':null):tool)};
}
function recordsFromTool(result){
 if(result.tool==='get_patient_snapshot')return sourceRecords(result.data[0]??{});
 if(result.actor_role==='DIRECTORY')result={...result,data:result.data.map(({checked_at,...row})=>row)};
 const rows=result.data.map((row,i)=>({source_id:`${result.tool}:${row.id??row.practice_id??row.facility_id??row.provider_id??i}`,date:row.checked_at??row.occurred_at??row.updated_at??row.created_at??row.issued_at??row.ordered_at??row.scheduled_at??row.source_at??row.assigned_at??row.requested_at??'DATE_NOT_RECORDED',kind:result.tool,text:JSON.stringify(row)}));
 if(JSON.stringify(rows).length>180000)throw Error('CONTEXT_TOO_LARGE');return rows;
}

export async function orchestrateRole({tool,scope={},question='',language='English',readTool,config,transport=fetch,observe=(_event)=>{},context:convContext=null}){
 if((tool!==undefined&&!TOOL_NAMES.includes(tool))||typeof question!=='string'||question.length>1000||!LANGUAGES.includes(language)||!scope||typeof scope!=='object'||Array.isArray(scope)||Object.keys(scope).some(k=>!['patient_id','facility_id','task_id','state','district','month','city','latitude','longitude','radius_km'].includes(k)))throw Error('INVALID_AI_REQUEST');
 const requestId=crypto.randomUUID();const started=Date.now();
 let brainConfig = null;
 let useBrain = false;
 if (!tool || tool === 'get_patient_snapshot') {
  if (config && typeof config === 'object') {
   brainConfig = config;
   useBrain = ['groq', 'gemini'].includes(config.provider);
  } else if (typeof config === 'function') {
   try {
    brainConfig = await config();
    useBrain = ['groq', 'gemini'].includes(brainConfig?.provider);
   } catch (err) {
    if (err?.message === 'CONFIGURATION_REQUIRED') {
     useBrain = true;
     brainConfig = null;
    }
   }
  }
 }
 if (useBrain) {
  return conversationBrain({question,language,tool,scope,context:convContext,config:brainConfig,resolveConfig:brainConfig&&typeof config==='function'?config:null,transport,readTool,registry:ROLE_TOOLS,recordsFromTool,observe,requestId,started});
 }
 // Compatibility for the separately governed owned-model selection contract.
 // Hosted conversation and provider outages never enter this legacy classifier.
 const sel=selectionRequest({question});
 let route=intentRoute(question,tool,scope);
 let plannerArgs={};
 let plannerTools=[];
 let clarificationMsg=null;

 const patientCatalog = ['get_patient_snapshot','get_prescriptions','get_recent_diagnostics','get_open_caregaps','get_appointments','get_longitudinal_history','d1_practices','d1_facilities','discover_pharmacies'];
 if((!tool || patientCatalog.includes(tool)) && (!sel.high_confidence||sel.intent==='AMBIGUOUS'||sel.intent==='AUTHORIZED_HISTORY')){
  let c;try{c=typeof config==='function'?await config():config}catch{}
  if(c?.key){
   const plan=await planSemanticTools(question,c,transport,convContext);
   if(plan){
    plannerArgs=plan.arguments||{};
    plannerTools=plan.selected_tools||[];
    clarificationMsg=plan.clarification_prompt;
    if(plan.action==='CLARIFY'&&clarificationMsg){
     route={intent:'CLARIFY',tool:null};
    }else if(plan.action==='ANSWER_DIRECTLY'){
     const need=plan.needs[0]||'GENERAL_HEALTH';
     route={intent:need,tool:null};
    }else if(plan.action==='USE_TOOL'&&plannerTools.length>0){
     const primary=plannerTools[0];
     const mappedIntent=primary==='get_prescriptions'?'MEDICINE_HISTORY'
      :primary==='get_recent_diagnostics'?'LAB_SUMMARY'
      :primary==='get_open_caregaps'?'FOLLOW_UPS'
      :primary==='get_appointments'?'APPOINTMENT_HELP'
      :primary==='get_patient_snapshot'?(/\bbimari|disease|diagnosis\b/i.test(question)?'DIAGNOSIS':'HEALTH_SUMMARY')
      :primary==='get_longitudinal_history'?'RECORD_LOOKUP'
      :primary==='d1_practices'?'DOCTOR_DISCOVERY'
      :primary==='d1_facilities'?'FACILITY_DISCOVERY'
      :primary==='discover_pharmacies'?'PHARMACY_DISCOVERY'
      :plan.needs[0]||'HEALTH_SUMMARY';
     route={intent:mappedIntent,tool:primary};
    }
   }
  }
 }

 tool=route.tool;language=detectLanguage(question,language);
 const metadata={intent:route.intent,detected_intent:route.intent,selected_tool:tool,tool,language};

 if(route.intent==='CLARIFY'&&clarificationMsg){
  observe({request_id:requestId,...metadata,status:'ANSWERED',source_count:0,duration_ms:Date.now()-started});
  return {...metadata,request_id:requestId,outcome:'CLARIFICATION_REQUIRED',items:[],answer:{language,text:clarificationMsg,citations:[]},provenance:'PLANNER_CLARIFICATION'};
 }

 if((route.intent==='AMBIGUOUS'&&!tool)||(route.intent==='CLARIFY'&&!clarificationMsg)){
  observe({request_id:requestId,...metadata,status:'ANSWERED',source_count:0,duration_ms:Date.now()-started});
  const msg = language === 'Hindi'
   ? 'नमस्ते! क्या आपको किसी विशिष्ट दवा (medicine) के बारे में जानना है, नज़दीकी मेडिकल स्टोर (pharmacy) खोजना है, या किसी बीमारी की जानकारी चाहिए?'
   : language === 'Hinglish'
   ? 'Namaste! Kya aapko koi specific dawai (medicine) chahiye, nazdeeki medical store (pharmacy) dhoondhna hai, ya kisi health topic ki jaankari chahiye?'
   : 'Hello! Would you like information about a specific medicine, help finding a nearby pharmacy or clinic, or general health guidance?';
  return {...metadata,request_id:requestId,outcome:'CLARIFICATION_REQUIRED',items:[],answer:{language,text:msg,citations:[]},provenance:'DISAMBIGUATION_POLICY_NO_RETRIEVAL'};
 }

 if(route.intent==='CLINICIAN_REQUIRED'){
  observe({request_id:requestId,...metadata,status:'REFUSED',source_count:0,duration_ms:Date.now()-started});
  return {...metadata,request_id:requestId,outcome:'UNSUPPORTED_REQUEST',items:[],answer:groundedAnswer([],'UNSUPPORTED_REQUEST',language,question),provenance:'SAFETY_POLICY_NO_RETRIEVAL'};
 }

 if(route.intent==='CASUAL'||route.intent==='OFF_TOPIC'){
  observe({request_id:requestId,...metadata,status:'ANSWERED',source_count:0,duration_ms:Date.now()-started});
  const outcome=route.intent==='CASUAL'?'CONVERSATIONAL':'OFF_TOPIC';
  let answer=groundedAnswer([],outcome,language,question);
  if(route.intent==='CASUAL')try {
   const c=typeof config==='function'?await config():config;
   const generated=await generateGeneralHealthAnswer(question,language,c,transport,convContext);
   answer={...answer,text:generated.text};
  }catch{}
  return {...metadata,request_id:requestId,outcome,items:[],answer,provenance:'CONVERSATIONAL_POLICY_NO_RETRIEVAL'};
 }

 if(route.intent==='GENERAL_HEALTH'){
  let text='';
  let modelRoute={provider:'NONE',model_version_id:null,revision:null};
  let conf=config;
  if(typeof conf==='function')try{conf=await conf()}catch(e){modelRoute={provider:'CONFIG_RESOLVE_ERR',error:String(e?.message||e)}}
  if(conf?.key&&(conf.provider==='groq'||conf.provider==='gemini')){
   try{
    const genRes=await generateGeneralHealthAnswer(question,language,conf,transport,convContext);
    text=genRes.text;
    modelRoute=genRes.model_route;
   }catch(e){
    modelRoute={provider:'GENERATION_ERR',error:String(e?.message||e)};
    console.warn('General health generation failed, using educational grounded text:', e?.message);
   }
  }else if(!modelRoute.error){
   modelRoute={provider:'NO_KEY',confProvider:conf?.provider,hasKey:Boolean(conf?.key)};
  }
  const answer=text?{language,text,citations:[],mode:'GENERAL_HEALTH_EDUCATION',translation_notice:'Educational health information provided for guidance only.'}:groundedAnswer([],'GENERAL_HEALTH',language,question);
  observe({request_id:requestId,...metadata,status:'SUCCESS',source_count:0,duration_ms:Date.now()-started});
  return {...metadata,request_id:requestId,outcome:'GENERAL_HEALTH_EXPLANATION',items:[],answer,provenance:'GENERAL_HEALTH_KNOWLEDGE_NO_RETRIEVAL',model_route:modelRoute};
 }

 const read=async(t=tool,args=plannerArgs)=>{
  const r=await readTool(t,scope,question,args);
  if(r.tool!==t||!ROLE_TOOLS[r.actor_role]?.includes(t)||r.purpose!=='AI_ASSISTANCE'||JSON.stringify(Object.entries(r.scope??{}).sort())!==JSON.stringify(Object.entries(scope).sort()))throw Error('AI_TOOL_NOT_AUTHORIZED');
  if(!Array.isArray(r.data))throw Error('INVALID_TOOL_RESULT');
  return r;
 };

 try{
  const context=await read(tool,plannerArgs);
  let records=recordsFromTool(context);
  let facts=relevantFacts(context,route.intent,question);

  // Controlled compound query support (e.g. appointment + doctor discovery): execute secondary tool if planned
  if(plannerTools.length>1&&plannerTools[1]!==tool){
   const secTool=plannerTools[1];
   try{
    const secCtx=await read(secTool,plannerArgs);
    const secRecs=recordsFromTool(secCtx);
    const secIntent=secTool==='d1_practices'?'DOCTOR_DISCOVERY':secTool==='d1_facilities'?'FACILITY_DISCOVERY':'HEALTH_SUMMARY';
    const secFacts=relevantFacts(secCtx,secIntent,question);
    if(secRecs.length)records=[...records,...secRecs];
    if(secFacts?.length)facts=[...(facts||[]),...secFacts];
   }catch(_e){}
  }

  const snapshot=tool==='get_patient_snapshot'&&['HEALTH_SUMMARY','AUTHORIZED_HISTORY'].includes(route.intent)?clinicalSnapshot(context.data[0]||{},language):null;
  const resolve=typeof config==='function'?config:null;

  if(!records.length)return {...metadata,request_id:requestId,actor_role:context.actor_role,outcome:'NO_RELEVANT_RECORDS',items:[],answer:{...groundedAnswer([],'NO_RELEVANT_RECORDS',language,question),...(snapshot?{text:snapshot.text}:facts!==null?{text:emptyRelevant(route.intent,language,question)}:{})},provenance:context.provenance,retrieved_at:context.retrieved_at,uncertainty:context.uncertainty,audit_reference:context.audit_reference,freshness:context.freshness,model_route:{provider:config?.provider??'NONE',model_version_id:config?.model_version_id??null,revision:config?.route_revision??null}};

  if(resolve)try{config=await resolve()}catch(e){if(e.message!=='CONFIGURATION_REQUIRED')throw e;config=null;}
  let result;
  try {
   result=(facts!==null||snapshot)?{items:records.slice(0,12),outcome:records.length?'SOURCES_FOUND':'NO_RELEVANT_RECORDS',model_route:{provider:'deterministic'}}:await modelSelection(records,{question,language,workflow:tool,role:context.actor_role},config,transport,async()=>{
    const latest=await read(tool,plannerArgs);
    if(latest.actor_role!==context.actor_role||JSON.stringify(recordsFromTool(latest))!==JSON.stringify(recordsFromTool(context)))throw Error('SOURCE_OR_ACCESS_CHANGED');
    if(resolve){const fresh=await resolve();if(fresh.route_revision!==config.route_revision||fresh.fallback?.model_version_id!==config.fallback?.model_version_id)throw Error('MODEL_ROUTE_CHANGED');}
   });
  }catch(e){
   if(!/PROVIDER_UNAVAILABLE|CONFIGURATION_REQUIRED|MODEL_INCOMPLETE/.test(e?.message??'')&&!['TimeoutError','AbortError','TypeError'].includes(e?.name))throw e;
   result={items:records.slice(0,12),outcome:'SOURCES_FOUND',model_route:{provider:'deterministic'}};
  }

  const generated=snapshot?{text:snapshot.text,provider:'deterministic'}:facts?.length===0?{text:emptyRelevant(route.intent,language,question),provider:'deterministic'}:result.items.length?await generateRecordAnswer(facts||result.items,language,config,transport,async()=>{
   const latest=await read(tool,plannerArgs);
   if(latest.actor_role!==context.actor_role||JSON.stringify(recordsFromTool(latest))!==JSON.stringify(recordsFromTool(context)))throw Error('SOURCE_OR_ACCESS_CHANGED');
  },route.intent,question):null;

  if(route.intent==='DIAGNOSIS'&&facts?.length&&generated)generated.text=language==='Hinglish'?'Aapke record mein documented diagnosis:\n'+facts.map(humanEvidence).join('\n'):language==='Hindi'?'रिकॉर्ड में दर्ज निदान:\n'+facts.map(humanEvidence).join('\n'):'Your documented diagnosis:\n'+facts.map(humanEvidence).join('\n');

  const refreshed=await read(tool,plannerArgs);
  if(refreshed.actor_role!==context.actor_role)throw Error('AI_TOOL_NOT_AUTHORIZED');
  const current=recordsFromTool(refreshed);
  if(result.items.some(r=>!current.some(x=>x.source_id===r.source_id&&x.date===r.date&&x.text===r.text)))throw Error('SOURCE_OR_ACCESS_CHANGED');
  if(resolve&&config){const fresh=await resolve();if(fresh.model_version_id!==config.model_version_id||fresh.route_revision!==config.route_revision||(result.fallback_used&&fresh.fallback?.model_version_id!==config.fallback?.model_version_id))throw Error('MODEL_ROUTE_CHANGED');}

  observe({request_id:requestId,tool,status:'SUCCESS',source_count:records.length,duration_ms:Date.now()-started});
  return {...result,...metadata,...(snapshot?{snapshot_sections:snapshot.sections}:{}),items:result.items.map(item=>({...item,display_text:humanEvidence(item)})),answer:{...groundedAnswer(result.items,result.outcome,language,question),...(generated?{text:generated.text}:{})},answer_provider:generated?.provider,request_id:requestId,tool,actor_role:context.actor_role,provenance:context.provenance,retrieved_at:refreshed.retrieved_at,uncertainty:context.uncertainty,audit_reference:context.audit_reference,freshness:context.freshness,model_route:result.model_route};
 }catch(e){
  observe({request_id:requestId,tool,status:'FAILED',duration_ms:Date.now()-started});
  throw e;
 }
}
