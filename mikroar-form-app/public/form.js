// MikroAR Form (temiz sürüm – Google Forms hissi + sticky bar + kapalı form kontrolü)
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

  const fmt = ts => {
    try { return new Date(ts).toLocaleString(); } catch { return ts || ""; }
  };

  const showMessage = (text, type="") => {
    const f = $("#f");
    f.innerHTML = "";
    f.appendChild(el("div", { class:`message${type ? " "+type : ""}`}, text));
  };

  function attachCheckedFallback(root) {
    if (state.hasHasSelector) return; // :has destekliyse gerek yok
    root.addEventListener("change", (ev) => {
      const input = ev.target;
      if (!input || !input.closest) return;
      const qwrap = input.closest(".q");
      if (!qwrap) return;

      if (input.type === "radio") {
        // aynı name altındaki satırlardan sınıfı kaldır
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
    const note = el("div", { class:"note" }, `
      Bu form <b>mikroar.com</b> alanında oluşturulmuştur.<br/>
      İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a><br/>
      <b>MikroAR Araştırma</b>
    `);
    const btn  = el("button", { type:"submit", id:"btnSend" }, "Gönder");
    bar.append(note, btn);
    formEl.appendChild(bar);
  }

  function renderForm(data) {
    state.form = data;

    // Başlık & açıklama
    $("#form-title").textContent = data.title || "Anket";
    const desc = $("#form-desc");
    if (data.description) {
      desc.textContent = data.description;
      desc.hidden = false;
    } else {
      desc.hidden = true;
    }

    // Forma soruları yerleştir
    const formEl = $("#f");
    formEl.innerHTML = "";

    const qs = (data.schema && Array.isArray(data.schema.questions))
      ? data.schema.questions
      : [];

    qs.forEach((q, idx) => {
      const wrap = el("div", { class:"q" });
      const qId  = "q_" + idx;

      // Etiket
      wrap.appendChild(el("label", { for:qId }, q.label || ("Soru " + (idx+1))));

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
          const id   = `${qId}_${i}`;
          const line = el("label", { class:"opt", for:id });
          const box  = el("input", { id, type:"checkbox", name:qId, value:opt });
          // checkbox required → en az birini zorunlu kılmak için ilkine koyarız
          if (required && i === 0) box.required = true;
          line.appendChild(box);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });

      } else {
        // default: radio
        (q.options || []).forEach((opt, i) => {
          const id   = `${qId}_${i}`;
          const line = el("label", { class:"opt", for:id });
          const rb   = el("input", { id, type:"radio", name:qId, value:opt });
          if (required) rb.required = true;
          line.appendChild(rb);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });
      }

      formEl.appendChild(wrap);
    });

    // Sticky Gönder barı
    buildStickyBar(formEl);

    // :has() fallback için işaretli sınıfları yönet
    attachCheckedFallback(formEl);

    // Submit handler
    formEl.onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = $("#btnSend");
      btn.disabled = true;

      try {
        const fd = new FormData(formEl);
        const answers = {};
        (state.form.schema?.questions || []).forEach((q, idx) => {
          const key = "q_" + idx;
          if (q.type === "checkbox") answers[key] = fd.getAll(key);
          else answers[key] = fd.get(key);
        });

        const resp = await fetch(`/api/forms/${encodeURIComponent(state.form.slug)}/submit`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ answers })
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
      } catch (e) {
        console.error(e);
        alert("Hata: " + e.message);
        btn.disabled = false;
      }
    };
  }

  async function boot() {
    // SSR ile gelmiş olabilir
    if (window.__FORM__ && window.__FORM__.slug) {
      state.slug = window.__FORM__.slug;
      renderForm(window.__FORM__);
      return;
    }

    // URL ?slug=...
    const params = new URLSearchParams(location.search);
    state.slug = params.get("slug");

    if (!state.slug) {
      showMessage("Form bulunamadı (slug yok).", "error");
      return;
    }

    try {
      // Yükleniyor mesajı
      $("#f").innerHTML = `<div class="message">Yükleniyor…</div>`;

      const r = await fetch(`/api/forms/${encodeURIComponent(state.slug)}`);
      const j = await r.json();

      if (!j.ok) {
        if (j.error === "inactive") {
          showMessage("Bu anketin süresi dolmuş ya da kapatılmış.", "error");
        } else if (j.error === "not_found") {
          showMessage("Form bulunamadı.", "error");
        } else {
          showMessage("Form yüklenemedi: " + (j.error || "bilinmeyen hata"), "error");
        }
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
