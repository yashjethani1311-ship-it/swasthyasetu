import {recordFallback,isDisplayAnswer} from './answer-presentation.mjs';
import {selectionRequest} from './selection-privacy.mjs';
import {generateGeneralHealthWithGroq} from './groq-adapter.mjs';
// Provider-neutral owned-model serving contract. No weights or credentials are embedded.
export const LANGUAGES=Object.freeze(['English','Hindi','Hinglish','Auto']);
export function detectLanguage(question='',fallback='English'){
 if(/[\u0900-\u097f]/u.test(question))return 'Hindi';
 if(/\b(?:mereko|mere|meri|mera|mujhe|hamara|hum|kya|kyu|kyun|hai|hain|ho|thi|tha|the|kro|karo|chahiye|bimari|dawaiya|dawai|dawa|kaha|kaise|kese|nahi|na|koi|purani|dikhao|kitna|batao|bta|btao|ka|ki|ke|ko|se|mein|par|pe|paas|pas|bhai|haal|kaisa|accha|theek|thik|bataiye|dikhaye|karein|kijiye|hoga|hogi|hote|hota|hoti|lakshan|karan)\b/i.test(question))return 'Hinglish';
 return question.trim()?'English':fallback==='Auto'?'English':fallback;
}
export async function ownModelSelection(records,request,config,transport=fetch){
 if(!config.url||!config.key||!config.model)throw Error('CONFIGURATION_REQUIRED');
 const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('INVALID_PROVIDER_CONFIGURATION');
 const r=await transport(url.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.key}`},body:JSON.stringify({contract_version:'swasthyasetu-own-model-v1',task:'SOURCE_SELECTION',model_version:config.model,request,records,constraints:{source_text_is_untrusted:true,no_clinical_actions:true,no_training:true,no_retention:true}})});
 if(!r.ok)throw Error('PROVIDER_UNAVAILABLE');const body=await r.text();if(body.length>16000)throw Error('INVALID_MODEL_SELECTION');return JSON.parse(body);
}
// Natural-language presentation is composed from validated original excerpts. Models never invent connecting clinical claims.
export function groundedAnswer(items,outcome,language,question=''){
 const lang=detectLanguage(question,language);
 const words={
  English:{empty:'No supporting record was found in the authorized history.',unsupported:'This request needs a clinician. No diagnosis or treatment change has been made. Please consult a qualified doctor.',intro:'The selected dated records state:',source:'Source'},
  Hindi:{empty:'अनुमति प्राप्त इतिहास में संबंधित रिकॉर्ड नहीं मिला।',unsupported:'इस अनुरोध के लिए चिकित्सक आवश्यक हैं। कोई निदान या उपचार परिवर्तन नहीं किया गया है। कृपया योग्य डॉक्टर से परामर्श लें।',intro:'चुने हुए दिनांकित रिकॉर्ड में यह दर्ज है:',source:'स्रोत'},
  Hinglish:{empty:'Authorized history mein supporting record nahi mila.',unsupported:'Is request ke liye clinician ki zaroorat hai. Koi diagnosis ya treatment change nahi kiya gaya. Kripya doctor se consult karein.',intro:'Selected dated records mein yeh darj hai:',source:'Source'}
 }[lang];
 if(!words)throw Error('INVALID_AI_REQUEST');

 const {intent}=selectionRequest({question});
 if(intent==='CASUAL'||outcome==='CONVERSATIONAL'){
  const msg={
   English:"Hello! I am your SwasthyaSetu Health Assistant. How can I help you today? You can ask me about health conditions, find doctors or hospitals, understand your medicines, or view your medical records.",
   Hindi:"नमस्ते! मैं आपका स्वास्थ्यसेतु हेल्थ असिस्टेंट हूँ। आज मैं आपकी कैसे सहायता कर सकता हूँ? आप मुझसे स्वास्थ्य से जुड़े सवाल पूछ सकते हैं, डॉक्टर या अस्पताल खोज सकते हैं, या अपनी दवाइयों और जाँच रिपोर्टों के बारे में जान सकते हैं।",
   Hinglish:"Namaste! Main aapka SwasthyaSetu Health Assistant hoon. Aaj main aapki kaise madad kar sakta hoon? Aap mujhse health ke sawal pooch sakte hain, doctor ya hospital dhoondh sakte hain, ya apni medicines aur lab reports ke baare me jaan sakte hain."
  }[lang];
  return {language:lang,text:msg,citations:[],mode:'CONVERSATIONAL_GREETING',translation_notice:'Warm health-focused assistant response.'};
 }
 if(intent==='OFF_TOPIC'||outcome==='OFF_TOPIC'){
  const msg={
   English:"I am SwasthyaSetu, your dedicated health assistant. I can only assist with healthcare questions, finding doctors, clinics, medicines, and managing health records. Please ask a health-related question!",
   Hindi:"मैं स्वास्थ्यसेतु हूँ, आपका स्वास्थ्य सहायक। मैं केवल स्वास्थ्य, डॉक्टर, क्लिनिक, दवाइयों और मेडिकल रिकॉर्ड से जुड़े सवालों में आपकी सहायता कर सकता हूँ। कृपया स्वास्थ्य से जुड़ा कोई प्रश्न पूछें!",
   Hinglish:"Main SwasthyaSetu hoon, aapka health assistant. Main sirf health, doctor, clinics, dawaiyon aur medical records se jude sawalon me madad kar sakta hoon. Kripya health se juda koi sawal poochein!"
  }[lang];
  return {language:lang,text:msg,citations:[],mode:'HEALTH_TOPIC_REDIRECT',translation_notice:'Polite redirection to health topics.'};
 }
 if(intent==='GENERAL_HEALTH'||outcome==='GENERAL_HEALTH_EXPLANATION'){
  const msg={
   English:"This is a general health topic. For general wellness, maintaining balanced nutrition, regular hydration, adequate sleep, and timely health screenings are recommended. For individual diagnosis or specific symptoms, please consult a qualified doctor.",
   Hindi:"यह एक सामान्य स्वास्थ्य विषय है। बेहतर स्वास्थ्य के लिए संतुलित आहार, पर्याप्त पानी, नियमित नींद और समय पर स्वास्थ्य जाँच जरूरी है। किसी भी व्यक्तिगत लक्षण या बीमारी के सही निदान के लिए कृपया डॉक्टर से परामर्श लें।",
   Hinglish:"Yeh ek general health topic hai. Acchi sehat ke liye balanced diet, regular paani peena, acchi neend aur regular health checkups zaroori hain. Kisi specific bimari ya lakshan ke sahi diagnosis ke liye kripya doctor se consult karein."
  }[lang];
  return {language:lang,text:msg,citations:[],mode:'GENERAL_HEALTH_EDUCATION',translation_notice:'General health educational information only.'};
 }
 let emptyAnswer=words.empty;
 if(intent==='HEALTH_SUMMARY'||intent==='DIAGNOSIS'){
  if(lang==='Hinglish'){
   emptyAnswer='Available verified records me koi confirmed current diagnosis dikh nahi raha. Iska matlab ye nahi ki definitely koi problem nahi hai—sirf records me confirmed diagnosis available nahi hai. Main recent diagnoses, medicines, lab results aur pending follow-ups summarize kar sakta hoon.';
  }else if(lang==='Hindi'){
   emptyAnswer='अनुमति प्राप्त इतिहास में संबंधित रिकॉर्ड नहीं मिला। उपलब्ध सत्यापित रिकॉर्ड में अभी कोई पुष्ट निदान दर्ज नहीं है। इसका मतलब यह नहीं है कि कोई समस्या नहीं है—केवल यह कि रिकॉर्ड में पुष्ट निदान उपलब्ध नहीं है। मैं आपकी हाल की दवाइयाँ, जाँच परिणाम या लंबित फॉलो-अप दिखा सकता हूँ।';
  }else{
   emptyAnswer='No supporting record was found in the authorized history. Available verified records show no confirmed current diagnosis. This does not mean there is definitely no health problem—only that no confirmed diagnosis is currently on file. I can summarize your recent encounters, active medicines, lab results, or pending follow-ups.';
  }
 }else if(intent==='MEDICINE_HISTORY'){
  if(lang==='Hinglish'){
   emptyAnswer='Mere paas available verified records me purani medicines ka reliable record nahi mil raha. Main guess nahi karunga. Main recent prescriptions ya current medicines separately check kar sakta hoon.';
  }else if(lang==='Hindi'){
   emptyAnswer='अनुमति प्राप्त इतिहास में संबंधित रिकॉर्ड नहीं मिला। सत्यापित रिकॉर्ड में पिछली दवाइयों का कोई विश्वसनीय रिकॉर्ड नहीं मिला। मैं बिना रिकॉर्ड के अनुमान नहीं लगाऊँगा। आप हाल की पर्चियों की अलग से जाँच कर सकते हैं।';
  }else{
   emptyAnswer='No supporting record was found in the authorized history. No reliable record of past medicines was found in the authorized history. I will not guess medication details. You can separately check recent prescriptions or consult your doctor.';
  }
 }else if(intent==='DOCTOR_DISCOVERY'){
  if(lang==='Hinglish'){
   emptyAnswer='Aapke khoje gaye doctor ya specialty ke liye practice directory me search kiya gaya. Doctors page (/doctors) par jakar aap verified specialists aur unke consultation slots dekh sakte hain.';
  }else if(lang==='Hindi'){
   emptyAnswer='आपकी खोजी गई विशेषता के लिए डायरेक्टरी में खोज की गई। उपलब्ध सत्यापित डॉक्टरों को देखने और समय लेने के लिए आप \'डॉक्टर\' पृष्ठ (/doctors) देख सकते हैं।';
  }else{
   emptyAnswer='Searched practice directory for matching specialists. You can view available verified specialists and book consultation slots directly on the Doctors page (/doctors).';
  }
 }else if(['LAB_SUMMARY','DIAGNOSTIC_HISTORY'].includes(intent)){
  if(lang==='Hinglish'){
   emptyAnswer='Available verified records me abhi koi published lab result nahi mila. Agar koi test karwaya hai, toh Diagnostics section (/lab) me uska status check kar sakte hain.';
  }else if(lang==='Hindi'){
   emptyAnswer='अनुमति प्राप्त इतिहास में संबंधित रिकॉर्ड नहीं मिला। रिकॉर्ड में अभी कोई प्रकाशित लैब परिणाम उपलब्ध नहीं है। लंबित जाँचों की स्थिति आप \'डायग्नोस्टिक्स\' पृष्ठ पर देख सकते हैं।';
  }else{
   emptyAnswer='No supporting record was found in the authorized history. No published lab results were found in your authorized records. Any pending orders can be tracked in the Diagnostics section (/lab).';
  }
 }else if(intent==='FOLLOW_UPS'){
  if(lang==='Hinglish'){
   emptyAnswer='Available verified records me koi pending follow-up dikh nahi raha.';
  }else if(lang==='Hindi'){
   emptyAnswer='अनुमति प्राप्त इतिहास में संबंधित रिकॉर्ड नहीं मिला। वर्तमान में कोई लंबित फॉलो-अप या डॉक्टर समीक्षा दर्ज नहीं है।';
  }else{
   emptyAnswer='No supporting record was found in the authorized history. There are currently no open care gaps or pending follow-up reviews recorded in your care timeline.';
  }
 }else if(intent==='PHARMACY_DISCOVERY'){
  if(lang==='Hinglish'){
   emptyAnswer='Apni active prescription se dawa lene ke liye, Prescriptions page (/prescriptions) par jayein aur \'Choose Pharmacy\' select karke local approved pharmacy choose karein.';
  }else if(lang==='Hindi'){
   emptyAnswer='सक्रिय पर्चे से दवा लेने के लिए, \'पर्चे\' पृष्ठ (/prescriptions) पर जाएं और \'Choose Pharmacy\' चुनकर नजदीकी अधिकृत फार्मेसी का चयन करें।';
  }else{
   emptyAnswer='To collect your medicine, visit the Prescriptions page (/prescriptions) and select \'Choose Pharmacy\' to assign an approved local dispensing pharmacy.';
  }
 }

 if(intent==='PHARMACY_DISCOVERY')emptyAnswer={English:'No matching pharmacy was found in the bounded verified directory results. Stock and opening hours are unknown; confirm with the pharmacy.',Hindi:'सीमित सत्यापित डायरेक्टरी परिणामों में संबंधित फार्मेसी नहीं मिली। दवा की उपलब्धता और खुलने का समय फार्मेसी से पुष्टि करें।',Hinglish:'Bounded verified directory results me matching pharmacy nahi mili. Stock aur opening hours pharmacy se confirm karein.'}[lang];
 if(intent==='FOLLOW_UPS')emptyAnswer={English:'Available verified records show no pending follow-up. Missing records do not establish that all follow-ups are up to date.',Hindi:'उपलब्ध सत्यापित रिकॉर्ड में कोई लंबित फॉलो-अप नहीं दिख रहा है। इससे सभी फॉलो-अप पूरे होने की पुष्टि नहीं होती।',Hinglish:'Available verified records me koi pending follow-up dikh nahi raha.'}[lang];

 const text=outcome==='UNSUPPORTED_REQUEST'?words.unsupported:!items.length?emptyAnswer:recordFallback(items,lang);
 return {language:lang,text,citations:items.map(r=>({source_id:r.source_id,date:r.date})),mode:'SOURCE_EXCERPTS_WITH_LOCALIZED_NARRATION',translation_notice:'Clinical source excerpts remain in their original language.'};
}
// Resolve only an already authorized, evaluation-approved server route. Never accept endpoint/keys from request JSON.
export async function governedConfig({capability='SOURCE_SELECTION',language,route,environment}){
 const result=await route(capability,language);const m=result?.primary;
 if(!m?.config_ref||!m.capabilities?.includes(capability)||!m.languages?.includes(language))throw Error('CONFIGURATION_REQUIRED');
 const provider=m.provider_kind==='OWN_MODEL'?'own-model':environment(m.config_ref+'_PROVIDER');
 const config={provider,url:environment(m.config_ref+'_URL'),key:environment(m.config_ref+'_KEY'),model:environment(m.config_ref+'_MODEL')??m.version,model_version_id:m.id,route_revision:result.revision};
 if(!config.key||!config.model||!['own-model','openai-responses','gemini'].includes(provider))throw Error('CONFIGURATION_REQUIRED');
 const f=result.fallback;
 if(environment('AI_ALLOW_GOVERNED_FALLBACK')==='true'&&f?.config_ref&&f.capabilities?.includes(capability)&&f.languages?.includes(language)&&(f.provider_kind==='OWN_MODEL'||result.allow_external_fallback===true)){
 const provider=f.provider_kind==='OWN_MODEL'?'own-model':environment(f.config_ref+'_PROVIDER');
 const fallback={provider,url:environment(f.config_ref+'_URL'),key:environment(f.config_ref+'_KEY'),model:environment(f.config_ref+'_MODEL')??f.version,model_version_id:f.id,route_revision:result.revision};
 if(fallback.key&&fallback.model&&['own-model','openai-responses','gemini'].includes(provider))config.fallback=fallback;
 }
 return config;
}

export async function generateGeneralHealthWithGemini(question, language, config, transport = fetch, conversationContext = null) {
  if (!config.key) throw new Error('CONFIGURATION_REQUIRED');
  const candidateModels = [
    (config.model || 'gemini-1.5-flash').replace(/^models\//, ''),
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-2.5-flash'
  ];
  const baseUrl = (config.url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const langInstruction = language === 'Hindi'
    ? 'Respond in clear, natural Hindi (Devanagari script).'
    : language === 'Hinglish'
    ? 'Respond in natural, conversational Hinglish (Hindi written in Latin script) like a helpful, compassionate Indian healthcare assistant.'
    : 'Respond in clear, professional, and empathetic English.';

  const systemPrompt = `You are SwasthyaCopilot, an intelligent, empathetic, and medically sound AI health assistant for SwasthyaSetu.
${langInstruction}

GUIDELINES FOR HEALTH & CONVERSATION:
1. SPEAK NATURALLY: Never speak like a database or search engine. Never say "According to your authorized database records", "Aapke dated records mein yeh darj hai", or mention database RPCs. Speak warmly and directly like an experienced healthcare professional.
2. SYMPTOMS & COMPLAINTS (e.g. fever, headache, stomach ache, cough, body pain, weakness, nausea):
   - Acknowledge the symptom with empathy.
   - Provide safe, practical home care guidance (rest, adequate hydration/fluids, light nutritious food, lukewarm water sponging for fever).
   - Ask clinically relevant follow-up questions to understand the situation (e.g., How long has it been going on? What is the temperature? Are there chills, vomiting, or other symptoms?).
   - Highlight important warning signs / red flags when the user should seek immediate doctor consultation (e.g., fever >102°F, shortness of breath, stiff neck, persistent vomiting, severe pain, blood in stool).
   - Do NOT give generic canned replies like "drink water and sleep" unless contextually tailored.
3. CONVERSATIONAL CONTINUATIONS:
   - The user may follow up on previous messages (e.g., "kal raat se" refers to the duration of the previously discussed fever; "101 tha" refers to the measured temperature). Understand and build upon the conversation naturally.
4. HEALTH CONCEPTS & EDUCATION (e.g., what is diabetes, HbA1c kya hota hai, why BP increases):
   - Explain clearly, accurately, and simply with relevant normal ranges or clinical implications.
5. CASUAL / GREETINGS:
   - Respond warmly and briefly, asking how you can assist with their health.
6. RULES:
   - DO NOT prescribe specific prescription-only medications or alter prescription doses.
   - Remind the user to consult a doctor for definitive medical evaluation.
   - Never output JSON, code blocks, or raw IDs. Provide clean, friendly markdown text.`;

  const contents = [];
  if (Array.isArray(conversationContext?.messages)) {
    for (const m of conversationContext.messages.slice(-6)) {
      if (m && m.content && typeof m.content === 'string') {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content.slice(0, 1000) }]
        });
      }
    }
  }

  if (contents.length && contents[contents.length - 1].role === 'user' && contents[contents.length - 1].parts[0].text.trim() === question.trim()) {
    contents.pop();
  }

  contents.push({ role: 'user', parts: [{ text: question }] });

  const triedGemini = [];
  for (const m of [...new Set(candidateModels)]) {
    try {
      const url = `${baseUrl}/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(config.key)}`;
      const res = await transport(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.key
        },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000
          }
        })
      });
      if (!res.ok) {
        const errTxt = await res.text().catch(()=>'');
        triedGemini.push(`${m}: ${res.status} ${errTxt}`);
        continue;
      }
      const data = await res.json();
      let text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text?.trim();
      if (text) {
        text = text
          .replace(/[{}\[\]`]/g, '')
          .replace(/\b([A-Z]{2,})_([A-Z]{2,})\b/g, (_, a, b) => `${a.toLowerCase()} ${b.toLowerCase()}`)
          .trim();
        return {
          text,
          model_route: {
            provider: 'gemini',
            model_version_id: m,
            revision: config.route_revision ?? null
          }
        };
      } else {
        triedGemini.push(`${m}: empty candidate`);
      }
    } catch (_e) {
      triedGemini.push(`${m}: ${_e?.message || _e}`);
    }
  }
  throw new Error(`GEMINI_UNAVAILABLE: ${triedGemini.join(' | ')}`);
}

export async function generateGeneralHealthAnswer(question, language, config, transport = fetch, conversationContext = null) {
  let currentConfig = config;
  const errors = [];
  while (currentConfig) {
    try {
      if (currentConfig.provider === 'groq') {
        const result=await generateGeneralHealthWithGroq(question, language, currentConfig, transport, conversationContext);
        result.text = result.text.replace(/[{}\[\]`]/g, '').trim();
        if(!isDisplayAnswer(result.text))throw Error('INVALID_ANSWER');
        return result;
      }
      if (currentConfig.provider === 'gemini') {
        const result=await generateGeneralHealthWithGemini(question, language, currentConfig, transport, conversationContext);
        result.text = result.text.replace(/[{}\[\]`]/g, '').trim();
        if(!isDisplayAnswer(result.text))throw Error('INVALID_ANSWER');
        return result;
      }
    } catch (e) {
      errors.push(`${currentConfig.provider}: ${e?.message || e}`);
      if (currentConfig.fallback) {
        currentConfig = currentConfig.fallback;
        continue;
      }
      throw new Error(`ERRORS: ${errors.join(' -> ')}`);
    }
    break;
  }
  throw new Error(`NO_HEALTH_PROVIDER_AVAILABLE: ${errors.join(' -> ')}`);
}
