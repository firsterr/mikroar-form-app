export async function handler(event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' }, body: 'Method Not Allowed' };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok:false, error:'Missing Supabase env vars' }, CORS);
  }

  // body & slug
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const q = event.queryStringParameters || {};
  const slug = q.slug || body.form_slug || '';
  if (!slug) return json(400, { ok:false, error:'form_slug (slug) gerekli' }, CORS);

  // IP
  const H = lower(event.headers || {});
  const ip =
    H['x-nf-client-connection-ip'] ||
    (H['x-forwarded-for'] ? H['x-forwarded-for'].split(',')[0].trim() : '') ||
    H['x-real-ip'] || H['client-ip'] || null;

  // Insert
  const insert = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ form_slug: slug, ip, answers: body.answers || {} })
  });

  // Duplicate? 409 -> önceki kaydın zamanını getirip anlamlı dön
  if (insert.status === 409) {
    const existed = await fetch(
      `${SUPABASE_URL}/rest/v1/responses?select=id,created_at&form_slug=eq.${encodeURIComponent(slug)}&ip=eq.${encodeURIComponent(ip)}&order=created_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    ).then(r => r.json()).catch(() => []);
    const lastAt = Array.isArray(existed) && existed[0]?.created_at || null;
    return json(409, { ok:false, already:true, at:lastAt, message:'Bu form bu IP ile zaten yanıtlanmış.' }, CORS);
  }

  const data = await insert.json().catch(() => null);
  return json(insert.status, { ok: insert.ok, data }, CORS);
}

function json(status, obj, headers) {
  return { statusCode: status, headers: { 'Content-Type':'application/json', ...headers }, body: JSON.stringify(obj) };
}
function lower(h) { const o={}; for (const k in h) o[k.toLowerCase()] = h[k]; return o; }
