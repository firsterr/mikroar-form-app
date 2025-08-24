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

      formEl.addEventListener('submit', async (e) => {
  e.preventDefault();

  const qs = (currentForm.schema?.questions) || [];
  const payload = { answers: {} };
  const eksik = [];

  qs.forEach((q, i) => {
    let val;

    if (q.type === 'radio') {
      const c = document.querySelector(`input[name="q${i}"]:checked`);
      val = c ? c.value : '';
    } else if (q.type === 'checkbox') {
      val = [...document.querySelectorAll(`input[name="q${i}"]:checked`)].map(x => x.value);
    } else {
      const el = document.querySelector(`[name="q${i}"]`);
      val = el ? el.value.trim() : '';
    }

    payload.answers[`q_${i}`] = val;

    if (q.required) {
      const doluMu = (q.type === 'checkbox') ? (Array.isArray(val) && val.length > 0) : (val !== '');
      if (!doluMu) eksik.push(q.label || `Soru ${i + 1}`);
    }
  });

  if (eksik.length) {
    alert(`Lütfen zorunlu soruları doldurun:\n- ${eksik.join('\n- ')}`);
    return; // gönderme YOK
  }

  const resp = await fetch(`/api/forms/${currentSlug}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await resp.json();

  if (!resp.ok || !data.ok) {
    alert(data.error || 'Kaydedilemedi');
    return;
  }

  alert('Teşekkürler, yanıtınız kaydedildi.');
  formEl.reset();
});
