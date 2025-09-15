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

// ... supabase init vs.

exports.handler = async (event) => {
  const slug = event.queryStringParameters?.slug;
  if (!slug) return { statusCode: 400, body: JSON.stringify({ error: "slug_required" }) };

  const { data, error } = await supabase
    .from("forms")
    .select("slug, title, description, active, schema, share_image_url")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return { statusCode: 404, body: JSON.stringify({ ok:false, error: "not_found" }) };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      form: {
        slug: data.slug,
        title: data.title,
        description: data.description,
        active: data.active,
        schema: data.schema,
        shareImageUrl: data.share_image_url || null
      }
    })
  };
};

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
