/* public/form.js - kısa link /f/:code ile slug gizleyerek formu yükler */

(function () {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const els = {
    title: $('#title'),
    form : $('#form'),
    err  : $('#err'),
    send : $('#send')
  };

  // --- 1) slug çözümü: ?slug=... varsa kullan, yoksa /f/<code> -> /api/resolve-short/<code>
  async function resolveSlug() {
    const qp = new URLSearchParams(location.search);
    const s  = (qp.get('slug') || '').trim();
    if (s) return s;

    const m = location.pathname.match(/^\/f\/([A-Za-z0-9_-]{4,64})$/);
    if (!m) throw new Error('slug veya kısa kod bulunamadı.');
    const code = m[1];

    const r = await fetch(`/api/resolve-short/${encodeURIComponent(code)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Kısa kod çözülemedi.');
    return j.slug;
  }

  // --- 2) küçük yardımcılar
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k in n) n[k] = v; else n.setAttribute(k, String(v));
    }
    for (const c of (Array.isArray(children) ? children : [children])) {
      n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return n;
  }

  // --- 3) formu çiz
  function renderForm(questions = []) {
    clear(els.form);

    questions.forEach((q, idx) => {
      const key  = q.key || q.name || `q_${idx}`;
      const labelText = q.text || q.title || `Soru ${idx+1}`;
      const type  = String(q.type || 'text').toLowerCase();

      const field = el('div', { className: 'field' });
      field.appendChild(el('label', { htmlFor: key }, `${idx+1}. ${labelText}`));

      let input;

      if (type === 'text') {
        input = el('input', { id:key, name:key, type:'text', className:'input' });
        field.appendChild(input);
      } else if (type === 'textarea') {
        input = el('textarea', { id:key, name:key, rows:4, className:'textarea' });
        field.appendChild(input);
      } else if (type === 'select') {
        input = el('select', { id:key, name:key, className:'select' });
        (q.options || []).forEach(opt => {
          input.appendChild(el('option', { value:String(opt) }, String(opt)));
        });
        field.appendChild(input);
      } else if (type === 'radio') {
        input = el('div');
        (q.options || []).forEach((opt, i) => {
          const rid = `${key}_${i}`;
          const wrap = el('label', { className:'mr-3 inline-flex items-center' }, [
            el('input', { type:'radio', name:key, value:String(opt), id:rid }),
            ' ',
            String(opt)
          ]);
          input.appendChild(wrap);
        });
        field.appendChild(input);
      } else if (type === 'checkbox') {
        input = el('div');
        (q.options || []).forEach((opt, i) => {
          const cid = `${key}_${i}`;
          const wrap = el('label', { className:'mr-3 inline-flex items-center' }, [
            el('input', { type:'checkbox', name:key, value:String(opt), id:cid }),
            ' ',
            String(opt)
          ]);
          input.appendChild(wrap);
        });
        field.appendChild(input);
      } else {
        // Bilinmeyen tür -> text
        input = el('input', { id:key, name:key, type:'text', className:'input' });
        field.appendChild(input);
      }

      els.form.appendChild(field);
    });
  }

  // --- 4) gönderim
  async function submitAnswers(slug) {
    try {
      els.send.disabled = true;

      const answers = {};
      // text & textarea & select
      $$('input[type="text"], textarea, select', els.form).forEach(inp => {
        answers[inp.name] = inp.value;
      });
      // radio
      const radiosByName = {};
      $$('input[type="radio"]', els.form).forEach(r => {
        (radiosByName[r.name] ||= []).push(r);
      });
      Object.entries(radiosByName).forEach(([name, arr]) => {
        const chosen = arr.find(r => r.checked);
        answers[name] = chosen ? chosen.value : '';
      });
      // checkbox
      const checksByName = {};
      $$('input[type="checkbox"]', els.form).forEach(c => {
        (checksByName[c.name] ||= []).push(c);
      });
      Object.entries(checksByName).forEach(([name, arr]) => {
        answers[name] = arr.filter(c => c.checked).map(c => c.value);
      });

      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(answers)
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `Sunucu ${r.status} döndürdü`);
      els.err.hidden = true;
      els.err.textContent = '';
      alert('Teşekkürler! Cevabınız kaydedildi.');
    } catch (e) {
      els.err.hidden = false;
      els.err.textContent = `Gönderilemedi: ${e.message || e}`;
    } finally {
      els.send.disabled = false;
    }
  }

  // --- 5) sayfa yükle
  async function main() {
    try {
      const slug = await resolveSlug();

      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Form yüklenemedi');

      const form = j.form || {};
      const questions = form.schema && Array.isArray(form.schema.questions)
        ? form.schema.questions
        : (form.schema && Array.isArray(form.schema) ? form.schema : []);

      if (els.title) els.title.textContent = form.title || slug;
      document.title = (form.title || slug) + ' – MikroAR';

      renderForm(questions);

      if (els.send) {
        els.send.onclick = (ev) => {
          ev.preventDefault();
          submitAnswers(slug);
        };
      }
    } catch (e) {
      els.err.hidden = false;
      els.err.textContent = `Yüklenemedi: ${e.message || e}`;
      if (els.send) els.send.disabled = true;
    }
  }

  // başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
