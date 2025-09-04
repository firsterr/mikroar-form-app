export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
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

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ZORUNLU alan
  if (!input.slug) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'slug_required' }) };
  }

  // ✅ Tablo adını gerekirse 'responses' yap
  const TABLE = 'responses';
  const endpoint = `${SUPABASE_URL}/rest/v1/${TABLE}`;

  // ✅ Şemaya uygun kayıt: form_slug + answers (jsonb)
  const record = {
    form_slug: input.slug,
    answers: input.answers ?? {
      name: input.name ?? null,
      email: input.email ?? null,
      message: input.message ?? null
    }
    // İstersen ve tabloda varsa: ip vb. alanları da ekleyebilirsin.
    // ip: event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || null,
  };

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(record)
    });

    const data = await resp.json().catch(() => null);
    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
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
