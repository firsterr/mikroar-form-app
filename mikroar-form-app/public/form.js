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

    // Gönder butonu
    const btn = el("button", { type: "submit", id: "btnSend" }, "Gönder");
    formEl.appendChild(btn);

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

  document.addEventListener("DOMContentLoaded", boot);
})();
