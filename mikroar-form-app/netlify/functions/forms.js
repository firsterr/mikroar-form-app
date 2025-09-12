// netlify/functions/forms.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // okuma için yeterli

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
});

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const qp = event.queryStringParameters || {};
  const slug = (qp.slug || "").trim();
  const list = qp.list === "1" || qp.list === "true";

  try {
    // Liste (index sayfasındaki açılır menü)
    if (list) {
      const { data, error } = await db
        .from("forms")
        .select("id, slug, title")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return respond(200, { ok: true, items: data || [] }, 60);
    }

    // Tek form (form.html ve SSR beklediği format)
    if (!slug) return respond(400, { ok: false, error: "slug gerekli" });

    const { data, error } = await db
      .from("forms")
      .select("id, slug, title, description, schema, active")
      .eq("slug", slug)
      .single();

    if (error) {
      if (error.code === "PGRST116" /* row not found */) {
        return respond(404, { ok: false, error: "Form bulunamadı" });
      }
      throw error;
    }

    if (!data?.active) {
      return respond(404, { ok: false, error: "Form pasif" });
    }

    // client { form } bekliyor
    return respond(200, { ok: true, form: data }, 30);
  } catch (err) {
    console.error("forms fn error:", err);
    return respond(500, { ok: false, error: "Sunucu hatası" });
  }
};

function respond(code, json, sMaxAgeSec = 0) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (sMaxAgeSec > 0) {
    // Netlify CDN cache (SSR olmayan çağrılar için hoş)
    headers["cache-control"] = `public, s-maxage=${sMaxAgeSec}`;
  }
  return { statusCode: code, headers, body: JSON.stringify(json) };
}
