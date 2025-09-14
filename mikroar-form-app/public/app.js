(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");
  const kvkkBox = document.getElementById("kvkk");
  const consent = document.getElementById("consent");

  kvkkBox.classList.remove("hidden");
  consent.addEventListener("change", () => consent.checked ? boot() : reset());

  function reset() {
    app.classList.add("hidden");
  }

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
    } catch (e) {
      skeleton.style.display = "none";
      errorBox.textContent = "Bağlantı sorunu yaşandı veya form bulunamadı.";
      errorBox.style.display = "block";
    }
  }

  function resolveSlugOrCode() {
    const url = new URL(location.href);
    const slug = url.searchParams.get("slug");
    if (slug) return { slug, code:null };

    // /f/ABC123 url'sinde pathname'den code'u al
    const m = location.pathname.match(/^\/f\/([^/?#]+)/i);
    if (m && m[1]) return { slug:null, code:m[1] };

    const k = url.searchParams.get("k");
    if (k) return { slug:null, code:k };

    return { slug:null, code:null };
  }

  async function fetchForm({ slug, code }) {
    const qs = slug ? `slug=${encodeURIComponent(slug)}` :
              code ? `k=${encodeURIComponent(code)}` : "";
    const res = await fetch(`/api/forms?${qs}`, { headers:{ "accept":"application/json" } });
    const data = await res.json();
    if (!res.ok || !data?.ok) throw new Error("form-not-found");
    return data.form;
  }

  function renderForm(form) {
    const s = form.schema || { questions: [] };
    const q = Array.isArray(s.questions) ? s.questions : [];

    const h = [];
    h.push(`<h1>${escapeHtml(form.title || "Anket")}</h1>`);
    if (form.description) h.push(`<p>${escapeHtml(form.description)}</p>`);

    h.push(`<form id="f" autocomplete="on">`);
    for (const it of q) {
      const id = it.id || it.name || it.key;
      const label = it.label || id;
      const required = it.required ? "required" : "";
      const name = escapeAttr(id);

      if (it.type === "radio" && Array.isArray(it.options)) {
        h.push(`<div class="field"><div><strong>${escapeHtml(label)}</strong></div>`);
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input type="radio" name="${name}" value="${escapeAttr(val)}" ${required}> ${escapeHtml(txt)}</label>`);
        }
        h.push(`</div>`);
      }
      else if (it.type === "checkbox" && Array.isArray(it.options)) {
        h.push(`<div class="field"><div><strong>${escapeHtml(label)}</strong></div>`);
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<label><input type="checkbox" name="${name}" value="${escapeAttr(val)}"> ${escapeHtml(txt)}</label>`);
        }
        h.push(`</div>`);
      }
      else if (it.type === "select" && Array.isArray(it.options)) {
        h.push(`<div class="field"><label><div><strong>${escapeHtml(label)}</strong></div>`);
        h.push(`<select name="${name}" ${required}>`);
        for (const opt of it.options) {
          const val = typeof opt === "string" ? opt : opt.value;
          const txt = typeof opt === "string" ? opt : (opt.label || opt.value);
          h.push(`<option value="${escapeAttr(val)}">${escapeHtml(txt)}</option>`);
        }
        h.push(`</select></label></div>`);
      }
      else if (it.type === "textarea") {
        h.push(`<div class="field"><label><div><strong>${escapeHtml(label)}</strong></div><textarea name="${name}" ${required} rows="4"></textarea></label></div>`);
      }
      else {
        const inputType = it.type || "text";
        h.push(`<div class="field"><label><div><strong>${escapeHtml(label)}</strong></div><input type="${escapeAttr(inputType)}" name="${name}" ${required} /></label></div>`);
      }
    }
    h.push(`<div class="field"><button class="btn" type="submit">Gönder</button></div>`);
    h.push(`</form>`);

    app.innerHTML = h.join("");

    document.getElementById("f").addEventListener("submit", onSubmit(form.slug));
  }

  function onSubmit(formSlug) {
    return async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const answers = {};

      for (const [k, v] of fd.entries()) {
        if (answers[k] !== undefined) {
          // checkbox çoklu değer
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

      if (res.status === 409) {
        alert("Bu anketi daha önce doldurmuşsunuz.");
        return;
      }
      if (!res.ok) {
        try {
          const data = await res.json();
          alert("Kaydetme hatası: " + (data?.detail || data?.error || res.status));
        } catch {
          alert("Kaydetme hatası.");
        }
        return;
      }

      e.currentTarget.reset();
      alert("Teşekkürler, kaydınız alındı.");
    };
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeAttr(s){ return String(s).replace(/"/g, "&quot;"); }
})();
