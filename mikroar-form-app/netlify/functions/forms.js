// mikroar-form-app/netlify/functions/forms.js
export async function handler(event) {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok:false, error:'Missing Supabase env vars' }, CORS);
  }

  const slug = (event.queryStringParameters?.slug || '').trim();

  // Liste modu (slug yoksa) — mevcut fonksiyon akışına uyumlu kalsın
  if (!slug) {
    const url = `${SUPABASE_URL}/rest/v1/forms?select=slug,title,description,active&active=is.true&order=created_at.desc`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    const rows = await r.json().catch(() => []);
    if (!r.ok) return json(r.status, { ok:false, error:'List fetch failed', data:rows }, CORS);
    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, s-maxage=60' // 1 dk edge cache
      },
      body: JSON.stringify({ ok:true, forms: rows })
    };
  }

  // Tek form: slug ile getir
  const url = `${SUPABASE_URL}/rest/v1/forms?select=slug,title,description,schema,fields,active&slug=eq.${encodeURIComponent(slug)}&active=is.true&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const data = await resp.json().catch(() => []);
  if (!resp.ok) return json(resp.status, { ok:false, error:'Fetch failed', data }, CORS);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return json(404, { ok:false, error:'Form not found' }, CORS);

  // Esnek alan çözümü: schema.fields veya fields
  const fields = (row.schema && Array.isArray(row.schema.fields))
    ? row.schema.fields
    : (Array.isArray(row.fields) ? row.fields : []);

  const schema = {
    slug: row.slug,
    title: row.title || row.slug,
    description: row.description || '',
    fields
  };

  return {
    statusCode: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=0, s-maxage=120' // 2 dk edge cache
    },
    body: JSON.stringify({ ok:true, schema })
  };
}

function json(status, body, extra = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body)
  };
}
