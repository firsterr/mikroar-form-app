// form.js — SSR + eski yol uyumlu
(() => {
  const qs = (s, r=document) => r.querySelector(s);
  const els = {
    title: qs("#pageTitle"),
    skeleton: qs("#skeleton"),
    content: qs("#content"),
    questions: qs("#questions"),
    form: qs("#theForm"),
    msg: qs("#msg"),
    sendBtn: qs("#sendBtn")
  };

  const inline = document.getElementById('__FORM_DATA__');
  let presetData = null;
  if (inline) {
    try { presetData = JSON.parse(inline.textContent); } catch {}
  }

  const urlSlug =
    new URLSearchParams(location.search).get("slug") ||
    (presetData?.form?.slug || "");

  function showLoading(b) {
    if (!els.skeleton || !els.content) return;
    els.skeleton.style.display = b ? '' : 'none';
    els.content.hidden = b;
  }

  function buildQuestion(q, idx) {
    const wrap = document.createElement('div');
    wrap.className = 'q';

    const label = document.createElement('label');
    label.className = 'q-label';
    label.textContent = q.label || `Soru ${idx+1}`;
    wrap.appendChild(label);

    const name = `q_${idx}`;

    if (q.type === 'radio') {
      (q.options || []).forEach(opt => {
        const id = `${name}_${opt}`;
        const li = document.createElement('div');
        li.className = 'q-opt';

        const r = document.createElement('input');
        r.type = 'radio';
        r.name = name;
        r.id = id;
        r.value = opt;

        const l = document.createElement('label');
        l.setAttribute('for', id);
        l.textContent = opt;

        li.appendChild(r);
        li.appendChild(l);
        wrap.appendChild(li);
      });
    } else if (q.type === 'checkbox') {
      (q.options || []).forEach(opt => {
        const id = `${name}_${opt}`;
        const li = document.createElement('div');
        li.className = 'q-opt';

        const c = document.createElement('input');
        c.type = 'checkbox';
        c.name = name;
        c.id = id;
        c.value = opt;

        const l = document.createElement('label');
        l.setAttribute('for', id);
        l.textContent = opt;

        li.appendChild(c);
        li.appendChild(l);
        wrap.appendChild(li);
      });
    } else {
      // text / textarea / default
      const input = (q.type === 'textarea')
        ? document.createElement('textarea')
        : document.createElement('input');

      if (q.type !== 'textarea') input.type = 'text';
      input.name = name;
      input.placeholder = q.placeholder || '';
      input.className = 'q-input';
      wrap.appendChild(input);
    }
    return wrap;
  }

  async function loadForm() {
    try {
      showLoading(true);

      let data;
      if (presetData) {
        data = presetData; // SSR: anında
      } else {
        const res = await fetch(`/api/forms/${encodeURIComponent(urlSlug)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Form yüklenemedi');
        data = await res.json();
      }

      if (!data?.ok || !data.form) throw new Error('Form bulunamadı');

      const form = data.form;
      const schema = form.schema || {};
      const questions = schema.questions || [];

      if (els.title) els.title.textContent = form.title || urlSlug;
      document.title = `${form.title || urlSlug} – Anket`;

      els.questions.innerHTML = '';
      questions.forEach((q, idx) => els.questions.appendChild(buildQuestion(q, idx)));

      // submit
      els.form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        els.sendBtn?.setAttribute('disabled', 'disabled');
        els.msg.textContent = '';

        // Yanıtları oku
        const answers = {};
        questions.forEach((q, idx) => {
          const name = `q_${idx}`;
          if (q.type === 'checkbox') {
            const vals = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
            answers[q.label || name] = vals;
          } else if (q.type === 'radio') {
            const r = document.querySelector(`input[name="${name}"]:checked`);
            answers[q.label || name] = r ? r.value : '';
          } else {
            const t = document.querySelector(`[name="${name}"]`);
            answers[q.label || name] = t ? t.value : '';
          }
        });

        // Kayıt
        const res = await fetch(`/api/forms/${encodeURIComponent(urlSlug)}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers })
        });
        const out = await res.json();
        if (!res.ok || !out.ok) throw new Error(out.error || 'Kayıt başarısız');

        els.msg.textContent = 'Teşekkürler, yanıtınız kaydedildi.';
        els.msg.className = 'ok';
      });

      showLoading(false);
    } catch (err) {
      els.msg.textContent = `Yüklenemedi: ${err.message || err}`;
      els.msg.className = 'err';
      showLoading(false);
    }
  }

  loadForm();
})();
