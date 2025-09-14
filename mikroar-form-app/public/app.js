(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");

  // KVKK artık engelleyici kapı değil; submit'te zorunlu
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
      const required = it.required ? "required" : "";
      const name = attr(id);

      h.push(`<div class="q" data-index="${i}"><div class="field"><div><strong>${esc(label)}</strong></div>`);

      if (it.type === "radio" && Array.isArray(it.options)) {
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input class="ctl" type="radio" name="${name}" value="${attr(val)}" ${required}> ${esc(txt)}</label>`);
        }
      }
      else if (it.type === "checkbox" && Array.isArray(it.options)) {
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input class="ctl" type="checkbox" name="${name}" value="${attr(val)}"> ${esc(txt)}</label>`);
        }
      }
      else if (it.type === "select" && Array.isArray(it.options)) {
        h.push(`<label><select class="ctl" name="${name}" ${required}>`);
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<option value="${attr(val)}">${esc(txt)}</option>`);
        }
        h.push(`</select></label>`);
      }
      else if (it.type === "textarea") {
        h.push(`<label><textarea class="ctl" name="${name}" ${required} rows="4"></textarea></label>`);
      }
      else {
        const inputType = it.type || "text";
        h.push(`<label><input class="ctl" type="${attr(inputType)}" name="${name}" ${required} /></label>`);
      }

      h.push(`</div></div>`);
    }

    // KVKK inline onay (submit önkoşulu)
    h.push(`
      <div class="kvkk-inline">
        <label><input id="kvkkConsent" type="checkbox" required> KVKK aydınlatma metnini okudum ve onaylıyorum.</label>
      </div>
    `);

    h.push(`<div class="field"><button class="btn" type="submit">Gönder</button></div>`);
    h.push(`</form>`);
    app.innerHTML = h.join("");

    // Google Form benzeri akış: seçenek işaretlenince bir sonraki soruya kay + hafif efekt
    const formEl = document.getElementById("f");
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
        }
      });
    });

    formEl.addEventListener("submit", onSubmit(form.slug));
  }

  function onSubmit(formSlug) {
    return async (e) => {
      e.preventDefault();
      const consent = document.getElementById("kvkkConsent");
      if (!consent.checked) return alert("Lütfen KVKK onayını işaretleyin.");

      const fd = new FormData(e.currentTarget);
      const answers = {};
      for (const [k, v] of fd.entries()) {
        if (k === "kvkkConsent") continue;
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

      if (res.status === 409) return alert("Bu anketi daha önce doldurmuşsunuz.");
      if (!res.ok) {
        let msg = "Kaydetme hatası.";
        try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
        return alert(msg);
      }

      e.currentTarget.reset();
      alert("Teşekkürler, kaydınız alındı.");
      focusFirstQuestion();
    };
  }

  // Yardımcılar: odak/scroll + efekt
  function focusFirstQuestion(){
    const first = app.querySelector(".q");
    if (first) { first.classList.add("focus"); first.scrollIntoView({ behavior:"smooth", block:"center" }); }
  }
  function setFocus(idx){
    const blocks = Array.from(app.querySelectorAll(".q"));
    blocks.forEach(b => b.classList.remove("focus"));
    const b = blocks[idx]; if (b) b.classList.add("focus");
  }
  function setFocusAttr(b){ if(!b) return; const blocks = Array.from(app.querySelectorAll(".q")); blocks.forEach(x=>x.classList.remove("focus")); b.classList.add("focus"); }
  function nextBlock(b){ const blocks = Array.from(app.querySelectorAll(".q")); const i = blocks.indexOf(b); return i>=0 && i<blocks.length-1 ? blocks[i+1] : null; }

  function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function attr(s){ return String(s).replace(/"/g, "&quot;"); }
})();
