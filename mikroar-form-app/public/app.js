(function () {
  "use strict";

  // ----------------- Helpers -----------------
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const show = (el) => el && (el.style.display = "");
  const hide = (el) => el && (el.style.display = "none");
  const esc = (s) => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const appEl  = $("#app");
  const formEl = $("#form");
  if (!formEl) return;

  // ----------------- Slug / Shortlink çözümleyici -----------------
  async function resolveSlug() {
    const url = new URL(location.href);

    // 1) ?slug=... varsa doğrudan kullan
    const qsSlug = url.searchParams.get("slug");
    if (qsSlug) return qsSlug;

    // 2) /f/:code kısa yol (URL'de slug görünmez)
    const m = location.pathname.match(/^\/f\/([^/?#]+)/);
    if (m) {
      const code = m[1];
      const r = await fetch(`/.netlify/functions/go?code=${encodeURIComponent(code)}`);
      if (r.ok) {
        const j = await r.json();
        if (j.ok && j.slug) return j.slug;
      }
      alert("Geçersiz veya süresi dolmuş bağlantı.");
      throw new Error("invalid-short-code");
    }

    // 3) Eski stil: ?k=101010 desteği (geriye uyumluluk)
    const k = url.searchParams.get("k");
    if (k) {
      const r = await fetch(`/.netlify/functions/go?code=${encodeURIComponent(k)}`);
      if (r.ok) {
        const j = await r.json();
        if (j.ok && j.slug) return j.slug;
      }
      alert("Geçersiz veya süresi dolmuş bağlantı.");
      throw new Error("invalid-short-code");
    }

    // 4) slug yoksa seçim ekranına düş
    return null;
  }

  // ----------------- Başlık & açıklama -----------------
  function setHeaderFromForm(form) {
    try {
      const t = form?.title || window.__FORM?.title || "";
      const d =
        form?.description ||
        window.__FORM?.description ||
        form?.schema?.description ||
        "";

      const titleEl = $("#title");
      if (titleEl) titleEl.textContent = t || "Anket";

      const descEl = $("#desc");
      if (descEl) descEl.textContent = d || "";
    } catch {}
  }

  // ----------------- Form render -----------------
  function renderQuestions(questions = []) {
    const qWrap = $("#qwrap") || formEl; // form.html içinde soruların konacağı alan
    qWrap.innerHTML = ""; // temizle

    questions.forEach((q, idx) => {
      const type = (q.type || "").toLowerCase(); // radio | checkbox | select | text
      const name = q.name || `q_${idx + 1}`;
      const label= q.label || name.toUpperCase();
      const req  = !!q.required;

      const field = document.createElement("div");
      field.className = "q-item";
      field.style.margin = "14px 0";

      const h = document.createElement("div");
      h.className = "q-title";
      h.innerHTML = `<strong>${esc(label)}</strong>${req ? ' <span style="color:#d00">*</span>' : ""}`;
      field.appendChild(h);

      const opts = (q.options || "").split(",").map(s => s.trim()).filter(Boolean);

      if (type === "radio") {
        opts.forEach((opt,i) => {
          const id = `${name}_${i}`;
          const w = document.createElement("label");
          w.style.display = "flex"; w.style.alignItems = "center"; w.style.gap="8px"; w.style.margin="6px 0";
          w.innerHTML = `<input type="radio" name="${esc(name)}" id="${esc(id)}" value="${esc(opt)}" ${req?'required':''} /> <span>${esc(opt)}</span>`;
          field.appendChild(w);
        });
      } else if (type === "checkbox") {
        // group required: en az bir tanesi seçilmeli -> HTML'de required'ı ilk elemana verip JS ile kontrol ediyoruz
        opts.forEach((opt,i) => {
          const id = `${name}_${i}`;
          const w = document.createElement("label");
          w.style.display = "flex"; w.style.alignItems = "center"; w.style.gap="8px"; w.style.margin="6px 0";
          w.innerHTML = `<input type="checkbox" name="${esc(name)}" id="${esc(id)}" value="${esc(opt)}" ${i===0 && req?'required':''} /> <span>${esc(opt)}</span>`;
          field.appendChild(w);
        });
      } else if (type === "select") {
        const sel = document.createElement("select");
        sel.name = name;
        if (req) sel.required = true;
        sel.style.minWidth = "200px";
        sel.innerHTML = `<option value="" disabled selected>Seçiniz</option>` +
          opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
        field.appendChild(sel);
      } else {
        // metin girişi
        const inp = document.createElement("input");
        inp.type = "text";
        inp.name = name;
        if (req) inp.required = true;
        inp.placeholder = "Yanıtınız…";
        inp.style.minWidth = "260px";
        field.appendChild(inp);
      }

      formEl.insertBefore(field, $("#formActions") || null);
    });
  }

  // ----------------- Form yükle -----------------
  async function loadForm(slug) {
    // UI: ilk açılış hissini iyileştirmek için hafif bir iskelet
    const titleEl = $("#title");
    const descEl  = $("#desc");
    if (titleEl && !titleEl.textContent) titleEl.textContent = "Yükleniyor…";
    if (descEl  && !descEl.textContent)  descEl.textContent  = "";

    const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`, { headers: { accept: "application/json" }});
    if (!r.ok) {
      const t = await r.text().catch(()=> "");
      throw new Error(t || "Form bulunamadı.");
    }
    const j = await r.json();
    if (!j.ok || !j.form) throw new Error("Form bulunamadı.");

    const form = j.form;
    window.__FORM = {
      id: form.id,
      slug: form.slug,
      title: form.title,
      description: form.description
    };

    setHeaderFromForm(form);
    const questions = form.schema?.questions || [];
    renderQuestions(questions);

    // Gönder butonu görünür olsun
    const actions = $("#formActions");
    if (actions) show(actions);
  }

  // ----------------- Serialize & Validasyon -----------------
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
    const titleEl = $("#title");
    const titleText = (titleEl && titleEl.textContent.trim()) || (window.__FORM?.title) || "Anket";
    appEl.innerHTML = `
      <div class="success-wrap" style="max-width:720px;margin:40px auto;padding:24px">
        <h1 class="center" style="margin-bottom:8px">${esc(titleText)}</h1>
        <p class="center" style="margin-top:0;font-size:16px">Yanıtınız <strong>kaydedildi</strong>. Teşekkür ederiz.</p>
        <div class="center" style="margin-top:22px;opacity:.8">Bu form <strong>mikroar.com</strong> alanında oluşturuldu.</div>
      </div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ----------------- Submit -----------------
  async function onSubmit(e) {
    e.preventDefault();
    e.stopPropagation();

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
      slug: window.__FORM?.slug || null,
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

  // ----------------- Açılış -----------------
  (async () => {
    try {
      const slug = await resolveSlug();
      if (slug) {
        await loadForm(slug);
        return;
      }

      // slug yoksa (ana sayfa): varsa seçim komponentiniz çalışır;
      // yoksa basit bir fallback seçici çizelim.
      if (!$("#chooser")) {
        const box = document.createElement("div");
        box.style.maxWidth = "720px";
        box.style.margin = "32px auto";
        box.innerHTML = `
          <h2>Bir form seçin</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="formSelect" style="min-width:280px"><option>Yükleniyor…</option></select>
            <button id="goBtn" type="button">Git</button>
          </div>`;
        appEl.prepend(box);

        const sel = $("#formSelect");
        const res = await fetch("/api/forms?list=1", { headers: { accept:"application/json"}});
        const js  = res.ok ? await res.json() : { ok:false };
        const items = (js.ok && js.forms) ? js.forms : [];
        sel.innerHTML = `<option value="">Seçiniz</option>` + items.map(f => `<option value="${esc(f.slug)}">${esc(f.title)} — ${esc(f.slug)}</option>`).join("");
        $("#goBtn").onclick = () => {
          const v = sel.value;
          if (v) loadForm(v);
        };
      }
    } catch (err) {
      showError(err?.message || "Bir hata oluştu.");
    }
  })();
})();
