(() => {
  const $ = (s) => document.querySelector(s);

  // --- Elemanlar
  const els = {
    form: document.getElementById('surveyForm') || document.getElementById('theForm') || document.querySelector('form'),
    list: document.getElementById('questions') || document.querySelector('[data-questions]'),
    // Hem eski (#form-title) hem yeni (#pageTitle) id'leri destekle
    title: document.getElementById('form-title') || document.getElementById('pageTitle') || document.querySelector('[data-form-title]'),
    skeleton: document.getElementById('skeleton') || document.querySelector('[data-skeleton]'),
    content: document.getElementById('content') || document.querySelector('#content'),
    banner: document.getElementById('banner') || document.querySelector('[data-banner]')
  };

  function showBanner(msg, type = 'error') {
    if (!els.banner) {
      const b = document.createElement('div');
      b.id = 'banner';
      b.style.margin = '12px 0';
      b.style.padding = '10px 14px';
      b.style.borderRadius = '10px';
      b.style.fontSize = '15px';
      b.style.lineHeight = '1.4';
      b.style.background = type === 'error' ? '#3a1212' : '#123a12';
      b.style.color = type === 'error' ? '#ffb4b4' : '#b9f6c5';
      (els.form?.parentElement || document.body).prepend(b);
      els.banner = b;
    }
    els.banner.textContent = msg;
  }

  function hideSkeletonAndReveal() {
    if (els.skeleton) els.skeleton.style.display = 'none';
    if (els.content) {
      els.content.hidden = false;          // <— GÖRÜNÜR YAP
      els.content.classList.add('visible');
    }
  }

  let currentSlug = new URLSearchParams(location.search).get('slug') || '';
  let currentForm = null;

  if (!currentSlug) {
    hideSkeletonAndReveal();
    showBanner('Geçersiz bağlantı: slug parametresi yok.', 'error');
    return;
  }

  async function submitAnswers(slug, answers) {
  try {
    const r = await fetch(`/api/forms/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    const data = await r.json();

    if (!r.ok || data.ok === false) {
      throw new Error(data.error || "Gönderim hatası");
    }

    // Yeni: duplicate olsa da hata değil, nazikçe bilgilendir
    if (data.alreadySubmitted) {
      showToast("Bu ankete daha önce yanıt verdiniz. Mevcut yanıtınız korunuyor.", "info");
      disableForm(); // istersen butonu pasifleştir, tekrar denemesin
      return;
    }

    showToast("Yanıtınız kaydedildi. Teşekkürler!", "success");
    disableForm();
  } catch (e) {
    showToast(`İnternet/servis hatası: ${e.message}`, "error");
  }
}

  function drawForm(form) {
    if (els.title) els.title.textContent = form.title || currentSlug;
    els.list.innerHTML = '';

    const qs = (form.schema?.questions) || [];
    if (!qs.length) {
      els.list.innerHTML = `<div style="opacity:.7">Bu formda soru yok.</div>`;
      return;
    }

    qs.forEach((q, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'q';
      wrap.style.margin = '18px 0';

      const label = document.createElement('div');
      label.style.fontWeight = '600';
      label.style.marginBottom = '10px';
      label.textContent = `${i + 1}. ${q.label || ''}${q.required ? ' *' : ''}`;
      wrap.appendChild(label);

      if (q.type === 'radio') {
        (q.options || []).forEach((opt, idx) => {
          const line = document.createElement('label');
          line.style.display = 'block';
          line.style.margin = '6px 0';

          const inp = document.createElement('input');
          inp.type = 'radio';
          inp.name = `q${i}`;
          inp.value = opt;
          inp.id = `q${i}_${idx}`;

          const text = document.createElement('span');
          text.textContent = ' ' + opt;

          line.appendChild(inp);
          line.appendChild(text);
          wrap.appendChild(line);
        });
      } else if (q.type === 'checkbox') {
        (q.options || []).forEach((opt, idx) => {
          const line = document.createElement('label');
          line.style.display = 'block';
          line.style.margin = '6px 0';

          const inp = document.createElement('input');
          inp.type = 'checkbox';
          inp.name = `q${i}`;
          inp.value = opt;
          inp.id = `q${i}_${idx}`;

          const text = document.createElement('span');
          text.textContent = ' ' + opt;

          line.appendChild(inp);
          line.appendChild(text);
          wrap.appendChild(line);
        });
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = `q${i}`;
        inp.placeholder = 'Yanıtınız...';
        inp.style.width = '100%';
        inp.style.padding = '10px 12px';
        inp.style.borderRadius = '10px';
        wrap.appendChild(inp);
      }

      if (q.required) wrap.dataset.required = '1';
      els.list.appendChild(wrap);
    });
  }

  // Gönderim + zorunlu kontrolü (istemci)
  document.addEventListener('submit', async (e) => {
    if (!els.form || !els.form.contains(e.target)) return;
    e.preventDefault();
    if (!currentForm) { showBanner('Form yüklenmedi.', 'error'); return; }

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
        const dolu = (q.type === 'checkbox') ? (Array.isArray(val) && val.length) : (val !== '');
        if (!dolu) eksik.push(q.label || `Soru ${i + 1}`);
      }
    });

    if (eksik.length) { showBanner(`Lütfen zorunlu soruları doldurun:\n- ${eksik.join('\n- ')}`, 'error'); return; }

    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(currentSlug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        const msg = data?.missing?.length
          ? `Eksik alanlar:\n- ${data.missing.join('\n- ')}`
          : (data?.error || 'Kaydedilemedi');
        showBanner(msg, 'error');
        return;
      }
      showBanner('Teşekkürler, yanıtınız kaydedildi.', 'ok');
      els.form.reset();
    } catch (err) {
      showBanner('Gönderim hatası: ' + err.message, 'error');
    }
  });

  loadForm();
})();
