/* form.js — MikroAR form görüntüleme + gönderme (sağlam sürüm) */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const toast = (msg) => {
    const box = $('#toast');
    if (!box) return alert(msg);
    box.textContent = msg;
    box.style.display = 'block';
    clearTimeout(window.__t_toast);
    window.__t_toast = setTimeout(() => (box.style.display = 'none'), 3500);
  };

  // 1) Slug belirle (URL ?slug=..., yoksa _config.js’ten)
  const params = new URLSearchParams(location.search);
  const slug =
    (params.get('slug') || '').trim() ||
    (window._DEFAULT_SLUG || '').trim();

  // 2) Temel elemanlar
  const els = {
    title: $('#title'),
    form: $('#form'),
    card: $('#formCard'),
    thanks: $('#thanks'),
    btnSend: $('#btnSend'),
    fineprint: $('#fineprint'),
  };

  // 3) Formu yükle
  async function loadForm() {
    if (!slug) {
      toast('Form slug bulunamadı. URL sonuna ?slug=... ekleyin.');
      return;
    }
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        throw new Error(`Sunucu ${res.status} döndürdü`);
      }
      const data = await res.json();
      if (!data.ok || !data.form) throw new Error('Form bulunamadı');
      const { form } = data; // { slug, title, active, schema }
      const questions = (form.schema && form.schema.questions) || [];

      // Başlık
      if (els.title) els.title.textContent = form.title || slug;

      // Eğer hiç soru yoksa…
      if (!questions.length) {
        els.form.innerHTML = '';
        toast('Bu ankette henüz soru yok.');
        return;
      }

      // Soruları çiz
      renderQuestions(questions);
    } catch (err) {
      console.error(err);
      toast(`Yüklenemedi: ${err.message}`);
    }
  }

  function renderQuestions(questions) {
    els.form.innerHTML = '';
    questions.forEach((q, i) => {
      const idx = i + 1;
      const type = (q.type || 'radio').toLowerCase();
      const label = q.label || `Soru ${idx}`;
      const required = !!q.required;
      const opts = Array.isArray(q.options) ? q.options : [];

      const field = document.createElement('fieldset');
      field.className = 'q';
      field.dataset.index = String(i);

      const lg = document.createElement('legend');
      lg.textContent = label + (required ? ' *' : '');
      field.appendChild(lg);

      // Tek seçim (radio), Çoklu seçim (checkbox), Serbest yazı (text/textarea)
      if (type === 'checkbox' || type === 'radio') {
        if (!opts.length) {
          const div = document.createElement('div');
          div.className = 'muted';
          div.textContent = '(Seçenek tanımlı değil)';
          field.appendChild(div);
        } else {
          opts.forEach((opt, k) => {
            const id = `q${idx}_${k}`;
            const row = document.createElement('label');
            row.className = 'opt';
            const input = document.createElement('input');
            input.type = type;
            input.name = `q${idx}`;
            input.id = id;
            input.value = opt;
            row.appendChild(input);

            const span = document.createElement('span');
            span.textContent = opt;
            row.appendChild(span);

            field.appendChild(row);
          });
        }
      } else if (type === 'textarea') {
        const wrap = document.createElement('div');
        wrap.className = 'text';
        const ta = document.createElement('textarea');
        ta.name = `q${idx}`;
        ta.placeholder = label;
        wrap.appendChild(ta);
        field.appendChild(wrap);
      } else {
        // text (varsayılan)
        const wrap = document.createElement('div');
        wrap.className = 'text';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = `q${idx}`;
        inp.placeholder = label;
        wrap.appendChild(inp);
        field.appendChild(wrap);
      }

      // required bilgisini tutalım
      field.dataset.required = required ? '1' : '0';
      field.dataset.type = type;

      els.form.appendChild(field);
    });
  }

  // 4) Gönderme
  async function handleSubmit(ev) {
    ev.preventDefault();

    const fields = $$('.q', els.form);
    if (!fields.length) return toast('Gönderilecek soru yok.');

    // Doğrulama + yanıtlama nesnesi
    const answers = {};
    for (const field of fields) {
      const idx = field.dataset.index; // string
      const qName = `q${Number(idx) + 1}`;
      const type = field.dataset.type || 'radio';
      const required = field.dataset.required === '1';

      let value = null;

      if (type === 'checkbox') {
        const checked = $$('input[type="checkbox"]:checked', field).map(
          (i) => i.value
        );
        value = checked;
        if (required && checked.length === 0) {
          return toast('Lütfen gerekli soruları doldurun.');
        }
      } else if (type === 'radio') {
        const r = $('input[type="radio"]:checked', field);
        value = r ? r.value : null;
        if (required && !value) {
          return toast('Lütfen gerekli soruları doldurun.');
        }
      } else if (type === 'textarea') {
        const ta = $('textarea', field);
        value = ta ? ta.value.trim() : '';
        if (required && !value) {
          return toast('Lütfen gerekli soruları doldurun.');
        }
      } else {
        const inp = $('input', field);
        value = inp ? inp.value.trim() : '';
        if (required && !value) {
          return toast('Lütfen gerekli soruları doldurun.');
        }
      }

      answers[qName] = value;
    }

    // Sunucuya gönder
    try {
      els.btnSend.disabled = true;
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Başarılı
      els.card.style.display = 'none';
      els.thanks.style.display = 'block';
    } catch (err) {
      console.error(err);
      toast(`Gönderilemedi: ${err.message}`);
    } finally {
      els.btnSend.disabled = false;
    }
  }

  // Etkinlik
  els.btnSend?.addEventListener('click', handleSubmit);

  // Başlat
  loadForm();
})();
