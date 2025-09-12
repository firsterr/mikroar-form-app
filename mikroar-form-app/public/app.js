// public/app.js — FULL REPLACE

(function () {
  "use strict";

  // ---- Yardımcılar ----
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

  // SSR tespiti: SSR ile gelmiş form, DOM'da data-ssr="1" olarak bulunur
  const formEl = $("#form");
  const SSR_READY =
    !!(window.__FORM && formEl && formEl.getAttribute("data-ssr") === "1");

  // Submit endpoint konfigürasyonu (gerekirse window.__SUBMIT_URL ile override edebilirsin)
  const SUBMIT_URL =
    (typeof window.__SUBMIT_URL === "string" && window.__SUBMIT_URL) ||
    "/api/responses";

  // ---- Formu serileştir ----
  function serializeForm(form) {
    const data = {};
    // Tekrarlı alanları gruplayacağız (checkbox vb.)
    const groups = {};

    $$("input, select, textarea", form).forEach((el) => {
      if (el.disabled || !el.name) return;

      const name = el.name;
      const type = (el.type || "").toLowerCase();

      // Checkbox grupları dizi toplar
      if (type === "checkbox") {
        if (!groups[name]) groups[name] = [];
        if (el.checked) groups[name].push(el.value);
        return;
      }

      // Radio: sadece seçili olan
      if (type === "radio") {
        if (el.checked) data[name] = el.value;
        return;
      }

      // Select/Textarea/Input
      data[name] = el.value;
    });

    // Checkbox gruplarını ekle
    Object.keys(groups).forEach((k) => {
      data[k] = groups[k];
    });

    return data;
  }

  // ---- Zorunlu alan kontrolü (hafif) ----
  function validateRequired(form) {
    const missing = [];
    $$("input[required], select[required], textarea[required]", form).forEach(
      (el) => {
        const type = (el.type || "").toLowerCase();
        if (type === "checkbox") {
          // checkbox group: en az bir tanesi işaretli olmalı
          const group = $$(`input[type="checkbox"][name="${el.name}"]`, form);
          if (!group.some((g) => g.checked)) missing.push(el);
        } else if (type === "radio") {
          const group = $$(`input[type="radio"][name="${el.name}"]`, form);
          if (!group.some((g) => g.checked)) missing.push(el);
        } else if (!el.value || el.value.trim() === "") {
          missing.push(el);
        }
      }
    );
    return missing;
  }

  // ---- Başarı ekranı (Google Forms tarzı) ----
  function showSuccessView() {
    const app = $("#app");
    if (!app) return;

    // Başlığı al (varsa)
    const titleEl = $("#title");
    const titleText = titleEl && titleEl.textContent.trim().length
      ? titleEl.textContent.trim()
      : (window.__FORM?.title || "Anket");

    app.innerHTML = `
      <div class="success-wrap" style="max-width:720px;margin:40px auto;padding:24px">
        <h1 class="center" style="margin-bottom:8px">${esc(titleText)}</h1>
        <p class="center" style="margin-top:0;font-size:16px">
          Yanıtınız <strong>kaydedildi</strong>. Teşekkür ederiz.
        </p>
        <div class="center" style="margin-top:22px;opacity:.8">
          Bu form <strong>mikroar.com</strong> alanında oluşturuldu.
        </div>
      </div>
    `;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---- Hata gösterimi ----
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

  // ---- Submit handler ----
  async function onSubmit(e) {
    e.preventDefault();
    const btn = $("#btnSend");

    // Required kontrol
    const missing = validateRequired(formEl);
    if (missing.length > 0) {
      // İlk eksik alana odaklan
      try {
        const first = missing[0];
        first.focus({ preventScroll: false });
      } catch {}
      showError("Lütfen zorunlu alanları doldurun.");
      return;
    }

    // Veriyi derle
    const payload = {
  form_slug: window.__FORM?.slug || new URLSearchParams(location.search).get("slug") || null,
  answers: serializeForm(formEl),
  ip: null, // backend IP ekleyebilir
  meta: {
    ua: navigator.userAgent,
    ts: new Date().toISOString(),
    href: location.href
  }
};

    // UI kilidi
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = "Gönderiliyor…";
    }

    try {
      const r = await fetch(SUBMIT_URL, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify(payload)
});

if (r.status === 409) {
  showError("Bu anketi daha önce doldurmuşsunuz.");
  // butonları eski haline getir
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

  // ---- Başlat ----
  function bootstrap() {
    if (!formEl) return;

    // SSR varsa: sadece submit event bağla, render akışına karışma
    if (SSR_READY) {
      formEl.addEventListener("submit", onSubmit);
      // SSR ile gelmiş başlık/açıklama görünürlüğünü form.html ayarlıyor; burada sadece garanti olsun
      show(formEl);
      return;
    }

    // SSR yoksa: form.html içindeki script render'ı üstleniyor.
    // Yine de submit'i bağlayalım (render sonrası da bağlanabilsin diye küçük bekleme)
    const tryBind = () => {
      const f = $("#form");
      if (f && !f.__bound) {
        f.addEventListener("submit", onSubmit);
        f.__bound = true;
      }
    };
    // İlk dene
    tryBind();
    // Render gecikmesine karşı birkaç kısa tekrar
    let retries = 20;
    const iv = setInterval(() => {
      tryBind();
      if (--retries <= 0) clearInterval(iv);
    }, 150);
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
