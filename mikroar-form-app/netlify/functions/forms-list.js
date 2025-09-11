// Netlify Function: /api/forms-list  (Supabase REST, admin token opsiyonel)

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: { ...CORS, Allow: 'GET, OPTIONS' }, body: 'Method Not Allowed' };
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: 'supabase-env-missing' }) };
    }

    // Anahtar zorunluluğunu ENV ile kontrol et
    const requireAdmin = process.env.REQUIRE_ADMIN_FORMS_LIST === '1';
    const adminToken =
      event.headers['x-admin-token'] ||
      event.headers['X-Admin-Token'] ||
      event.headers['x-admin_token'];

    if (requireAdmin) {
      const expected = process.env.ADMIN_TOKEN || '';
      if (!adminToken) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, message: 'Unauthorized' }) };
      }
      if (adminToken !== expected) {
        return { statusCode: 403, headers: CORS, body: JSON.stringify({ ok: false, message: 'Forbidden' }) };
      }
    }

    // REST çağrı
    const url = `${SUPABASE_URL}/rest/v1/forms?select=slug,title,active&order=created_at.desc&limit=200`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });

    const data = await r.json().catch(() => []);
    if (!r.ok) {
      const msg = (data && (data.message || data.error)) || `supabase-${r.status}`;
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ ok: false, error: msg }) };
    }

    const forms = Array.isArray(data) ? data.filter(f => f.active !== false) : [];
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, forms }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};

import { createClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL;
const SRV = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

const db = createClient(URL, SRV, { auth: { persistSession: false } });

export async function handler() {
  const { data, error } = await db
    .from("forms")
    // description yok; sadece aktif formlar gelsin
    .select("slug, title, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { statusCode: 500, body: JSON.stringify({ error: "Liste alınamadı" }) };

  const items = (data || []).map(x => ({
    slug: x.slug,
    title: x.title || x.slug,
    created_at: x.created_at
  }));

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items })
  };
}
