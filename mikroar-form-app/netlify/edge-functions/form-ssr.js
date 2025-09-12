// netlify/edge-functions/form-ssr.js
// Deno (Edge) ortamı. Formu SSR ile üretir ve app.js'ye devreder.

export const config = { path: "/form.html" };

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL");
const SUPABASE_KEY  = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE");

// küçük yardımcılar
const esc = (s="") =>
  String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");

function asOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  return String(raw).split(",").map(v => v.trim()).filter(Boolean);
}

function fieldHTML(q, idx) {
  const name = q.name || `q_${idx+1}`;
  const label = q.label || q.title || `SORU${idx+1}`;
  const req = q.required ? " required" : "";
  const type = (q.type || "").toLowerCase();
  const opts = asOptions(q.options || q.choices || q.items);

  if (type === "radio" || type === "tek" || type === "single") {
    return `
    <div class="card">
      <div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="q-body">
        ${opts.map((o,i)=>`
          <label class="opt">
            <input type="radio" name="${esc(name)}" value="${esc(o)}"${req}>
            <span>${esc(o)}</span>
          </label>`).join("")}
      </div>
    </div>`;
  }

  if (type === "checkbox" || type === "çoklu" || type === "multi") {
    return `
    <div class="card">
      <div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="q-body">
        ${opts.map((o,i)=>`
          <label class="opt">
            <input type="checkbox" name="${esc(name)}" value="${esc(o)}">
            <span>${esc(o)}</span>
          </label>`).join("")}
      </div>
    </div>`;
  }

  if (type === "select" || type === "açılır" || type === "dropdown") {
    return `
    <div class="card">
      <div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
      <div class="q-body">
        <select name="${esc(name)}"${req} class="select">
          ${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}
        </select>
      </div>
    </div>`;
  }

  // default: kısa metin
  return `
  <div class="card">
    <div class="q-title">${esc(label)}${q.required ? ' <span class="req">*</span>' : ""}</div>
    <div class="q-body">
      <input type="text" name="${esc(name)}"${req} class="input">
    </div>
  </div>`;
}

function pageHTML(form, slug) {
  const title = form?.title || "Anket";
  const desc  = form?.description || "";
  const qs    = Array.isArray(form?.schema?.questions) ? form.schema.questions : [];

  return `<!doctype html>
<html lang="tr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/form.css">
<body>
  <div id="app">
    <h1 id="title">${esc(title)}</h1>
    ${desc ? `<p class="desc">${esc(desc)}</p>` : ""}

    <form id="form" data-ssr="1">
      ${qs.map((q,i)=>fieldHTML(q,i)).join("")}

      <div class="actions">
        <button id="btnSend" class="btn" type="submit">Gönder</button>
      </div>
    </form>

    <div id="alertBottom" class="alert" style="display:none"></div>
  </div>

  <script>
    // app.js'nin ihtiyacı olan minimal bilgi
    window.__FORM = {
      id: ${form?.id ? `"${esc(String(form.id))}"` : "null"},
      slug: ${slug ? `"${esc(slug)}"` : "null"},
      title: ${JSON.stringify(title)}
    };
  </script>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim();

    if (!slug) {
      return new Response("Hata: Form bulunamadı (slug eksik).", { status: 400 });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response("Sunucu yapılandırma hatası (Supabase env).", { status: 500 });
    }

    // Supabase REST ile formu al
    const restURL = `${SUPABASE_URL}/rest/v1/forms?select=id,slug,title,description,active,schema&slug=eq.${encodeURIComponent(slug)}&limit=1`;
    const r = await fetch(restURL, {
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        accept: "application/json"
      }
    });

    if (!r.ok) {
      return new Response("Hata: Form alınamadı.", { status: 502 });
    }
    const rows = await r.json();
    const form = Array.isArray(rows) && rows[0] ? rows[0] : null;

    if (!form || form.active === false) {
      return new Response("Hata: Form bulunamadı.", { status: 404 });
    }

    const html = pageHTML(form, slug);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  } catch (err) {
    return new Response("Beklenmeyen hata.", { status: 500 });
  }
};
