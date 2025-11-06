// public/app.js — robust fetch + proper error surfacing
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
    skeleton.style.display = "none";
    errorBox.style.display = "none";
    app.classList.add("hidden");
    return;
  }

  skeleton.style.display = "grid";
  errorBox.style.display = "none";
  app.classList.add("hidden");

  try {
    const { slug, code } = resolveIdent();
    const form = await fetchForm({ slug, code });

    // AKTİF / PASİF KONTROLÜ
    if (form && form.active === false) {
      skeleton.style.display = "none";
      if (errorBox) {
        errorBox.textContent = "Bu anket şu anda pasif. Lütfen daha sonra tekrar deneyin.";
        errorBox.style.display = "block";
      }
      return; // renderForm ÇAĞRILMIYOR
    }

    renderForm(form);
    skeleton.style.display = "none";
    app.classList.remove("hidden");
    setupProgress();
    try {
      if (window.__fbqReady && window.fbq) {
        fbq("track", "ViewContent", { content_name: form.title, content_category: "survey" });
      }
    } catch {}
  } catch (e) {
    console.error("BOOT_FAIL:", e);
    skeleton.style.display = "none";
    errorBox.textContent = "Form bulunamadı veya bağlantı sorunu.";
    errorBox.style.display = "block";
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
    // DOĞRU query dizesi
    const qs = slug ? `slug=${encodeURIComponent(slug)}` : `k=${encodeURIComponent(code)}`;

    // İstersen /api/forms kullan — _redirects varsa:
    // const url = `/api/forms?${qs}`;
    const url = `/.netlify/functions/forms?${qs}`;

    let r;
    try { r = await fetch(url); }
    catch (e) { console.error("FORMS_FETCH_ERR:", e); throw e; }

    let d = null;
    try { d = await r.json(); } catch (e) { console.error("FORMS_JSON_ERR:", e); }

    if (!r.ok) {
      console.error("FORMS_BAD_STATUS:", r.status, d);
      if (d && d.error === "inactive_form") {
        showError("Bu anket şu anda pasif. Lütfen daha sonra tekrar deneyin.");
      } else {
        showError("Form yüklenemedi.");
      }
      throw new Error("load_failed");
    }
    if (!d || !d.ok || !d.form) {
      console.error("FORMS_PAYLOAD_INVALID:", d);
      throw new Error("nf");
    }
    return d.form;
  }

  function showError(msg){
    if (errorBox) {
      errorBox.textContent = msg || "Hata";
      errorBox.style.display = "block";
    }
  }
// Metin satırını "label | imageUrl" formatında çöz
function normalizeOption(opt) {
  // Eski JSON formatını da desteklesin
  if (typeof opt === "object" && opt !== null) {
    return {
      label: opt.label || opt.value || "",
      value: opt.value || opt.label || "",
      imageUrl: opt.imageUrl || null,
    };
  }

  const raw = String(opt || "").trim();
  if (!raw) return { label: "", value: "", imageUrl: null };

  const parts = raw.split("|");
  const label = parts[0].trim();
  const imageUrl = (parts[1] || "").trim() || null;

  return {
    label,
    value: label,      // DB’ye yine sadece label gidiyor
    imageUrl,
  };
}
  // ---------- Render ----------
  function renderForm(form) {
    const s = form.schema || { questions: [] };
    const q = Array.isArray(s.questions) ? s.questions : [];
    CURRENT_QUESTIONS = q;

    const h = [];
    h.push(`<style>
      .btn { padding:10px 16px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; }
      .btn.loading { opacity:.8; pointer-events:none }
      .btn.shake { animation:shake .4s }
      @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      .toast { position:sticky; top:0; background:#fff7f7; border:1px solid #fca5a5; color:#b91c1c; padding:8px 10px; border-radius:10px; margin-bottom:10px; display:none; z-index:60 }

      .progress-wrap{ position:sticky; top:0; z-index:40; background:#fff; padding:8px 0 6px; margin-bottom:8px }
      .progress-meta{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#6b7280; margin-bottom:6px }
      .progress{ height:6px; background:#e5e7eb; border-radius:999px; overflow:hidden }
      #progressBar{ height:100%; width:0%; background:linear-gradient(90deg,#111,#555) }

      .q { padding:12px; border-radius:12px; transition:background .2s, box-shadow .2s; scroll-margin-top:120px; }
      .q.focus { background:#f9fafb; box-shadow: inset 0 0 0 2px #e5e7eb; }
      .q.checked { background:#fffef2; box-shadow: inset 0 0 0 2px #fde68a; }
      label { display:block; margin:6px 0; cursor:pointer; }

      .ripple { position:relative; overflow:hidden }
      .ripple span.rip { position:absolute; border-radius:50%; transform:scale(0);
        opacity:.35; background:#fff; pointer-events:none; animation:rip .6s ease-out }
      @keyframes rip { to { transform:scale(12); opacity:0 } }

      .submit-bar { position: static; padding:16px 0 24px; margin-top:16px; background:transparent; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; align-items:center; gap:8px; }
      .submit-meta{ color:#6b7280; font-size:12px; line-height:1.3; text-align:center }
      .submit-meta b{ font-weight:700 }

      .other-wrap{display:flex;align-items:center;gap:8px;margin-top:6px}
      .other-input{flex:1;min-width:160px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px}
      .other-input[disabled]{opacity:.6}
    </style>`);

    h.push(`<div class="toast" id="toast">Uyarı</div>`);
    h.push(`<div class="progress-wrap">
      <div class="progress-meta"><span id="progressTxt">0 / ${q.length}</span><span id="progressPct">0%</span></div>
      <div class="progress"><div id="progressBar"></div></div>
    </div>`);

    h.push(`<h1>${esc(form.title || "Anket")}</h1>`);
    if (form.description) h.push(`<p>${esc(form.description)}</p>`);
    h.push(`<form id="f" autocomplete="on">`);

    for (let i=0;i<q.length;i++){
      const it = q[i];
      const qid = it.id || it.name || it.key || `q${i+1}`;
      const label = it.label || qid;
      const required = !!it.required;
      const name = attr(qid);
      const showOther = !!(it.other || it.allowOther || it.showOther);

      h.push(`<div class="q" tabindex="-1" data-index="${i}" data-required="${required ? "1":""}" data-name="${name}" data-qid="${attr(qid)}">
        <div class="field"><div><strong>${esc(label)}</strong></div>`);

      if (it.type==="radio" && Array.isArray(it.options)) {
        for (const opt of it.options) {
          const val = typeof opt==="string" ? opt : opt.value;
          const txt = typeof opt==="string" ? opt : (opt.label||opt.value);
          h.push(`<label><input class="ctl" type="radio" name="${name}" value="${attr(val)}"> ${esc(txt)}</label>`);
        }
        if (showOther) {
          h.push(`<label class="other-wrap">
            <input class="ctl other-toggle" type="checkbox" name="${name}" value="__OTHER__">
            Diğer:
            <input type="text" class="other-input" data-other-for="${name}" placeholder="Yazınız" disabled>
          </label>`);
        }
      }
      // (checkbox/select/text/textarea blokları sizde nasılsa aynı şekilde devam eder…)
      h.push(`</div>`); // .field
      h.push(`<div class="hint" style="display:none;color:#b91c1c;font-size:12px">Bu soru zorunlu.</div>`);
      h.push(`</div>`); // .q
    }

    // Submit bar
    h.push(`<div class="submit-bar">
      <button id="submitBtn" class="btn ripple">Gönder</button>
      <div class="submit-meta">Gönder düğmesine basmadan önce yanıtlarınızı kontrol edin.</div>
    </div>`);

    h.push(`</form>`);
    app.innerHTML = h.join("");

    attachInteractions();
    attachIOSSubmitFix();
  }

  // ---- Interactions / Submit (özet) ----
  function attachInteractions(){
    const btn  = document.getElementById("submitBtn");
    const form = document.getElementById("f");
    if (!btn || !form) return;

    form.addEventListener("submit", async (ev)=>{
      ev.preventDefault();

      // Zorunlu kontrol
      const missing = findFirstInvalid();
      if (missing) { showInvalidFeedback(btn, missing); return; }

      setLoading(btn,true);
      const answers = collectAnswers();
      const formSlug = new URL(location.href).searchParams.get("slug");

      try {
        const res = await fetch("/api/responses", {
          method:"POST",
          headers:{ "content-type":"application/json" },
          body: JSON.stringify({ form_slug: formSlug, answers, meta: { href: location.href, ua: navigator.userAgent } })
        });
        const reason = res && res.status===409 ? "duplicate" : (res && res.ok ? "ok" : "error");
        sessionStorage.setItem("mikroar_thanks", JSON.stringify({ reason }));
        if (res && (res.ok || res.status===409)) { location.href="/thanks.html"; return; }
        toast("Kaydetme hatası. Lütfen tekrar deneyin.");
      } catch (e) {
        console.error("RESP_SUBMIT_ERR:", e);
        toast("Bağlantı hatası. Tekrar deneyin.");
      } finally {
        setLoading(btn,false);
      }
    });
  }

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

  // --- helpers (progress/answers/validation/toast/ripple vs. — sizdekiyle aynı) ---
  function showInvalidFeedback(btn, block){
    toast("Lütfen zorunlu soruları doldurun.");
    try { if (navigator.vibrate) navigator.vibrate(40); } catch {}
    btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake");
    const hint = block.querySelector(".hint"); if (hint) hint.style.display="block";
    block.scrollIntoView({ behavior:"smooth", block:"center" });
  }
  function toast(msg){ const t=document.getElementById("toast"); if(!t) return; t.textContent=msg; t.style.display="block"; clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display="none",2200); }
  function setLoading(btn, on){ if(!btn) return; btn.classList.toggle("loading", !!on); }
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }
  function attr(s){ return String(s).replace(/"/g,"&quot;"); }

  function findFirstInvalid(){
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks){
      const req = b.getAttribute("data-required")==="1";
      if (!req) continue;
      const name = b.getAttribute("data-name");
      const anyChecked = !!app.querySelector(`[name="${name}"]:checked`);
      if (!anyChecked) return b;
    }
    return null;
  }

  function collectAnswers(){
    const answers = {};
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks){
      const name = b.getAttribute("data-name");
      const inputs = Array.from(b.querySelectorAll(".ctl"));
      const radios = inputs.filter(x=>x.type==="radio");
      if (radios.length){
        const c = radios.find(x=>x.checked);
        if (c) {
          const v = c.value;
          if (v === "__OTHER__") {
            const oi = b.querySelector(`.other-input[data-other-for="${name}"]`);
            answers[name] = oi ? (oi.value || "") : "";
          } else {
            answers[name] = v;
          }
        }
      }
      // (checkbox, text, textarea vb. sizde nasılsa aynı mantıkla eklenebilir)
    }
    return answers;
  }

  function setupProgress(){ /* isteğe bağlı */ }
})();
