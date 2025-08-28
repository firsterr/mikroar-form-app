(() => {
  const qs = (s, r=document) => r.querySelector(s);
  const els = {
    title: qs("#pageTitle"),
    skeleton: qs("#skeleton"),
    content: qs("#content"),
    form: qs("#theForm"),
    questions: qs("#questions"),
    msg: qs("#msg"),
    sendBtn: qs("#sendBtn")
  };

  const slug = new URLSearchParams(location.search).get("slug") || "";
  if (!slug) { location.href = "/index.html"; return; }

  // Başlık: ilk karede HİÇ "yükleniyor" yazma; boşlukla yer tut.
  els.title.textContent = "\u00A0"; // NBSP – yükseklik sabit kalsın
  document.title = "Anket";

  function showLoading(on) {
    if (on) {
      els.skeleton.classList.remove("hidden");
      els.content.hidden = true;
      els.content.classList.remove("visible");
    } else {
      els.skeleton.classList.add("hidden");
      els.content.hidden = false;
      requestAnimationFrame(() => els.content.classList.add("visible"));
    }
  }

  function normalizeKey(s) {
    return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "");
  }

  function buildQuestion(q, idx) {
    const wrap = document.createElement("div");
    wrap.className = "q";

    const labelEl = document.createElement("label");
    labelEl.className = "q-text";
    labelEl.textContent = `${idx + 1}. ${q.label || q.text || "Soru"}`;
    wrap.appendChild(labelEl);

    const name = q.label ? `label::${normalizeKey(q.label)}` : `q_${idx}`;

    if (q.type === "radio") {
      (q.options || []).forEach(opt => {
        const id = `q_${idx}_${normalizeKey(opt)}`;
        const line = document.createElement("div");
        const input = Object.assign(document.createElement("input"), { type:"radio", name, value:opt, id });
        const l = Object.assign(document.createElement("label"), { htmlFor:id });
        l.textContent = opt;
        line.append(input, " ", l);
        wrap.appendChild(line);
      });
    } else if (q.type === "checkbox") {
      (q.options || []).forEach(opt => {
        const id = `q_${idx}_${normalizeKey(opt)}`;
        const line = document.createElement("div");
        const input = Object.assign(document.createElement("input"), { type:"checkbox", name, value:opt, id });
        const l = Object.assign(document.createElement("label"), { htmlFor:id });
        l.textContent = opt;
        line.append(input, " ", l);
        wrap.appendChild(line);
      });
    } else {
      const input = document.createElement(q.multiline ? "textarea" : "input");
      if (!q.multiline) input.type = "text";
      input.name = name;
      input.placeholder = "Yanıtınız…";
      input.style.width = "100%";
      wrap.appendChild(input);
    }

    return wrap;
  }

  function collectAnswers(schema) {
    const answers = {};
    const toKey = (raw) => raw.startsWith("label::") ? raw.slice(7) : raw;

    (schema.questions || []).forEach((q, idx) => {
      const name = q.label ? `label::${normalizeKey(q.label)}` : `q_${idx}`;
      if (q.type === "checkbox") {
        const checked = [...els.form.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map(i => i.value);
        answers[toKey(name)] = checked;
      } else if (q.type === "radio") {
        const r = els.form.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
        answers[toKey(name)] = r ? r.value : "";
      } else {
        const t = els.form.querySelector(`[name="${CSS.escape(name)}"]`);
        answers[toKey(name)] = t ? t.value : "";
      }
    });

    return answers;
  }

  async function loadForm() {
    try {
      showLoading(true);

      // Form bilgisini getir (cache bypass)
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Form yüklenemedi");
      const data = await res.json();
      if (!data?.ok || !data.form) throw new Error("Form bulunamadı");

      const form = data.form;
      const schema = form.schema || {};
      const questions = schema.questions || [];

      // Başlığı HEMEN gerçek metinle değiştir
      els.title.textContent = form.title || slug;
      document.title = `${form.title || slug} – Anket`;

      // Soruları çiz
      els.questions.innerHTML = "";
      questions.forEach((q, idx) => els.questions.appendChild(buildQuestion(q, idx)));

      // Göster
      showLoading(false);

      // Gönder
      els.form.addEventListener("submit", async (e) => {
        e.preventDefault();
        els.msg.textContent = "";
        els.msg.className = "muted";
        els.sendBtn.disabled = true;

        try {
          const answers = collectAnswers(schema);
          const resp = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers })
          });
          const j = await resp.json().catch(() => ({}));
          if (!resp.ok || !j.ok) throw new Error(j.error || "Kayıt başarısız");

          els.msg.textContent = "Cevaplarınız kaydedildi. Teşekkürler!";
          els.msg.className = "ok";
          els.form.reset();
        } catch (err) {
          els.msg.textContent = "Gönderilemedi: " + (err.message || err);
          els.msg.className = "error";
        } finally {
          els.sendBtn.disabled = false;
        }
      });
    } catch (err) {
      // Başlık yine boş görünmesin
      if (!els.title.textContent.trim()) els.title.textContent = "Anket";
      els.msg.textContent = "Yüklenemedi: " + (err.message || err);
      els.msg.className = "error";
      showLoading(false);
      els.form.style.display = "none";
    }
  }

  loadForm();
})();
