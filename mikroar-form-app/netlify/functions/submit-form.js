// mikroar-form-app/netlify/functions/submit-form.js
export async function handler(event) {
  // Sadece POST kabul et
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method Not Allowed' }, { Allow: 'POST' });
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok: false, error: 'Missing Supabase env vars' });
  }

  // slug: URL query'den (…/submit-form?slug=FORM_SLUG)
  const slug = event.queryStringParameters?.slug;
  if (!slug) return json(400, { ok: false, error: "form_slug (slug) gerekli" });

  // Body
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }

  // IP'yi güvenli şekilde birden çok header’dan dene
  const h = normalizeHeaders(event.headers || {});
  const ip =
    h['x-nf-client-connection-ip'] ||
    h['client-ip'] ||
    (h['x-forwarded-for'] ? h['x-forwarded-for'].split(',')[0].trim() : null) ||
    h['x-real-ip'] ||
    null;

  // Kayıt payload’u — responses tablosu şemanıza uygun
  const record = {
    form_slug: slug,
    ip,                               // inet sütunu: string IPv4/IPv6
    answers: {
      ad: body.ad ?? null,
      email: body.email ?? null,
      mesaj: body.mesaj ?? null,
    },
    slug: body.slug ?? null           // varsa, yoksa kalsın
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(record)
    });

    const data = await safeJson(resp);
    return json(resp.status, { ok: resp.ok, data, ipUsed: ip });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
}

/* helpers */
function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}

function normalizeHeaders(headers) {
  const out = {};
  for (const k in headers) out[k.toLowerCase()] = headers[k];
  return out;
}
