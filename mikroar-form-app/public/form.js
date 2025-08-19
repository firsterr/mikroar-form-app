(() => {
  const qs = (sel, root = document) => root.querySelector(sel);

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
  if (!slug) {
    // slug yoksa seçim ekranına dön
    location.href = "/index.html";
    return;
  }

  // İlk anda "yükleniyor" başlığı (FOUC engelleme)
  els.title.textContent = "Anket yükleniyor…";

  function showLoading(on) {
    if (on) {
      els.skeleton.classList.remove("hidden");
      els.content.hidden = true;
      els.content.classList.remove("visible");
    } else {
      els.skeleton.classList.add("hidden");
      els.content.hidden = false;
      // bir sonraki frame’de görünür yap
      requestAnimationFrame(() => els.content.classList.add("visible"));
    }
  }

  function normalizeKey(s) {
    return (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, ""); // diacritics hariç tüm noktalama kaldır
  }

  function buildQuestion(q, idx) {
    const wrap = document.createElement("div");
    wrap.className = "q";

    // Soru metni
    const labelEl = document.createElement("label");
    labelEl.className = "q-text";
    labelEl.textContent = `${idx + 1}. ${q.label || q.text || "Soru"}`;
    wrap.appendChild(labelEl);

    // İsim: label varsa onu baz al, yoksa q_idx
    const name = q.label ? `label::${normalizeKey(q.label)}` : `q_${idx}`;

    if (q.type === "radio") {
      (q.options || []).forEach(opt => {
        const id = `q_${idx}_${normalizeKey(opt)}`;
        const line = document.createElement("div");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = opt;
        input.id = id;
        const l = document.createElement("label");
        l.htmlFor = id;
        l.textContent = opt;
        line.appendChild(input);
        line.appendChild(document.createTextNode(" "));
        line.appendChild(l);
        wrap.appendChild(line);
      });
    } else if (q.type === "checkbox") {
      (q.options || []).forEach(opt => {
        const id = `q_${idx}_${normalizeKey(opt)}`;
        const line = document.createElement("div");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = name;
        input.value = opt;
        input.id = id;
        const l = document.createElement("label");
        l.htmlFor = id;
        l.textContent = opt;
        line.appendChild(input);
        line.appendChild(document.createTextNode(" "));
        line.appendChild(l);
        wrap.appendChild(line);
      });
    } else {
      // text / textarea
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
    const toKey = (raw) => {
      // label::... geldiyse label’ı anahtar yap, yoksa zaten q_idx
      if (raw.startsWith("label::")) return raw.slice("label::".length);
      return raw;
    };

    (schema.questions || []).forEach((q, idx) => {
      const name = q.label ? `label::${normalizeKey(q.label)}` : `q_${idx}`;

      if (q.type === "checkbox") {
        const checked = [...els.form.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)]
          .map(i => i.value);
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

      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Form yüklenemedi");
      const data = await res.json();
      if (!data?.ok || !data.form) throw new Error("Form bulunamadı");

      const form = data.form;
      const schema = form.schema || {};
      const questions = schema.questions || [];

      // Başlık/bağlam
      document.title = `${form.title || slug} – Anket`;
      els.title.textContent = form.title || slug;

      // Soruları oluştur
      els.questions.innerHTML = "";
      questions.forEach((q, idx) => {
        els.questions.appendChild(buildQuestion(q, idx));
      });

      // Formu göster
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
      els.title.textContent = "Anket yüklenemedi";
      els.msg.textContent = "Yüklenemedi: " + (err.message || err);
      els.msg.className = "error";
      showLoading(false);
      // içerik boş kalmasın diye formu gizli bırak, mesaj görünsün
      els.form.style.display = "none";
    }
  }

  loadForm();
})();
