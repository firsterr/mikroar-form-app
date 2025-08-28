// public/form.js — auto-advance + required validation + smooth focus
(function () {
  const $ = (s) => document.querySelector(s);
  let FORM = null;

  function renderForm(form) {
    FORM = form;
    const titleEl = $("#form-title");
    const descEl  = $("#form-desc");
    const formEl  = $("#f");

    titleEl.textContent = form.title || "Anket";
    if (form.description && String(form.description).trim()) {
      descEl.textContent = form.description;
      descEl.style.display = "block";
    } else {
      descEl.style.display = "none";
    }

    formEl.innerHTML = "";
    const schema = form.schema && Array.isArray(form.schema.questions)
      ? form.schema
      : { questions: [] };

    schema.questions.forEach((q, i) => {
      const wrap = document.createElement("div");
      wrap.className = "q";
      wrap.dataset.idx = i;
      wrap.tabIndex = -1;

      const label = document.createElement("label");
      label.className = "q-label";
      label.innerHTML = `${i + 1}. ${q.label || "Soru"} ${
        q.required ? '<span class="req">*</span>' : ""
      }`;
      wrap.appendChild(label);

      const body = document.createElement("div");
      body.className = "q-body";
      const name = "q_" + i;

      if (q.type === "text") {
        body.innerHTML = `<input type="text" name="${name}" placeholder="Yanıtınız">`;
      } else if (q.type === "textarea") {
        body.innerHTML = `<textarea name="${name}" placeholder="Yanıtınız"></textarea>`;
      } else if (q.type === "checkbox") {
        (q.options || []).forEach((opt, j) => {
          const id = `${name}_${j}`;
          body.insertAdjacentHTML(
            "beforeend",
            `<label class="opt"><input id="${id}" type="checkbox" name="${name}" value="${opt}"><span>${opt}</span></label>`
          );
        });
      } else {
        // radio (default)
        (q.options || []).forEach((opt, j) => {
          const id = `${name}_${j}`;
          body.insertAdjacentHTML(
            "beforeend",
            `<label class="opt"><input id="${id}" type="radio" name="${name}" value="${opt}"><span>${opt}</span></label>`
          );
        });
      }
      wrap.appendChild(body);
      formEl.appendChild(wrap);
    });

    // Gönder barı
    const bar = document.createElement("div");
    bar.className = "sticky-submit";
    bar.id = "submitBar";
    bar.innerHTML = `
      <button type="submit" id="btnSend">Gönder</button>
      <div class="note">
        <div>Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.</div>
        <div>İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a></div>
        <strong>MikroAR Araştırma</strong>
      </div>`;
    formEl.appendChild(bar);

    attachAutoAdvance(schema);
    formEl.onsubmit = makeSubmitHandler(schema, form.slug);
  }

  // ---- ortak yardımcılar
  function clearError(block) {
    block.classList.remove("error");
    const em = block.querySelector(".err-msg");
    if (em) em.remove();
  }
  function markError(block, msg) {
    block.classList.remove("answered");
    block.classList.add("error", "active");
    let em = block.querySelector(".err-msg");
    if (!em) {
      em = document.createElement("div");
      em.className = "err-msg";
      block.appendChild(em);
    }
    em.textContent = msg || "Lütfen bu soruyu yanıtlayın.";
  }
  function scrollToBlock(idx) {
    const target = document.querySelector(`.q[data-idx="${idx}"]`);
    if (!target) return;
    target.classList.add("active");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = target.querySelector("input,textarea,select");
    if (first) setTimeout(() => first.focus(), 150);
  }
  function isAnswered(q, idx) {
    const key = "q_" + idx;
    if (q.type === "checkbox") {
      return document.querySelectorAll(`[name="${key}"]:checked`).length > 0;
    }
    if (q.type === "radio") {
      return !!document.querySelector(`[name="${key}"]:checked`);
    }
    const el = document.querySelector(`[name="${key}"]`);
    const v = (el && el.value) ? el.value.trim() : "";
    return v.length > 0;
  }

  // --- Auto advance + hata temizleme
  function attachAutoAdvance(schema) {
    const formEl = $("#f");
    const blocks = Array.from(formEl.querySelectorAll(".q"));

    function goTo(idx) {
      blocks.forEach((b) => b.classList.remove("active"));
      const target = blocks[idx];
      if (!target) {
        const btn = $("#btnSend");
        btn?.scrollIntoView({ behavior: "smooth", block: "center" });
        btn?.classList.add("pulse");
        setTimeout(() => btn?.classList.remove("pulse"), 1200);
        return;
      }
      target.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const first = target.querySelector("input,textarea,select");
      if (first) setTimeout(() => first.focus(), 150);
    }

    (schema.questions || []).forEach((q, i) => {
      const block = formEl.querySelector(`.q[data-idx="${i}"]`);
      if (!block) return;

      // Her etkileşimde hata temizle
      block.addEventListener("input", () => clearError(block), { passive: true });
      block.addEventListener("change", () => clearError(block), { passive: true });

      if (q.type === "radio") {
        block.querySelectorAll('input[type="radio"]').forEach((el) => {
          el.addEventListener("change", () => {
            block.classList.add("answered");
            goTo(i + 1);
          });
        });
      } else if (q.type === "text") {
        const inp = block.querySelector('input[type="text"]');
        if (inp) {
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              block.classList.add("answered");
              goTo(i + 1);
            }
          });
          inp.addEventListener("blur", () => {
            if (inp.value.trim()) block.classList.add("answered");
          });
        }
      } else if (q.type === "textarea") {
        const ta = block.querySelector("textarea");
        if (ta) {
          ta.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              block.classList.add("answered");
              goTo(i + 1);
            }
          });
        }
      } else if (q.type === "checkbox") {
        block.querySelectorAll('input[type="checkbox"]').forEach((el) => {
          el.addEventListener("change", () => {
            const any = block.querySelectorAll('input[type="checkbox"]:checked').length > 0;
            block.classList.toggle("answered", any);
          });
        });
      }
    });
  }

  // --- Submit + zorunlu doğrulama
  function makeSubmitHandler(schema, slug) {
    return async function (e) {
      e.preventDefault();
      const btn = $("#btnSend");
      btn.disabled = true;

      // 1) Zorunlu soruları kontrol et, ilk eksikte odaklan ve engelle
      const qs = schema.questions || [];
      let firstMissing = -1;
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        if (q.required && !isAnswered(q, i)) {
          firstMissing = i;
          break;
        }
      }
      if (firstMissing !== -1) {
        const block = document.querySelector(`.q[data-idx="${firstMissing}"]`);
        if (block) {
          markError(block, "Lütfen bu zorunlu soruyu yanıtlayın.");
          scrollToBlock(firstMissing);
        }
        btn.disabled = false;
        return;
      }

      try {
        // 2) Cevapları topla
        const answers = {};
        qs.forEach((q, idx) => {
          const key = "q_" + idx;
          if (q.type === "checkbox") {
            answers[key] = Array.from(
              document.querySelectorAll(`[name="${key}"]:checked`)
            ).map((el) => el.value);
          } else {
            const val = new FormData($("#f")).get(key);
            answers[key] = val;
          }
        });

        // 3) Gönder
        const resp = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });

        let j = {};
        try { j = await resp.json(); } catch {}

        if (resp.status === 409 || j.alreadySubmitted) {
          const when = j.at ? ` (${new Date(j.at).toLocaleString()})` : "";
          alert("Bu IP’den zaten yanıt gönderilmiş." + when);
          btn.disabled = false;
          return;
        }
        if (!resp.ok || !j.ok) {
          alert(j.error || "Gönderilemedi");
          btn.disabled = false;
          return;
        }
        location.href = "/thanks.html";
      } catch (err) {
        alert("Hata: " + err.message);
        btn.disabled = false;
      }
    };
  }

  // --- Boot
  function boot() {
    if (window.__FORM__ && window.__FORM__.slug) {
      renderForm(window.__FORM__);
      return;
    }
    const slug = new URLSearchParams(location.search).get("slug");
    if (!slug) {
      document.body.innerHTML = "<h2>Form bulunamadı (slug yok)</h2>";
      return;
    }
    fetch(`/api/forms/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "Form alınamadı");
        renderForm(j.form);
      })
      .catch((e) => {
        document.body.innerHTML = "<h2>Form yüklenemedi.</h2>";
        console.error(e);
      });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
