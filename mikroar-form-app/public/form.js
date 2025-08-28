(() => {
  const $ = s => document.querySelector(s);

  function normalizeSchema(s) {
    try { if (typeof s === "string") s = JSON.parse(s); } catch {}
    // {schema:{questions:[]}} ya da {questions:[]} ya da direkt []
    if (s && s.schema && !s.questions) s = s.schema;
    if (Array.isArray(s)) return { questions: s };
    if (s && Array.isArray(s.questions)) return s;
    return { questions: [] };
  }

  function render(form) {
    $('#form-title').textContent = form.title || 'Anket';

    const desc = (form.description || '').toString().trim();
    const $desc = $('#form-desc');
    if (desc) { $desc.textContent = desc; $desc.style.display = ''; }
    else { $desc.style.display = 'none'; }

    const schema = normalizeSchema(form.schema);
    const $f = $('#f');
    $f.innerHTML = '';

    schema.questions.forEach((q, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'q';

      const label = document.createElement('label');
      label.className = 'qlabel';
      label.innerHTML = `${idx + 1}. ${q.label || q.text || 'Soru'} ${q.required ? '<span class="req">*</span>' : ''}`;
      wrap.appendChild(label);

      const name = `q_${idx}`;

      if (q.type === 'text') {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.name = name;
        if (q.required) inp.required = true;
        wrap.appendChild(inp);
      } else if (q.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.name = name; ta.rows = 3;
        if (q.required) ta.required = true;
        wrap.appendChild(ta);
      } else if (q.type === 'checkbox') {
        (q.options || []).forEach((opt, i) => {
          const id = `${name}_${i}`;
          const row = document.createElement('label');
          row.className = 'opt';
          row.htmlFor = id;
          row.innerHTML = `<input id="${id}" type="checkbox" name="${name}" value="${opt}"> ${opt}`;
          wrap.appendChild(row);
        });
        // en az bir checkbox’ı zorunlu kılmak için ilkini required yap
        if (q.required) {
          const first = wrap.querySelector('input[type="checkbox"]');
          if (first) first.required = true;
        }
      } else {
        // default: radio
        (q.options || []).forEach((opt, i) => {
          const id = `${name}_${i}`;
          const row = document.createElement('label');
          row.className = 'opt';
          row.htmlFor = id;
          row.innerHTML = `<input id="${id}" type="radio" name="${name}" value="${opt}" ${q.required ? 'required' : ''}> ${opt}`;
          wrap.appendChild(row);
        });
      }

      $f.appendChild(wrap);
    });

    // Yapışkan gönder barı
    const bar = document.createElement('div');
    bar.className = 'sticky-submit';
    bar.innerHTML = `
      <div class="note">
        Bu form <strong>mikroar.com</strong> alanında oluşturulmuştur.<br/>
        İletişim: <a href="mailto:iletisim@mikroar.com">iletisim@mikroar.com</a><br/>
        <strong>MikroAR Araştırma</strong>
      </div>
      <button id="btnSend" type="submit">Gönder</button>
    `;
    $f.appendChild(bar);

    // Gönder
    $f.onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = $('#btnSend');
      btn.disabled = true;

      const fd = new FormData($f);
      const answers = {};
      schema.questions.forEach((q, idx) => {
        const key = `q_${idx}`;
        answers[key] = q.type === 'checkbox' ? fd.getAll(key) : fd.get(key);
      });

      try {
        const slug = form.slug; // SSR’de olabilir, yoksa fetch’ten geldi
        const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ answers })
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 409 || j.alreadySubmitted) {
          alert(`Bu IP’den zaten yanıt gönderilmiş${j.at ? ' (' + new Date(j.at).toLocaleString() + ')' : ''}.`);
          btn.disabled = false; return;
        }
        if (!r.ok || !j.ok) throw new Error(j.error || 'Gönderilemedi');
        location.href = '/thanks.html';
      } catch (e) {
        alert('Hata: ' + e.message);
        btn.disabled = false;
      }
    };
  }

  async function boot() {
    // SSR varsa
    if (window.__FORM__ && window.__FORM__.slug) {
      render(window.__FORM__);
      return;
    }
    // /form.html?slug=...
    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) { document.body.innerHTML = '<h2>Form bulunamadı (slug yok)</h2>'; return; }

    try {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Form alınamadı');
      j.form.slug = j.form.slug || slug;  // submit için garantiye al
      render(j.form);
    } catch (e) {
      console.error(e);
      document.body.innerHTML = '<h2>Form yüklenemedi.</h2>';
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
