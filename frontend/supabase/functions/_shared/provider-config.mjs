// Server-only configuration shared by both AI entry points.
// Provider keys never cross the Edge Function boundary.
export function providerConfig(environment, reasoning = false) {
  const geminiKey = environment('GEMINI_API_KEY');
  const secondary = geminiKey ? {
    provider: 'gemini', key: geminiKey,
    model: environment('GEMINI_MODEL') || 'gemini-1.5-flash',
    url: environment('GEMINI_URL') || 'https://generativelanguage.googleapis.com/v1beta',
  } : null;
  const groqKey = environment('GROQ_API_KEY');
  if (groqKey) return {
    provider: 'groq', key: groqKey,
    model: (reasoning && environment('GROQ_REASONING_MODEL')) || environment('GROQ_MODEL') || 'openai/gpt-oss-120b',
    url: environment('GROQ_URL') || 'https://api.groq.com/openai/v1',
    fallback: secondary,
  };
  if (secondary) return secondary;
  throw new Error('CONFIGURATION_REQUIRED');
}
