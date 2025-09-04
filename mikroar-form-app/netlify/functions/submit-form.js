// netlify/functions/submit-form.js
export async function handler(event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // 1) Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }

  // 2) Sadece POST kabul et
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, Allow: 'POST,OPTIONS' }, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  // Body'yi al (JSON veya form-encoded)
  let obj = {};
  try {
    const ct = (event.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      obj = JSON.parse(event.body || '{}');
    } else {
      obj = Object.fromEntries(new URLSearchParams(event.body || ''));
    }
  } catch {
    return { statusCode: 400, headers: CORS, body: 'Invalid body' };
  }

  const form_slug = obj.form_slug || obj.slug;
  if (!form_slug) {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'form_slug (slug) gerekli' }) };
  }

  // Cevapları ayıkla
  const answers = obj.answers ?? Object.fromEntries(
    Object.entries(obj).filter(([k]) => !['form_slug','slug'].includes(k))
  );

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ form_slug, answers }),
    });

    const data = await resp.json().catch(() => null);
    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: resp.ok, data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
}
