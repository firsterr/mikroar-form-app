// netlify/functions/forms.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

function respond(code, json, cacheSec = 0) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (cacheSec > 0) headers["cache-control"] = `public, s-maxage=${cacheSec}`;
  return { statusCode: code, headers, body: JSON.stringify(json) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return respond(405, { ok: false, error: "Method Not Allowed" });

  const qp = event.queryStringParameters || {};
  const list = qp.list === "1" || qp.list === "true";
  let slug = (qp.slug || "").trim();
  const code = (qp.code || qp.k || "").trim();

  try {
    // Liste (index'te açılır menü vs.)
    if (list) {
      const { data, error } = await db
        .from("forms")
        .select("id, slug, title")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;
      return respond(200, { ok: true, items: data || [] }, 60);
    }

    // Kısa kod -> slug çöz
    if (!slug && code) {
      const { data: sl, error: e1 } = await db
        .from("shortlinks")
        .select("slug, active")
        .eq("code", code)
        .single();
      if (e1 || !sl?.slug || sl.active === false) return respond(404, { ok: false, error: "Kısa kod bulunamadı" });
      slug = sl.slug;
    }

    if (!slug) return respond(400, { ok: false, error: "slug gerekli" });

    // Formu getir (description dahil)
    const { data, error } = await db
      .from("forms")
      .select("id, slug, title, description, schema, active")
      .eq("slug", slug)
      .single();

    if (error) {
      if (error.code === "PGRST116") return respond(404, { ok: false, error: "Form bulunamadı" });
      throw error;
    }
    if (!data?.active) return respond(404, { ok: false, error: "Form pasif" });

    return respond(200, { ok: true, form: data }, 30);
  } catch (err) {
    console.error("forms fn error:", err);
    return respond(500, { ok: false, error: "Sunucu hatası" });
  }
};
