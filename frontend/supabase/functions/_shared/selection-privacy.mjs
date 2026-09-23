// Model selection receives bounded structural signals, never source narratives, filenames or identity fields.
// Original authorized source excerpts stay on the server and are disclosed only after a second authorization read.
const states=new Set(['OPEN','CLOSED','PENDING','COMPLETED','CANCELLED','CONFIRMED','WAITING','ACTIVE','UNKNOWN','ORDERED','VERIFIED','PUBLISHED','DISPENSED','RECEIVED','FAILED','APPROVED','REJECTED','ADMITTED','DISCHARGED','PASS','FAIL','HIGH','CRITICAL','LOW','MEDIUM','ROUTINE','GRANTED','REVOKED','EXPIRED']);
const numeric=new Set(['quantity','total','amount','selling_price','reorder_point','numerator','denominator','temperature_c','pulse_bpm','systolic_bp','diastolic_bp','spo2_percent','weight_kg']);
export function selectionRecords(records){return records.map(r=>{
 const signals={};try{const obj=JSON.parse(r.text);if(obj&&typeof obj==='object'&&!Array.isArray(obj))for(const [k,v] of Object.entries(obj)){if(numeric.has(k)&&typeof v==='number'&&Number.isFinite(v))signals[k]=v;else if(['status','state','severity','urgency','quality_state'].includes(k)&&states.has(v))signals[k]=v}}catch{}
 return {source_id:r.source_id,date:r.date,kind:r.kind,text:JSON.stringify({source_kind:r.kind,...signals})};
})}
export function selectionRequest(request){
 const q=request.question??'';
 // Past clinical actions are records, not requests for a new clinical decision.
 // Match each new directive independently so a history question cannot mask one.
 const historical = /\b(?:did|has|had) (?:my |the )?(?:doctor|clinician) (?:prescribe|diagnose)\b|\b(?:recorded|previous|past|existing) diagnos(?:is|es)\b|\bdiagnos(?:is|es) (?:was|were|is) recorded\b|\b(?:was|were) (?:my |the )?(?:dose|dosage|treatment) (?:changed|increased|reduced)\b/gi;
 const directives=q.replace(historical,' recorded history ');
 const clinical=/\b(?:prescribe|diagnose me|diagnose my|new diagnosis)\b|\b(?:change|increase|decrease|reduce|stop|start|switch|adjust)\b[^?.!]{0,50}\b(?:dose|dosage|medicine|medication|treatment|taking)\b|\b(?:recommend|suggest)\b[^?.!]{0,50}\b(?:treatment|medicine|medication|antibiotic)\b|\bwhat\b[^?.!]{0,40}\b(?:should I take|medicine should I take)\b|\bsubstitut(?:e|ion)\b|नया निदान|निदान (?:करें|करो)|दवा.*बदल/i.test(directives);
 let intent;
 let highConfidence = true;
 if(/\b(?:and|aur|evam|sath mein|bhi)\b/i.test(q) && (
   (/\b(?:appointment|consultation|booking|visit)\b/i.test(q) && /\b(?:doctor|clinic|hospital)\b/i.test(q)) ||
   (/\b(?:medicine|dawai|prescription)\b/i.test(q) && /\b(?:lab|test|report|diagnostic)\b/i.test(q))
 )) {
  highConfidence = false;
 }

 if(clinical){
  intent='CLINICIAN_REQUIRED';
 }else if(/^(?:hi+|hello+|hey+|hlo|hola|namaste|namaskar|pranam|kaisa hai(?:\s+(?:bhai|bro|yaar|sab|sb|aap))?|kaise ho(?:\s+(?:bhai|bro|yaar|sab|sb|aap))?|kya haal(?:\s+(?:hai|chaal))?(?:\s+(?:bhai|bro|yaar|sab|sb|aap))?|how are you|how r u|good\s+(?:morning|afternoon|evening|day)|thanks|thank\s+you(?:\s+so\s+much)?|dhanyawad|shukriya|sup|yo|wassup|whats\s+up|what's\s+up|arre yaaar|arrey yaaar|yaar)[\s.?!,]*$/i.test(q) || /\barre yaaar\b/i.test(q)){
  intent='CASUAL';
 }else if(/\b(?:my|me|mine|i|meri|mera|mere|mereko|mujhe|mujhko)\b.*\b(?:bimari|disease|illness|condition|diagnosis|rog)\b|\b(?:bimari|disease|illness|condition|diagnosis|rog)\b.*\b(?:my|me|mine|i|meri|mera|mere|mereko|mujhe|mujhko|hai|h|documented|diagnosed)\b|\b(?:what|which)\s+(?:disease|condition|diagnosis|illness)\b|\bdo I have any(?:\s+\w+)?\s+(?:disease|illness|condition|diagnosis)\b|(?:मेरी|मेरा|मेरे|मुझे).*(?:बीमारी|रोग|निदान)|(?:बीमारी|रोग|निदान).*(?:मेरी|मेरा|मेरे|मुझे|hai|है|क्या)/i.test(q)&&!/summary|summari[sz]e|snapshot|timeline|overall health|पूरा स्वास्थ्य/i.test(q)){
  intent='DIAGNOSIS';
 }else if(/\b(?:where|kaha|kidhar|near|pass|paas)\b.*(?:get|buy|milegi|milengi|dhoond|search|located).*(?:medicine|medicines|medication|dawa|dawai|dawao|davai|davaiyon|aushadhi)|\b(?:pharmacy|pharmacies|chemist|chemists|medical\s*store|medicals|dawa|dawai|dawao|davai|davaiyo|davaiyon|aushadhi)\b.*\b(?:near|pass|paas|kaha|kidhar|dukan|dukaan|shop|store|locator|location|chahiye|milegi|milengi|located)\b|\b(?:near|pass|paas|which|what|where)\b.*\b(?:pharmacy|pharmacies|chemist|chemists|medical\s*store|medicals|dawai|davai|dawa|medicine|medications)\b|\b(?:pharmacy|pharmacies|chemist|medical\s*store)\b|मेडिकल स्टोर|दवा.*कहाँ|दवा.*दुकान|दुकान.*दवा/i.test(q)){
  intent='PHARMACY_DISCOVERY';
 }else if(/\b(?:appointments?|consultations?|bookings?|checkups?|visits?|slots?|meetings?)\b|\b(?:agli|next|upcoming|purani|pichli)\b.*\b(?:appointments?|consultations?|bookings?|visits?|checkups?|mulakat|meetings?)\b|\b(?:doctor|hospital)\b.*\b(?:kab\s+dikhana|kab\s+milna|appointments?)\b|अपॉइंटमेंट|मुलाकात|कब\s+दिखाना|अगली\s+विज़िट|अगला\s+चेकअप/i.test(q)){
  intent='APPOINTMENT_HELP';
 }else if(/\b(?:find|search|nearby|nearest|looking for)\b.*\b(?:doctor|specialist)|\b(?:cardio\w*|dermatolog\w*|ortho\w*|pediatric\w*|gynae\w*|ophthalmolog\w*)\b|\b(?:timing|timings|schedule)\b.*\b(?:of|for)?\s*(?:dr\.?|doctor)?\s*[a-z]+|\b(?:dr\.?|doctor)\b.*\b(?:timing|timings|clinic|fees?|available|schedule)\b|\b[a-z]+(?:\s+[a-z]+)?\s+(?:ki|ka|ke)\s*(?:clinic\s+)?(?:timing|timings|schedule|slot)\b|डॉक्टर.*(?:खोज|ढूंढ|चाहिए)|(?:खोज|ढूंढ).*डॉक्टर/i.test(q)){
  intent='DOCTOR_DISCOVERY';
 }else if(/\b(?:hospital|aspatal|facility|clinic|pathology lab|diagnostic lab|blood test cent\w*)\b|\b(?:blood test|lab test|pathology|x-ray|mri|ct scan)\b.*\b(?:kaha|kidhar|where|near|paas|karwa\w*|hoga|hogi|hote|center|lab)\b|\b(?:kaha|kidhar|where|near|paas)\b.*\b(?:blood test|lab test|pathology|x-ray|mri|ct scan)\b|अस्पताल|क्लिनिक|पैथोलॉजी लैब|प्रयोगशाला/i.test(q)){
  intent='FACILITY_DISCOVERY';
 }else if(/follow[ -]?up|review.*pending|pending.*review|care[ -]?gap|referral|फॉलो.?अप|दोबारा मिलना/i.test(q)){
  intent='FOLLOW_UPS';
 }else if(/\b(?:my|mine|me|meri|mera|mere|mereko|mujhe)\b.*\b(?:report|result|\blabs?\b|\btests?\b|hba1c|sugar|bp|blood pressure|hemoglobin|cholesterol|creatinine|platelets?|ecg|tsh)\b/i.test(q) || /report|result|\blabs?\b|\btests?\b|diagnostic|जाँच|जांच|रिपोर्ट|नतीजे/i.test(q)){
  intent=/latest|summari[sz]e|summary|आखिरी|सारांश/i.test(q)?'LAB_SUMMARY':'DIAGNOSTIC_HISTORY';
 }else if(/\b(?:dwayi\w*|dawai\w*|dawa\w*|davai\w*|medicine\w*|medication\w*|prescri\w*)\b|दवा|दवाई|दवाइ|पर्च/i.test(q)){
  intent='MEDICINE_HISTORY';
  }else if(/\b(?:bukhar|fever|temperature|taap|dard|pain|sir\s*dard|headache|pet\s*dard|stomach\s*ache|pet\s*me\s*dard|chhati\s*me\s*dard|chest\s*pain|vomit\w*|ulti|dast|diarrhea|loose\s*motion|cough|khansi|cold|sardi|jukaam|throat|gale\s*me\s*kharash|dizziness|chakkar|kamzori|weakness|fatigue|allergy|rash|itching|khujli|gas|acidity|jalan|heartburn)\b/i.test(q) && !/\b(?:my|mine|me|meri|mera|mere|mereko|mujhe)\b.*\b(?:record|history|prescribed|dawa|medicine|report|appointment|slot)\b/i.test(q)){
   intent='GENERAL_HEALTH';
   highConfidence=false;
  }else if(/\b(?:kal\s+raat\s+se|subah\s+se|pichle\s+\d+\s+din\s+se|since\s+yesterday|since\s+morning|\b\d{2,3}(?:\.\d)?(?:\s*(?:tha|hai|degree|f|c))?|second\s+wale\s+ki|dusre\s+wale\s+ki)\b/i.test(q)){
   intent='GENERAL_HEALTH';
   highConfidence=false;
  }else if(/\b(?:what is|what are|what causes|why does|why do|why is|how does|meaning of|symptoms of|causes of|treatment for|difference between|kya hot[aie]|kyu hot[aie]|kyun hot[aie]|kya hai|kya hain|lakshan|kise kehte|kisko bolte|karan|hota kya hai)\b.*\b(?:diabetes|sugar|bp|blood pressure|cholesterol|ecg|heart|fever|typhoid|malaria|dengue|jaundice|asthma|cancer|migraine|infection|pneumonia|stroke|hypertension|anemia|thyroid|vitamin|calcium|protein|hemoglobin|creatinine|platelet|pain|headache|cough|cold|allergy|hba1c)\b|\b(?:diabetes|sugar|bp|blood pressure|cholesterol|ecg|heart attack|fever|typhoid|malaria|dengue|jaundice|asthma|cancer|migraine|infection|pneumonia|stroke|hypertension|anemia|thyroid|vitamin|calcium|protein|hemoglobin|creatinine|platelet|hba1c)\b.*\b(?:kya hot[aie]|kyu hot[aie]|kyun hot[aie]|kya hai|kya hain|lakshan|kise kehte|kisko bolte|meaning|definition|hota kya hai)\b|\b(?:diabetes|cholesterol|hypertension|ecg|hba1c)\b|क्या होत[ाीे]|क्यों होत[ाीे]|क्या है|लक्षण|कारण|\b(?:fever\s+body\s+pain|body\s+pain\s+fever|fever.*pain|fever.*cold|cold.*fever)\b/i.test(q)){
   intent='GENERAL_HEALTH';
  }else if(/^(?:what (?:is|are|does)|explain|meaning of|how (?:does|do))\b/i.test(q) && !/\b(?:my|mine|meri|mera|mere|mereko|mujhe|record|history|prescribed|stock|inventory|medical|medicals|pharmacy|doctor|clinic|hospital|timing|timings)\b/i.test(q)){
   intent='GENERAL_HEALTH';
 }else if(/\b(?:my|mine|me|meri|mera|mere|mereko|mujhe|hamari|apna|apni|मेरी|मेरा|मेरे|मुझे)\b.*\b(?:health\s+summary|health\s+snapshot|overall\s+health|स्वास्थ्य\s+सारांश)\b|Summarize my health|health summary/i.test(q)){
  intent='HEALTH_SUMMARY';
 }else if(/\b(?:my|mine|me|meri|mera|mere|mereko|mujhe|मेरी|मेरा|मेरे)\b.*\b(?:record|history|timeline|इतिहास|रिकॉर्ड)\b|Show my records/i.test(q)){
  intent='RECORD_LOOKUP';
 }else if(/\b(?:doctor|specialist)\b|डॉक्टर/i.test(q)){
  intent='DOCTOR_DISCOVERY';
 }else if(/\b(?:code|python|java|javascript|script|programming|cricket|match|football|score|movie|film|actor|actress|song|weather|joke|politics|prime minister|president|capital of|recipe|bake|cake|food|restaurant|flight|train|hotel)\b/i.test(q)){
  intent='OFF_TOPIC';
 }else if(/\b(?:health\s+summary|health\s+snapshot|overall\s+health|स्वास्थ्य\s+सारांश)\b/i.test(q)){
  intent='HEALTH_SUMMARY';
 }else if(/\b(?:record|history|इतिहास|रिकॉर्ड|सलाह)\b/i.test(q)){
  intent='RECORD_LOOKUP';
 }else if(q.trim().length===0){
  intent='AUTHORIZED_HISTORY';
  highConfidence=false;
 }else{
  intent='AMBIGUOUS';
  highConfidence=false;
 }
 return {...request,question:/पुरानी/u.test(q)?`${intent}: पुरानी जानकारी`:intent,intent,high_confidence:highConfidence};
}
