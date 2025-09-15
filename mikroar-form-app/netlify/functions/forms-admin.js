const { createClient } = require("@supabase/supabase-js");
const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, X-Admin-Token"
};
// ... mevcut import/supabase init/guard blokları aynen kalsın

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  const token = event.queryStringParameters?.token || "";
  if (token !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, body: JSON.stringify({ error: "unauthorized" }) };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "bad_json" }) }; }

  const { slug, title, description, active, schema, shareImageUrl } = payload;
  if (!slug || !schema) {
    return { statusCode: 400, body: JSON.stringify({ error: "slug_and_schema_required" }) };
  }

  const row = {
    slug,
    title: title || null,
    description: description || null,
    active: active === false ? false : true,
    schema,
    share_image_url: shareImageUrl || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("forms")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    console.error("forms-admin upsert error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "db_upsert_failed" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
function resp(code,json,extra={}){ return { statusCode:code, headers:{ ...CORS, ...extra, "content-type":"application/json; charset=utf-8" }, body:JSON.stringify(json) }; }
function toLower(h){ const o={}; for(const k in h) o[k.toLowerCase()]=h[k]; return o; }
