// Netlify Function: /api/forms-admin  (depsiz, REST ile upsert)
// Node 18+ ortamında fetch globaldir.

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const ALLOWED_TYPES = ['text', 'email', 'textarea', 'radio', 'checkbox', 'select'];

const norm = (v) => (v ?? '').toString().trim();

function normalizeQuestion(q, idx) {
  const t = norm(q.type).toLowerCase();
  const type = ALLOWED_TYPES.includes(t) ? t : 'text';

  let name = norm(q.name).toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!name) name = `q${idx + 1}`;

  const out = {
    type,
    name,
    label: norm(q.label) || `Soru ${idx + 1}`,
    required: !!q.required,
  };

  // radio | checkbox | select => options
  if (['radio', 'checkbox', 'select'].includes(type)) {
    let opts = [];
    if (Array.isArray(q.options)) {
      opts = q.options.map(norm).filter(Boolean);
    } else if (q.options != null) {
      opts = norm(q.options).split(',').map(s => s.trim()).filter(Boolean);
    }
    out.options = Array.from(new Set(opts));
  }

  return out;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Admin auth
    const hdr = event.headers || {};
    const token = hdr['x-admin-token'] || hdr['X-Admin-Token'];
    if (!token || (ADMIN_TOKEN && token !== ADMIN_TOKEN)) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'supabase-env-missing' }) };
    }

    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ ok:false, error:'invalid-json' }) }; }

    const slug = norm(payload.slug);
    if (!slug) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'slug-required' }) };

    const questionsIn =
      (payload.schema && Array.isArray(payload.schema.questions)) ? payload.schema.questions :
      (payload.schema && Array.isArray(payload.schema.fields)) ? payload.schema.fields : [];

    const questions = questionsIn.map((q, i) => normalizeQuestion(q, i));

    const schema = {
      title: norm(payload.title),
      description: norm(payload.description),
      active: !!payload.active,
      questions
    };

    const row = {
      slug,
      title: schema.title || slug,
      text: schema.description || '',
      active: schema.active,
      schema
    };

    // Supabase REST upsert
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/forms?on_conflict=slug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(row)
    });

    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      const msg = (data && (data.message || data.error)) || `supabase-${resp.status}`;
      return { statusCode: 500, body: JSON.stringify({ ok:false, error: msg, detail: data }) };
    }

    const saved = Array.isArray(data) ? data[0] : data;
    return { statusCode: 200, body: JSON.stringify({ ok:true, schema: saved.schema }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: err.message }) };
  }
};
