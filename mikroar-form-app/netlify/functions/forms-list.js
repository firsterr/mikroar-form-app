// /.netlify/functions/forms-list
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  try {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
    const hdr = event.headers || {};
    const token = hdr["x-admin-token"] || hdr["X-Admin-Token"] || (event.queryStringParameters?.token || "");
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    const sb  = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await sb
      .from("forms")
      .select("slug, title, active, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ items: data || [] })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
