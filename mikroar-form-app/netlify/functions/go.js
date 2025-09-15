// netlify/functions/go.js
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY } = process.env;
const KEY = SUPABASE_SERVICE_ROLE || SUPABASE_ANON_KEY;

function j(status, body, headers = {}) {
  return { statusCode: status, headers: { "content-type": "application/json; charset=utf-8", ...headers }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code
      || (event.path || "").split("/").pop();
    if (!code) return j(400, { error: "code_required" });
    if (!SUPABASE_URL || !KEY) return j(500, { error: "server_env_missing" });

    const url = new URL(`${SUPABASE_URL}/rest/v1/forms`);
    url.searchParams.set("select", "slug,short_code");
    url.searchParams.set("short_code", `eq.${code}`);
    url.searchParams.set("limit", "1");

    const r = await fetch(url, { headers: { apikey: KEY, authorization: `Bearer ${KEY}`, accept: "application/json" } });
    if (!r.ok) return j(502, { error: "upstream_error", detail: r.statusText });

    const rows = await r.json();
    if (!rows?.length) return j(404, { error: "not_found" });

    const slug = rows[0].slug;
    const fmt = (event.queryStringParameters?.format || "").toLowerCase();
    if (fmt === "json") return j(200, { ok: true, slug });

    // default: redirect
    return {
      statusCode: 302,
      headers: { Location: `/form.html?slug=${encodeURIComponent(slug)}` },
      body: "",
    };
  } catch (e) {
    console.error("go.js crash:", e);
    return j(500, { error: "server_crash" });
  }
};
