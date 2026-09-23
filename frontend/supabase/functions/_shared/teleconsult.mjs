// Trusted adapter contract; only the RPC boundary can authorize participants. No credentials persist here.
export async function teleconsult({appointment,request,action='JOIN',userRpc,serviceRpc,environment,transport=fetch,now=()=>Date.now()}) {
 if(!['JOIN','END'].includes(action))throw Error('INVALID_REQUEST');
 const opened=await userRpc('t4_open',{p_appointment:appointment});
 const call=async(context,path,payload)=>{
  const origin=environment(`${context.config_ref}_URL`),key=environment(`${context.config_ref}_KEY`);
  if(!origin||!key)throw Error('PROVIDER_UNAVAILABLE');
  let u;try{u=new URL(origin)}catch{throw Error('PROVIDER_UNAVAILABLE')}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('PROVIDER_UNAVAILABLE');
  const r=await transport(new URL(path,u.origin),{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('PROVIDER_UNAVAILABLE');
  const raw=await r.text();if(raw.length>16000)throw Error('PROVIDER_UNAVAILABLE');
  try{return JSON.parse(raw)}catch{throw Error('PROVIDER_UNAVAILABLE')}
 };
 if(action==='END'){
  const state=await userRpc('t4_request_end',{p_session:opened.session_id});
  if(state==='ENDED')return {session_id:opened.session_id,state};
  const c=await serviceRpc('t4_end_context',{p_session:opened.session_id});
  const r=await call(c,'/rooms/end',{room_reference:c.room_reference,idempotency_key:c.idempotency_key});
  if(r.state!=='ENDED'||typeof r.reference!=='string'||r.reference.length<3||r.reference.length>200)throw Error('PROVIDER_UNAVAILABLE');
  await serviceRpc('t4_provider_state',{p_session:c.session_id,p_state:'ENDED',p_reference:r.reference,p_event:c.idempotency_key});
  return {session_id:c.session_id,state:'ENDED'};
 }
 if(opened.state==='UNCONFIGURED'){
  const c=await serviceRpc('t4_prepare',{p_session:opened.session_id});
  const r=await call(c,'/rooms',{idempotency_key:c.session_id,expires_at:c.expires_at,recording_enabled:false});
  if(typeof r.room_reference!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(r.room_reference))throw Error('PROVIDER_UNAVAILABLE');
  await serviceRpc('t4_room_ready',{p_session:c.session_id,p_reference:r.room_reference,p_event:`room:${c.session_id}`});
 }
 const intent=await userRpc('t4_join_intent',{p_session:opened.session_id,p_request:request});
 if(intent.status!=='ISSUANCE_REQUIRED')throw Error('PROVIDER_UNAVAILABLE');
 const c=await serviceRpc('t4_issue_context',{p_intent:intent.intent_id});
 const r=await call(c,'/join-credentials',{idempotency_key:c.intent_id,room_reference:c.room_reference,participant_id:c.participant_id,role:c.role,expires_at:c.expires_at,recording_enabled:false});
 if(typeof r.token!=='string'||r.token.length<16||r.token.length>8000||typeof r.reference!=='string'||r.reference.length<3||r.reference.length>200||!Number.isFinite(Date.parse(r.expires_at))||Date.parse(r.expires_at)>Date.parse(c.expires_at)||Date.parse(r.expires_at)<=now())throw Error('PROVIDER_UNAVAILABLE');
 const current=await serviceRpc('t4_issue_context',{p_intent:intent.intent_id});
 if(JSON.stringify(current)!==JSON.stringify(c))throw Error('AUTHORIZATION_CHANGED');
 await serviceRpc('t4_token_issued',{p_intent:c.intent_id,p_reference:r.reference});
 return {session_id:c.session_id,participant_id:c.participant_id,role:c.role,token:r.token,expires_at:r.expires_at,recording_enabled:false};
}
