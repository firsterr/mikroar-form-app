// Netlify Function: /api/responses
// Supabase REST ile insert + anlamlı hata kodları (409 duplicate vs)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' }, body: 'Method Not Allowed' };
    }
    if (!SUPABASE_URL || !KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:'supabase-env-missing' }) };
    }

    // --- Body
    let body = {};
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok:false, error:'invalid-json' }) }; }

    const slug = (body.slug || '').trim();
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : null;
    const form_id = body.form_id || null;
    if (!slug || !answers) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok:false, error:'missing-fields' }) };
    }

    // --- Meta/IP
    const h = event.headers || {};
    const ip =
      (h['x-forwarded-for'] || h['client-ip'] || '').split(',')[0].trim() ||
      h['x-nf-client-connection-ip'] || null;
    const ua = (body.meta && body.meta.ua) || h['user-agent'] || '';
    const href = (body.meta && body.meta.href) || h['referer'] || '';

    const row = {
      form_id,
      slug,
      answers,
      ip,
      ua,
      meta: { ...(body.meta||{}), ip, ua, href, ts: new Date().toISOString() }
    };

    // --- Insert
    const url = `${SUPABASE_URL}/rest/v1/responses`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'content-type': 'application/json',
        // duplicate unique index varsa 409 döner
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    });

    if (r.status === 409) {
      return { statusCode: 409, headers: CORS, body: JSON.stringify({ ok:false, error:'duplicate' }) };
    }
    if (!r.ok) {
      const txt = await r.text().catch(()=> '');
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:'save-failed', detail: txt.slice(0,200) }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:String(err) }) };
  }
};
