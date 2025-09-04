// netlify/functions/submit-form.js
export async function handler(event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
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

  // --- payload'ı çıkar (JSON, form-encoded, GET) ---
  let payload = {};
  const ct = (event.headers?.['content-type'] || '').toLowerCase();

  if (event.httpMethod === 'POST') {
    if (ct.includes('application/json')) {
      try { payload = JSON.parse(event.body || '{}'); } catch { payload = {}; }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(event.body || '');
      payload = Object.fromEntries(params.entries());
    } else {
      try { payload = JSON.parse(event.body || '{}'); } catch { payload = {}; }
    }
  } else if (event.httpMethod === 'GET') {
    payload = { ...(event.queryStringParameters || {}) };
  } else {
    return { statusCode: 405, headers: { ...CORS, Allow: 'POST,OPTIONS,GET' }, body: 'Method Not Allowed' };
  }

  const form_slug = payload.form_slug || payload.slug;
  if (!form_slug) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:false, error:'form_slug (slug) gerekli' }) };
  }

  // answers alanını hazırla
  let answers = payload.answers;
  if (!answers) {
    // JSON gelmediyse form alanlarından answers oluştur
    const { form_slug: _a, slug: _b, ...rest } = payload;
    answers = rest;
  }
  if (typeof answers === 'string') {
    try { answers = JSON.parse(answers); } catch { /* string kalsın */ }
  }

  // kaydet
  const endpoint = `${SUPABASE_URL}/rest/v1/responses`;
  const body = { form_slug, answers };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(body)
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
      body: JSON.stringify({ ok:false, error:String(err) })
    };
  }
}
