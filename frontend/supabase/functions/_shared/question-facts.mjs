import {cleanText,humanEvidence} from './answer-presentation.mjs';
const present=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&!/^(?:not documented|unknown|n\/a|null|none)$/i.test(String(v).trim());
const label=v=>cleanText(v).replaceAll('_',' ').replace(/\b(?:IN PROGRESS|ACTIVE|OPEN|PENDING|COMPLETED|CONFIRMED|CANCELLED|CLOSED)\b/g,m=>m.toLowerCase());
const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>present(row?.[k])).map(k=>[k,row[k]]));
const date=r=>r.verified_at||r.issued_at||r.started_at||r.ordered_at||r.scheduled_at||r.created_at||'';
const latest=rows=>[...rows].sort((a,b)=>String(date(b)).localeCompare(String(date(a))));
const item=(row,kind,body)=>({source_id:row.id||row.practice_id||row.facility_id||kind,date:date(row),kind,text:JSON.stringify(body)});
function medicine(p){return {status:p.status,items:(p.items||[p]).map(r=>pick(r,['medicine_name','strength','dose','route','frequency','duration','instructions'])).filter(r=>r.medicine_name)};}
function diagnosisRows(ctx){
 const encounters=latest(ctx.encounters||[]);
 return encounters.filter(r=>present(r.diagnosis)&&!r.resolved_at&&!/resolved|ruled.out|suspected/i.test(String(r.diagnosis_status||''))&&(r.diagnosis_status==='ACTIVE'||r.is_current===true||r===encounters[0])).map(r=>item(r,'Documented diagnosis',{diagnosis:r.diagnosis}));
}
function diagnostics(rows){return latest(rows).filter(r=>r.result?.status==='COMPLETED'&&r.result?.verified_at).map(r=>item({...r,verified_at:r.result.verified_at},'Recent investigation',{test_name:r.test_name,result:{result_json:r.result.result_json}}));}
export function relevantFacts(context,intent,question='',now=new Date()){
 if(context.actor_role && !['PATIENT','DOCTOR'].includes(context.actor_role))return null;
 const rows=context.data||[],ctx=context.tool==='get_patient_snapshot'?(rows[0]||{}):{};
 let facts=[];
 if(intent==='DIAGNOSIS')facts=diagnosisRows(ctx.encounters?ctx:{encounters:rows});
 else if(intent==='APPOINTMENT_HELP'){
  const list=ctx.appointments||rows;
  const past=/\b(?:past|previous|history|purani|pichli)\b|पिछल|पुरान/i.test(question);
  const appts=list.filter(r=>past||(!['CANCELLED','COMPLETED','NO_SHOW'].includes(r.status)&&(Date.parse(r.scheduled_at)>=now.getTime()-86400000||['CONFIRMED','SCHEDULED','REQUESTED','PENDING','WAITING','IN_PROGRESS'].includes(r.status)))).sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  facts=(past?appts.reverse():appts.slice(0,1)).map(r=>item(r,'Appointment',pick(r,['scheduled_at','practice_timezone','doctor_name','provider_name','facility_name','practice_name','status','mode'])));
 }else if(['MEDICINE_HISTORY','MEDICINES'].includes(intent)){
  const list=ctx.prescriptions||rows;
  facts=list.map(r=>item(r,'Prescription',medicine(r)));
 }else if(['LAB_SUMMARY','DIAGNOSTIC_HISTORY'].includes(intent)){
  const list=ctx.diagnostics||rows;
  facts=diagnostics(list);if(/latest|recent|आखिरी|नवीनतम/i.test(question)&&facts.length)facts=facts.filter(r=>r.date===facts[0].date);
 }else if(intent==='FOLLOW_UPS'){
  const list=ctx.care_gaps||rows;
  facts=list.filter(r=>!['CLOSED','COMPLETED','CANCELLED'].includes(r.status)).map(r=>item(r,'Pending care',pick(r,['gap_type','task','title','status','due_at'])));
 }else if(intent==='DOCTOR_DISCOVERY'){
  facts=rows.map(r=>item(r,'Doctor practice',pick(r,['doctor_name','specialization','practice_name','address','city','district','state','distance_km','next_slot','availability_state','timezone','mode','consultation_fee'])));
 }else if(/FACILITY_DISCOVERY|PHARMACY_DISCOVERY/.test(intent)){
  facts=rows.map(r=>item(r,'Facility',pick(r,['name','facility_name','facility_type','type','city','district','state','distance_km','address','address_text'])));
 }else return null;
 return facts;
}
export function emptyRelevant(intent,language,question=''){
 const hinglish=language==='Hinglish',hindi=language==='Hindi';
 if(intent==='DIAGNOSIS')return hindi?'उपलब्ध सत्यापित रिकॉर्ड में कोई पुष्ट वर्तमान निदान दर्ज नहीं है। दवाओं या जाँच परिणामों से बीमारी का अनुमान नहीं लगाया गया है।':hinglish?'Available verified records mein koi confirmed current diagnosis documented nahi hai. Dawaiyon ya lab results se bimari ka andaza nahi lagaya gaya hai.':'No confirmed current diagnosis is documented in the available verified records. Medicines and lab results do not establish a diagnosis.';
 if(intent==='APPOINTMENT_HELP')return hindi?'उपलब्ध रिकॉर्ड में कोई आगामी अपॉइंटमेंट नहीं मिला।':hinglish?'Available records mein koi upcoming appointment nahi mila.':'No upcoming appointment was found in the available records.';
 if(intent==='FOLLOW_UPS')return hindi?'उपलब्ध रिकॉर्ड में कोई खुला फॉलो-अप नहीं मिला।':hinglish?'Available verified records me koi pending follow-up dikh nahi raha.':'No open follow-up was found in the available records.';
 if(intent==='DOCTOR_DISCOVERY')return hindi?'सत्यापित डॉक्टर डायरेक्टरी में कोई मेल खाता रिकॉर्ड नहीं मिला।':hinglish?'Verified practice directory mein koi matching doctor ya clinic record nahi mila.':'No matching verified practitioner was found in the practice directory.';
 if(intent==='PHARMACY_DISCOVERY')return hindi?'सत्यापित मेडिकल स्टोर या फार्मेसी का कोई रिकॉर्ड नहीं मिला।':hinglish?'Verified pharmacy / medical store directory mein koi matching record nahi mila.':'No verified pharmacy or medical store was found in the directory.';
 if(intent==='FACILITY_DISCOVERY')return hindi?'सत्यापित अस्पताल या जाँच केंद्र डायरेक्टरी में कोई रिकॉर्ड नहीं मिला।':hinglish?'Verified hospital / lab directory mein koi matching record nahi mila.':'No verified hospital or diagnostic facility was found in the directory.';
 return hindi?'इस सवाल से संबंधित सत्यापित जानकारी नहीं मिली।':hinglish?'Is sawal se related verified jaankari nahi mili.':'No verified information relevant to this question was found.';
}
export function clinicalSnapshot(ctx,language='English'){
 const isHi=language==='Hindi',isHinglish=language==='Hinglish';
 const meds=latest(ctx.prescriptions||[]).filter(r=>r.status==='ACTIVE').map(r=>item(r,'Active medicines',medicine(r)));
 const dated=latest(ctx.prescriptions||[]).filter(r=>r.status!=='ACTIVE'&&!['CANCELLED','STOPPED'].includes(r.status)).slice(0,3).map(r=>item(r,'Dated prescriptions',medicine(r)));
 const labs=diagnostics(ctx.diagnostics||[]).slice(0,5);
 const diagnoses=diagnosisRows(ctx);
 const gaps=(ctx.care_gaps||[]).filter(r=>!['CLOSED','COMPLETED','CANCELLED'].includes(r.status)).slice(0,8).map(r=>item(r,'Open follow-ups',pick(r,['gap_type','status','due_at'])));
 const consultRows=latest(ctx.encounters||[]).filter(e=>present(e.chief_complaint)||present(e.symptoms)||present(e.clinical_notes));
 const consult=consultRows.slice(0,1).map(r=>item(r,'Recent consultation',pick(r,['chief_complaint','symptoms','clinical_notes'])));
 const emptyDiagnosis=isHi?'कोई पुष्ट निदान दर्ज नहीं है।':isHinglish?'Koi confirmed diagnosis documented nahi hai.':'No confirmed diagnosis documented.';
 const emptyConsult=isHi?'हाल के परामर्श का कोई नैदानिक विवरण दर्ज नहीं है।':'No documented clinical details.';
 const sections=[
  ['Active medicines',meds,isHi?'सक्रिय दवाइयाँ दर्ज नहीं हैं।':'No medicines explicitly marked active.'],
  ...(dated.length?[['Dated prescriptions',dated,'']]:[]),
  ['Recent investigations',labs,isHi?'सत्यापित जाँच परिणाम उपलब्ध नहीं हैं।':'No verified recent investigation available.'],
  ['Documented diagnoses',diagnoses,emptyDiagnosis],
  ['Open follow-ups / care gaps',gaps,isHi?'कोई खुला फॉलो-अप दर्ज नहीं है।':'No open follow-up documented.'],
  ['Recent consultation',consult,emptyConsult]
 ];
 return {text:'CLINICAL SNAPSHOT\n\n'+sections.map(([title,items,empty])=>title+'\n'+(items.length?items.map(r=>'• '+humanEvidence(r)).join('\n'):'• '+empty)).join('\n\n'),sections:sections.map(([title,items])=>({title,items:items.map(r=>({...r,display_text:humanEvidence(r)}))}))};
}
