(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");

  window.addEventListener("DOMContentLoaded", boot);

  async function boot() {
    skeleton.style.display = "grid";
    errorBox.style.display = "none";
    app.classList.add("hidden");
    try {
      const { slug, code } = resolveSlugOrCode();
      const form = await fetchForm({ slug, code });
      renderForm(form);
      skeleton.style.display = "none";
      app.classList.remove("hidden");
      focusFirstQuestion();
    } catch (e) {
      skeleton.style.display = "none";
      errorBox.textContent = "Form bulunamadı veya bağlantı sorunu.";
      errorBox.style.display = "block";
    }
  }

  function resolveSlugOrCode() {
    const url = new URL(location.href);
    const slug = url.searchParams.get("slug");
    if (slug) return { slug, code:null };
    const m = location.pathname.match(/^\/f\/([^/?#]+)/i);
    if (m && m[1]) return { slug:null, code:m[1] };
    const k = url.searchParams.get("k");
    if (k) return { slug:null, code:k };
    return { slug:null, code:null };
  }

  async function fetchForm({ slug, code }) {
    const qs = slug ? `slug=${encodeURIComponent(slug)}` :
              code ? `k=${encodeURIComponent(code)}` : "";
    if (!qs) throw new Error("missing-ident");
    const res = await fetch(`/api/forms?${qs}`, { headers:{ "accept":"application/json" } });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error("form-not-found");
    return data.form;
  }

  function renderForm(form) {
    const s = form.schema || { questions: [] };
    const q = Array.isArray(s.questions) ? s.questions : [];

    const h = [];
    h.push(`<h1>${esc(form.title || "Anket")}</h1>`);
    if (form.description) h.push(`<p>${esc(form.description)}</p>`);
    h.push(`<form id="f" autocomplete="on">`);

    for (let i=0;i<q.length;i++) {
      const it = q[i];
      const id = it.id || it.name || it.key || `q${i+1}`;
      const label = it.label || id;
      const required = !!it.required;
      const name = attr(id);
      const reqAttr = required ? "required" : "";

      h.push(`<div class="q" data-index="${i}" data-required="${required ? "1" : ""}" data-name="${name}">
                <div class="field"><div><strong>${esc(label)}</strong></div>`);

      if (it.type === "radio" && Array.isArray(it.options)) {
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input class="ctl" type="radio" name="${name}" value="${attr(val)}" ${reqAttr}> ${esc(txt)}</label>`);
        }
      } else if (it.type === "checkbox" && Array.isArray(it.options)) {
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input class="ctl" type="checkbox" name="${name}" value="${attr(val)}"> ${esc(txt)}</label>`);
        }
      } else if (it.type === "select" && Array.isArray(it.options)) {
        h.push(`<label><select class="ctl" name="${name}" ${reqAttr}>`);
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<option value="${attr(val)}">${esc(txt)}</option>`);
        }
        h.push(`</select></label>`);
      } else if (it.type === "textarea") {
        h.push(`<label><textarea class="ctl" name="${name}" ${reqAttr} rows="4"></textarea></label>`);
      } else {
        const inputType = it.type || "text";
        h.push(`<label><input class="ctl" type="${attr(inputType)}" name="${name}" ${reqAttr} /></label>`);
      }

      // inline küçük uyarı alanı
      h.push(`<div class="hint" style="display:none;color:#b00020;font-size:12px;margin-top:6px;">Bu soru zorunludur.</div>`);
      h.push(`</div></div>`);
    }

    // Gönder + dipnot
    h.push(`<div class="field"><button class="btn" type="submit">Gönder</button></div>`);
    h.push(`
      <div style="margin-top:12px; color:#6b7280; font-size:12px; line-height:1.4">
        Bu form mikroar.com alanında oluşturuldu.<br>
        iletisim@mikroar.com<br>
        Mikroar Formlar
      </div>
    `);

    h.push(`</form>`);
    app.innerHTML = h.join("");

    // “Seçince aşağı kay” + hafif vurgu (KORUNDU)
    const blocks = Array.from(app.querySelectorAll(".q"));
    blocks.forEach((b, idx) => {
      b.addEventListener("click", () => setFocus(idx));
      b.addEventListener("focusin", () => setFocus(idx));
      b.addEventListener("focusout", () => b.classList.remove("focus"));
    });
    app.querySelectorAll(".ctl").forEach(el => {
      el.addEventListener("change", (e) => {
        const b = e.target.closest(".q");
        if (b) {
          b.classList.add("checked");
          const next = nextBlock(b);
          if (next) next.scrollIntoView({ behavior: "smooth", block: "center" });
          setFocusAttr(next || b);
          // varsa uyarıyı kaldır
          const hint = b.querySelector(".hint"); if (hint) hint.style.display = "none";
        }
      });
    });

    document.getElementById("f").addEventListener("submit", onSubmit(form.slug));
  }

  function onSubmit(formSlug) {
    return async (e) => {
      e.preventDefault();

      // Özel doğrulama (mobilde de %100 çalışsın)
      const invalid = findFirstInvalid();
      if (invalid) {
        invalid.classList.add("focus");
        invalid.scrollIntoView({ behavior: "smooth", block: "center" });
        const hint = invalid.querySelector(".hint"); if (hint) hint.style.display = "block";
        return; // gönderme
      }

      const fd = new FormData(e.currentTarget);
      const answers = {};
      for (const [k, v] of fd.entries()) {
        if (answers[k] !== undefined) {
          if (Array.isArray(answers[k])) answers[k].push(v);
          else answers[k] = [answers[k], v];
        } else {
          answers[k] = v;
        }
      }
      const meta = { href: location.href, ua: navigator.userAgent };

      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify({ form_slug: formSlug, answers, meta })
      });

      // 409: aynı IP daha önce göndermiş
      if (res.ok || res.status === 409) {
        const reason = res.status === 409 ? "duplicate" : "ok";
        location.href = `/thanks.html?slug=${encodeURIComponent(formSlug)}&status=${res.status}&reason=${reason}`;
        return;
      }

      let msg = "Kaydetme hatası.";
      try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
      alert(msg);
    };
  }

  // Zorunlu sorular için sağlam kontrol (radio/select/textarea/input)
  function findFirstInvalid(){
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks) {
      const required = b.dataset.required === "1";
      if (!required) continue;
      const name = b.dataset.name;
      if (!name) continue;

      const group = b.querySelectorAll(`[name="${cssEscape(name)}"]`);
      if (!group || group.length === 0) continue;

      let ok = false;
      for (const el of group) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input") {
          if (el.type === "radio") { if (el.checked) { ok = true; break; } }
          else if (el.type === "checkbox") {
            // checkbox'ta zorunluluk tanımı varsa en az bir seçim varsayalım
            if (el.checked) ok = true;
          } else {
            if (el.value && el.value.trim() !== "") ok = true;
          }
        } else if (tag === "select" || tag === "textarea") {
          if (el.value && el.value.trim() !== "") ok = true;
        }
      }
      if (!ok) return b;
    }
    return null;
  }

  // UI yardımcılar
  function focusFirstQuestion(){ const first = app.querySelector(".q"); if (first) { first.classList.add("focus"); first.scrollIntoView({ behavior:"smooth", block:"center" }); } }
  function setFocus(idx){ const blocks = Array.from(app.querySelectorAll(".q")); blocks.forEach(b=>b.classList.remove("focus")); const b = blocks[idx]; if (b) b.classList.add("focus"); }
  function setFocusAttr(b){ if(!b) return; const blocks = Array.from(app.querySelectorAll(".q")); blocks.forEach(x=>x.classList.remove("focus")); b.classList.add("focus"); }
  function nextBlock(b){ const blocks = Array.from(app.querySelectorAll(".q")); const i = blocks.indexOf(b); return i>=0 && i<blocks.length-1 ? blocks[i+1] : null; }
  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function attr(s){ return String(s).replace(/"/g, "&quot;"); }
  function cssEscape(s){ return s.replace(/["\\]/g, "\\$&"); }
})();
