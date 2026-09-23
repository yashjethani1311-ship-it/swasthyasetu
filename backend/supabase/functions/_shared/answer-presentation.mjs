// Only these clinical/display fields can cross the answer-generation boundary.
const fields = new Set('medicine_name strength dose route frequency duration instructions quantity quantity_prescribed test_name value result_value unit units reference_range interpretation gap_type task title due_at status state severity diagnosis chief_complaint temperature_c pulse_bpm systolic_bp diastolic_bp spo2_percent weight_kg doctor_name specialization practice_name facility_name name city district consultation_fee scheduled_at practice_timezone provider_name mode distance_km address address_text type symptoms clinical_notes next_slot availability_state timezone'.split(' '));
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export function cleanText(value) {
 if (!['string','number'].includes(typeof value)) return '';
 if(/^(?:not documented|unknown|n\/a|null)$/i.test(String(value).trim()))return '';
 return String(value).replace(uuid,'').replace(/\b(?:get_\w+|a3_\w+|AUTHORIZED_DATABASE_RPC|[A-Z]+(?:_[A-Z]+)+)\b/g, m => m.startsWith('get_') || m.startsWith('a3_') || m === 'AUTHORIZED_DATABASE_RPC' ? '' : m.toLowerCase().replaceAll('_',' ')).replace(/[{}\[\]`]/g,'').trim();
}
export function isDisplayAnswer(text) {
 return typeof text === 'string' && text.trim().length > 0 && text.length < 12000 && !/^(?:I(?:'m| am| will)|Please hold on|Let me|One moment)\s+(?:fetching|checking|looking up|retriev(?:ing|e)|gather)/i.test(text.trim()) && !/[{}\[\]`]|\b(?:get_\w+|a3_\w+|AUTHORIZED_DATABASE_RPC|Audit\s*#|Source\s+get_|[A-Z]+(?:_[A-Z]+)+)\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(text);
}
function describe(row, depth=0) {
 if (!row || typeof row !== 'object' || depth > 5) return [];
 if (Array.isArray(row)) return row.flatMap(r=>describe(r,depth+1));
 const parts=Object.entries(row).filter(([k,v])=>fields.has(k)&&['string','number'].includes(typeof v)).map(([k,v])=>`${k.replaceAll('_',' ')}: ${cleanText(v)}`).filter(s=>!s.endsWith(': '));
 const lines=parts.length?[parts.join(' · ')]:[];
 if(row.medicine_name) {
  const name=[row.medicine_name,row.strength].map(cleanText).filter(Boolean).join(' ');
  const directions=[row.dose,row.route,row.frequency,row.duration,row.instructions].map(cleanText).filter(Boolean).join('; ');
  lines.splice(0,lines.length,name+(directions?' — '+directions:'' )+(row.quantity!==undefined?' · quantity: '+cleanText(row.quantity):''));
 } else if(row.scheduled_at && (row.doctor_name || row.provider_name || row.facility_name || row.practice_name)) {
  const doc = [row.doctor_name, row.provider_name].map(cleanText).filter(Boolean)[0];
  const place = [row.facility_name, row.practice_name].map(cleanText).filter(Boolean)[0];
  const dt = String(row.scheduled_at).replace('T', ' ').replace(/:\d\d\..*|Z/g, '');
  const status = cleanText(row.status || '');
  const mode = cleanText(row.mode || '');
  let appt = `Appointment on ${row.scheduled_at}${row.practice_timezone ? ` (${cleanText(row.practice_timezone)})` : ''}`;
  if(doc) appt += ` with ${doc.startsWith('Dr') ? doc : 'Dr. ' + doc}`;
  if(place) appt += ` at ${place}`;
  if(status) appt += ` (${status.toLowerCase()}${mode ? `, ${mode.toLowerCase()}` : ''})`;
  lines.splice(0, lines.length, appt);
 } else if(row.doctor_name && (row.practice_name || row.specialization || row.availability_state || row.city)) {
  const doc = row.doctor_name.toLowerCase().startsWith('dr') ? row.doctor_name : 'Dr. ' + row.doctor_name;
  const spec = row.specialization ? cleanText(row.specialization) : '';
  const place = [row.practice_name, row.address, row.city, row.state].filter(Boolean).map(cleanText).join(', ');
  let timing = '';
  if (row.next_slot) {
   const dt = String(row.next_slot).replace('T', ' ').replace(/:\d\d\..*|Z/g, '');
   timing = ` · Next available slot: ${dt}${row.timezone ? ` (${cleanText(row.timezone)})` : ''}`;
  } else {
   timing = ' · Specific clinic opening hours not recorded in directory listing';
  }
  lines.splice(0, lines.length, `${doc}${spec ? ` (${spec})` : ''} at ${place}${timing}`);
 } else if(row.facility_type || (row.name && (row.city || row.state))) {
  const fname = cleanText(row.name || row.facility_name);
  const ftype = cleanText(row.facility_type || row.type || 'Facility').replaceAll('_', ' ');
  const loc = [row.address, row.address_text, row.city, row.state].filter(Boolean).map(cleanText).join(', ');
  const dist = (row.distance_km != null && !isNaN(row.distance_km)) ? ` · ${row.distance_km} km away` : ' · Location distance unavailable without coordinates';
  lines.splice(0, lines.length, `${fname} (${ftype}) — ${loc}${dist}`);
 } else if(row.diagnosis) {
  lines.splice(0, lines.length, cleanText(row.diagnosis));
 } else if(row.test_name) {
  const tname = cleanText(row.test_name);
  const rjson = row.result?.result_json || row.result_json || {};
  const observations = Array.isArray(rjson?.observations) ? rjson.observations : [];
  if (observations.length > 0) {
   lines.splice(0, lines.length, ...observations.map(o => {
    const pname = cleanText(o.parameter_name || o.parameter_code || tname);
    const val = cleanText(o.raw_value ?? o.value ?? '');
    const unit = cleanText(o.unit ?? '');
    const flag = cleanText(o.flag ?? o.interpretation ?? '');
    const numPart = [val, unit].filter(Boolean).join(' ');
    return `${pname} — ${numPart}${flag && !/normal/i.test(flag) ? ` (${flag})` : ''}`;
   }));
  } else if (rjson.value !== undefined || rjson.result_value !== undefined) {
   const val = cleanText(rjson.value ?? rjson.result_value);
   const unit = cleanText(rjson.unit ?? rjson.units ?? '');
   const flag = cleanText(rjson.flag ?? rjson.interpretation ?? '');
   const numPart = [val, unit].filter(Boolean).join(' ');
   lines.splice(0, lines.length, `${tname} — ${numPart}${flag && !/normal/i.test(flag) ? ` (${flag})` : ''}`);
  } else if (typeof rjson === 'object' && Object.keys(rjson).length > 0) {
   const sub = [];
   for (const [k, v] of Object.entries(rjson)) {
    if (/^(?:id|.*_id|name|phone|address|email|notes?|file|url|status|source|sample_code)$/i.test(k)) continue;
    if (typeof v === 'string' || typeof v === 'number') {
     sub.push(`${cleanText(k.replaceAll('_',' '))} — ${cleanText(v)}`);
    }
   }
   if (sub.length > 0) lines.splice(0, lines.length, ...sub);
   else lines.splice(0, lines.length, tname);
  } else {
   lines.splice(0, lines.length, tname);
  }
 } else if(row.gap_type || row.task || row.title) {
  const action = cleanText(row.title || row.task || row.gap_type || '');
  const humanAction = action.replaceAll('_', ' ').toLowerCase();
  const status = row.status ? cleanText(row.status) : '';
  const due = row.due_at ? `due ${cleanText(row.due_at).slice(0, 10)}` : '';
  lines.splice(0, lines.length, [humanAction, status, due].filter(Boolean).join(' · '));
 }
 for(const key of ['items','result','result_json','results','components']) {
  const child=row[key];
  if (key==='result_json' && child && typeof child==='object' && !Array.isArray(child)) {
   for(const [test,value] of Object.entries(child)) {
    if (fields.has(test)) continue;
    if (/^(?:id|.*_id|name|phone|address|email|notes?|file|url)$/i.test(test)) continue;
    if (typeof value==='number' || typeof value==='string') lines.push(`${cleanText(test.replaceAll('_',' ').replace(/hba1c/i,'HbA1c'))}: ${cleanText(value)}`);
    else lines.push(...describe(value,depth+1).map(s=>`${cleanText(test.replaceAll('_',' '))} — ${s}`));
   }
  }
  lines.push(...describe(child,depth+1));
 }
 return lines;
}
export function humanEvidence(item) {
 let lines;
 try { lines=describe(JSON.parse(item.text)); }
 catch {
  const cleaned = String(item.text)
    .replace(/(?:Status|Complaint|Symptoms|Recorded diagnosis|Clinician notes|Follow-up after days|strength|dose|route|frequency|duration|instructions|total units prescribed):\s*(?:Not documented|null|unknown|none|undefined)[.;,\s]*/gi, '')
    .split(/[\[{]/)[0];
  lines=[cleanText(cleaned)];
 }
 const date=/^\d{4}-\d{2}-\d{2}/.test(item.date??'')?item.date.slice(0,10):'';
 const body=lines.filter(Boolean).join('\n• ') || 'Record details are not available in a readable form.';
 return `${date ? date+' — ' : ''}${body}`;
}
export function recordFallback(items,language) {
 const intro=language==='Hindi'?'आपके दिनांकित रिकॉर्ड के अनुसार:':language==='Hinglish'?'Aapke records ke anusar:':'Your records show:';
 return `${intro}\n• ${items.map(humanEvidence).join('\n• ')}`;
}
export async function generateRecordAnswer(items, language, config, transport=fetch, beforeFallback=async()=>{}, focus='', question='') {
 const facts=items.map(humanEvidence);
 const prompt=`User question: "${question || focus || 'Health question'}".
Focus: ${focus || 'Direct answer to question'}.
You are SwasthyaCopilot, an intelligent and compassionate AI health assistant for SwasthyaSetu.
Answer the user's question directly, naturally, and warmly in ${language} using ONLY the verified facts below.
Rules:
1. SPEAK NATURALLY TO THE HUMAN:
   - DO NOT TALK LIKE A DATABASE OR SEARCH ENGINE.
   - NEVER say "According to your authorized database records", "Aapke dated records mein yeh darj hai", "the database contains", "the RPC returned", or mention tool names or record IDs.
   - Deliver the answer directly and conversationally (e.g., "Aapki current medicines mein Metformin 500 mg shamil hai...", "Aapke aas-paas available options mein XYZ Pharmacy hai...").
2. Answer ONLY what the user asked. If they asked about medicines, focus on medicines. If they asked about doctor timings or clinic location, state the doctor, clinic/practice, and slot/timing clearly. If daily opening hours are not stored, explain that next slot is available but specific daily hours are not listed. If they asked for a pharmacy, state the verified medical store / pharmacy.
3. Medication indications and abnormal labs are NEVER a documented diagnosis. Never invent or infer a diagnosis.
4. Preserve every medicine name, dose, frequency, date, slot time, and value exactly.
5. Do NOT output raw JSON, tool names, schemas, UUIDs, or audit references.
6. Use clean formatting with short prose or bullet points.`;

 let current=config;
 while(current) {
  try {
   let text;
    if(current.provider==='groq') {
     const candidateModels = [
       current.model,
       'qwen/qwen3.8-27b',
       'openai/gpt-oss-20b',
       'openai/gpt-oss-120b',
       'llama-3.3-70b-versatile',
       'llama-3.1-8b-instant',
       'llama3-70b-8192'
     ].filter(Boolean);
     let response;
     for (const model of [...new Set(candidateModels)]) {
       try {
         const res = await transport(`${(current.url||'https://api.groq.com/openai/v1').replace(/\/+$/,'')}/chat/completions`,{
           method:'POST',
           redirect:'error',
           signal:AbortSignal.timeout(6000),
           headers:{Authorization:`Bearer ${current.key}`,'Content-Type':'application/json'},
           body:JSON.stringify({
             model,
             messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({question,facts})}],
             temperature:0.2,
             max_tokens:1400
           })
         });
          if (res.ok) { response = res; break; }
          if (res.status === 404 || res.status === 400 || res.status === 429) continue;
          break;
        } catch {
          break;
        }
      }
     if(!response || !response.ok)throw Error('ANSWER_UNAVAILABLE');
     const data=await response.json();if(data.choices?.[0]?.finish_reason!=='stop')throw Error('ANSWER_INCOMPLETE');
     text=data.choices?.[0]?.message?.content;
    } else if(current.provider==='gemini') {
     const candidateModels = [
       (current.model||'gemini-3.6-flash').replace(/^models\//, ''),
       'gemini-3.6-flash',
       'gemini-3.5-flash-lite',
       'gemini-3.5-flash',
       'gemini-1.5-flash'
     ];
     let response;
     for (const m of [...new Set(candidateModels)]) {
       try {
         const res = await transport(`${(current.url||'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/,'')}/models/${encodeURIComponent(m)}:generateContent`,{
           method:'POST',
           redirect:'error',
           signal:AbortSignal.timeout(5000),
           headers:{'x-goog-api-key':current.key,'Content-Type':'application/json'},
           body:JSON.stringify({
             systemInstruction:{parts:[{text:prompt}]},
             contents:[{role:'user',parts:[{text:JSON.stringify({question,facts})}]}],
             generationConfig:{temperature:0.2,maxOutputTokens:1400}
           })
         });
          if (res.ok) { response = res; break; }
          if (res.status === 404 || res.status === 400 || res.status === 429) continue;
          break;
        } catch {
          break;
        }
      }
     if(!response || !response.ok)throw Error('ANSWER_UNAVAILABLE');
     const data=await response.json();if(data.candidates?.[0]?.finishReason!=='STOP')throw Error('ANSWER_INCOMPLETE');
     text=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
    } else break;
   text = (text || '')
     .replace(/[{}\[\]`]/g, '')
     .replace(/\b([A-Z]{2,})_([A-Z]{2,})\b/g, (_, a, b) => `${a.toLowerCase()} ${b.toLowerCase()}`)
     .trim();
   if(!isDisplayAnswer(text))throw Error('ANSWER_NOT_READABLE');
   return {text,provider:current.provider};
  } catch { if(current.fallback)await beforeFallback(); }
  current=current.fallback;
 }
 return {text:recordFallback(items,language),provider:'deterministic'};
}
