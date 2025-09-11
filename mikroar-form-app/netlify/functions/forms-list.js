// netlify/functions/forms-list.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    // --- Auth gate ---
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
    const hdrToken = event.headers['x-admin-token'] || event.headers['X-Admin-Token'] || '';
    const qToken   = (event.queryStringParameters && event.queryStringParameters.token) || '';
    const token = hdrToken || qToken;
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
    }

    // --- Supabase client (server role) ---
    const url  = process.env.SUPABASE_URL;
    const key  = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    const sb   = createClient(url, key, { auth: { persistSession: false } });

    // --- Data ---
    const { data, error } = await sb
      .from('forms')
      .select('slug, title')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: data || [] })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
