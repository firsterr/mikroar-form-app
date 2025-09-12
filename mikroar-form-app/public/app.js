// public/app.js — CLEAN & STABLE
(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const show = (el) => el && (el.style.display = "block");
  const hide = (el) => el && (el.style.display = "none");
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function getCookie(name){
    return document.cookie.split("; ").find(r=>r.startsWith(name+"="))?.split("=")[1] || null;
  }
  function getUTM(){
    const p = new URLSearchParams(location.search);
    const o = {}; p.forEach((v,k)=>o[k]=v);
    return o;
  }
  function getFbpFbc(){
    const fbp = getCookie("_fbp");
    const fbclid = new URLSearchParams(location.search).get("fbclid");
    const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;
    return { fbp, fbc };
  }

  // ---------- SSR tespiti ----------
  const formEl = $("#form");
  const SSR_READY = !!(window.__FORM && formEl && formEl.getAttribute("data-ssr") === "1");

  // ---------- Endpoint ----------
  const SUBMIT_URL =
    (typeof window.__SUBMIT_URL === "string" && window.__SUBMIT_URL) ||
    "/api/responses";

  // ---------- Form serialize ----------
  function serializeForm(form) {
    const data = {};
    const groups = {};

    $$("input, select, textarea", form).forEach((el) => {
      if (el.disabled || !el.name) return;
      const name = el.name;
      const type = (el.type || "").toLowerCase();

      if (type === "checkbox") {
        if (!groups[name]) groups[name] = [];
        if (el.checked) groups[name].push(el.value);
        return;
      }
      if (type === "radio") {
        if (el.checked) data[name] = el.value;
        return;
      }
      data[name] = el.value;
    });

    Object.keys(groups).forEach((k) => (data[k] = groups[k]));
    return data;
  }

  // ---------- Required kontrol ----------
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

  // ---------- Başarı ekranı ----------
  function showSuccessView() {
    const app = $("#app");
    if (!app) return;
    const titleEl = $("#title");
    const titleText =
      (titleEl && titleEl.textContent.trim()) ||
      window.__FORM?.title ||
      "Anket";

    app.innerHTML = `
      <div class="success-wrap" style="max-width:720px;margin:40px auto;padding:24px">
        <h1 class="center" style="margin-bottom:8px">${esc(titleText)}</h1>
        <p class="center" style="margin-top:0;font-size:16px">
          Yanıtınız <strong>kaydedildi</strong>. Teşekkür ederiz.
        </p>
        <div class="center" style="margin-top:22px;opacity:.8">
          Bu form <strong>mikroar.com</strong> alanında oluşturuldu.
        </div>
      </div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Hata göstergesi ----------
  function showError(msg) {
    const el = $("#alertBottom");
    if (el) {
      el.innerHTML = esc(msg);
      show(el);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      alert(msg);
    }
  }

  // ---------- Submit ----------
  async function onSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

    const btn = $("#btnSend");

    // Required kontrol
    const missing = validateRequired(formEl);
    if (missing.length > 0) {
      try { missing[0].focus({ preventScroll: false }); } catch {}
      showError("Lütfen zorunlu alanları doldurun.");
      return;
    }

    // Dedupe/event meta
    const event_id =
      (crypto && crypto.randomUUID && crypto.randomUUID()) ||
      ("lead_" + Date.now() + "_" + Math.random().toString(36).slice(2));
    const { fbp, fbc } = getFbpFbc();

    // Payload
    const form_slug = window.__FORM?.slug || new URLSearchParams(location.search).get("slug") || null;
    const payload = {
      form_slug,
      answers: serializeForm(formEl),
      meta: {
        ua: navigator.userAgent,
        ts: new Date().toISOString(),
        href: location.href,
        event_id,
        fbp, fbc,
        utm: getUTM()
      }
    };

    // UI kilidi
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = "Gönderiliyor…";
    }

    try {
      // DB kaydı
      const r = await fetch(SUBMIT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload)
      });

      if (r.status === 409) {
        // IP duplicate
        showError("Bu anketi daha önce doldurmuşsunuz.");
        if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.textContent = "Gönder"; }
        return;
      }
      if (!r.ok) {
        const r2 = await fetch("/api/answers", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(payload)
        });
        if (!r2.ok) throw new Error("Yanıt kaydedilemedi.");
      }

      // Pixel + CAPI (dedupe için aynı event_id)
      try {
        if (window.fbq) {
          fbq("track", "Lead", { content_name: form_slug, value: 1, currency: "TRY" }, { eventID: event_id });
        }
        const testCode = new URLSearchParams(location.search).get("fb_test");
        fetch("/.netlify/functions/fb", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event_id,
            event_name: "Lead",
            form_slug,
            event_source_url: location.href,
            test_event_code: testCode || undefined
          })
        }).catch(()=>{});
      } catch {}

      showSuccessView();
    } catch (err) {
      showError(err?.message || "Bir hata oluştu.");
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.textContent = "Gönder";
      }
    }
  }

  // ---------- Başlat ----------
  function bootstrap() {
    if (!formEl) return;

    if (SSR_READY) {
      formEl.addEventListener("submit", onSubmit);
      show(formEl);
      return;
    }

    // Render gecikmesine karşı bağla
    const tryBind = () => {
      const f = $("#form");
      if (f && !f.__bound) {
        f.addEventListener("submit", onSubmit);
        f.__bound = true;
      }
    };
    tryBind();
    let retries = 20;
    const iv = setInterval(() => {
      tryBind();
      if (--retries <= 0) clearInterval(iv);
    }, 150);
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
