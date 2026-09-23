const base = 'https://xtehgpcekegoqpyqsxmo.supabase.co';
const key = 'sb_publishable_3sMHL2NrqF3KOFu2OD6hZQ_gwGrkV3B';

async function getToken(email = 'swasthyasetu.test.pass2.patient@example.com', password = 'TestPassword123!') {
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).access_token;
}

const token = await getToken();

async function testQuery(category, question, expectedBehavior, context = null) {
  const t0 = Date.now();
  const res = await fetch(`${base}/functions/v1/role-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': key
    },
    body: JSON.stringify({
      tool: 'get_patient_snapshot',
      scope: {},
      question,
      language: 'Auto',
      context
    })
  });
  const data = await res.json();
  const ms = Date.now() - t0;
  console.log(`\n===============================================================`);
  console.log(`[${category}] "${question}" (${ms}ms)`);
  console.log(`Intent: ${data.intent} | Tool: ${data.selected_tool} | Outcome: ${data.outcome}`);
  console.log(`Expected: ${expectedBehavior}`);
  console.log(`Answer:\n${data.answer?.text}`);
  return { category, question, data, ms };
}

console.log('=== PART 1: MULTI-TURN CONVERSATIONAL HEALTH FLOW ===');
const conv1 = await testQuery(
  'CONV_TURN_1',
  'Bukhar aa raha hai kya karun',
  'AI understands symptom question, useful fever advice, red flags, follow-up questions, 0 DB'
);

const history1 = [
  { role: 'user', content: 'Bukhar aa raha hai kya karun' },
  { role: 'assistant', content: conv1.data.answer?.text || '' }
];

const conv2 = await testQuery(
  'CONV_TURN_2',
  'kal raat se',
  'AI understands fever started last night from conversation context, no DB',
  { messages: history1 }
);

const history2 = [
  ...history1,
  { role: 'user', content: 'kal raat se' },
  { role: 'assistant', content: conv2.data.answer?.text || '' }
];

const conv3 = await testQuery(
  'CONV_TURN_3',
  '101 tha',
  'AI understands 101F temperature in context, gives fever control guidance',
  { messages: history2 }
);

console.log('\n=== PART 2: GENERAL HEALTH & SYMPTOMS ===');
await testQuery(
  'SYMPTOM_ABDOMINAL',
  'pet me ajeeb sa dard ho raha hai',
  'AI explains stomach ache, asks location/type, warns about emergency red flags, 0 DB'
);

await testQuery(
  'CONCEPT_HBA1C',
  'HbA1c hota kya hai',
  'AI explains 3-month average blood sugar and normal/diabetic ranges in simple language, 0 DB'
);

console.log('\n=== PART 3: PERSONAL HEALTH WITH VERIFIED TOOLS ===');
await testQuery(
  'PERSONAL_MEDICINES',
  'meri current medicines bata',
  'AI uses get_prescriptions -> speaks naturally without robotic database phrases'
);

await testQuery(
  'PERSONAL_HBA1C',
  'mera HbA1c kitna tha',
  'AI uses get_recent_diagnostics -> checks verified lab report'
);

await testQuery(
  'PERSONAL_APPOINTMENT',
  'meri next appointment kab hai',
  'AI uses get_appointments -> speaks naturally'
);

console.log('\n=== PART 4: DISCOVERY WITH PLATFORM DIRECTORY ===');
await testQuery(
  'DISCOVERY_PHARMACY',
  'koi medical store paas me?',
  'AI uses discover_pharmacies -> finds yash pharmacy naturally'
);

await testQuery(
  'DISCOVERY_LAB',
  'blood test kaha ho jayega?',
  'AI uses d1_facilities (type: DIAGNOSTIC_LAB) -> finds yash lab naturally'
);

await testQuery(
  'DISCOVERY_DOCTOR_TIMING',
  'Princy Tolani ki clinic timing?',
  'AI uses d1_practices (search: Princy Tolani) -> Apollo Hospital slot without saying no access'
);

await testQuery(
  'COMPOUND_MULTI_TOOL',
  'meri next appointment kab hai aur us doctor ka clinic kaha hai?',
  'AI handles compound query: appointment + doctor clinic'
);

console.log('\n=== PART 5: CASUAL & AMBIGUOUS ===');
await testQuery(
  'CASUAL_FRIENDLY',
  'hello bhai',
  'Friendly conversational greeting, 0 DB'
);

await testQuery(
  'AMBIGUOUS_CLARIFY',
  'medical chahiye',
  'Polite bilingual clarification: medicine, pharmacy, or health info'
);

console.log('\n=== ALL LIVE TESTS FINISHED ===');
