// netlify/edge-functions/form-ssr.js
export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    // /f/:code => form.html?slug=...
    const slug = url.searchParams.get("slug")
      || url.pathname.replace(/^\/f\/?/, "") || "";

    // Formu API’den çek (OG için share_image_url ve title/desc lazım)
    let form = null;
    if (slug) {
      const api = `${origin}/api/forms?slug=${encodeURIComponent(slug)}`;
      const r = await fetch(api, { headers: { accept: "application/json" } });
      if (r.ok) {
        const j = await r.json();
        form = j?.form || null;
      }
    }

    // Meta
    let meta = {
      title: form?.title || "Mikroar Anket",
      description: form?.description || "Ankete katılın.",
      image: `${origin}/og/default.jpg`,
      url: origin + url.pathname,
    };

    // 1) URL parametri ile override
    const i = url.searchParams.get("i");
    if (i && /^https?:\/\//i.test(i)) {
      meta.image = i;
    } else if (form?.shareImageUrl && /^https?:\/\//i.test(form.shareImageUrl)) {
      // 2) DB alanı
      meta.image = form.shareImageUrl;
    }

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${escapeAttr(meta.url)}">

<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:image" content="${escapeAttr(meta.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeAttr(meta.url)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${escapeAttr(meta.image)}">

<style>html,body{height:100%}body{display:flex;align-items:center;justify-content:center;font:16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111}.b{opacity:.7}</style>
</head>
<body>
  <div class="b">Yükleniyor…</div>
  <script>location.replace("${origin}/form.html?slug=${encodeURIComponent(slug)}");</script>
</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (e) {
    return new Response("SSR error", { status: 500 });
  }
};

function escapeHtml(s){return String(s??"").replace(/[&<>"]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[m]));}
function escapeAttr(s){return String(s??"").replace(/"/g,"&quot;");}
