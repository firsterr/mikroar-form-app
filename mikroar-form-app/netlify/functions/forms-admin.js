// netlify/functions/forms-admin.js
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Allow': 'POST' }, body: 'Method Not Allowed' };
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jerr(500, 'Missing Supabase env vars');
  }

  // admin auth (header is case-insensitive)
  const got = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  if (!ADMIN_TOKEN || got !== ADMIN_TOKEN) {
    return jerr(401, 'Unauthorized');
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return jerr(400, 'Invalid JSON'); }

  const slug = String(body.slug || '').trim();
  if (!slug) return jerr(400, 'slug required');

  // normalize questions  (accept "schema.questions" OR legacy "schema.fields")
  const schemaIn = body.schema || {};
  const inArr = Array.isArray(schemaIn.questions)
    ? schemaIn.questions
    : Array.isArray(schemaIn.fields) ? schemaIn.fields : [];

  const questions = inArr.map((q, i) => normalizeQ(q, i));
  const schemaOut = { questions }; // <-- DB'ye HER ZAMAN questions olarak yaz

  const row = {
    slug,
    title: body.title ?? null,
    description: body.description ?? null,
    active: body.active !== false,
    schema: schemaOut
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/forms?on_conflict=slug`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        // upsert + dönen kaydı istiyoruz
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(row)
    });

    const data = await resp.json().catch(() => null);
    const saved = Array.isArray(data) ? data[0] : data;

    return jok(resp.ok, {
      id: saved?.id,
      slug: saved?.slug,
      schema: saved?.schema   // { questions:[...] } olarak dönsün
    }, resp.status);
  } catch (e) {
    return jerr(500, String(e));
  }
}

function normalizeQ(q = {}, idx = 0) {
  const type = String(q.type || 'text');
  const name = String(q.name || '').trim() || `q${idx + 1}`;
  const label = String(q.label || `Soru ${idx + 1}`).trim();
  const required = !!q.required;
  let options = [];

  if (type === 'radio' || type === 'checkbox') {
    if (Array.isArray(q.options)) options = q.options.map(s => String(s));
  }

  const out = { type, name, label, required };
  if (options.length) out.options = options;
  return out;
}

function jok(ok, data, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok, ...data })
  };
}
function jerr(code, msg) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: false, error: msg })
  };
}
