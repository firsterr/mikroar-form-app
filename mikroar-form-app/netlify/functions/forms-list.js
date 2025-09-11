// Netlify Function — return shape: { items: [...] }
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'supabase-env-missing' }) };
  }

  const url = `${SUPABASE_URL}/rest/v1/forms?select=slug,title,active,created_at&order=created_at.desc&limit=200`;
  const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const data = await r.json().catch(() => []);
  if (!r.ok) {
    return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: 'supabase-error' }) };
  }

  const items = (Array.isArray(data) ? data : [])
    .filter(f => f.active !== false)
    .map(f => ({ slug: f.slug, title: f.title || f.slug, created_at: f.created_at }));

  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) };
};
