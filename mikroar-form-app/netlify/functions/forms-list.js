// netlify/functions/forms-list.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return json({ ok: false, error: 'method_not_allowed' }, 405);
    }

    // 🔒 Anahtar kontrolü (X-Admin-Token)
    const hdr = event.headers || {};
    const key =
      hdr['x-admin-token'] ||
      hdr['X-Admin-Token'] ||
      hdr['x-admin-token'.toLowerCase()];

    if (!ADMIN_TOKEN || key !== ADMIN_TOKEN) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    // Aktif formlar
    const { data, error } = await supabase
      .from('forms')
      .select('slug,title,active')
      .order('slug', { ascending: true });

    if (error) throw error;

    const forms =
      (data || [])
        .filter((f) => f.active !== false && f.slug)
        .map((f) => ({ slug: f.slug, title: f.title || f.slug }));

    return json({ ok: true, forms });
  } catch (e) {
    return json({ ok: false, error: e.message || 'unknown' }, 500);
  }
};
