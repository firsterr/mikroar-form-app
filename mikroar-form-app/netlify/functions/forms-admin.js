// Netlify Function: /api/forms-admin
// CJS yazıldı (Netlify default). ESM kullanıyorsanız export syntax'ını uyarlayın.
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // aynı token admin arayüzünde sorulan

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const ALLOWED_TYPES = ['text', 'email', 'textarea', 'radio', 'checkbox', 'select'];

function normStr(x) {
  return (x ?? '').toString().trim();
}

function normalizeQuestion(q, idx) {
  const t = normStr(q.type).toLowerCase();
  const type = ALLOWED_TYPES.includes(t) ? t : 'text';

  let name = normStr(q.name).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!name) name = `q${idx + 1}`;

  const base = {
    type,
    name,
    label: normStr(q.label) || `Soru ${idx + 1}`,
    required: !!q.required,
  };

  // radio | checkbox | select -> options
  if (['radio', 'checkbox', 'select'].includes(type)) {
    let opts = [];
    if (Array.isArray(q.options)) {
      opts = q.options.map(normStr).filter(Boolean);
    } else if (q.options != null) {
      opts = normStr(q.options).split(',').map(s => s.trim()).filter(Boolean);
    }
    base.options = Array.from(new Set(opts)); // tekrarı sil
  }

  return base;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const token = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
    if (!token || (ADMIN_TOKEN && token !== ADMIN_TOKEN)) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'invalid-json' }) };
    }

    const slug = normStr(payload.slug);
    if (!slug) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'slug-required' }) };

    const questionsIn = (payload.schema && Array.isArray(payload.schema.questions))
      ? payload.schema.questions
      : (payload.schema && Array.isArray(payload.schema.fields))
        ? payload.schema.fields
        : [];

    const questions = questionsIn.map((q, i) => normalizeQuestion(q, i));

    const schema = {
      title: normStr(payload.title),
      description: normStr(payload.description),
      active: !!payload.active,
      questions
    };

    // upsert by slug
    const row = {
      slug,
      title: schema.title || slug,
      text: schema.description || '',
      active: schema.active,
      schema
    };

    const { data, error } = await sb
      .from('forms')
      .upsert(row, { onConflict: 'slug' })
      .select()
      .single();

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, schema: data.schema }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
