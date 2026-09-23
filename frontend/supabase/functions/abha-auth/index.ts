// This adapter intentionally does NOT simulate ABHA success.
// Configure it only with official ABDM sandbox credentials and current API contract.
Deno.serve(async (_req) => {
  const configured = Boolean(Deno.env.get('ABDM_BASE_URL') && Deno.env.get('ABDM_CLIENT_ID') && Deno.env.get('ABDM_CLIENT_SECRET'))
  if (!configured) return new Response(JSON.stringify({ error: 'ABDM sandbox is not configured. No fake verification performed.' }), { status: 501, headers: { 'content-type':'application/json' } })
  return new Response(JSON.stringify({ error: 'ABHA adapter contract must be implemented against the current official ABDM sandbox API before enabling.' }), { status: 501, headers: { 'content-type':'application/json' } })
})
