<!-- public/form.js -->
<script>
(() => {
  // Kısa seçici
  const $ = (s) => document.querySelector(s);

  // --- Elemanlar (eski/yeni id'lerle uyumlu)
  const els = {
    form: document.getElementById('surveyForm') ||
          document.getElementById('theForm')   ||
          document.querySelector('form'),
    list: document.getElementById('questions') ||
          document.querySelector('[data-questions]'),
    title: document.getElementById('form-title') ||
           document.getElementById('pageTitle')  ||
           document.querySelector('[data-form-title]'),
    skeleton: document.getElementById('skeleton') ||
              document.querySelector('[data-skeleton]'),
    content: document.getElementById('content') ||
             document.querySelector('#content'),
    banner: document.getElementById('banner') ||
            document.querySelector('[data-banner]')
  };

  // Basit bildirim
  function showBanner(msg, type = 'error') {
    if (!els.banner) {
      const b = document.createElement('div');
      b.id = 'banner';
      b.style.margin = '12px 0';
      b.style.padding = '10px 14px';
      b.style.borderRadius = '10px';
      b.style.fontSize = '15px';
      b.style.lineHeight = '1.4';
      (els.form?.parentElement || document.body).prepend(b);
      els.banner = b;
    }
    const isError = type === 'error';
    els.banner.style.background = isError ? '#3a1212' : '#123a12';
    els.banner.style.color = isError ? '#ffb4b4' : '#b9f6c5';
    els.banner.textContent = msg;
  }

  // İskeleti gizle, içeriği göster
  function revealContent() {
    if (els.skeleton) els.skeleton.style.display = 'none';
    if (els.content) {
      els.content.hidden = false;
      els.content.classList.add('visible');
    }
  }

  // Formu tamamen devre dışı bırak
  function disableForm() {
    if (!els.form) return;
    [...els.form.querySelectorAll('input,button,select,textarea')].forEach(el => {
      el.disabled = true;
    });
  }

  // URL’den slug
  const currentSlug = new URLSearchParams(location.search).get('slug') || '';

  // Bellekte form
  let currentForm = null;

  // Soru çizimi
  function drawForm(form) {
    if (!els.list) return;

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

  // Formu YÜKLE
  async function loadForm() {
    if (!currentSlug) {
      revealContent();
      showBanner('Geçersiz bağlantı: slug parametresi yok.', 'error');
      return;
    }

    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(currentSlug)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await r.json();

      if (!r.ok || data?.ok === false) {
        throw new Error(data?.error || 'Form bulunamadı');
      }

      currentForm = data.form || data; // API iki farklı gövdeden birini dönebilir
      drawForm(currentForm);
      revealContent();
    } catch (err) {
      revealContent();
      showBanner(`Form yüklenemedi: ${err.message}`, 'error');
    }
  }

  // İstemci doğrulama + gönderim
  document.addEventListener('submit', async (e) => {
    if (!els.form || !els.form.contains(e.target)) return;
    e.preventDefault();

    if (!currentForm) {
      showBanner('Form henüz yüklenmedi.', 'error');
      return;
    }

    const qs = (currentForm.schema?.questions) || [];
    const payload = { answers: {} };
    const eksik = [];

    qs.forEach((q, i) => {
      let val;

      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="q${i}"]:checked`);
        val = checked ? checked.value : '';
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

      // Başarısızlık
      if (!r.ok || data?.ok === false) {
        // Sunucu "eksik alan" döndürebilir
        if (Array.isArray(data?.missing) && data.missing.length) {
          showBanner(`Eksik alanlar:\n- ${data.missing.join('\n- ')}`, 'error');
          return;
        }

        // Aynı IP’den tekrar oy hatası (unique constraint)
        const msg = String(data?.error || '').toLowerCase();
        if (msg.includes('duplicate key') || msg.includes('already') || data?.code === 'ALREADY_SUBMITTED') {
          showBanner('Bu ankete daha önce yanıt verdiniz. Mevcut yanıtınız korunuyor.', 'ok');
          disableForm();
          return;
        }

        // Diğer hatalar
        throw new Error(data?.error || 'Kaydedilemedi');
      }

      // Başarılı
      showBanner('Teşekkürler, yanıtınız kaydedildi.', 'ok');
      els.form.reset();
      disableForm();
    } catch (err) {
      showBanner(`İnternet/servis hatası: ${err.message}`, 'error');
    }
  });

  // Başlat
  loadForm();
})();
</script>
