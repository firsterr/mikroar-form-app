// MikroAR – Form (SSR destekli)  |  v=ipfix2 + closed-guard
(function () {
  const $ = (s) => document.querySelector(s);

  const state = { form: null };

  function el(tag, attrs = {}, html = "") {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "for") e.htmlFor = v;
      else if (k.startsWith("on") && typeof v === "function") e[k] = v;
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  }

  function fmt(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return ts || ""; }
  }
// ---- sticky bar ve alt bilgi için minimal stil
(() => {
  const style = document.createElement("style");
  style.textContent = `
    /* sticky bar görünürken form içeriği alta gizlenmesin */
    #f { padding-bottom: 88px; }

    .sticky-submit{
      position: sticky;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 12px 16px;
      background: rgba(255,255,255,0.96);
      backdrop-filter: saturate(180%) blur(8px);
      border-top: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;       /* BUTON ÜSTTE, BİLGİ ALTA */
      align-items: center;
      gap: 12px;
      z-index: 10;
    }

    .sticky-submit .info{
      text-align: center;
      line-height: 1.35;
      color: #111;
      font-size: 14px;
    }
    .sticky-submit .info a{
      color: inherit;
      text-decoration: underline;
    }
    .sticky-submit .info .brand{
      margin-top: 2px;
      font-size: 16px;     /* bir tık büyük */
      font-weight: 700;    /* kalın */
    }
  `;
  document.head.appendChild(style);
})();
  // --- Pasif / kapalı form ekranı
  function renderClosed(msg) {
    const title = $("#form-title");
    const formEl = $("#f");
    if (title) title.textContent = "Anket kapalı";
    const text = msg || "Bu anket yayında değil veya süresi dolmuş olabilir.";

    const html = `
      <div style="
        max-width:880px;margin:24px 0;padding:20px;
        border:1px solid #30364a;border-radius:12px;background:#0f1221;color:#e7e7f1;
      ">
        <h3 style="margin:0 0 8px;font-size:22px">Anket kapalı</h3>
        <p style="margin:0;line-height:1.6">${text}</p>
      </div>
    `;

    if (formEl) {
      formEl.innerHTML = html;
    } else {
      document.body.innerHTML = html;
    }
    document.title = "Anket kapalı";
  }

  function renderForm(data) {
    state.form = data;
    const title = $("#form-title");
    const formEl = $("#f");

    title && (title.textContent = data.title || "Anket");
    if (!formEl) return;

    formEl.innerHTML = "";

    const qs = (data.schema && Array.isArray(data.schema.questions))
      ? data.schema.questions
      : [];

    qs.forEach((q, idx) => {
      const wrap = el("div", { class: "q" });
      const qId = "q_" + idx;

      const lbl = el("label", { for: qId }, (q.label || ("Soru " + (idx + 1))));
      wrap.appendChild(lbl);

      const required = !!q.required;

      if (q.type === "text") {
        const inp = el("input", { id: qId, name: qId, type: "text" });
        if (required) inp.required = true;
        wrap.appendChild(inp);
      } else if (q.type === "textarea") {
        const inp = el("textarea", { id: qId, name: qId, rows: "3" });
        if (required) inp.required = true;
        wrap.appendChild(inp);
      } else if (q.type === "checkbox") {
        (q.options || []).forEach((opt, i) => {
          const id = qId + "_" + i;
          const line = el("label", { class: "opt", for: id });
          const box = el("input", { id, type: "checkbox", name: qId, value: opt });
          // checkbox required: en az birini zorunlu kılmak için ilkine koyarız
          if (required && i === 0) box.required = true;
          line.appendChild(box);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });
      } else { // radio (default)
        (q.options || []).forEach((opt, i) => {
          const id = qId + "_" + i;
          const line = el("label", { class: "opt", for: id });
          const rb = el("input", { id, type: "radio", name: qId, value: opt });
          if (required) rb.required = true;
          line.appendChild(rb);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });
      }

      formEl.appendChild(wrap);
    });

   // Gönder alanı: yapışkan bar (buton üstte) + 3 satır alt bilgi
const bar  = el("div", { class: "sticky-submit" });
const btn  = el("button", { type: "submit", id: "btnSend" }, "Gönder");

// 3 satır, ortalı, son satır daha büyük
const info = el("div", { class: "info" }, `
  <div>Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.</div>
  <div>İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a></div>
  <div class="brand">MikroAR Araştırma</div>
`);

bar.append(btn, info);
formEl.appendChild(bar);

    formEl.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#btnSend");
      btn.disabled = true;

      try {
        const fd = new FormData(formEl);
        const answers = {};
        (state.form.schema.questions || []).forEach((q, idx) => {
          const key = "q_" + idx;
          if (q.type === "checkbox") {
            answers[key] = fd.getAll(key);
          } else {
            answers[key] = fd.get(key);
          }
        });

        const resp = await fetch(`/api/forms/${encodeURIComponent(state.form.slug)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });

        // Sunucu iki şekilde duplicate dönebilir:
        //  - HTTP 409
        //  - 200/ok:true + alreadySubmitted:true
        let j = {};
        try { j = await resp.json(); } catch { j = {}; }

        if (resp.status === 409 || j.alreadySubmitted) {
          const when = j.at ? ` (${fmt(j.at)})` : "";
          alert("Bu IP’den zaten yanıt gönderilmiş." + when);
          btn.disabled = false;
          return;
        }

        if (!resp.ok || !j.ok) {
          alert(j.error || "Gönderilemedi");
          btn.disabled = false;
          return;
        }

        // Başarılı (created veya updated)
        location.href = "/thanks.html";
      } catch (err) {
        console.error(err);
        alert("Hata: " + err.message);
        btn.disabled = false;
      }
    };
  }

  async function boot() {
    // SSR'dan gelen veri varsa (ve aktifse) anında çiz
    if (window.__FORM__ && window.__FORM__.slug) {
      if (window.__FORM__.active === false) {
        renderClosed();
        return;
      }
      renderForm(window.__FORM__);
      return;
    }

    // Fallback (fetch)
    const params = new URLSearchParams(location.search);
    const slug = params.get("slug");
    if (!slug) {
      document.body.innerHTML = "<h2>Form bulunamadı (slug yok)</h2>";
      return;
    }
    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);

      if (r.status === 403) {
        // Pasif form
        renderClosed();
        return;
      }
      if (!r.ok) {
        document.body.innerHTML = "<h2>Form yüklenemedi.</h2>";
        return;
      }

      const j = await r.json();
      if (!j.ok || !j.form) {
        renderClosed();
        return;
      }
      renderForm(j.form);
    } catch (e) {
      console.error(e);
      document.body.innerHTML = "<h2>Form yüklenemedi.</h2>";
    }
  }
// ---- Google Form benzeri CSS
const style = document.createElement("style");
style.textContent = `
  body {
    background: #f1f3f4;
    font-family: Arial, sans-serif;
  }

  #f {
    max-width: 720px;
    margin: 20px auto;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  }

  .q {
    margin-bottom: 24px;
    padding: 16px;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  .q label {
    display: block;
    font-weight: 500;
    margin-bottom: 12px;
  }

  .opt {
    display: flex;
    align-items: center;
    margin: 6px 0;
    cursor: pointer;
  }

  .opt input[type="radio"],
  .opt input[type="checkbox"] {
    accent-color: #673ab7; /* Google Forms mor tonu */
    margin-right: 8px;
    transform: scale(1.2);
  }

  /* Hover ve aktif efekt */
  .opt:hover {
    background: #f6f6f6;
    border-radius: 4px;
    padding: 2px;
  }

  /* Gönder butonu */
  #btnSend {
    background: #1a73e8;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 22px;
    font-size: 15px;
    cursor: pointer;
  }
  #btnSend:hover {
    background: #1669c1;
  }

  /* Alt bar */
  .sticky-submit {
    margin-top: 30px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    text-align: center;
  }
  .note {
    font-size: 13px;
    color: #444;
    margin-bottom: 6px;
  }
  .note strong {
    display: block;
    font-size: 15px;
    margin-top: 4px;
  }
`;
document.head.appendChild(style);
  document.addEventListener("DOMContentLoaded", boot);
})();
