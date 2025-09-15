// netlify/edge-functions/form-ssr.js
export default async (request) => {
  try {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;

    // Bu Edge yalnızca /f/* için bağlı. Kodu al:
    const m = url.pathname.match(/^\/f\/([^/?#]+)/);
    const code = m ? m[1] : "";

    // short_code -> slug çöz
    let slug = "";
    if (code) {
      const rr = await fetch(`${origin}/api/go?code=${encodeURIComponent(code)}&format=json`,
        { headers: { accept: "application/json" } });
      if (rr.ok) {
        const jj = await rr.json().catch(() => null);
        slug = jj?.slug || "";
      }
    }

    // Form meta (başlık/açıklama/görsel)
    let form = null;
    if (slug) {
      const r = await fetch(`${origin}/api/forms?slug=${encodeURIComponent(slug)}`,
        { headers: { accept: "application/json" } });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        form = j?.form || null;
      }
    }

    // ?i= ile override, yoksa DB, o da yoksa default
    const paramImg = url.searchParams.get("i");
    const meta = {
      title: form?.title || "Mikroar Anket",
      description: form?.description || "Ankete katılın.",
      image: (paramImg && /^https?:\/\//i.test(paramImg))
             ? paramImg
             : (form?.shareImageUrl && /^https?:\/\//i.test(form.shareImageUrl))
               ? form.shareImageUrl
               : `${origin}/og/default.jpg`,
      url: origin + url.pathname
    };

    const frameSrc = slug
      ? `/form.html?slug=${encodeURIComponent(slug)}`
      : `/form.html?error=not_found`;

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${h(meta.title)}</title>
<meta name="description" content="${h(meta.description)}">
<link rel="canonical" href="${a(meta.url)}">

<meta property="og:type" content="website">
<meta property="og:title" content="${h(meta.title)}">
<meta property="og:description" content="${h(meta.description)}">
<meta property="og:image" content="${a(meta.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${a(meta.url)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h(meta.title)}">
<meta name="twitter:description" content="${h(meta.description)}">
<meta name="twitter:image" content="${a(meta.image)}">

<style>
  html,body{height:100%;margin:0}
  body{font:16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111}
  .wrap{position:fixed;inset:0}
  iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
  .noslug{display:flex;align-items:center;justify-content:center;height:100%}
  .muted{opacity:.7}
</style>
</head>
<body>
  ${slug
    ? `<div class="wrap"><iframe src="${a(frameSrc)}" allow="clipboard-write *; clipboard-read *"></iframe></div>`
    : `<div class="noslug"><div class="muted">Form bulunamadı.</div></div>`}
  <noscript><div class="muted" style="position:fixed;left:0;right:0;bottom:8px;text-align:center">Bu sayfa JavaScript gerektirir.</div></noscript>
</body>
</html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("SSR error", { status: 500 });
  }
};

function h(s){return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));}
function a(s){return String(s??"").replace(/"/g,"&quot;");}
