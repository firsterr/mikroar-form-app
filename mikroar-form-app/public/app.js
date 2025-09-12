(function () {
  "use strict";

  // ---- Helpers ----
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const show = (el) => el && (el.style.display = "block");
  const hide = (el) => el && (el.style.display = "none");
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const formEl = $("#form");
  if (!formEl) return;
// Başlık & açıklamayı doldur
function setHeaderFromForm(form) {
  try {
    const t = form?.title || window.__FORM?.title || "";
    const d =
      form?.description ||
      window.__FORM?.description ||
      form?.schema?.description ||
      "";
    const titleEl = document.getElementById("title");
    if (titleEl && t) titleEl.textContent = t;
    const descEl = document.getElementById("desc");
    if (descEl) descEl.textContent = d || "";
  } catch {}
}
  // ---- Form serialize ----
  function serializeForm(form) {
    const data = {};
    const checks = {};
    $$("input, select, textarea", form).forEach((el) => {
      if (el.disabled || !el.name) return;
      const name = el.name;
      const type = (el.type || "").toLowerCase();
      if (type === "checkbox") {
        if (!checks[name]) checks[name] = [];
        if (el.checked) checks[name].push(el.value);
        return;
      }
      if (type === "radio") {
        if (el.checked) data[name] = el.value;
        return;
      }
      data[name] = el.value;
    });
    Object.assign(data, checks);
    return data;
  }

  // ---- Require kontrol ----
  function validateRequired(form) {
    const missing = [];
    $$("input[required], select[required], textarea[required]", form).forEach((el) => {
      const type = (el.type || "").toLowerCase();
      if (type === "checkbox") {
        const group = $$(`input[type="checkbox"][name="${el.name}"]`, form);
        if (!group.some((g) => g.checked)) missing.push(el);
      } else if (type === "radio") {
        const group = $$(`input[type="radio"][name="${el.name}"]`, form);
        if (!group.some((g) => g.checked)) missing.push(el);
      } else if (!el.value || el.value.trim() === "") {
        missing.push(el);
      }
    });
    return missing;
  }

  function showError(msg) {
    const el = $("#alertBottom");
    if (el) {
      el.textContent = msg;
      show(el);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      alert(msg);
    }
  }

  function showSuccessView() {
    const app = $("#app");
    const titleEl = $("#title");
    const titleText = (titleEl && titleEl.textContent.trim()) || (window.__FORM?.title) || "Anket";
    app.innerHTML = `
      <div class="success-wrap" style="max-width:720px;margin:40px auto;padding:24px">
        <h1 class="center" style="margin-bottom:8px">${esc(titleText)}</h1>
        <p class="center" style="margin-top:0;font-size:16px">Yanıtınız <strong>kaydedildi</strong>. Teşekkür ederiz.</p>
        <div class="center" style="margin-top:22px;opacity:.8">Bu form <strong>mikroar.com</strong> alanında oluşturuldu.</div>
      </div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    // Required
    const missing = validateRequired(formEl);
    if (missing.length > 0) {
      try { missing[0].focus({ preventScroll: false }); } catch {}
      showError("Lütfen zorunlu alanları doldurun.");
      return;
    }

    const btn = $("#btnSend");
    if (btn) { btn.disabled = true; btn.setAttribute("aria-busy","true"); btn.textContent = "Gönderiliyor…"; }

    const payload = {
      form_id: window.__FORM?.id || null,
      slug: window.__FORM?.slug || new URLSearchParams(location.search).get("slug") || null,
      answers: serializeForm(formEl),
      meta: {
        ua: navigator.userAgent,
        href: location.href,
        ts: new Date().toISOString()
      }
    };

    try {
      const r = await fetch("/api/responses", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload)
      });

      if (r.status === 409) {
        showError("Bu anketi daha önce doldurmuşsunuz.");
        if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = "Gönder"; }
        return;
      }
      if (!r.ok) {
        const t = await r.text().catch(()=> "");
        throw new Error(t || "Yanıt kaydedilemedi.");
      }

      showSuccessView();
    } catch (err) {
      showError(err?.message || "Yanıt kaydedilemedi.");
      if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = "Gönder"; }
    }
  }

  formEl.addEventListener("submit", onSubmit);
})();
