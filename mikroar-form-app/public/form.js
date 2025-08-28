// MikroAR – Form: güvenli, sade, tek dosya CSS ile çalışır.
(function () {
  const $ = (s) => document.querySelector(s);

  const state = { form: null };

  // DOM yardımcıları
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
  const show = (node, on = true) => (node.hidden = !on);

  // Seçeneklerde tıklanınca “checked” vurgusu
  function bindOptionHighlight(container) {
    container.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;

      // Tüm sibling .opt'lardan checked sınıfını kaldır
      const name = t.name;
      const siblings = container.querySelectorAll(`.opt input[name="${name}"]`);
      siblings.forEach((inp) => {
        const lab = inp.closest(".opt");
        if (lab) lab.classList.toggle("checked", inp.checked);
      });

      // checkbox'ta birden fazla olabilir, onları da set'leyelim
      if (t.type === "checkbox") {
        const lab = t.closest(".opt");
        if (lab) lab.classList.toggle("checked", t.checked);
      }
    });
  }

  function renderForm(data) {
    state.form = data;

    // Başlık + açıklama
    $("#form-title").textContent = data.title || "Anket";
    const descText =
      data.schema?.description ??
      data.description ??
      data.schema?.kvkk ??
      "";
    if (descText && String(descText).trim()) {
      const d = $("#form-desc");
      d.textContent = descText;
      show(d, true);
    }

    const formEl = $("#f");
    formEl.innerHTML = "";

    const qs = Array.isArray(data.schema?.questions)
      ? data.schema.questions
      : [];

    qs.forEach((q, idx) => {
      const box = el("div", { class: "qBox" });

      const qId = "q_" + idx;
      const lbl = el(
        "label",
        { for: qId, class: "qtitle" },
        q.label || `Soru ${idx + 1}`
      );
      box.appendChild(lbl);

      const required = !!q.required;

      if (q.type === "text") {
        const inp = el("input", { id: qId, name: qId, type: "text" });
        if (required) inp.required = true;
        box.appendChild(inp);
      } else if (q.type === "textarea") {
        const inp = el("textarea", { id: qId, name: qId, rows: "4" });
        if (required) inp.required = true;
        box.appendChild(inp);
      } else if (q.type === "checkbox") {
        (q.options || []).forEach((opt, i) => {
          const id = `${qId}_${i}`;
          const row = el("label", { class: "opt", for: id });
          const boxInp = el("input", {
            id,
            type: "checkbox",
            name: qId,
            value: opt,
          });
          if (required && i === 0) boxInp.required = true; // en az 1 seçilsin
          row.append(boxInp, document.createTextNode(" " + opt));
          box.appendChild(row);
        });
      } else {
        // radio (default)
        (q.options || []).forEach((opt, i) => {
          const id = `${qId}_${i}`;
          const row = el("label", { class: "opt", for: id });
          const rb = el("input", {
            id,
            type: "radio",
            name: qId,
            value: opt,
          });
          if (required) rb.required = true;
          row.append(rb, document.createTextNode(" " + opt));
          box.appendChild(row);
        });
      }

      formEl.appendChild(box);
    });

    // Vurgu davranışını aktif et
    bindOptionHighlight(formEl);

    // Sticky gönder alanını aç
    show($("#sticky"), true);

    // Submit
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

        const resp = await fetch(
          `/api/forms/${encodeURIComponent(state.form.slug)}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers }),
          }
        );

        let j = {};
        try {
          j = await resp.json();
        } catch {}

        if (resp.status === 409 || j.alreadySubmitted) {
          const when = j.at ? ` (${new Date(j.at).toLocaleString()})` : "";
          alert("Bu IP’den zaten yanıt gönderilmiş." + when);
          btn.disabled = false;
          return;
        }

        if (!resp.ok || !j.ok) {
          alert(j.error || "Gönderilemedi.");
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

  async function fetchForm(slug) {
    const callout = $("#callout");
    callout.textContent = "";
    show(callout, false);

    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      // inaktif form 403 dönebilir -> “süresi doldu” mesajı göster, ama sayfa kalsın
      if (r.status === 403) {
        show($("#sticky"), false);
        show(callout, true);
        callout.textContent =
          "Bu anket şu an için aktif değildir (süresi dolmuş olabilir).";
        return null;
      }
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Form alınamadı");
      return j.form;
    } catch (e) {
      show(callout, true);
      callout.textContent = "Form yüklenemedi: " + e.message;
      return null;
    }
  }

  async function boot() {
    // Kısa link /s/XXXX desteği sunucu tarafında slug’a çözümleniyor.
    if (window.__FORM__ && window.__FORM__.slug) {
      renderForm(window.__FORM__);
      return;
    }
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug) {
      show($("#callout"), true);
      $("#callout").textContent = "Form bulunamadı (slug yok).";
      return;
    }
    const form = await fetchForm(slug);
    if (form) renderForm(form);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
