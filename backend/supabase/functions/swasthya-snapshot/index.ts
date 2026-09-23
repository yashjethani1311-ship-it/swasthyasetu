import {providerConfig} from '../_shared/provider-config.mjs'
import {orchestrateCare} from '../_shared/ai-orchestrator.mjs'
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'}
const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(req.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'})
 const authorization=req.headers.get('authorization')??''
 if(!/^Bearer \S+$/i.test(authorization))return respond(401,{error:'AUTHENTICATION_REQUIRED'})
 try{
 const raw=await req.text();if(raw.length>6000)return respond(413,{error:'REQUEST_TOO_LARGE'})
 const {patient_id,question,language,workflow}=JSON.parse(raw)
 if(typeof patient_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patient_id))return respond(400,{error:'INVALID_PATIENT'})
 const base=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_ANON_KEY')
 if(!base||!key)return respond(503,{error:'CONFIGURATION_REQUIRED'})
 const retrieve=async(id:string)=>{const r=await fetch(`${base}/rest/v1/rpc/a1_ai_context`,{method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({p_patient:id}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('PATIENT_CONTEXT_NOT_AUTHORIZED');return r.json()}
 const config=()=>providerConfig((name:string)=>Deno.env.get(name))
 const result=await orchestrateCare({patientId:patient_id,question,language,workflow,retrieve,config,observe:(event:unknown)=>console.info(JSON.stringify(event))})
 return respond(200,result)
 }catch(e){const code=e instanceof Error?e.message:'';if(e instanceof SyntaxError)return respond(400,{error:'INVALID_JSON'});const allowed=['AI_WORKFLOW_NOT_AUTHORIZED','AI_WORKFLOW_UNAVAILABLE','CONFIGURATION_REQUIRED','PATIENT_CONTEXT_NOT_AUTHORIZED','INVALID_AI_REQUEST','NO_SOURCE_RECORDS','SOURCE_OR_ACCESS_CHANGED','MODEL_REFUSED','MODEL_INCOMPLETE','QUESTION_PROVIDER_NOT_SUPPORTED'];return respond(['CONFIGURATION_REQUIRED','AI_WORKFLOW_UNAVAILABLE'].includes(code)?503:['PATIENT_CONTEXT_NOT_AUTHORIZED','AI_WORKFLOW_NOT_AUTHORIZED'].includes(code)?403:code==='INVALID_AI_REQUEST'?400:502,{error:allowed.includes(code)?code:'AI_UNAVAILABLE'})}
})
