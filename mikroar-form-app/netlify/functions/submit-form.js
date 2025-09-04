// netlify/functions/submit-form.js
export async function handler(event) {
  // CORS + preflight
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  };

  if (event.httpMethod === 'OPTIONS') {
    // Preflight başarıyla dönsün
    return { statusCode: 204, headers: CORS };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' }, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing Supabase env vars' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: 'Invalid JSON' };
  }

  // responses tablosuna yazıyoruz (form_slug + answers)
  const endpoint = `${SUPABASE_URL}/rest/v1/responses`;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => null);
    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: resp.ok, data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) })
    };
  }
}
