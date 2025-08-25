// public/form.js
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');

  const titleEl = document.getElementById('form-title');
  const boxEl = document.getElementById('questions');
  const formEl = document.getElementById('survey');
  const noteEl = document.getElementById('note');
  const statusEl = document.getElementById('status');

  if (!slug) {
    if (statusEl) statusEl.textContent = 'Hatalı bağlantı. (slug yok)';
    return;
  }

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || '';
  }

  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;
      if (k === 'class') n.className = v;
      else if (k === 'for') n.htmlFor = v;
      else n.setAttribute(k, v);
    });
    children.forEach(c => {
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else if (c) n.appendChild(c);
    });
    return n;
  }

  async function loadForm() {
    setStatus('Yükleniyor…');
    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json(); // { ok, form:{title, schema:{questions:[...]}} }

      if (!data.ok) throw new Error(data.error || 'Form getirilemedi');
      const form = data.form || {};
      const questions = (form.schema && form.schema.questions) || [];

      // Başlık
      if (titleEl) titleEl.textContent = form.title || slug;

      // Soruları çiz
      boxEl.innerHTML = '';
      questions.forEach((q, idx) => {
        const name = `q_${idx}`;
        const wrap = el('div', { class: 'q' });
        const label = el('label', { class: 'q-label' }, `${idx + 1}. ${q.label || ''}`, q.required ? ' *' : '');

        wrap.appendChild(label);

        if (q.type === 'radio') {
          (q.options || []).forEach(opt => {
            const id = `${name}_${opt}`;
            const inp = el('input', { type: 'radio', id, name, value: opt, required: q.required || undefined });
            const l = el('label', { for: id, class: 'opt' }, opt);
            wrap.appendChild(el('div', { class: 'opt-row' }, inp, l));
          });
        } else if (q.type === 'checkbox') {
          (q.options || []).forEach(opt => {
            const id = `${name}_${opt}`;
            const inp = el('input', { type: 'checkbox', id, name, value: opt });
            const l = el('label', { for: id, class: 'opt' }, opt);
            wrap.appendChild(el('div', { class: 'opt-row' }, inp, l));
          });
          // HTML5 required checkbox group için standart yok; submit öncesi doğrularız
          if (q.required) wrap.dataset.requiredGroup = name;
        } else {
          // text
          const inp = el('input', {
            type: 'text',
            name,
            placeholder: 'Yanıtınızı yazınız',
            required: q.required || undefined
          });
          wrap.appendChild(inp);
        }

        boxEl.appendChild(wrap);
      });

      // Formu göster
      formEl.style.display = '';
      setStatus('');
    } catch (e) {
      console.error(e);
      setStatus('Form yüklenemedi');
    }
  }

  function collectAnswers() {
    const answers = {};
    // q_0, q_1, … isimli alanları toplayacağız
    const groups = new Map();

    Array.from(formEl.elements).forEach(elm => {
      if (!elm.name || !/^q_\d+$/.test(elm.name)) return;

      if (elm.type === 'checkbox') {
        if (!groups.has(elm.name)) groups.set(elm.name, []);
        if (elm.checked) groups.get(elm.name).push(elm.value);
      } else if (elm.type === 'radio') {
        if (elm.checked) answers[elm.name] = elm.value;
      } else {
        answers[elm.name] = elm.value ?? '';
      }
    });

    groups.forEach((arr, name) => (answers[name] = arr));

    return answers;
  }

  function validateRequiredCheckboxGroups() {
    // data-required-group olan sarmalları kontrol et
    const reqWraps = boxEl.querySelectorAll('[data-required-group]');
    for (const w of reqWraps) {
      const name = w.dataset.requiredGroup;
      const anyChecked = !!boxEl.querySelector(`input[name="${name}"]:checked`);
      if (!anyChecked) return false;
    }
    return true;
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    // checkbox zorunluluk kontrolü
    if (!validateRequiredCheckboxGroups()) {
      alert('Lütfen zorunlu soruları işaretleyin.');
      return;
    }

    const answers = collectAnswers(); // { q_0: "Evet", q_1: ["Evet","Hayır"], q_2: "metin"... }

    try {
      setStatus('Gönderiliyor…');

      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ answers })
      });

      const data = await r.json();

      if (!r.ok || !data.ok) {
        const msg = (data && data.error) || `HTTP ${r.status}`;
        // Bazı özel hatalar
        if (/already/i.test(msg)) {
          setStatus('Bu ankete yanıt vermiş görünüyorsunuz.');
        } else if (/unique/i.test(msg) || /uniq_response_per_ip_per_form/i.test(msg)) {
          setStatus('Bu ankete bu IP ile zaten oy verilmiş.');
        } else {
          setStatus(`Hata: ${msg}`);
        }
        return;
      }

      setStatus('Teşekkürler, yanıtınız kaydedildi.');
      formEl.reset();
    } catch (err) {
      console.error(err);
      setStatus('Bağlantı/servis hatası.');
    }
  });

  // başlangıç
  loadForm();
});
