// netlify/functions/go.js
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, SUPABASE_ANON_KEY } = process.env;
const KEY = SUPABASE_SERVICE_ROLE || SUPABASE_ANON_KEY;

function j(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const code =
      event.queryStringParameters?.code ||
      (event.path || "").split("/").pop();

    if (!code) return j(400, { error: "code_required" });
    if (!SUPABASE_URL || !KEY) return j(500, { error: "server_env_missing" });

    // 1) Önce shortlinks tablosundan çöz
    let slug = await resolveFromShortlinks(code);

    // 2) shortlinks’te yoksa forms.short_code üzerinden dene (geri uyum)
    if (!slug) {
      slug = await resolveFromFormsShortCode(code);
    }

    if (!slug) {
      return j(404, { error: "not_found" });
    }

    const fmt = (event.queryStringParameters?.format || "").toLowerCase();
    if (fmt === "json") {
      return j(200, { ok: true, slug });
    }

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

async function resolveFromShortlinks(code) {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/shortlinks`);
    url.searchParams.set("select", "slug,expires_at,max_visits,visits");
    url.searchParams.set("code", `eq.${code}`);
    url.searchParams.set("limit", "1");

    const r = await fetch(url.toString(), {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Accept: "application/json",
      },
    });

    if (!r.ok) {
      console.error("shortlinks lookup error:", r.status, await r.text());
      return "";
    }

    const rows = await r.json();
    if (!rows || !rows.length) return "";

    const row = rows[0];

    // İstersen expire / max_visits burada enforce edebilirsin
    // Şimdilik sadece slug dönüyoruz.
    return row.slug || "";
  } catch (e) {
    console.error("resolveFromShortlinks crash:", e);
    return "";
  }
}

async function resolveFromFormsShortCode(code) {
  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/forms`);
    url.searchParams.set("select", "slug,short_code");
    url.searchParams.set("short_code", `eq.${code}`);
    url.searchParams.set("limit", "1");

    const r = await fetch(url.toString(), {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Accept: "application/json",
      },
    });

    if (!r.ok) {
      console.error("forms.short_code lookup error:", r.status, await r.text());
      return "";
    }

    const rows = await r.json();
    if (!rows || !rows.length) return "";

    return rows[0].slug || "";
  } catch (e) {
    console.error("resolveFromFormsShortCode crash:", e);
    return "";
  }
}
