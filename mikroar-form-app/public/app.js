// public/app.js — CLEAN BUILD (inactive form guard + iOS submit fix)
(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");

  const LAZY_THRESHOLD = 16;
  let CURRENT_QUESTIONS = [];

  window.addEventListener("DOMContentLoaded", boot);

  function hasIdent(){
    const u = new URL(location.href);
    if (u.searchParams.get("slug") || u.searchParams.get("k")) return true;
    if (/^\/f\//i.test(location.pathname)) return true;
    return false;
  }

  async function boot() {
    if (!hasIdent()) {
      skeleton.style.display="none";
      errorBox.style.display="none";
      app.classList.add("hidden");
      return;
    }

    skeleton.style.display="grid";
    errorBox.style.display="none";
    app.classList.add("hidden");

    try {
      const { slug, code } = resolveIdent();
      const form = await fetchForm({ slug, code });
      renderForm(form);
      skeleton.style.display="none";
      app.classList.remove("hidden");
      setupProgress();
      try { if (window.__fbqReady && window.fbq) fbq('track', 'ViewContent', { content_name: form.title, content_category: 'survey' }); } catch {}
    } catch {
      skeleton.style.display="none";
      errorBox.textContent="Form bulunamadı veya bağlantı sorunu.";
      errorBox.style.display="block";
    }
  }

  function resolveIdent() {
    const u = new URL(location.href);
    const slug = u.searchParams.get("slug"); if (slug) return { slug, code:null };
    const m = location.pathname.match(/^\/f\/([^/?#]+)/i); if (m && m[1]) return { slug:null, code:m[1] };
    const k = u.searchParams.get("k"); if (k) return { slug:null, code:k };
    return { slug:null, code:null };
  }

  async function fetchForm({ slug, code }) {
    const qs = slug ? `slug=${encodeURIComponent(slug)}` : `k=${encodeURIComponent(code)}`;
    const r = await fetch(`/.netlify/functions/forms?${qs}`);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j.error === "inactive_form") {
        showError("Bu anket şu anda pasif. Lütfen daha sonra tekrar deneyin.");
        throw new Error("inactive_form");
      }
      showError("Form yüklenemedi.");
      throw new Error("load_failed");
    }
    const d = await r.json();
    if (!d?.ok || !d.form) throw new Error("nf");
    return d.form;
  }

  function showError(msg){
    if (errorBox) {
      errorBox.textContent = msg || "Hata";
      errorBox.style.display = "block";
    }
  }

  // --- render (mevcut sürümünüzle uyumlu) ---
  // ... (renderForm, interactions, submit akışı, lazy options, progress vs — SİZDEKİYLE AYNI) ...
  // Bu blok çok uzun olduğu için mevcut dosyanızdaki render/submit bölümünü koruyun;
  // yalnızca fetchForm ve iOS submit butonu için eklediğimiz ufak yama kritik.

  // iOS Safari submit fix
  function attachIOSSubmitFix(){
    const btn  = document.getElementById("submitBtn");
    const form = document.getElementById("f");
    if (!btn || !form) return;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (typeof form.requestSubmit === "function") form.requestSubmit(btn);
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }, { passive: false });
  }

  // renderForm bittiğinde:
  //   attachIOSSubmitFix();

  // ... geri kalan mevcut yardımcılarınız (progress, ripple vs.) ...
})();
