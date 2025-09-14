// /.netlify/functions/forms
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const json = (body, status = 200, extraHeaders = {}) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    let slug = q.slug?.trim() || null;
    const code = (q.k || q.code || "").trim() || null;

    // k -> slug
    if (!slug && code) {
      const { data: short, error: e1 } = await sb
        .from("shortlinks").select("slug").eq("code", code).maybeSingle();
      if (e1) throw e1;
      slug = short?.slug || null;
    }

    if (!slug) return json({ ok:false, error:"slug-required" }, 400);

    // form
    const { data: form, error } = await sb
      .from("forms")
      .select("*")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!form) return json({ ok:false, error:"not-found" }, 404);

    // normalize
    const description =
      form.description ?? form.desc ?? form.schema?.description ?? form.schema?.desc ?? null;

    const payload = {
      id: form.id,
      slug: form.slug,
      title: form.title ?? form.schema?.title ?? "",
      description,
      active: !!form.active,
      schema: form.schema ?? { questions: [] }
    };

    return json({ ok:true, form: payload }, 200, {
      "Cache-Control": "public, max-age=30, must-revalidate"
    });
  } catch (err) {
    return json({ ok:false, error:"server-error", detail: err?.message || String(err) }, 500);
  }
};
