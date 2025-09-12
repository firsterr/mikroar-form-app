// netlify/functions/forms.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const json = (body, status = 200) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    let slug = params.slug || null;
    const code = params.k || params.code || null;

    // k -> slug
    if (!slug && code) {
      const { data: short, error: e1 } = await supabase
        .from("shortlinks")
        .select("slug")
        .eq("code", code)
        .maybeSingle();
      if (e1) throw e1;
      slug = short?.slug || null;
    }

    if (!slug) return json({ ok: false, error: "slug-required" }, 400);

    // Formu çek
    const { data: form, error } = await supabase
      .from("forms")
      .select("*")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    if (!form) return json({ ok: false, error: "not-found" }, 404);

    // description farklı kolon/alanlarda olabilir -> normalize et
    const description =
      form.description ??
      form.desc ??
      form.schema?.description ??
      form.schema?.desc ??
      null;

    const payload = {
      id: form.id,
      slug: form.slug,
      title: form.title ?? form.schema?.title ?? "",
      description,
      active: !!form.active,
      schema: form.schema ?? null,
    };

    return json({ ok: true, form: payload });
  } catch (err) {
    return json(
      { ok: false, error: "server-error", detail: err?.message || String(err) },
      500
    );
  }
};
