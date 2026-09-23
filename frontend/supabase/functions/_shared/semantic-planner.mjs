// Semantic Tool Planner for SwasthyaSetu
// Analyzes user queries in English, Hindi, Hinglish, slang, or with typos.
// Chooses only from authorized, bounded SwasthyaSetu capabilities.

const ALLOWED_TOOLS = [
  'get_prescriptions',
  'get_recent_diagnostics',
  'get_open_caregaps',
  'get_appointments',
  'get_patient_snapshot',
  'get_longitudinal_history',
  'd1_practices',
  'd1_facilities',
  'discover_pharmacies'
];

const PLANNER_SYSTEM_PROMPT = `You are the SwasthyaSetu Semantic Tool Planner for a national healthcare platform.
Analyze the user query in any language (English, Hindi, Hinglish, colloquial slang, typos, incomplete sentences).
Select the most appropriate tool(s) from the allowed catalog.

ALLOWED TOOLS:
- get_prescriptions: Patient's verified prescribed medicines, dosages, active medications, or past prescriptions.
- get_recent_diagnostics: Patient's verified lab orders, blood tests, pathology/radiology test results.
- get_open_caregaps: Patient's pending follow-ups, overdue tests, or open care gaps.
- get_appointments: Patient's booked, upcoming, or past doctor appointments and consultation schedules.
- get_patient_snapshot: Broader clinical summary or checking explicitly documented medical diagnoses.
- get_longitudinal_history: Comprehensive historical care records timeline across all visits.
- d1_practices: Public directory to find verified doctors, practitioners, specialists, clinics, clinic timings, fees, or availability by doctor name (e.g. "princy tolani"), specialty (e.g. "cardiologist", "skin doctor"), or city/area.
- d1_facilities: Public directory to find verified hospitals, pathology/diagnostic labs, blood test centres, or health facilities.
- discover_pharmacies: Public directory to find pharmacies, chemists, medical stores, or "dawai ki dukaan".

NO_TOOL:
When NO database retrieval is needed, return selected_tools: [].
Use action "ANSWER_DIRECTLY" for:
- Symptoms, fever, headache, stomach ache, body pain, general health questions ("bukhar aa raha hai kya karun", "pet me ajeeb sa dard ho raha hai", "what is diabetes", "dengue ke symptoms", "HbA1c kya hota hai"). Set needs: ["GENERAL_HEALTH"].
- Conversational continuations / follow-ups ("kal raat se", "101 tha", "second wale ki timing", "aur kuch?"). If it refers to doctor/directory, use appropriate tool; if it refers to symptoms/health, set needs: ["GENERAL_HEALTH"].
- Casual chat / greetings ("hii", "hello", "kaise ho", "thanks", "kya haal chaal bro"). Set needs: ["CASUAL"].
- Off-topic non-health questions ("who won the match", "tell a joke"). Set needs: ["OFF_TOPIC"].
- Medical directives ("prescribe an antibiotic", "diagnose my symptoms", "increase my dose"). Set needs: ["CLINICIAN_REQUIRED"].

Use action "CLARIFY" when the request is genuinely ambiguous (e.g. "medical chahiye" where it is unclear if they want medicines, a pharmacy, or health info). Provide a friendly clarification_prompt in the user's language.

Use action "USE_TOOL" when platform tools should be invoked. If a query asks multiple things (e.g. "meri appointment kab hai aur doctor ka clinic kaha hai"), you may select up to 2 tools (e.g. ["get_appointments", "d1_practices"]).

OUTPUT JSON SCHEMA:
{
  "action": "USE_TOOL" | "ANSWER_DIRECTLY" | "CLARIFY",
  "needs": ["string"],
  "selected_tools": ["string"],
  "arguments": {
    "search": "doctor/facility name to search if mentioned, e.g. 'princy tolani', otherwise null",
    "type": "HOSPITAL" | "DIAGNOSTIC_LAB" | "PHARMACY" | null,
    "specialization": "specialty if mentioned, e.g. 'Cardiology', 'Dermatology', otherwise null"
  },
  "confidence": number between 0.0 and 1.0,
  "clarification_prompt": "string or null"
}
Output strictly valid JSON only. Never invent tools outside the allowed list.`;

export async function planSemanticTools(question, config, transport = fetch, conversationContext = null) {
  if (!question || typeof question !== 'string') return null;
  const sanitized = question
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]+\b/gi, '[redacted]')
    .replace(/\b[0-9a-f-]{36}\b|\b\d{10,}\b/gi, '[redacted]');

  let contextSnippet = '';
  if (Array.isArray(conversationContext?.messages) && conversationContext.messages.length > 0) {
    const turns = conversationContext.messages.slice(-4).map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: "${String(m.content || '').slice(0, 200)}"`).join('\n');
    contextSnippet = `\nRecent conversation history:\n${turns}`;
  } else if (conversationContext?.previous_tool || conversationContext?.previous_query) {
    contextSnippet = `\nPrevious conversation context: last_tool=${conversationContext.previous_tool || 'none'}, last_query="${conversationContext.previous_query || ''}"`;
  }

  const userMessage = `User question: "${sanitized}"${contextSnippet}`;

  let currentConfig = config;
  while (currentConfig) {
    try {
      let rawJson = null;
      if (currentConfig.provider === 'groq') {
        const url = `${(currentConfig.url || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')}/chat/completions`;
        const candidateModels = [
          currentConfig.model,
          'openai/gpt-oss-120b',
          'qwen/qwen3.8-27b',
          'openai/gpt-oss-20b',
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'llama3-70b-8192'
        ].filter(Boolean);
        for (const model of [...new Set(candidateModels)]) {
          try {
            const res = await transport(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${currentConfig.key}`,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(4500),
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: PLANNER_SYSTEM_PROMPT },
                  { role: 'user', content: userMessage }
                ],
                response_format: { type: 'json_object' },
                temperature: 0,
                max_tokens: 220
              })
            });
            if (res.ok) {
              const data = await res.json();
              rawJson = data.choices?.[0]?.message?.content;
              if (rawJson) break;
            }
          } catch {}
        }
      } else if (currentConfig.provider === 'gemini') {
        const baseUrl = (currentConfig.url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        const candidateModels = [
          (currentConfig.model || 'gemini-1.5-flash').replace(/^models\//, ''),
          'gemini-1.5-flash',
          'gemini-1.5-flash-latest',
          'gemini-2.0-flash',
          'gemini-1.5-pro'
        ];
        for (const m of [...new Set(candidateModels)]) {
          try {
            const url = `${baseUrl}/models/${encodeURIComponent(m)}:generateContent`;
            const res = await transport(url, {
              method: 'POST',
              headers: {
                'x-goog-api-key': currentConfig.key,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(4000),
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: PLANNER_SYSTEM_PROMPT }] },
                contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0,
                  maxOutputTokens: 220
                }
              })
            });
            if (res.ok) {
              const data = await res.json();
              rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (rawJson) break;
            }
          } catch {}
        }
      }

      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') {
          // Validate selected tools are in ALLOWED_TOOLS
          const validTools = (Array.isArray(parsed.selected_tools) ? parsed.selected_tools : [])
            .filter(t => ALLOWED_TOOLS.includes(t))
            .slice(0, 2);

          const action = ['USE_TOOL', 'ANSWER_DIRECTLY', 'CLARIFY'].includes(parsed.action)
            ? parsed.action
            : validTools.length > 0 ? 'USE_TOOL' : 'ANSWER_DIRECTLY';

          return {
            action,
            needs: Array.isArray(parsed.needs) ? parsed.needs : [],
            selected_tools: validTools,
            arguments: {
              search: typeof parsed.arguments?.search === 'string' ? parsed.arguments.search.trim().slice(0, 100) : null,
              type: ['HOSPITAL', 'DIAGNOSTIC_LAB', 'PHARMACY'].includes(parsed.arguments?.type) ? parsed.arguments.type : null,
              specialization: typeof parsed.arguments?.specialization === 'string' ? parsed.arguments.specialization.trim().slice(0, 50) : null
            },
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            clarification_prompt: typeof parsed.clarification_prompt === 'string' ? parsed.clarification_prompt : null
          };
        }
      }
    } catch (_e) {}

    currentConfig = currentConfig.fallback;
  }

  return null;
}
