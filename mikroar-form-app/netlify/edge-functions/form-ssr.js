// netlify/edge-functions/form-ssr.js
export default async (request) => {
  try {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    // 1) slug çöz
    let slug = url.searchParams.get("slug") || "";
    if (!slug) {
      const m = url.pathname.match(/^\/f\/([^/?#]+)/);
      if (m) {
        const code = m[1];
        // kısa kodu slug'a çevir
        const rr = await fetch(`${origin}/api/go?code=${encodeURIComponent(code)}&format=json`, { headers: { accept: "application/json" } });
        if (rr.ok) {
          const jj = await rr.json().catch(() => null);
          slug = jj?.slug || "";
        }
      }
    }

    // 2) Formu getir
    let form = null;
    if (slug) {
      const api = `${origin}/api/forms?slug=${encodeURIComponent(slug)}`;
      const r = await fetch(api, { headers: { accept: "application/json" } });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        form = j?.form || null;
      }
    }

    // 3) Meta hazırla (öncelik: ?i= → DB → default)
    let meta = {
      title: form?.title || "Mikroar Anket",
      description: form?.description || "Ankete katılın.",
      image: `${origin}/og/default.jpg`,
      url: origin + url.pathname
    };

    const paramImg = url.searchParams.get("i");
    if (paramImg && /^https?:\/\//i.test(paramImg)) {
      meta.image = paramImg;
    } else if (form?.shareImageUrl && /^https?:\/\//i.test(form.shareImageUrl)) {
      meta.image = form.shareImageUrl;
    }

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(meta.title)}</title>
<meta name="description" content="${e(meta.description)}">
<link rel="canonical" href="${a(meta.url)}">

<meta property="og:type" content="website">
<meta property="og:title" content="${e(meta.title)}">
<meta property="og:description" content="${e(meta.description)}">
<meta property="og:image" content="${a(meta.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${a(meta.url)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(meta.title)}">
<meta name="twitter:description" content="${e(meta.description)}">
<meta name="twitter:image" content="${a(meta.image)}">

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

function e(s){return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));}
function a(s){return String(s??"").replace(/"/g,"&quot;");}
