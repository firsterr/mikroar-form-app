// netlify/edge-functions/form-ssr.js
export const config = { path: "/form.html" };

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY  = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE");

const esc = (s = "") =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function asOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  return String(raw).split(",").map(v => v.trim()).filter(Boolean);
}

function fieldHTML(q, i) {
  const name = q.name || `q_${i+1}`;
  const label = q.label || q.title || `Soru ${i+1}`;
  const req = q.required ? " required" : "";
  const type = (q.type || "").toLowerCase();
  const opts = asOptions(q.options || q.choices || q.items);

  if (type === "radio" || type === "tek") {
    return `<div class="row"><div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="options">${opts.map(o=>`
        <label class="opt"><input type="radio" name="${esc(name)}" value="${esc(o)}"${req}><span>${esc(o)}</span></label>`).join("")}
      </div></div>`;
  }
  if (type === "checkbox" || type === "çoklu") {
    return `<div class="row"><div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="options">${opts.map(o=>`
        <label class="opt"><input type="checkbox" name="${esc(name)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("")}
      </div></div>`;
  }
  if (type === "select" || type === "açılır" || type === "dropdown") {
    return `<div class="row"><div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="options"><div class="opt"><select name="${esc(name)}"${req}>
        ${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}
      </select></div></div></div>`;
  }
  return `<div class="row"><div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
    <input type="text" name="${esc(name)}"${req} class="input"></div>`;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    let slug = (url.searchParams.get("slug") || "").trim();
    const code = (url.searchParams.get("k") || "").trim();

    if (!slug && code) {
      // shortlinks → slug çöz
      const slURL = `${SUPABASE_URL}/rest/v1/shortlinks?select=slug,active&code=eq.${encodeURIComponent(code)}&limit=1`;
      const slR = await fetch(slURL, { headers:{ apikey: SUPABASE_KEY, authorization:`Bearer ${SUPABASE_KEY}` }});
      const sl = (await slR.json())[0];
      if (!sl?.slug || sl.active === false) return new Response("Hata: Geçersiz kısa kod.", { status: 404 });
      slug = sl.slug;
    }
    if (!slug) return new Response("Hata: slug veya kısa kod gerekli.", { status: 400 });

    // formu getir
    const fURL = `${SUPABASE_URL}/rest/v1/forms?select=id,slug,title,description,schema,active&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    const fR = await fetch(fURL, { headers:{ apikey: SUPABASE_KEY, authorization:`Bearer ${SUPABASE_KEY}` }});
    const form = (await fR.json())[0];
    if (!form || form.active === false) return new Response("Hata: Form bulunamadı.", { status: 404 });

    const title = form.title || form.slug || "Anket";
    const desc  = (form.description || "").trim();
    const qs = Array.isArray(form?.schema?.questions) ? form.schema.questions : [];

    const html = `<!doctype html>
<html lang="tr">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/form.css">
<body>
  <div id="app">
    <h1 id="title">${esc(title)}</h1>
    ${desc ? `<p id="desc" class="form-desc">${esc(desc)}</p>` : `<p id="desc" class="form-desc" style="display:none"></p>`}

    <form id="form" data-ssr="1">
      ${qs.map((q,i)=>fieldHTML(q,i)).join("")}
      <div class="actions"><button id="btnSend" type="submit">Gönder</button></div>
    </form>
    <p id="alertBottom" class="note center" style="display:none"></p>
  </div>

  <script>
    window.__FORM = { id: ${form.id ? `"${String(form.id)}"` : "null"}, slug: "${esc(slug)}", title: ${JSON.stringify(title)} };
  </script>
  <script src="/app.js" defer></script>
</body></html>`;

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }});
  } catch (e) {
    return new Response("Beklenmeyen hata.", { status: 500 });
  }
};
