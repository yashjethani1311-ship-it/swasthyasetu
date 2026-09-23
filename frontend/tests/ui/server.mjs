import fs from 'node:fs';
import http from 'node:http';import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
const root=path.resolve(new URL('../..',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''));let mode='order';let selected=false;
const order={id:'00000000-0000-4000-8000-000000000050',patient_id:'00000000-0000-4000-8000-000000000011',test_name:'Isolated UI catalog test',diagnostic_test_id:'00000000-0000-4000-8000-000000000030',clinical_note:null,status:'ORDERED',ordered_at:'2026-09-18T09:00:00Z',lab_provider_id:null,collection_centre_id:null,routing_status:null,doctor:{full_name:'UI test doctor'},lab:null,centre:null,lab_results:null,lab_specimens:[]};
http.createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','http://localhost:5187');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json');if(req.method==='OPTIONS'){res.end();return}const u=new URL(req.url,'http://localhost:54329');
 if(u.pathname==='/test-report'){const chunks=[];for await(const chunk of req)chunks.push(chunk);fs.writeFileSync(path.join(root,'tests/ui/report-render-test.pdf'),Buffer.concat(chunks));res.end('{}');return}
 if(u.pathname==='/mode'){mode=u.searchParams.get('value');selected=false;res.end('{}');return}
 if(u.pathname==='/rest/v1/patient_profiles'){res.end(JSON.stringify({id:order.patient_id}));return}
 if(u.pathname==='/rest/v1/lab_orders'){if(mode==='error'){res.statusCode=503;res.end(JSON.stringify({message:'Isolated test: service unavailable'}));return}if(mode==='loading'){await new Promise(r=>setTimeout(r,3000))}res.end(JSON.stringify(mode==='empty'?[]:[{...order,collection_centre_id:selected?'00000000-0000-4000-8000-000000000022':null,centre:selected?{centre_name:'UI test collection centre'}:null}]));return}
 if(u.pathname==='/rest/v1/rpc/p0_discover'){if(mode==='no-options'){res.end('[]');return}res.end(JSON.stringify([{destination_id:'00000000-0000-4000-8000-000000000022',provider_id:null,name:'UI test collection centre',kind:'CENTRE',address:'Isolated test address',distance_km:null,capability:'SUPPORTED'},{destination_id:'00000000-0000-4000-8000-000000000023',provider_id:null,name:'UI unknown capability',kind:'CENTRE',address:'Isolated test address',distance_km:null,capability:'UNKNOWN'}]));return}
 if(u.pathname==='/rest/v1/rpc/p0_select_destination'){selected=true;res.end('null');return}

 if(u.pathname==='/rest/v1/rpc/c1_care_context'){res.end(JSON.stringify({patient_id:order.patient_id,encounters:[{id:'encounter-fixture',started_at:'2026-09-18',status:'COMPLETED',chief_complaint:'UI fixture complaint',clinical_notes:'दर्ज टिप्पणी — केवल UI परीक्षण'}],prescriptions:[],diagnostics:[],health_records:[],care_gaps:[{id:'gap-fixture',gap_type:'FOLLOW_UP_PENDING',status:'OPEN',severity:'HIGH',due_at:'2026-09-25'}],follow_ups:[],events:[{id:'event-fixture',created_at:'2026-09-18',event_type:'CONSULTATION_COMPLETED'}]}));return}
 if(u.pathname==='/functions/v1/swasthya-snapshot'){res.statusCode=503;res.end(JSON.stringify({error:'CONFIGURATION_REQUIRED'}));return}
 if(u.pathname==='/rest/v1/rpc/c1_pharmacy_queue'){res.end(JSON.stringify([{id:'fulfilment-fixture',status:'REQUESTED',full_name:'UI fixture patient',patient_code:'UI-ONLY',items:[{id:'item-fixture',medicine_name:'UI fixture medicine',strength:'Fixture strength',quantity_prescribed:10,dispensed:0,dose:'Source instruction'}]}]));return}
 if(u.pathname==='/rest/v1/provider_profiles'&&u.searchParams.get('provider_type')==='eq.DOCTOR'){res.end(JSON.stringify([{id:'doctor-fixture',full_name:'UI fixture doctor',specialization:'UI fixture specialty',verification_status:'APPROVED'}]));return}
 if(u.pathname==='/rest/v1/provider_practices'){res.end(JSON.stringify([{id:'practice-fixture',provider_id:'doctor-fixture',practice_name:'UI fixture clinic',city:'UI city',state:'UI state',active:true,consultation_mode:'PHYSICAL'}]));return}
 if(u.pathname==='/rest/v1/provider_schedules'||u.pathname==='/rest/v1/appointments'){res.end('[]');return}
 if(u.pathname==='/rest/v1/rpc/a2_available_slots'){res.end(JSON.stringify([{scheduled_at:'2026-09-25T04:00:00Z',duration_minutes:30,consultation_fee:120,practice_timezone:'Asia/Kolkata'}]));return}
 if(u.pathname==='/rest/v1/rpc/a2_book_appointment'){res.statusCode=409;res.end(JSON.stringify({message:'UI fixture: slot no longer available'}));return}
 if(u.pathname==='/rest/v1/provider_profiles'){res.end(JSON.stringify({id:'pharmacy-fixture'}));return}
 if(u.pathname==='/rest/v1/pharmacy_inventory'){res.end('[]');return}
 if(u.pathname==='/rest/v1/rpc/c1_worker_queue'){res.end(JSON.stringify([{id:'task-fixture',patient_code:'UI-ONLY',full_name:'UI fixture patient',phone:null,status:'ASSIGNED',outcome:null,due_at:'2026-09-25'}]));return}
 if(u.pathname==='/rest/v1/rpc/c1_worker_outcome'){res.statusCode=403;res.end(JSON.stringify({message:'UI test: write rejected'}));return}
 if(u.pathname==='/rest/v1/patient_consents'){res.end(JSON.stringify([{id:'consent-fixture',reason:'Review prior records for current consultation — UI fixture',purpose:'TREATMENT',categories:['ENCOUNTERS'],status:'REQUESTED',valid_from:'2026-09-19T00:00:00Z',expires_at:'2027-01-01T00:00:00Z',requester:{full_name:'UI fixture doctor'}}]));return}
 if(u.pathname==='/rest/v1/consent_audit'||u.pathname==='/rest/v1/rpc/a1_access_history'){res.end('[]');return}
 if(u.pathname==='/rest/v1/rpc/a1_decide_consent'){res.statusCode=403;res.end(JSON.stringify({message:'UI fixture: consent decision denied'}));return}
 res.statusCode=404;res.end(JSON.stringify({message:'Unhandled test endpoint: '+u.pathname}));
}).listen(54329,'127.0.0.1');
process.env.VITE_SUPABASE_URL='http://127.0.0.1:54329';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='isolated-ui-test-key';
const server=await createServer({configFile:false,root,plugins:[react(),tailwind()],resolve:{alias:[{find:'@/lib/auth',replacement:path.join(root,'tests/ui/auth.ts')},{find:'@',replacement:path.join(root,'src')}]},server:{host:'localhost',port:5187,strictPort:true}});await server.listen();console.log('UI test only: http://localhost:5187/tests/ui/index.html');

