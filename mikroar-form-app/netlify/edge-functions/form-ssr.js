// netlify/edge-functions/form-ssr.js
// Amaç: /form.html?slug=... isteğinde form şemasını EDGE üzerinde çekip
// HTML’i soru kartlarıyla birlikte renderlamak (ilk ekranda "boş bekleme" yok).

export default async (request) => {
  const url = new URL(request.url);

  // slug = ?slug=... veya /SOME-SLUG (form.html değilse)
  const rawPath = url.pathname.replace(/^\/+|\/+$/g, "");
  const pathSlug = rawPath && !/\.html$/i.test(rawPath) ? rawPath : "";
  const slug = url.searchParams.get("slug") || pathSlug;

  // slug yoksa: static form.html (listeden seçim) sayfasını olduğu gibi ver
  if (!slug) {
    const resp = await fetch(new URL("/form.html", url));
    // HTML olarak dön (Netlify asset’ini proxyliyoruz)
    return new Response(await resp.text(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  // Şemayı aynı sitedeki Netlify Function’dan çek (server-to-server, hızlı)
  const api = new URL(
    "/.netlify/functions/forms?slug=" + encodeURIComponent(slug),
    url
  );

  let schema;
  try {
    const r = await fetch(api);
    const j = await r.json();
    if (!r.ok || !j?.ok || !j?.schema) throw new Error(j?.error || "not found");
    schema = j.schema;
  } catch (e) {
    return new Response(renderPage({
      title: "Form yüklenemedi",
      desc: "",
      slug,
      formHtml: `<p class="note err" style="max-width:680px;margin:16px auto">Hata: ${esc(
        e.message || "Fetch failed"
      )}</p>`,
    }), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }
    });
  }

  const fields = Array.isArray(schema.questions)
    ? schema.questions
    : Array.isArray(schema.fields)
      ? schema.fields
      : [];

  const formHtml = renderForm(fields, slug);
  const html = renderPage({
    title: schema.title || slug,
    desc: schema.description || "",
    slug,
    formHtml,
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

// -------- Helpers --------

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function renderPage({ title, desc, slug, formHtml }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<link rel="stylesheet" href="/form.css" />
<style>
  /* Sayfanın ortalanması ve kart düzeni form.css ile uyumlu kalsın */
  .wrap{max-width:920px;margin:40px auto;padding:0 20px}
  #title,#desc,#alert,#form,#pickWrap{width:min(720px,100%);margin-inline:auto}
</style>
</head>
<body>
<main class="wrap">
  <h1 id="title" style="display:block">${esc(title)}</h1>
  ${
    desc
      ? `<p id="desc" class="muted" style="display:block">${esc(desc)}</p>`
      : `<p id="desc" class="muted" style="display:none"></p>`
  }

  <!-- SSR ile çizilmiş form -->
  <form id="f" method="POST" action="/api/submit-form?slug=${encodeURIComponent(
    slug
  )}" class="gform" style="display:block">
    ${formHtml}
    <div class="actions"><button type="submit" class="primary">Gönder</button></div>
    <p id="alertBottom" class="note" style="display:none"></p>
    <p class="foot-meta">Bu form mikroar.com alanında oluşturuldu.</p>
  </form>
</main>

<script>
(() => {
  const form = document.getElementById('f');
  const alertEl = document.getElementById('alertBottom');
  const API = '/api';
  const slug = ${JSON.stringify(slug)};

  function setNote(kind, msg){
    alertEl.className = 'note ' + kind;
    alertEl.textContent = msg;
    alertEl.style.display = 'block';
  }
  function clearNote(){ alertEl.style.display = 'none'; }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearNote();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    // Yanıtları topla
    const answers = {};
    [...form.elements].forEach(el => {
      if (!el.name) return;
      if (el.type === 'radio'){
        if (el.checked) answers[el.name] = el.value;
      } else if (el.type === 'checkbox'){
        const base = el.name.replace(/\$begin:math:display$\\$end:math:display$$/, '');
        answers[base] = answers[base] || [];
        if (el.checked) answers[base].push(el.value);
      } else if (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'email'){
        answers[el.name] = el.value;
      }
    });

    try{
      const r = await fetch(\`\${API}/submit-form?slug=\${encodeURIComponent(slug)}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ answers })
      });

      let j = null; try { j = await r.json(); } catch {}

      if (r.status === 409) {
        setNote('warn', (j && (j.data?.message || j.message || j.error)) || 'Bu anketi daha önce doldurmuşsunuz.');
        return;
      }
      if (r.ok && (j?.ok ?? true)) {
        setNote('ok', 'Gönderildi, teşekkürler!');
        form.reset();
      } else {
        setNote('err', (j && (j.data?.message || j.message || j.error)) || ('Hata: ' + r.status));
      }
    } catch (err) {
      setNote('err', 'Bağlantı hatası: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}

function renderForm(fields, slug) {
  if (!fields.length) {
    return `<div class="row"><div class="muted">Bu formda soru tanımı bulunamadı.</div></div>`;
  }
  return fields.map((q, i) => drawQuestion(q, i)).join("");
}

function drawQuestion(q, idx) {
  const type  = String(q?.type || "text").toLowerCase();
  const name  = q?.name ? String(q.name) : `q${idx + 1}`;
  const label = q?.label ? String(q.label) : `Soru ${idx + 1}`;
  const req   = q?.required ? ' required' : '';
  const opts  = Array.isArray(q?.options) ? q.options : [];

  // Başlık
  let html = `<div class="row"><label for="f_${esc(name)}">${esc(label)}${req ? " *" : ""}</label>`;

  if (type === "radio" || type === "checkbox") {
    if (!opts.length) {
      html += `<div class="muted">Bu soru için seçenek tanımlı değil.</div></div>`;
      return html;
    }
    html += `<div class="choices">`;
    for (let i = 0; i < opts.length; i++) {
      const id = `f_${name}_${i}`;
      const val = String(opts[i]);
      html += `<label class="opt" for="${esc(id)}">
        <input id="${esc(id)}" type="${type}" name="${esc(name)}${type === "checkbox" ? "[]": ""}" value="${esc(val)}"${req && type==="radio" ? " required": ""} />
        <span>${esc(val)}</span>
      </label>`;
    }
    html += `</div></div>`;
    return html;
  }

  if (type === "select") {
    html += `<select id="f_${esc(name)}" name="${esc(name)}"${req}>
      <option value="" disabled selected>Seçiniz</option>
      ${opts.map(v => `<option value="${esc(String(v))}">${esc(String(v))}</option>`).join("")}
    </select></div>`;
    return html;
  }

  if (type === "textarea") {
    html += `<textarea id="f_${esc(name)}" name="${esc(name)}"${req}></textarea></div>`;
    return html;
  }

  const itype = type === "email" ? "email" : "text";
  html += `<input type="${itype}" id="f_${esc(name)}" name="${esc(name)}"${req} /></div>`;
  return html;
}
