// mikroar-form-app/netlify/functions/submit-form.js
// Robust: CORS + OPTIONS + güvenli JSON parse + ayrıntılı hata çıkarımı
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };

  try {
    // Preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' }, body: 'Method Not Allowed' };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return j(500, { ok: false, error: 'Missing Supabase env vars' }, CORS);
    }

    // Body & slug
    let body = {};
    try { body = event.body ? JSON.parse(event.body) : {}; } catch { body = {}; }

    const q = event.queryStringParameters || {};
    const slug = q.slug || body.form_slug || '';
    if (!slug) return j(400, { ok: false, error: 'form_slug (slug) gerekli' }, CORS);

    // Answers objesi garanti
    const answers = (body && typeof body.answers === 'object' && body.answers !== null) ? body.answers : {};

    // IP tespiti (çeşitli header’lardan)
    const H = lower(event.headers || {});
    const ip =
      H['x-nf-client-connection-ip'] ||
      (H['x-forwarded-for'] ? H['x-forwarded-for'].split(',')[0].trim() : '') ||
      H['x-real-ip'] ||
      H['client-ip'] ||
      null;

    // INSERT -> Supabase REST
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        Accept: 'application/json'
      },
      body: JSON.stringify({ form_slug: slug, ip, answers })
    });

    // Başarısızsa mümkün olan en okunur hatayı çıkar
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Duplicate (unique) kontrolünü kullanıcıya anlamlı ver
    if (resp.status === 409) {
      return j(409, { ok: false, already: true, message: 'Bu form bu IP ile zaten yanıtlanmış.' }, CORS);
    }

    return j(resp.status, { ok: resp.ok, data }, CORS);

  } catch (err) {
    // Netlify 502 yerine burada 500 + mesaj döner
    return j(500, { ok: false, error: String(err && err.stack ? err.stack : err) }, CORS);
  }
};

/* helpers */
function j(status, obj, headers = {}) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(obj) };
}
function lower(h) { const o = {}; for (const k in h) o[k.toLowerCase()] = h[k]; return o; }
