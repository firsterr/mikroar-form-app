// netlify/functions/forms.js
// GET /api/forms?slug=ASD  → { form: {...} }
const json = (code, obj) => ({
  statusCode: code,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const KEY =
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    const slug = (event.queryStringParameters?.slug || '').trim();
    if (!slug) return json(400, { error: 'slug gerekli' });
    if (!SUPABASE_URL || !KEY) return json(500, { error: 'supabase-env-missing' });

    const select = encodeURIComponent('id,slug,title,schema,active,created_at');
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

    // 1) Kesin eşleşme
    let r = await fetch(
      `${SUPABASE_URL}/rest/v1/forms?slug=eq.${encodeURIComponent(slug)}&select=${select}`,
      { headers }
    );
    let rows = await r.json().catch(() => []);

    if (!r.ok) {
      // Supabase hata kodunu aynen geçir
      return json(r.status || 500, { error: 'supabase-error', detail: rows });
    }

    // 2) Yoksa: case-insensitive fallback
    if (!Array.isArray(rows) || rows.length === 0) {
      r = await fetch(
        `${SUPABASE_URL}/rest/v1/forms?slug=ilike.${encodeURIComponent(slug)}&select=${select}`,
        { headers }
      );
      rows = await r.json().catch(() => []);
      if (!r.ok) return json(r.status || 500, { error: 'supabase-error', detail: rows });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(404, { error: 'Form bulunamadı' });
    }

    const form = rows[0] || null;
    if (form && typeof form.schema === 'string') {
      try { form.schema = JSON.parse(form.schema); } catch { form.schema = {}; }
    }

    return json(200, { form });
  } catch (e) {
    return json(500, { error: 'internal', detail: String(e && e.message || e) });
  }
};
