export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing Supabase env vars' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { slug, ...answers } = payload;           // slug + kalan alanlar
  if (!slug) { return { statusCode: 400, body: 'slug required' }; }

  // İstemci IP’si
  const ip =
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for'] ||
    null;

  // 1) forms tablosunda slug yoksa oluştur (409’u önler)
  try {
    // Var mı diye bak
    const existsResp = await fetch(
      `${SUPABASE_URL}/rest/v1/forms?select=form_slug&form_slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const exists = await existsResp.json();

    if (!Array.isArray(exists) || exists.length === 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/forms`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ form_slug: slug, ip })
      });
      // Hata yutsa da sorun değil; tekrar insert denerken FK sağlam olur
    }
  } catch (_) { /* sessiz geç */ }

  // 2) responses’a kaydet
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        form_slug: slug,
        ip,
        answers,       // {ad, email, mesaj, ...}
        // created_at DB default ile doluyor
      })
    });

    const data = await resp.json().catch(() => null);
    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: resp.ok, data })
    };
  } catch (err) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) }) };
  }
}
