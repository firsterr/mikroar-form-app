// mikroar-form-app/netlify/edge-functions/form-ssr.js
// Amaç: /form.html?slug=... için şemayı EDGE’de çekip HTML’i sunucu tarafında çizmek (ilk boyamada “boş ekran/yükleniyor” yok)

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldHTML(q, idx) {
  const type  = String(q.type || "text").toLowerCase();
  const name  = q.name || `q${idx + 1}`;
  const label = q.label || `Soru ${idx + 1}`;
  const req   = q.required ? " required" : "";
  const opts  = Array.isArray(q.options) ? q.options.map(v => String(v)) : [];

  // ortak kap
  const start = `<div class="row"><label for="f_${esc(name)}">${esc(label)}${q.required ? " *" : ""}</label>`;
  const end   = `</div>`;

  if (type === "radio" || type === "checkbox") {
    if (!opts.length) {
      return `${start}<div class="muted">Bu soru için seçenek tanımlı değil.</div>${end}`;
    }
    const items = opts.map((opt, i) => {
      const id = `f_${name}_${i}`;
      const n  = type === "checkbox" ? `${name}[]` : name;
      // geniş tıklama alanı için label sarmalıyoruz
      return `<label class="opt" for="${esc(id)}">
                <input type="${type}" id="${esc(id)}" name="${esc(n)}" value="${esc(opt)}"${type === "radio" && q.required ? " required" : ""}>
                <span>${esc(opt)}</span>
              </label>`;
    }).join("");
    return `${start}<div class="choices">${items}</div>${end}`;
  }

  if (type === "select") {
    const first = `<option value="" disabled selected>Seçiniz</option>`;
    const items = opts.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    const warn  = !opts.length ? `<div class="muted">Bu soru için seçenek tanımlı değil.</div>` : "";
    return `${start}${warn}<select id="f_${esc(name)}" name="${esc(name)}"${req}>${first}${items}</select>${end}`;
  }

  if (type === "textarea") {
    return `${start}<textarea id="f_${esc(name)}" name="${esc(name)}"${req}></textarea>${end}`;
  }

  // text / email / default
  const itype = type === "email" ? "email" : "text";
  return `${start}<input type="${esc(itype)}" id="f_${esc(name)}" name="${esc(name)}"${req}>${end}`;
}

export default async (req, context) => {
  const url  = new URL(req.url);
  const slug = url.searchParams.get("slug") || (url.pathname.endsWith(".html") ? "" : url.pathname.replace(/^\/+|\/+$/g, ""));
  if (!slug) {
    // slug yoksa SSR yok: normal dosyayı ver (liste ekranı zaten hızlı)
    return context.next();
  }

  // Paralel: sayfanın kendisi + API
  const [baseRes, apiRes] = await Promise.all([
    context.next(),                                  // /form.html statik dosya
    fetch(new URL(`/api/forms?slug=${encodeURIComponent(slug)}`, req.url), {
      headers: { "accept": "application/json" }
    })
  ]);

  let json = null;
  try { json = await apiRes.json(); } catch { /* yut */ }

  if (!apiRes.ok || !json?.ok || !json?.schema) {
    // API gelmediyse SSR denemeyelim; statik sayfayı olduğu gibi döndür
    return baseRes;
  }

  const s  = json.schema || {};
  const qs = Array.isArray(s.questions) ? s.questions : (Array.isArray(s.fields) ? s.fields : []);
  const title = s.title || slug;
  const desc  = s.description || "";

  // Alanları HTML’e çevir
  const fields = qs.map((q, i) => fieldHTML(q, i)).join("") +
                 `<div class="actions"><button type="submit" class="primary">Gönder</button></div>` +
                 `<p class="foot-meta">Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.</p>`;

  // İstemci tarafı JS’in fetch yapmaması için boot veriyi gömelim
  const boot = {
    slug,
    schema: { title: s.title || "", description: s.description || "", questions: qs }
  };
  const bootScript = `<script>window.__FORM__=${JSON.stringify(boot)};</script>`;

  // DOM’u rewrite et: başlık, açıklama, form içeriği
  const rewritten = new HTMLRewriter()
    .on("h1#title", {
      element(e) {
        e.removeAttribute("style");
        e.setInnerContent(esc(title), { html: false });
      }
    })
    .on("p#desc", {
      element(e) {
        if (desc && String(desc).trim()) {
          e.removeAttribute("style");
          e.setInnerContent(esc(desc), { html: false });
        }
      }
    })
    .on("form#form", {
      element(e) {
        e.removeAttribute("style");              // display:none → kaldır
        e.setInnerContent(fields, { html: true });
      }
    })
    .on("body", {
      element(e) {
        e.append(bootScript, { html: true });
      }
    })
    .transform(baseRes);

  return rewritten;
};

// Netlify eşleme
export const config = { path: "/form.html" };
