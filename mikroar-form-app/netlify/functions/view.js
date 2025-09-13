// mikroar-form-app/netlify/functions/view.js
import fs from "fs";
import path from "path";

export const handler = async (event) => {
  try {
    // /f/101010 -> "101010"
    const p = event.path || "";
    const code = decodeURIComponent(p.split("/f/")[1] || "").split("/")[0];
    if (!code) return { statusCode: 400, body: "Missing code" };

    // Supabase REST ile shortlinks'ten slug'ı çek
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/shortlinks?code=eq.${encodeURIComponent(code)}&select=slug&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );

    if (!resp.ok) {
      return { statusCode: 500, body: "shortlinks query failed" };
    }

    const rows = await resp.json();
    const slug = rows?.[0]?.slug;
    if (!slug) return { statusCode: 404, body: "Link not found" };

    // form.html'i oku (repo köküne göre doğru yolu bul)
    const candidates = [
      path.join(process.cwd(), "mikroar-form-app", "public", "form.html"),
      path.join(process.cwd(), "public", "form.html"),
      path.join(process.cwd(), "form.html"),
    ];

    let html = null;
    for (const fp of candidates) {
      if (fs.existsSync(fp)) {
        html = fs.readFileSync(fp, "utf8");
        break;
      }
    }
    if (!html) return { statusCode: 500, body: "form.html not found" };

    // Slug'ı enjekte et (sayfa yüklendiğinde app.js bunu görecek)
    const inject = `<script>window.__PRESET_SLUG=${JSON.stringify(slug)};</script>`;
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${inject}\n</head>`);
    } else {
      html = `${inject}\n${html}`;
    }

    return {
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: html,
    };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
};
