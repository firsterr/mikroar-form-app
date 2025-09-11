// Netlify Function — return shape: { form: {...} }
const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  const slug = (event.queryStringParameters?.slug || '').trim();
  if (!slug) return json(400, { error: 'slug gerekli' });
  if (!SUPABASE_URL || !KEY) return json(500, { error: 'supabase-env-missing' });

  const url = `${SUPABASE_URL}/rest/v1/forms`
            + `?slug=eq.${encodeURIComponent(slug)}`
            + `&select=id,slug,title,schema,active,created_at`;

  const r = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const rows = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(rows) || rows.length === 0) {
    return json(404, { error: 'Form bulunamadı' });
  }

  const form = rows[0];
  if (typeof form.schema === 'string') { try { form.schema = JSON.parse(form.schema); } catch { form.schema = {}; } }
  return json(200, { form });
};

const json = (code, obj) => ({
  statusCode: code,
- headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
+ headers: {
+   'Content-Type': 'application/json',
+   'Access-Control-Allow-Origin': '*',
+   // 60 sn CDN, 5 dk SWR → cold-start hissi azalır
+   'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
+ },
  body: JSON.stringify(obj)
});
