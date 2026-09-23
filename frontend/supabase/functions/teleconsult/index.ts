import {teleconsult} from '../_shared/teleconsult.mjs'
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers})
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'})
 const authorization=req.headers.get('authorization')??''
 if(!/^Bearer \S+$/i.test(authorization))return reply(401,{error:'AUTHENTICATION_REQUIRED'})
 try{
  const raw=await req.text();if(raw.length>2000)return reply(413,{error:'REQUEST_TOO_LARGE'})
  const {appointment,request,action}=JSON.parse(raw)
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if(!uuid.test(appointment??'')||(!uuid.test(request??'')&&action!=='END'))return reply(400,{error:'INVALID_REQUEST'})
  const base=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if(!base||!anon||!service)return reply(503,{error:'PROVIDER_UNAVAILABLE'})
  const rpc=async(name:string,args:unknown,trusted:boolean)=>{
   const key=trusted?service:anon
   const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:trusted?`Bearer ${key}`:authorization,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)})
   if(!r.ok)throw Error(trusted?'PROVIDER_UNAVAILABLE':'NOT_AUTHORIZED')
   return r.json()
  }
  return reply(200,await teleconsult({appointment,request,action,userRpc:(n:string,a:unknown)=>rpc(n,a,false),serviceRpc:(n:string,a:unknown)=>rpc(n,a,true),environment:(n:string)=>Deno.env.get(n)}))
 }catch(e){const code=e instanceof Error?e.message:'';return reply(code==='NOT_AUTHORIZED'?403:503,{error:code==='NOT_AUTHORIZED'?'NOT_AUTHORIZED':'PROVIDER_UNAVAILABLE'})}
})
