// MikroAR – Form (Google Forms benzeri)  —  FULL FILE
(function () {
  // ---------- helpers ----------
  const $  = (s) => document.querySelector(s);
  const el = (t, a = {}, html = "") => {
    const e = document.createElement(t);
    for (const [k, v] of Object.entries(a)) {
      if (k === "class") e.className = v;
      else if (k === "for") e.htmlFor = v;
      else if (k.startsWith("on") && typeof v === "function") e[k] = v;
      else e.setAttribute(k, v);
    }
    if (html) e.innerHTML = html;
    return e;
  };

  // küçük başarı ekranı stili (form.css yoksa minimum görünüm için)
  const style = document.createElement("style");
  style.textContent = `
    .card.success{ background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.06); border-radius:12px; padding:24px; }
    .thanks-title{ font-size:28px; font-weight:800; margin:0 0 6px; }
    .thanks-sub{ margin:0 0 14px; color:#374151; }
    .thanks-note{ font-size:14px; color:#4b5563; line-height:1.45; }
    .thanks-note a{ color:#2563eb; text-decoration:underline; }
    .sticky-submit{ margin-top:28px; padding:14px; border-top:1px solid #e5e7eb; background:#fff; border-radius:12px 12px 0 0; box-shadow:0 -2px 6px rgba(0,0,0,.04); display:flex; flex-direction:column; align-items:center; gap:10px; }
    .sticky-submit .note{ text-align:center; font-size:13px; color:#4b5563; }
    .sticky-submit .note strong{ display:block; margin-top:4px; font-size:15px; color:#111827; }
    #btnSend{ background:#1a73e8; color:#fff; border:none; border-radius:10px; padding:10px 18px; font-size:16px; font-weight:600; cursor:pointer; }
    #btnSend:disabled{ opacity:.6; cursor:default; }
  `;
  document.head.appendChild(style);

  // ---------- state ----------
  const state = { form: null };

  // ---------- render ----------
  function renderForm(data) {
    state.form = data;

    // başlık + açıklama
    const titleEl = $("#title");
    const descEl  = $("#form-desc");
    if (titleEl) titleEl.textContent = data.title || "Anket";
    if (descEl) {
      const d = data.description || "";
      if (d && String(d).trim()) {
        descEl.textContent = d;
        descEl.style.display = "block";
      } else {
        descEl.style.display = "none";
      }
    }

    const formEl = $("#f");
    formEl.innerHTML = "";

    const qs = (data.schema && Array.isArray(data.schema.questions))
      ? data.schema.questions
      : [];

    // soruları çiz
    qs.forEach((q, idx) => {
      const wrap = el("div", { class: "q" });
      const qId  = "q_" + idx;

      wrap.appendChild(el("label", { for: qId }, `${idx + 1}. ${q.label || "Soru"} ${q.required ? '<span style="color:#dc2626">*</span>' : ''}`));

      if (q.type === "text") {
        const inp = el("input", { id: qId, name: qId, type: "text" });
        wrap.appendChild(inp);
      } else if (q.type === "textarea") {
        const ta = el("textarea", { id: qId, name: qId, rows: "3" });
        wrap.appendChild(ta);
      } else if (q.type === "checkbox") {
        (q.options || []).forEach((opt, i) => {
          const id = `${qId}_${i}`;
          const line = el("label", { class: "opt", for: id });
          const box  = el("input", { id, type: "checkbox", name: qId, value: opt });
          // en az birini isteyeceksek JS tarafı kontrol edecek
          line.appendChild(box);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });
      } else {
        // radio (default)
        (q.options || []).forEach((opt, i) => {
          const id = `${qId}_${i}`;
          const line = el("label", { class: "opt", for: id });
          const rb   = el("input", { id, type: "radio", name: qId, value: opt });
          // native required vermiyoruz; JS ile ilk boş olana odaklanacağız
          line.appendChild(rb);
          line.appendChild(document.createTextNode(" " + opt));
          wrap.appendChild(line);
        });
      }

      formEl.appendChild(wrap);
    });

    // gönder barı (BUTON ÜSTTE!)
    const bar = el("div", { class: "sticky-submit", id: "submitBar" });
    bar.innerHTML = `
      <button type="submit" id="btnSend">Gönder</button>
      <div class="note">
        <div>Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.</div>
        <div>İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a></div>
        <strong>MikroAR Araştırma</strong>
      </div>`;
    formEl.appendChild(bar);

    // submit handler
    formEl.onsubmit = submitHandler;
  }

  // ---------- success ----------
  function showThanks() {
    // alttaki barı kaldır
    const bar = document.getElementById("submitBar");
    if (bar) bar.remove();

    // kartı “teşekkürler”e çevir
    const card = document.querySelector(".card");
    if (card) {
      card.classList.add("success");
      card.innerHTML = `
        <h2 class="thanks-title">Yanıtınız kaydedildi</h2>
        <p class="thanks-sub">Teşekkürler!</p>
        <div class="thanks-note">
          <div>Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.</div>
          <div>İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a></div>
          <strong>MikroAR Araştırma</strong>
        </div>
      `;
    }

    // başa kaydır
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- submit ----------
  async function submitHandler(ev) {
    ev.preventDefault();
    const formEl = $("#f");
    const btn    = $("#btnSend");
    if (btn) btn.disabled = true;

    // cevapları topla
    const fd = new FormData(formEl);
    const answers = {};
    for (const [k, v] of fd.entries()) {
      if (k in answers) {
        if (Array.isArray(answers[k])) answers[k].push(v);
        else answers[k] = [answers[k], v];
      } else {
        const all = formEl.querySelectorAll(`[name="${k}"][type="checkbox"]`);
        if (all.length > 1) {
          answers[k] = [...all].filter(x => x.checked).map(x => x.value);
        } else {
          answers[k] = v;
        }
      }
    }

    // zorunlu kontrol + ilk boş olana odaklan
    const qs = (state.form?.schema?.questions) || [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q?.required) continue;

      const key = "q_" + i;
      const val = answers[key];
      const empty =
        val == null ||
        (Array.isArray(val) && val.length === 0) ||
        (typeof val === "string" && !val.trim());

      if (empty) {
        const target = formEl.querySelector(`[name="${key}"]`) ||
                       formEl.querySelector(`[name="${key}[]"]`) ||
                       formEl.querySelector(`#${key}`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.focus?.();
        }
        if (btn) btn.disabled = false;
        return; // gönderme yok
      }
    }

    // gönder
    try {
      const slug = state.form?.slug;
      const resp = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });

      let j = {};
      try { j = await resp.json(); } catch {}

      // aynı IP’den daha önce gönderilmişse de teşekkür ekranı
      if (resp.status === 409 || j.alreadySubmitted) {
        showThanks();
        return;
      }

      if (!resp.ok || j.ok === false) {
        alert(j.error || "Gönderim hatası");
        if (btn) btn.disabled = false;
        return;
      }

      // başarılı
      showThanks();
    } catch (e) {
      alert("Hata: " + e.message);
      if (btn) btn.disabled = false;
    }
  }

  // ---------- boot ----------
  async function boot() {
    // SSR ile geldiyse
    if (window.__FORM__ && window.__FORM__.slug) {
      renderForm(window.__FORM__);
      return;
    }

    // slug ile fetch
    const params = new URLSearchParams(location.search);
    const slug = params.get("slug");
    if (!slug) {
      document.body.innerHTML = "<h2>Form bulunamadı (slug yok)</h2>";
      return;
    }
    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Form alınamadı");
      renderForm(j.form);
    } catch (e) {
      document.body.innerHTML = "<h2>Form yüklenemedi.</h2>";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
