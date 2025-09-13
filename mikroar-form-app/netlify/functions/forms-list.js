// netlify/functions/forms-list.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return cors(204);
    }

    // --- Auth gate: only header ---
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    const token =
      event.headers['x-admin-token'] ||
      event.headers['X-Admin-Token'] ||
      '';

    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    // --- Supabase client: SERVICE_ROLE mandatory for admin ops ---
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE; // no fallback
    if (!url || !key) return json({ error: 'misconfig' }, 500);

    const sb = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await sb
      .from('forms')
      .select('slug, title')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return json({ items: data || [] });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': 'https://anket.mikroar.com',
      'access-control-allow-headers': 'content-type,x-admin-token',
      'access-control-allow-methods': 'GET,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}
function cors(status = 204) {
  return {
    statusCode: status,
    headers: {
      'access-control-allow-origin': 'https://anket.mikroar.com',
      'access-control-allow-headers': 'content-type,x-admin-token',
      'access-control-allow-methods': 'GET,OPTIONS',
    },
    body: '',
  };
}
