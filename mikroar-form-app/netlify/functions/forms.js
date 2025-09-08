// mikroar-form-app/netlify/functions/forms.js
export async function handler(event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET')   return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok:false, error:'Missing Supabase env vars' }, CORS);
  }

  const slug = (event.queryStringParameters?.slug || '').trim();

  // Liste modu (aktif formlar)
  if (!slug) {
    const url = `${SUPABASE_URL}/rest/v1/forms`
      + `?select=slug,title,description,active`
      + `&active=is.true`
      + `&order=created_at.desc`;
    const r = await fetch(url, { headers: auth(SUPABASE_ANON_KEY) });
    const rows = await r.json().catch(() => []);
    if (!r.ok) return json(r.status, { ok:false, error:'List fetch failed', data:rows }, CORS);
    return ok({ ok:true, forms: rows }, CORS, 60);
  }

  // Tek form: schema JSON içinde fields var
  const url = `${SUPABASE_URL}/rest/v1/forms`
    + `?select=slug,title,description,schema,active`
    + `&slug=eq.${encodeURIComponent(slug)}`
    + `&active=is.true`
    + `&limit=1`;
  const resp = await fetch(url, { headers: auth(SUPABASE_ANON_KEY) });
  const data = await resp.json().catch(() => []);
  if (!resp.ok) return json(resp.status, { ok:false, error:'Fetch failed', data }, CORS);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return json(404, { ok:false, error:'Form not found' }, CORS);

  const fields = (row.schema && Array.isArray(row.schema.fields)) ? row.schema.fields : [];
  const schema = {
    slug: row.slug,
    title: row.title || row.slug,
    description: row.description || '',
    fields
  };

  return ok({ ok:true, schema }, CORS, 120);
}

/* helpers */
function auth(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
}
function json(status, body, extra = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body)
  };
}
function ok(body, cors, sMaxAge = 0) {
  return {
    statusCode: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}`
    },
    body: JSON.stringify(body)
  };
}
