export async function handler(event) {
  // Yalnızca POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing Supabase env vars' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // TODO: alanları kendi formuna göre doğrula
  // ör: if (!payload.name || !payload.email) return { statusCode: 400, body: 'name & email required' };

  const table = 'forms'; // tablo adını kendi şemana göre değiştir
  const endpoint = `${SUPABASE_URL}/rest/v1/${table}`;

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => null);
    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: resp.ok, data })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) })
    };
  }
}
