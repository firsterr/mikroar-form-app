// Netlify Function: /api/submit-form  (REST ile Supabase, duplicate IP kontrolü)
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const norm = (v) => (v ?? '').toString().trim();

function getIp(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v]));
  return (
    (h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-real-ip'] ||
     (h['x-forwarded-for'] ? h['x-forwarded-for'].split(',')[0] : '') || '').trim()
  ) || null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: { ...CORS, 'Allow':'POST, OPTIONS' }, body: 'Method Not Allowed' };
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:'supabase-env-missing' }) };
    }

    const qs = event.queryStringParameters || {};
    const slugFromQuery = norm(qs.slug);

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const slugFromBody = norm(body.form_slug);
    const answers = (body.answers && typeof body.answers === 'object') ? body.answers : body;

    const form_slug = slugFromBody || slugFromQuery;
    if (!form_slug) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok:false, error:'form_slug-required' }) };
    }

    const ip = getIp(event.headers);

    // 1) Duplicate check (aynı IP + aynı form)
    if (ip) {
      const chk = await fetch(
        `${SUPABASE_URL}/rest/v1/responses?select=created_at&form_slug=eq.${encodeURIComponent(form_slug)}&ip=eq.${encodeURIComponent(ip)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const existed = await chk.json().catch(() => []);
      if (Array.isArray(existed) && existed.length > 0) {
        return {
          statusCode: 409,
          headers: CORS,
          body: JSON.stringify({ ok:false, alreadySubmitted:true, at: existed[0].created_at })
        };
      }
    }

    // 2) Insert
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ form_slug, ip, answers })
    });

    const data = await ins.json().catch(() => null);

   const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

// ... duplicate tespitinde:
return json({ ok: false, code: 'duplicate', message: 'Bu anketi daha önce doldurdunuz.' }, 409);

    // FK/slug yoksa vb. hataları anlaşılır döndür
    if (!ins.ok) {
      const msg = (data && (data.message || data.error)) || `supabase-${ins.status}`;
      return { statusCode: ins.status, headers: CORS, body: JSON.stringify({ ok:false, error: msg, data }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, data }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error: String(err) }) };
  }
};
