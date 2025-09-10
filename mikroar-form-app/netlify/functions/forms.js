
// netlify/functions/forms.js
export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'Allow': 'GET' }, body: 'Method Not Allowed' };
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' });
  }

  const slug = new URLSearchParams(event.rawQuery || event.queryStringParameters).get('slug');
  if (!slug) return json(400, { ok: false, error: 'slug required' });

  const url = `${SUPABASE_URL}/rest/v1/forms?slug=eq.${encodeURIComponent(slug)}&select=*`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });

  const rows = await r.json().catch(() => []);
  const one = Array.isArray(rows) ? rows[0] : null;
  if (!one) return json(404, { ok: false, error: 'not found' });

 
  // normalize: always provide schema.questions (and mirror to fields for eski clientlar)
  const qs = one.schema?.questions || one.schema?.fields || [];
  const schema = {
    slug: one.slug,
    title: one.title,
    description: one.description,
    active: !!one.active,
    questions: qs,
    fields: qs
  };

  return json(200, { ok: true, schema });
}

function json(code, obj) {
  return {
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    // Netlify edge cache:
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=30'
  },
  body: JSON.stringify({ ok: true, schema })
};
}
