// netlify/functions/forms.js
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY } = process.env;
const SB_KEY = SUPABASE_SERVICE_ROLE || SUPABASE_ANON_KEY;

function res(status, body, extra = {}) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return res(204, {});
    if (event.httpMethod !== "GET") return res(405, { error: "method_not_allowed" });

    if (!SUPABASE_URL || !SB_KEY) return res(500, { error: "server_env_missing" });

    const slug = event.queryStringParameters?.slug;
    if (!slug) return res(400, { error: "slug_required" });

    const url = new URL(`${SUPABASE_URL}/rest/v1/forms`);
    url.searchParams.set("select", "slug,title,description,active,schema,share_image_url");
    url.searchParams.set("slug", `eq.${slug}`);
    url.searchParams.set("limit", "1");

    const r = await fetch(url.toString(), {
      headers: {
        apikey: SB_KEY,
        authorization: `Bearer ${SB_KEY}`,
        accept: "application/json",
      },
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("forms.js supabase error:", r.status, t);
      return res(502, { ok: false, error: "upstream_error", detail: r.statusText });
    }

    const rows = await r.json();
    if (!rows || !rows.length) return res(404, { ok: false, error: "not_found" });

    const f = rows[0];
    return res(200, {
      ok: true,
      form: {
        slug: f.slug,
        title: f.title,
        description: f.description,
        active: !!f.active,
        schema: f.schema,
        shareImageUrl: f.share_image_url || null,
      },
    });
  } catch (e) {
    console.error("forms.js crash:", e);
    return res(500, { error: "server_crash" });
  }
};
