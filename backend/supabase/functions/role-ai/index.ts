import {createRoleToolReader} from '../_shared/role-tool-reader.mjs'
import {orchestrateRole,ROLE_TOOLS} from '../_shared/role-ai.mjs'
import {providerConfig} from '../_shared/provider-config.mjs'
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
const respond=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(req.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'})
 const authorization=req.headers.get('authorization')??''
 if(!/^Bearer \S+$/i.test(authorization))return respond(401,{error:'AUTHENTICATION_REQUIRED'})
 try{
  const raw=await req.text();if(raw.length>16000)return respond(413,{error:'REQUEST_TOO_LARGE'})
  const {tool,scope,question,language,context}=JSON.parse(raw)
  if(scope!==undefined&&(!scope||typeof scope!=='object'||Array.isArray(scope)))return respond(400,{error:'INVALID_AI_REQUEST'});
  const resolvedScope = { ...(scope || {}) }
  const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_ANON_KEY')
  if(!base||!key)throw Error('CONFIGURATION_REQUIRED')
  const identityResponse=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
  if(!identityResponse.ok)return respond(401,{error:'AUTHENTICATION_REQUIRED'});
  const identity=await identityResponse.json();
  if(!identity.id)return respond(401,{error:'AUTHENTICATION_REQUIRED'});
  const reader=createRoleToolReader(async(name:string,args:unknown)=>{
   const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
   if(!r.ok){
    const err=await r.json().catch(()=>({}));
    const msg=String(err?.message||'');
    if(/consent/i.test(msg))throw Error('PATIENT_CONSENT_REQUIRED');
    if(/scope/i.test(msg)||/patient.*required/i.test(msg))throw Error('PATIENT_REQUIRED');
    if(/not authorized|unauthorized/i.test(msg))throw Error('PATIENT_ACCESS_REQUIRED');
    throw Error('AI_TOOL_NOT_AUTHORIZED');
   }
   return r.json()
  })
  const readTool=async(name:string,boundScope:Record<string,unknown>,q:string,args:unknown)=>{
   if(ROLE_TOOLS.PATIENT.includes(name)&&!boundScope.patient_id&&!boundScope.facility_id&&!boundScope.task_id){
    const pr=await fetch(`${base}/rest/v1/patient_profiles?select=id&user_id=eq.${encodeURIComponent(identity.id)}&limit=1`,{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
    if(!pr.ok)throw Error('PATIENT_ACCESS_REQUIRED');
    const rows=await pr.json();
    if(!rows[0]?.id)throw Error('PATIENT_REQUIRED');
    boundScope.patient_id=rows[0].id;
   }
   return reader(name,boundScope,q,args);
  }
  const config=()=>providerConfig((name:string)=>Deno.env.get(name),true)
  return respond(200,await orchestrateRole({tool,scope:resolvedScope,question,language,readTool,config,observe:(e:unknown)=>console.info(JSON.stringify(e)),context}))
 }catch(e){
  const code=e instanceof Error?e.message:'';
  const allowed=['CONFIGURATION_REQUIRED','AI_TOOL_NOT_AUTHORIZED','INVALID_AI_REQUEST','SOURCE_OR_ACCESS_CHANGED','MODEL_ROUTE_CHANGED','PATIENT_CONSENT_REQUIRED','PATIENT_REQUIRED','PATIENT_ACCESS_REQUIRED'];
  const status=code==='CONFIGURATION_REQUIRED'?503:code==='INVALID_AI_REQUEST'?400:code==='PATIENT_REQUIRED'?400:['PATIENT_CONSENT_REQUIRED','PATIENT_ACCESS_REQUIRED','AI_TOOL_NOT_AUTHORIZED'].includes(code)?403:502;
  const message=code==='PATIENT_CONSENT_REQUIRED'?'Patient consent required or expired':code==='PATIENT_ACCESS_REQUIRED'?'Patient context not authorized':code==='PATIENT_REQUIRED'?'Patient scope required':'Advanced AI is temporarily unavailable. Core SwasthyaSetu features remain available.';
  return respond(status,{error:allowed.includes(code)?code:'AI_UNAVAILABLE',message})
 }
})
