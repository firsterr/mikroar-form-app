// netlify/functions/forms-list.js
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
    if (event.httpMethod !== "GET") return res(405, { error: "method_not_allowed" });

    const token = event.queryStringParameters?.token || "";
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) return res(401, { error: "unauthorized" });

    if (!SUPABASE_URL || !SB_KEY) return res(500, { error: "server_env_missing" });

    const url = new URL(`${SUPABASE_URL}/rest/v1/forms`);
    url.searchParams.set("select", "slug,title,active,created_at");
    // Güvenli sıralama: slug’a göre (bazı ortamlarda created_at olmayabiliyor)
    url.searchParams.set("order", "slug.asc");

    const r = await fetch(url.toString(), {
      headers: { apikey: SB_KEY, authorization: `Bearer ${SB_KEY}`, accept: "application/json" },
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("forms-list error:", r.status, t);
      return res(502, { error: "upstream_error" });
    }

    const arr = await r.json();
    return res(200, { items: (arr || []).map(x => ({
      slug: x.slug,
      title: x.title,
      active: !!x.active,
      created_at: x.created_at || null,
    }))});
  } catch (e) {
    console.error("forms-list crash:", e);
    return res(500, { error: "server_crash" });
  }
};
