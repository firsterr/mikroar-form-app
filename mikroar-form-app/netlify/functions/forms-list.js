const { createClient } = require("@supabase/supabase-js");
exports.handler = async (event) => {
  try {
    const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();
    const hdr = toLower(event.headers || {});
    const q = event.queryStringParameters || {};
    const token = (hdr["x-admin-token"] || q.token || "").trim();
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return { statusCode: 401, headers:{ "content-type":"application/json" }, body: JSON.stringify({ error:"unauthorized" }) };
    }
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY, { auth:{ persistSession:false } });
    const { data, error } = await sb.from("forms").select("slug,title,active,created_at,updated_at").order("created_at",{ascending:false}).limit(200);
    if (error) throw error;
    return { statusCode: 200, headers:{ "content-type":"application/json" }, body: JSON.stringify({ items: data || [] }) };
  } catch (e) {
    return { statusCode: 500, headers:{ "content-type":"application/json" }, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
function toLower(h){ const o={}; for(const k in h) o[k.toLowerCase()]=h[k]; return o; }
