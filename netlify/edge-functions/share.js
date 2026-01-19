// netlify/functions/share.js
const { createClient } = require("@supabase/supabase-js");

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

exports.handler = async (event) => {
  try {
    const code = event.queryStringParameters?.code;
    if (!code) {
      return { statusCode: 400, body: "Missing code" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: "Supabase env missing" };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) shortlinks tablosundan çöz (varsa)
    let slug = null;

    const { data: slRow } = await supabase
      .from("shortlinks")
      .select("slug")
      .eq("code", code)
      .maybeSingle();

    if (slRow?.slug) slug = slRow.slug;

    // 2) shortlinks yoksa forms.short_code üzerinden dene
    if (!slug) {
      const { data: fRow } = await supabase
        .from("forms")
        .select("slug")
        .eq("short_code", code)
        .maybeSingle();

      if (fRow?.slug) slug = fRow.slug;
    }

    if (!slug) {
      return { statusCode: 404, body: "Short code not found" };
    }

    // 3) form bilgilerini çek
    const { data: formRow } = await supabase
      .from("forms")
      .select("title, description, share_image_url")
      .eq("slug", slug)
      .maybeSingle();

    const title = formRow?.title || "MikroAR Anket";
    const description =
      formRow?.description ||
      "Bu anket linki üzerinden formu açabilir ve yanıtlayabilirsiniz.";
    const image =
      formRow?.share_image_url || "https://anket.mikroar.com/og/3.png";

    const siteUrl = "https://form.mikroar.com";
    const targetUrl = `${siteUrl}/form.html?slug=${encodeURIComponent(slug)}`;

    // WhatsApp cache kırmak için küçük versiyon paramı
    const imageUrl = image.includes("?") ? `${image}&v=1` : `${image}?v=1`;

    const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>${esc(title)}</title>

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(imageUrl)}" />
  <meta property="og:url" content="${esc(targetUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(imageUrl)}" />

  <meta http-equiv="refresh" content="0; url=${esc(targetUrl)}" />
</head>
<body>
  <p>Yönlendiriliyorsunuz…</p>
  <a href="${esc(targetUrl)}">Formu aç</a>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      body: html,
    };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
