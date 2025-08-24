(() => {
  // ---------- Yardımcı seçiciler ----------
  const $ = (s) => document.querySelector(s);

  // Esnek seçim: sizde farklı id'ler varsa burayı uyarlayabilirsiniz
  const els = {
    form: document.getElementById('surveyForm') || document.querySelector('form'),
    list: document.getElementById('questions') || document.querySelector('[data-questions]'),
    title: document.getElementById('form-title') || document.querySelector('[data-form-title]'),
    skeleton: document.getElementById('skeleton') || document.querySelector('[data-skeleton]'),
    banner: document.getElementById('banner') || document.querySelector('[data-banner]')
  };

  // Ekranda yazı göstermek için küçük yardımcı
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

  function hideSkeleton() {
    if (els.skeleton) els.skeleton.style.display = 'none';
  }

  // ---------- Global durum ----------
  let currentSlug = new URLSearchParams(location.search).get('slug') || '';
  let currentForm = null;

  if (!currentSlug) {
    // slug yoksa index sayfası varsa oraya yönlendirir; yoksa bilgi gösterir
    hideSkeleton();
    showBanner('Geçersiz bağlantı: slug parametresi yok.', 'error');
    return;
  }

  // ---------- Formu çek & çiz ----------
  async function loadForm() {
    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(currentSlug)}`);
      const data = await r.json();

      if (!r.ok || !data?.ok) {
        hideSkeleton();
        showBanner(data?.error || 'Form yüklenemedi.', 'error');
        return;
      }

      currentForm = data.form;
      drawForm(currentForm);
    } catch (e) {
      hideSkeleton();
      showBanner('İnternet/servis hatası: ' + e.message, 'error');
    }
  }

  function drawForm(form) {
    try {
      if (els.title) els.title.textContent = form.title || currentSlug;

      // Soruları temizle
      els.list.innerHTML = '';

      const qs = (form.schema?.questions) || [];
      if (!qs.length) {
        els.list.innerHTML = `<div style="opacity:.7">Bu formda soru yok.</div>`;
        hideSkeleton();
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
            const id = `q${i}_${idx}`;
            const line = document.createElement('label');
            line.style.display = 'block';
            line.style.margin = '6px 0';

            const inp = document.createElement('input');
            inp.type = 'radio';
            inp.name = `q${i}`;
            inp.value = opt;
            inp.id = id;

            const text = document.createElement('span');
            text.textContent = ' ' + opt;

            line.appendChild(inp);
            line.appendChild(text);
            wrap.appendChild(line);
          });
        } else if (q.type === 'checkbox') {
          (q.options || []).forEach((opt, idx) => {
            const id = `q${i}_${idx}`;
            const line = document.createElement('label');
            line.style.display = 'block';
            line.style.margin = '6px 0';

            const inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.name = `q${i}`;
            inp.value = opt;
            inp.id = id;

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

        // required bilgisini dataset'e yaz (istemci doğrulaması için)
        if (q.required) wrap.dataset.required = '1';

        els.list.appendChild(wrap);
      });

      hideSkeleton();
    } catch (e) {
      hideSkeleton();
      showBanner('Form çizimi sırasında hata: ' + e.message, 'error');
    }
  }

  // ---------- Gönderim ----------
  els.form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentForm) {
      showBanner('Form yüklenmedi.', 'error');
      return;
    }

    const qs = (currentForm.schema?.questions) || [];
    const payload = { answers: {} };
    const eksik = [];

    // Önce her soruyu oku ve required kontrolü yap
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
        const doluMu = (q.type === 'checkbox')
          ? (Array.isArray(val) && val.length > 0)
          : (val !== '');
        if (!doluMu) eksik.push(q.label || `Soru ${i + 1}`);
      }
    });

    if (eksik.length) {
      showBanner(`Lütfen zorunlu soruları doldurun:\n- ${eksik.join('\n- ')}`, 'error');
      return;
    }

    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(currentSlug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();

      if (!r.ok || !data?.ok) {
        // Sunucu tarafı required kontrolü de var: missing dönebilir
        const msg = data?.missing?.length
          ? `Eksik alanlar:\n- ${data.missing.join('\n- ')}`
          : (data?.error || 'Kaydedilemedi');
        showBanner(msg, 'error');
        return;
      }

      showBanner('Teşekkürler, yanıtınız kaydedildi.', 'ok');
      els.form.reset();
    } catch (e) {
      showBanner('Gönderim hatası: ' + e.message, 'error');
    }
  });

  // Başlat
  loadForm();
})();
