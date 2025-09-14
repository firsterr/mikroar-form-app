// /.netlify/functions/forms-admin
const { createClient } = require("@supabase/supabase-js");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  try {
    const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
    const hdr = event.headers || {};
    const token = hdr["x-admin-token"] || hdr["X-Admin-Token"] || (event.queryStringParameters?.token || "");
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    const sb  = createClient(url, key, { auth: { persistSession: false } });

    if (event.httpMethod === "GET") {
      const slug = event.queryStringParameters?.slug || "";
      if (!slug) return resp(400, { error:"slug-required" });
      const { data, error } = await sb.from("forms").select("*").eq("slug", slug).maybeSingle();
      if (error) return resp(500, { error:error.message });
      return resp(200, { form: data });
    }

    if (event.httpMethod !== "POST") {
      return resp(405, { error:"method-not-allowed" }, { Allow: "GET, POST, OPTIONS" });
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return resp(400, { error:"invalid-json" }); }

    const payload = {
      slug:  (body.slug || "").trim(),
      title: (body.title || "").trim(),
      active: !!body.active,
      description: body.description ?? null,
      schema: body.schema || { questions: [] }
    };
    if (!payload.slug)  return resp(400, { error:"slug-required" });
    if (!payload.title) return resp(400, { error:"title-required" });

    // upsert
    const { data, error } = await sb
      .from("forms")
      .upsert(payload, { onConflict: "slug" })
      .select("*")
      .maybeSingle();
    if (error) return resp(500, { error: error.message });

    return resp(200, { ok:true, form: data });
  } catch (e) {
    return resp(500, { error: String(e.message || e) });
  }
};

function resp(code, json, extra = {}) {
  return {
    statusCode: code,
    headers: { ...CORS, ...extra, "content-type":"application/json; charset=utf-8" },
    body: JSON.stringify(json)
  };
}
