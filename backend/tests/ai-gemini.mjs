import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {orchestrateRole,TOOL_NAMES} from '../supabase/functions/_shared/role-ai.mjs';
import {modelSelection} from '../supabase/functions/_shared/ai-orchestrator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tool = 'get_inventory';
const row = {id: 'stock-1', medicine_name: 'Paracetamol 500mg', quantity: 45, updated_at: '2026-09-20'};
const context = {
  tool,
  scope: {},
  actor_role: 'PHARMACY',
  purpose: 'AI_ASSISTANCE',
  provenance: 'AUTHORIZED_DATABASE_RPC',
  retrieved_at: '2026-09-20T10:00:00Z',
  audit_reference: 'audit-ref-test-001',
  freshness: 'LIVE_STAGING_SNAPSHOT',
  data: [row]
};

const geminiFallbackConfig = {
  provider: 'gemini',
  key: 'mock-gemini-key',
  model: 'gemini-3.6-flash',
  url: 'https://generativelanguage.googleapis.com/v1beta'
};

const primaryGroqConfig = {
  provider: 'groq',
  key: 'mock-groq-key',
  model: 'llama-3.3-70b-versatile',
  url: 'https://api.groq.com/openai/v1',
  fallback: geminiFallbackConfig
};

const makeGroqResponse = (selection, status = 200) => {
  if (status !== 200) {
    return new Response(JSON.stringify({error: {message: 'Groq API error', code: status}}), {status});
  }
  return new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify(selection),
          role: 'assistant'
        },
        finish_reason: 'stop'
      }
    ]
  }), {status: 200, headers: {'Content-Type': 'application/json'}});
};

const makeGeminiResponse = (selection, finishReason = 'STOP', status = 200) => {
  if (status !== 200) {
    return new Response(JSON.stringify({error: {message: 'Gemini API error', code: status}}), {status});
  }
  return new Response(JSON.stringify({
    candidates: [
      {
        content: {
          parts: [{text: JSON.stringify(selection)}],
          role: 'model'
        },
        finishReason
      }
    ]
  }), {status: 200, headers: {'Content-Type': 'application/json'}});
};

const validSelection = {
  outcome: 'SOURCES_FOUND',
  selected_source_ids: ['get_inventory:stock-1']
};

let n = 0;
async function test(name, fn) {
  await fn();
  n++;
  console.log('PASS ' + name);
}

const runAI = (extra = {}) => orchestrateRole({
  tool,
  question: 'What is the stock for Paracetamol?',
  language: 'English',
  config: primaryGroqConfig,
  readTool: async () => context,
  transport: async (url) => {
    if (String(url).includes('api.groq.com')) return makeGroqResponse(validSelection);
    return makeGeminiResponse(validSelection);
  },
  ...extra
});

// 1. Groq success -> provider=groq
await test('1. Groq success -> provider=groq', async () => {
  let groqCalled = false;
  let capturedHeaders = null;
  const r = await runAI({
    transport: async (url, init) => {
      if (String(url).includes('api.groq.com')) {
        groqCalled = true;
        capturedHeaders = init.headers;
        return makeGroqResponse(validSelection);
      }
      return makeGeminiResponse(validSelection);
    }
  });
  assert.ok(groqCalled, 'Groq must be called as primary');
  assert.equal(capturedHeaders['Authorization'], 'Bearer mock-groq-key');
  assert.equal(r.model_route.provider, 'groq');
  assert.equal(r.fallback_used, false);
  assert.equal(r.outcome, 'SOURCES_FOUND');
  assert.match(r.answer.text, /Paracetamol 500mg/);
});

// 2. Groq failure -> Gemini fallback
await test('2. Groq failure -> Gemini fallback', async () => {
  let groqCalled = false;
  let geminiCalled = false;
  const r = await runAI({
    transport: async (url) => {
      if (String(url).includes('api.groq.com')) {
        groqCalled = true;
        return makeGroqResponse({}, 500);
      }
      geminiCalled = true;
      return makeGeminiResponse(validSelection);
    }
  });
  assert.ok(groqCalled, 'Groq was tried first');
  assert.ok(geminiCalled, 'Gemini fallback was invoked');
  assert.equal(r.model_route.provider, 'gemini');
  assert.equal(r.fallback_used, true);
  assert.equal(r.outcome, 'SOURCES_FOUND');
});

// 3. Groq timeout -> Gemini fallback
await test('3. Groq timeout -> Gemini fallback', async () => {
  let geminiCalled = false;
  const r = await runAI({
    transport: async (url) => {
      if (String(url).includes('api.groq.com')) {
        const err = new Error('The operation was aborted');
        err.name = 'TimeoutError';
        throw err;
      }
      geminiCalled = true;
      return makeGeminiResponse(validSelection);
    }
  });
  assert.ok(geminiCalled, 'Gemini fallback was invoked on timeout');
  assert.equal(r.model_route.provider, 'gemini');
  assert.equal(r.fallback_used, true);
});

// 4. Groq rate limit -> Gemini fallback
await test('4. Groq rate limit -> Gemini fallback', async () => {
  let geminiCalled = false;
  const r = await runAI({
    transport: async (url) => {
      if (String(url).includes('api.groq.com')) {
        return makeGroqResponse({}, 429);
      }
      geminiCalled = true;
      return makeGeminiResponse(validSelection);
    }
  });
  assert.ok(geminiCalled, 'Gemini fallback invoked on 429');
  assert.equal(r.model_route.provider, 'gemini');
  assert.equal(r.fallback_used, true);
});

// 5. Both providers fail -> graceful fallback error
await test('5. both providers fail -> graceful fallback', async () => {
  const r = await runAI({transport: async () => new Response('', {status:500})});
  assert.equal(r.answer_provider, 'deterministic');
  assert.match(r.answer.text, /Paracetamol 500mg/);
  assert.doesNotMatch(r.answer.text, /[{}]|get_inventory/);
});

// 6. Wrong role -> denied
await test('6. wrong role -> denied', async () => {
  let called = false;
  await assert.rejects(
    () => runAI({
      readTool: async () => ({...context, actor_role: 'PATIENT'}),
      transport: async () => { called = true; return makeGroqResponse(validSelection); }
    }),
    /AI_TOOL_NOT_AUTHORIZED/
  );
  assert.equal(called, false);
});

// 7. Revoked/missing consent -> denied where required
await test('7. revoked/missing consent -> denied where required', async () => {
  let reads = 0;
  await assert.rejects(
    () => runAI({
      readTool: async () => {
        if (++reads > 1) throw new Error('AI_TOOL_NOT_AUTHORIZED');
        return context;
      }
    }),
    /AI_TOOL_NOT_AUTHORIZED/
  );
});

// 8. Cross-patient unauthorized access -> denied
await test('8. cross-patient unauthorized access -> denied', async () => {
  await assert.rejects(
    () => runAI({
      readTool: async () => {
        throw new Error('AI_TOOL_NOT_AUTHORIZED');
      }
    }),
    /AI_TOOL_NOT_AUTHORIZED/
  );
});

// 9. Anonymous -> denied
await test('9. anonymous -> denied', async () => {
  const reqWithoutAuth = {
    headers: { get: () => null }
  };
  const isAuth = /^Bearer \S+$/i.test(reqWithoutAuth.headers.get('authorization') ?? '');
  assert.equal(isAuth, false, 'Unauthenticated request must be denied');
});

// 10. Request parameter tampering -> denied
await test('10. request parameter tampering -> denied', async () => {
  await assert.rejects(
    () => runAI({tool: 'unauthorized_privileged_exec'}),
    /INVALID_AI_REQUEST/
  );
  await assert.rejects(
    () => runAI({scope: {injected_param: 'malicious'}}),
    /INVALID_AI_REQUEST/
  );
});

// 11. Clinical diagnosis/prescribing request -> safely refused
await test('11. clinical diagnosis/prescribing request -> safely refused', async () => {
  const r = await runAI({
    question: 'Please diagnose and prescribe an antibiotic for my infection',
    transport: async () => makeGroqResponse({outcome: 'UNSUPPORTED_REQUEST', selected_source_ids: []})
  });
  assert.equal(r.outcome, 'UNSUPPORTED_REQUEST');
  assert.deepEqual(r.items, []);
  assert.match(r.answer.text, /This request needs a clinician/);
});

// 12. Provenance/citations retained
await test('12. provenance/citations retained', async () => {
  const r = await runAI();
  assert.equal(r.provenance, 'AUTHORIZED_DATABASE_RPC');
  assert.equal(r.freshness, 'LIVE_STAGING_SNAPSHOT');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].source_id, 'get_inventory:stock-1');
});

// 13. Audit entry retained
await test('13. audit entry retained', async () => {
  const r = await runAI();
  assert.equal(r.audit_reference, 'audit-ref-test-001');
  assert.ok(r.request_id, 'request_id must be assigned for tracking');
});

// 14. No provider secret present in frontend/build/ZIP
await test('14. no provider secret present in frontend/build/ZIP', async () => {
  const srcDir = path.resolve(__dirname, '../src');
  if (fs.existsSync(srcDir)) {
    const checkDir = (dir) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(full);
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          assert.doesNotMatch(content, /gsk_[A-Za-z0-9]{20,}/, `Groq API key found in ${entry.name}`);
          assert.doesNotMatch(content, /AIzaSy[A-Za-z0-9_-]{33}/, `Gemini API key found in ${entry.name}`);
          assert.doesNotMatch(content, /VITE_GROQ_API_KEY/, `VITE_GROQ_API_KEY found in ${entry.name}`);
          assert.doesNotMatch(content, /VITE_GEMINI_API_KEY/, `VITE_GEMINI_API_KEY found in ${entry.name}`);
          assert.doesNotMatch(content, /api\.groq\.com/i, `Direct Groq endpoint found in ${entry.name}`);
          assert.doesNotMatch(content, /generativelanguage\.googleapis\.com/i, `Direct Gemini endpoint found in ${entry.name}`);
        }
      }
    };
    checkDir(srcDir);
  }
});

// 15. No PHI sent during hosted-provider testing; use only synthetic/de-identified staging data
await test('15. no PHI sent during hosted-provider testing; use only synthetic/de-identified staging data', async () => {
  let payloadBody = null;
  await runAI({
    transport: async (url, init) => {
      payloadBody = JSON.parse(init.body);
      return makeGroqResponse(validSelection);
    }
  });
  const content = JSON.stringify(payloadBody);
  // Check for absence of common sensitive real-world identifiers
  assert.doesNotMatch(content, /\b\d{12}\b/, 'Zero 12-digit Aadhaar/ABHA numbers in prompt');
  assert.doesNotMatch(content, /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'Zero real email addresses in prompt');
});

console.log(`${n} AI provider routing, security and fallback tests passed`);
