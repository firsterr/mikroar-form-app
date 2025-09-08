// netlify/functions/forms-admin.js
// Basit admin API: form oluştur / güncelle (UPSERT) ve sil
// Güvenlik: X-Admin-Token header'ı ADMIN_TOKEN ile eşleşmeli

const json = (s, d) => ({
  statusCode: s,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(d)
});

export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
      }
    };
  }

  const token = event.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return json(401, { ok: false, message: 'Unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    return json(500, { ok: false, message: 'Missing Supabase server envs' });
  }

  const TABLE = `${SUPABASE_URL}/rest/v1/forms`;
  const HEADERS = {
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    // return=representation: dönen kaydı geri ver
    // resolution=merge-duplicates + on_conflict=slug ile UPSERT yap
    Prefer: 'return=representation,resolution=merge-duplicates'
  };

  if (event.httpMethod === 'POST') {
    // Body: { slug, title?, description?, fields: [...] }
    const body = JSON.parse(event.body || '{}');
    if (!body.slug) return json(400, { ok: false, message: 'slug gerekli' });

    // forms tablosunda JSON kolonun adı sende “schema” ise bu şekliyle bırak.
    // Eğer kolonun adı “fields” ise aşağıdaki satırı:
    //   const row = { slug: body.slug, title: ..., description: ..., fields: body.fields || [] };
    // şeklinde değiştir.
    const row = {
      slug: body.slug,
      title: body.title || body.slug,
      description: body.description || '',
      schema: { fields: body.fields || [] }   // <<< burada “schema” kolonu varsayımı
    };

    const r = await fetch(`${TABLE}?on_conflict=slug`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify([row])
    });

    const j = await r.json().catch(() => ({}));
    return json(r.status, { ok: r.ok, ...j, message: r.ok ? 'Kaydedildi' : 'Hata' });
  }

  if (event.httpMethod === 'DELETE') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) return json(400, { ok: false, message: 'slug gerekli' });

    const r = await fetch(`${TABLE}?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: HEADERS
    });
    return json(r.status, { ok: r.ok, message: r.ok ? 'Silindi' : 'Hata' });
  }

  return json(405, { ok: false, message: 'Method Not Allowed' });
}
