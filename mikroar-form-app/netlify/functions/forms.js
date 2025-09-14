// /.netlify/functions/forms
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const json = (body, status = 200, extraHeaders = {}) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

// Stabil ETag üretimi için kanonik JSON
function canonical(obj) {
  try {
    const keys = Object.keys(obj).sort();
    return JSON.stringify(obj, keys);
  } catch {
    return JSON.stringify(obj);
  }
}

function successWithCache(payload, event) {
  const body = canonical(payload);
  const etag = 'W/"' + crypto.createHash("sha256").update(body).digest("hex") + '"';
  const inm =
    (event.headers?.["if-none-match"] || event.headers?.["If-None-Match"] || "").trim();

  const cacheHeaders = {
    ETag: etag,
    "Netlify-CDN-Cache-Control": "public, max-age=60",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
    Vary: "Accept-Encoding"
  };

  if (inm && inm === etag) {
    return { statusCode: 304, headers: cacheHeaders, body: "" };
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...cacheHeaders },
    body
  };
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    let slug = q.slug?.trim() || null;
    const code = (q.k || q.code || "").trim() || null;

    // kısa kod → slug
    if (!slug && code) {
      const { data: short, error: e1 } = await sb
        .from("shortlinks")
        .select("slug")
        .eq("code", code)
        .maybeSingle();
      if (e1) throw e1;
      slug = short?.slug || null;
    }

    if (!slug) return json({ ok: false, error: "slug-required" }, 400, { "Cache-Control": "no-store" });

    // form
    const { data: form, error } = await sb
      .from("forms")
      .select("*")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!form) return json({ ok: false, error: "not-found" }, 404, { "Cache-Control": "no-store" });

    // normalize
    const description =
      form.description ??
      form.desc ??
      form.schema?.description ??
      form.schema?.desc ??
      null;

    const payload = {
      ok: true,
      form: {
        id: form.id,
        slug: form.slug,
        title: form.title ?? form.schema?.title ?? "",
        description,
        active: !!form.active,
        schema: form.schema ?? { questions: [] }
      }
    };

    // 200/304 + cache header'lar
    return successWithCache(payload, event);
  } catch (err) {
    return json(
      { ok: false, error: "server-error", detail: err?.message || String(err) },
      500,
      { "Cache-Control": "no-store" }
    );
  }
};
