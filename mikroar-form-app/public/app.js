// public/app.js — robust fetch + UX (auto-advance, progress, ripple, visuals)
(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");

  const LAZY_THRESHOLD = 16;
  let CURRENT_QUESTIONS = [];

  window.addEventListener("DOMContentLoaded", boot);

  function hasIdent() {
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
        return;
      }

      renderForm(form);
      skeleton.style.display = "none";
      app.classList.remove("hidden");
      setupProgress();

      try {
        if (window.__fbqReady && window.fbq) {
          fbq("track", "ViewContent", {
            content_name: form.title,
            content_category: "survey",
          });
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
    const slug = u.searchParams.get("slug");
    if (slug) return { slug, code: null };
    const m = location.pathname.match(/^\/f\/([^/?#]+)/i);
    if (m && m[1]) return { slug: null, code: m[1] };
    const k = u.searchParams.get("k");
    if (k) return { slug: null, code: k };
    return { slug: null, code: null };
  }

  async function fetchForm({ slug, code }) {
    const qs = slug
      ? `slug=${encodeURIComponent(slug)}`
      : `k=${encodeURIComponent(code)}`;

    const url = `/.netlify/functions/forms?${qs}`;

    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      console.error("FORMS_FETCH_ERR:", e);
      throw e;
    }

    let d = null;
    try {
      d = await r.json();
    } catch (e) {
      console.error("FORMS_JSON_ERR:", e);
    }

    if (!r.ok) {
      console.error("FORMS_BAD_STATUS:", r.status, d);
      if (d && d.error === "inactive_form") {
        showError(
          "Bu anket şu anda pasif. Lütfen daha sonra tekrar deneyin."
        );
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

  function showError(msg) {
    if (errorBox) {
      errorBox.textContent = msg || "Hata";
      errorBox.style.display = "block";
    }
  }

  // Metin satırını "label | imageUrl" formatında çöz
  function normalizeOption(opt) {
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
      value: label,
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
        opacity:.35; background:#000; pointer-events:none; animation:rip .6s ease-out }
      @keyframes rip { to { transform:scale(12); opacity:0 } }

      .submit-bar { position: static; padding:16px 0 24px; margin-top:16px; background:transparent; border-top:1px solid #e5e7eb; display:flex; flex-direction:column; align-items:center; gap:8px; }
      .submit-meta{ color:#6b7280; font-size:12px; line-height:1.3; text-align:center }
      .submit-meta b{ font-weight:700 }

      .other-wrap{display:flex;align-items:center;gap:8px;margin-top:6px}
      .other-input{flex:1;min-width:160px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px}
      .other-input[disabled]{opacity:.6}

      /* Görselli tek seçim seçenekleri */
      .opt-row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:10px 12px;
        margin-bottom:6px;
        border-radius:12px;
        border:1px solid #e5e7eb;
        background:#fff;
        transition:background .15s,border-color .15s,box-shadow .15s;
      }
      .opt-row:hover{
        background:#f9fafb;
        border-color:#d1d5db;
      }
      .q.checked .opt-row{
        border-color:#111;
        background:#fefce8;
        box-shadow:0 0 0 1px rgba(0,0,0,.04);
      }

      .opt-main{
        display:flex;
        align-items:center;
        gap:8px;
        min-width:0;
      }
      .opt-main input[type="radio"]{
        width:18px;
        height:18px;
      }
      .opt-text{
        display:inline-block;
        font-size:15px;
        line-height:1.3;
        word-break:break-word;
      }

      .opt-media{
        flex-shrink:0;
      }
      .opt-img{
        display:block;
        width:76px;
        height:76px;
        object-fit:cover;
        border-radius:12px;
        border:1px solid #e5e7eb;
      }

      @media (max-width:640px){
        .opt-row{
          padding:9px 10px;
          gap:10px;
        }
        .opt-img{
          width:68px;
          height:68px;
        }
      }
      @media (max-width:390px){
        .opt-row{
          gap:8px;
        }
        .opt-img{
          width:60px;
          height:60px;
        }
      }
    </style>`);

    h.push(
      `<div class="toast" id="toast">Uyarı</div>
       <div class="progress-wrap">
         <div class="progress-meta">
           <span id="progressTxt">0 / ${q.length}</span>
           <span id="progressPct">0%</span>
         </div>
         <div class="progress"><div id="progressBar"></div></div>
       </div>`
    );

    h.push(`<h1>${esc(form.title || "Anket")}</h1>`);
    if (form.description) h.push(`<p>${esc(form.description)}</p>`);
    h.push(`<form id="f" autocomplete="on">`);

    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      const qid = it.id || it.name || it.key || `q${i + 1}`;
      const label = it.label || qid;
      const required = !!it.required;
      const name = attr(qid);
      const showOther = !!(it.other || it.allowOther || it.showOther);

      h.push(
        `<div class="q" tabindex="-1" data-index="${i}" data-required="${
          required ? "1" : ""
        }" data-name="${name}" data-qid="${attr(qid)}">
          <div class="field">
            <div><strong>${esc(label)}</strong></div>`
      );

      if (it.type === "radio" && Array.isArray(it.options)) {
        const options = it.options.map(normalizeOption);

        for (const o of options) {
          const val = o.value;
          const txt = o.label;
          const img = o.imageUrl;

          h.push(
            `<label class="opt-row ripple">
               <span class="opt-main">
                 <input class="ctl" type="radio" name="${name}" value="${attr(
              val
            )}">
                 <span class="opt-text">${esc(txt)}</span>
               </span>
               ${
                 img
                   ? `<span class="opt-media">
                        <img src="${attr(
                          img
                        )}" alt="${esc(txt)} görseli" class="opt-img">
                      </span>`
                   : ""
               }
             </label>`
          );
        }

        if (showOther) {
          h.push(
            `<label class="other-wrap">
              <input class="ctl other-toggle" type="checkbox" name="${name}" value="__OTHER__">
              Diğer:
              <input type="text" class="other-input" data-other-for="${name}" placeholder="Yazınız" disabled>
            </label>`
          );
        }
      }
      // (ileride checkbox/select/text/textarea da eklenebilir)

      h.push(`</div>`); // .field
      h.push(
        `<div class="hint" style="display:none;color:#b91c1c;font-size:12px">Bu soru zorunlu.</div>`
      );
      h.push(`</div>`); // .q
    }

    h.push(
      `<div class="submit-bar">
        <button id="submitBtn" class="btn ripple">Gönder</button>
        <div class="submit-meta">Gönder düğmesine basmadan önce yanıtlarınızı kontrol edin.</div>
      </div>`
    );

    h.push(`</form>`);
    app.innerHTML = h.join("");

    attachInteractions();
    attachIOSSubmitFix();
  }

  // ---- Interactions / Submit + UX ----
  function attachInteractions() {
    const btn = document.getElementById("submitBtn");
    const form = document.getElementById("f");
    if (!btn || !form) return;

    const blocks = Array.from(app.querySelectorAll(".q"));

    // focus/blur vurgusu
    blocks.forEach((b) => {
      b.addEventListener("focusin", () => b.classList.add("focus"));
      b.addEventListener("focusout", () => b.classList.remove("focus"));
    });

    // change -> checked, diğer input, auto-advance, progress
    form.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;

      const block = t.closest(".q");
      if (block) {
        const name = block.getAttribute("data-name");

        if (t.type === "radio" || t.type === "checkbox") {
          block.classList.add("checked");
          const hint = block.querySelector(".hint");
          if (hint) hint.style.display = "none";

          // Diğer şıkkı
          if (t.classList.contains("other-toggle") || t.value === "__OTHER__") {
            const oi = block.querySelector(
              `.other-input[data-other-for="${name}"]`
            );
            if (oi) {
              const enabled = t.checked;
              oi.disabled = !enabled;
              if (enabled) oi.focus({ preventScroll: false });
              else oi.value = "";
            }
          } else {
            const otherToggle = block.querySelector(
              `.other-toggle[name="${name}"]`
            );
            const otherInput = block.querySelector(
              `.other-input[data-other-for="${name}"]`
            );
            if (otherInput && (!otherToggle || !otherToggle.checked)) {
              otherInput.disabled = true;
              otherInput.value = "";
            }
          }

          // AUTO-ADVANCE: radio seçildiyse bir alt soruya kaydır
          if (t.type === "radio") {
            const idx = blocks.indexOf(block);
            const next = blocks[idx + 1];
            if (next) {
              setTimeout(() => {
                next.scrollIntoView({ behavior: "smooth", block: "center" });
                const first =
                  next.querySelector("input,textarea,select") || next;
                first.focus({ preventScroll: true });
              }, 120);
            }
          }
        }
      }

      updateProgress();
    });

    // Ripple efekti
    app.addEventListener("click", (ev) => {
      const host = ev.target.closest(".ripple");
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const r = document.createElement("span");
      r.className = "rip";
      r.style.left = ev.clientX - rect.left + "px";
      r.style.top = ev.clientY - rect.top + "px";
      host.appendChild(r);
      setTimeout(() => r.remove(), 600);
    });

    // Submit
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();

      const missing = findFirstInvalid();
      if (missing) {
        showInvalidFeedback(btn, missing);
        return;
      }

      setLoading(btn, true);
      const answers = collectAnswers();
      const url = new URL(location.href);
      const formSlug =
        url.searchParams.get("slug") ||
        url.searchParams.get("k") ||
        url.pathname.replace(/^\/f\//, "") ||
        null;

      try {
        const res = await fetch("/api/responses", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            form_slug: formSlug,
            answers,
            meta: { href: location.href, ua: navigator.userAgent },
          }),
        });
        const reason =
          res && res.status === 409
            ? "duplicate"
            : res && res.ok
            ? "ok"
            : "error";
        sessionStorage.setItem(
          "mikroar_thanks",
          JSON.stringify({ reason })
        );
        if (res && (res.ok || res.status === 409)) {
          location.href = "/thanks.html";
          return;
        }
        toast("Kaydetme hatası. Lütfen tekrar deneyin.");
      } catch (e) {
        console.error("RESP_SUBMIT_ERR:", e);
        toast("Bağlantı hatası. Tekrar deneyin.");
      } finally {
        setLoading(btn, false);
      }
    });

    // ilk hazırlanışta progress
    updateProgress();
  }

  // iOS Safari submit fix
  function attachIOSSubmitFix() {
    const btn = document.getElementById("submitBtn");
    const form = document.getElementById("f");
    if (!btn || !form) return;
    btn.addEventListener(
      "click",
      (ev) => {
        ev.preventDefault();
        if (typeof form.requestSubmit === "function") form.requestSubmit(btn);
        else
          form.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true })
          );
      },
      { passive: false }
    );
  }

  // --- helpers (progress/answers/validation/toast) ---
  function showInvalidFeedback(btn, block) {
    toast("Lütfen zorunlu soruları doldurun.");
    try {
      if (navigator.vibrate) navigator.vibrate(40);
    } catch {}
    btn.classList.remove("shake");
    void btn.offsetWidth;
    btn.classList.add("shake");
    const hint = block.querySelector(".hint");
    if (hint) hint.style.display = "block";
    block.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), 2200);
  }

  function setLoading(btn, on) {
    if (!btn) return;
    btn.classList.toggle("loading", !!on);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
    );
  }

  function attr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

    function findFirstInvalid() {
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks) {
      const req = b.getAttribute("data-required") === "1";
      if (!req) continue;

      const name = b.getAttribute("data-name");
      if (!name) continue;

      const controls = Array.from(
        b.querySelectorAll(`.ctl[name="${name}"]`)
      );
      const checked = controls.filter((x) => x.checked);

      // Hiçbir seçenek işaretlenmemişse
      if (!checked.length) return b;

      // Diğer seçeneği işaretliyse ama metin boşsa
      const otherCtl = checked.find(
        (x) => x.classList.contains("other-toggle") || x.value === "__OTHER__"
      );
      if (otherCtl) {
        const oi = b.querySelector(
          `.other-input[data-other-for="${name}"]`
        );
        if (!oi || !oi.value || !oi.value.trim()) return b;
      }
    }
    return null;
  }

   function collectAnswers() {
    const answers = {};
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks) {
      const name = b.getAttribute("data-name");
      if (!name) continue;

      const inputs = Array.from(b.querySelectorAll(".ctl"));
      const radios = inputs.filter((x) => x.type === "radio");
      const others = inputs.filter(
        (x) => x.classList.contains("other-toggle") || x.value === "__OTHER__
      );

      let chosen = null;
      // Öncelik: normal seçenek (radio)
      const radioChecked = radios.find((x) => x.checked);
      if (radioChecked) {
        chosen = radioChecked;
      } else {
        const otherChecked = others.find((x) => x.checked);
        if (otherChecked) chosen = otherChecked;
      }

      if (!chosen) continue;

      if (
        chosen.classList.contains("other-toggle") ||
        chosen.value === "__OTHER__"
      ) {
        const oi = b.querySelector(
          `.other-input[data-other-for="${name}"]`
        );
        answers[name] = oi && oi.value ? oi.value.trim() : "";
      } else {
        answers[name] = chosen.value;
      }
    }
    return answers;
  }

  function updateProgress() {
    const total = (CURRENT_QUESTIONS || []).length;
    const blocks = Array.from(app.querySelectorAll(".q"));
    let answered = 0;
    blocks.forEach((b) => {
      const name = b.getAttribute("data-name");
      if (document.querySelector(`[name="${name}"]:checked`)) answered++;
    });
    const pct = total ? Math.round((answered * 100) / total) : 0;
    const txtEl = document.getElementById("progressTxt");
    const pctEl = document.getElementById("progressPct");
    const barEl = document.getElementById("progressBar");
    if (txtEl) txtEl.textContent = `${answered} / ${total}`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
  }

  function setupProgress() {
    updateProgress();
  }
})();
