// MikroAR – Form (temiz, açıklama + kapalı form kontrolü + sticky bar)
(() => {
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  const state = {
    form: null,
    slug: null,
    hasHasSelector: CSS && CSS.supports && CSS.supports('selector(:has(*))')
  };

  const el = (tag, attrs={}, html="") => {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === "class") e.className = v;
      else if (k === "for") e.htmlFor = v;
      else if (k.startsWith("on") && typeof v === "function") e[k] = v;
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  };

  const fmt = ts => { try { return new Date(ts).toLocaleString(); } catch { return ts || ""; } };

  const showMessage = (text, type="") => {
    const f = $("#f");
    f.innerHTML = "";
    f.appendChild(el("div", { class:`message${type ? " "+type : ""}`}, text));
  };

  function renderClosed(msg) {
    $("#form-title").textContent = "Anket kapalı";
    showMessage(msg || "Bu anketin süresi dolmuş ya da kapatılmış.", "error");
    document.title = "Anket kapalı";
  }

  function attachCheckedFallback(root) {
    if (state.hasHasSelector) return; // :has destekliyse gerek yok
    root.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!input || !input.closest) return;
      const qwrap = input.closest(".q");
      if (!qwrap) return;

      if (input.type === "radio") {
        $$(".opt", qwrap).forEach(li => li.classList.remove("is-checked"));
        const li = input.closest(".opt");
        if (li) li.classList.add("is-checked");
      } else if (input.type === "checkbox") {
        const li = input.closest(".opt");
        if (!li) return;
        if (input.checked) li.classList.add("is-checked");
        else li.classList.remove("is-checked");
      }
    });

    // İlk yüklemede işaretliler varsa sınıf ata
    $$(".q .opt input:checked").forEach(inp => {
      const li = inp.closest(".opt");
      if (li) li.classList.add("is-checked");
    });
  }

  function buildStickyBar(formEl){
    const bar  = el("div", { class:"sticky-submit" });
    const btn  = el("button", { type:"submit", id:"btnSend" }, "Gönder");
    const note = el("div", { class:"note" }, `
      Bu form <b>mikroar.com</b> alanında oluşturulmuştur.<br/>
      İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a><br/>
      <b>MikroAR Araştırma</b>
    `);
    // İSTENEN DİZİLİM: buton ÜSTTE, 3 satır bilgi ALTA
    bar.append(btn, note);
    formEl.appendChild(bar);
  }

  function renderForm(data) {
    state.form = data;

    // Başlık & açıklama
    $("#form-title").textContent = data.title || "Anket";
    const desc = $("#form-desc");
    const descText = data.description || data.schema?.description || "";
    if (descText) { desc.textContent = descText; desc.hidden = false; }
    else { desc.hidden = true; }

    const formEl = $("#f");
    formEl.innerHTML = "";

    const qs = (data.schema && Array.isArray(data.schema.questions)) ? data.schema.questions : [];

    qs.forEach((q, idx) => {
      const wrap = el("div", { class: "q" });
      const qId  = "q_" + idx;

      wrap.appendChild(el("label", { for: qId }, q.label || ("Soru " + (idx + 1))));
      const required = !!q.required;

      if (q.type === "text") {
        const inp = el("input", { id:qId, name:qId, type:"text" });
        if (required) inp.required = true;
        wrap.appendChild(inp);

      } else if (q.type === "textarea") {
        const inp = el("textarea", { id:qId, name:qId, rows:"3" });
        if (required) inp.required = true;
        wrap.appendChild(inp);

      } else if (q.type === "checkbox") {
        (q.options || []).forEach((opt, i) => {
          const id  = `${qId}_${i}`;
          const row = el("label", { class:"opt", for:id });
          const box = el("input", { id, type:"checkbox", name:qId, value:opt });
          // checkbox required → en az birini zorunlu kılmak için ilkine koyarız
          if (required && i === 0) box.required = true;
          row.append(box, document.createTextNode(" " + opt));
          wrap.appendChild(row);
        });

      } else {
        // default: radio
        (q.options || []).forEach((opt, i) => {
          const id  = `${qId}_${i}`;
          const row = el("label", { class:"opt", for:id });
          const rb  = el("input", { id, type:"radio", name:qId, value:opt });
          if (required) rb.required = true;
          row.append(rb, document.createTextNode(" " + opt));
          wrap.appendChild(row);
        });
      }

      formEl.appendChild(wrap);
    });

    // Sticky Gönder barı
    buildStickyBar(formEl);

    // :has() fallback için sınıf yönetimi
    attachCheckedFallback(formEl);

    // Submit
    formEl.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $("#btnSend");
      btn.disabled = true;

      try {
        const fd = new FormData(formEl);
        const answers = {};
        (state.form.schema?.questions || []).forEach((q, idx) => {
          const key = "q_" + idx;
          answers[key] = q.type === "checkbox" ? fd.getAll(key) : fd.get(key);
        });

        const resp = await fetch(`/api/forms/${encodeURIComponent(state.form.slug)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });

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

        location.href = "/thanks.html";
      } catch (err) {
        console.error(err);
        alert("Hata: " + err.message);
        btn.disabled = false;
      }
    };
  }

  async function boot() {
    // SSR ile geldiyse
    if (window.__FORM__ && window.__FORM__.slug) {
      if (window.__FORM__.active === false) { renderClosed(); return; }
      renderForm(window.__FORM__);
      return;
    }

    // ?slug=...
    const params = new URLSearchParams(location.search);
    state.slug = params.get("slug");
    if (!state.slug) { showMessage("Form bulunamadı (slug yok).", "error"); return; }

    try {
      $("#f").innerHTML = `<div class="message">Yükleniyor…</div>`;
      const r = await fetch(`/api/forms/${encodeURIComponent(state.slug)}`);

      if (r.status === 403) { renderClosed(); return; }

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        if (j?.error === "inactive") renderClosed();
        else showMessage("Form yüklenemedi.", "error");
        return;
      }

      renderForm(j.form);
    } catch (e) {
      console.error(e);
      showMessage("Form yüklenemedi: " + e.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
