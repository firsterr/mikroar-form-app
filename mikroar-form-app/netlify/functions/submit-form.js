// netlify/functions/submit-form.js
export async function handler(event) {
  // --- CORS ---
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method Not Allowed' };
  }

  // --- Env kontrol ---
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' }, cors);
  }

  // --- Body & slug ---
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }

  // slug: query ?slug=... ya da body.form_slug
  const q = event.queryStringParameters || {};
  let slug = q.slug || body.form_slug || '';
  if (!slug) return json(400, { ok: false, error: 'form_slug (slug) gerekli' }, cors);

  // answers
  let answers = body.answers;
  if (!answers || typeof answers !== 'object') answers = {};

  // --- IP tespiti (Netlify) ---
  const H = lowerKeys(event.headers || {});
  const ip =
    H['x-nf-client-connection-ip'] ||
    (H['x-forwarded-for'] ? H['x-forwarded-for'].split(',')[0].trim() : '') ||
    H['x-real-ip'] ||
    H['client-ip'] ||
    null;

  // --- Supabase REST insert ---
  const endpoint = `${SUPABASE_URL}/rest/v1/responses`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ form_slug: slug, answers, ip }),
  });

  const data = await resp.json().catch(() => null);
  return json(resp.status, { ok: resp.ok, data }, cors);
}

function json(status, obj, headers = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(obj),
  };
}
function lowerKeys(obj) {
  const out = {};
  for (const k in obj) out[k.toLowerCase()] = obj[k];
  return out;
}
