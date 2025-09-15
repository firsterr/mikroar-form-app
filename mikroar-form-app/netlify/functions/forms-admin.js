// netlify/functions/forms-admin.js
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY, ADMIN_TOKEN } = process.env;
const SB_KEY = SUPABASE_SERVICE_ROLE || SUPABASE_ANON_KEY;

function res(status, body) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return res(204, {});
    if (event.httpMethod !== "POST") return res(405, { error: "method_not_allowed" });

    if (!SUPABASE_URL || !SB_KEY) return res(500, { error: "server_env_missing" });

    const token = event.queryStringParameters?.token || "";
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res(401, { error: "unauthorized" });

    let payload = {};
    try { payload = JSON.parse(event.body || "{}"); }
    catch { return res(400, { error: "bad_json" }); }

    const { slug, title, description, active, schema, shareImageUrl } = payload;
    if (!slug || !schema) return res(400, { error: "slug_and_schema_required" });

    const row = {
      slug,
      title: title ?? null,
      description: description ?? null,
      active: active === false ? false : true,
      schema,
      share_image_url: (shareImageUrl || null),
      updated_at: new Date().toISOString(),
    };

    const url = new URL(`${SUPABASE_URL}/rest/v1/forms`);
    // upsert by unique slug
    url.searchParams.set("on_conflict", "slug");

    const r = await fetch(url.toString(), {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        authorization: `Bearer ${SB_KEY}`,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("forms-admin upsert error:", r.status, t);
      return res(502, { error: "db_upsert_failed", detail: r.statusText });
    }

    return res(200, { ok: true });
  } catch (e) {
    console.error("forms-admin crash:", e);
    return res(500, { error: "server_crash" });
  }
};
