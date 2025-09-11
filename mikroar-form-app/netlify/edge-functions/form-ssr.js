// netlify/edge-functions/form-ssr.js
// Amaç: /form.html?slug=... isteklerinde formu edge'de SSR edip
// boş/flash olmadan doğrudan HTML olarak döndürmek.

export default async (req, context) => {
  const url = new URL(req.url);

  // slug: ?slug=... yoksa path'ten (form.mikroar.com/SLUG gibi kullanım için)
  const rawPath  = url.pathname.replace(/^\/+|\/+$/g, "");
  const pathSlug = rawPath && !/\.html$/i.test(rawPath) ? rawPath : "";
  const slug = url.searchParams.get("slug") || pathSlug;

  // slug yoksa static sayfayı ver (liste ekranı)
  if (!slug) return context.next();

  // Şemayı iç fonksiyondan çek (aynı origin, soğuk başlatma riski düşük)
  const api = new URL("/.netlify/functions/forms?slug=" + encodeURIComponent(slug), url.origin);
  let schema;
  try {
    const r = await fetch(api.toString(), { headers: { "accept": "application/json" } });
    const j = await r.json();
    if (!r.ok || !j?.ok || !j?.schema) return context.next();
    schema = j.schema;
  } catch {
    return context.next();
  }

  // HTML yardımcıları
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const row = (q, i) => {
    const type = String(q.type || "text").toLowerCase();
    const name = q.name || `q${i + 1}`;
    const label = q.label || `Soru ${i + 1}`;
    const req = q.required ? " required" : "";
    const opts = Array.isArray(q.options) ? q.options : [];

    // Radio & Checkbox
    if (type === "radio" || type === "checkbox") {
      const items = opts.length
        ? opts
            .map((opt, j) => {
              const id = `f_${name}_${j}`;
              const base = `<input type="${type}" id="${id}" name="${esc(name)}" value="${esc(opt)}"${type === "radio" && q.required ? " required" : ""}>`;
              return `<div><label for="${id}">${base}<span>${esc(opt)}</span></label></div>`;
            })
            .join("")
        : `<div class="muted">Bu soru için seçenek tanımlı değil.</div>`;

      return `
        <div class="row">
          <label>${esc(label)}${q.required ? " *" : ""}</label>
          <div>${items}</div>
        </div>`;
    }

    // Select
    if (type === "select") {
      const options = opts.length
        ? opts.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")
        : "";
      const warn = opts.length ? "" : `<div class="muted">Bu soru için seçenek tanımlı değil.</div>`;
      return `
        <div class="row">
          <label for="f_${esc(name)}">${esc(label)}${q.required ? " *" : ""}</label>
          <select id="f_${esc(name)}" name="${esc(name)}"${req}>
            <option value="" disabled selected>Seçiniz</option>
            ${options}
          </select>
          ${warn}
        </div>`;
    }

    // Textarea
    if (type === "textarea") {
      return `
        <div class="row">
          <label for="f_${esc(name)}">${esc(label)}${q.required ? " *" : ""}</label>
          <textarea id="f_${esc(name)}" name="${esc(name)}"${req}></textarea>
        </div>`;
    }

    // Text/Email default
    const itype = type === "email" ? "email" : "text";
    return `
      <div class="row">
        <label for="f_${esc(name)}">${esc(label)}${q.required ? " *" : ""}</label>
        <input id="f_${esc(name)}" type="${itype}" name="${esc(name)}"${req} />
      </div>`;
  };

  const questions = (schema.questions || schema.fields || []).map(row).join("");

  // SSR edilmiş tam sayfa (form.css ve forms.js ile)
  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(schema.title || slug)}</title>
  <link rel="stylesheet" href="/form.css">
  <style>
    /* Kritik min-CSS: kartlar stil dosyası gelmeden de kutular görünür olsun */
    body{margin:0;background:#f6f7fb;color:#1f2937;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
    .wrap{max-width:920px;margin:40px auto;padding:0 20px}
    #form{max-width:680px;margin:18px auto 8px}
    .row{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:18px;margin:16px 0}
    label{display:block;font-weight:700;margin:0 0 10px}
    input,select,textarea{width:100%;padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px}
    button[type=submit]{appearance:none;border:0;background:#2563eb;color:#fff;padding:12px 18px;border-radius:12px;font-weight:700;cursor:pointer}
  </style>
  <script>
    // Hydration için şema:
    window.__FORM__ = ${JSON.stringify({ slug, schema })};
  </script>
  <script defer src="/forms.js"></script>
</head>
<body>
  <main class="wrap">
    <h1 id="title">${esc(schema.title || slug)}</h1>
    ${schema.description ? `<p id="desc">${esc(schema.description)}</p>` : `<p id="desc" style="display:none"></p>`}
    <form id="form" method="POST" action="/api/submit-form?slug=${encodeURIComponent(slug)}">
      ${questions}
      <div class="row" style="border:none;background:transparent;padding-top:0">
        <button type="submit">Gönder</button>
      </div>
    </form>
  </main>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }
  });
};
