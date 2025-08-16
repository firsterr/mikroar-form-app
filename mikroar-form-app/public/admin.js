// admin.js v8 — form yükle/düzenle/kaydet (label sorunu ve butonlar fix)

(() => {
  // --- DOM
  const el = {
    slug: document.getElementById('slug'),
    title: document.getElementById('title'),
    status: document.getElementById('status'),
    btnLoad: document.getElementById('btnLoad'),
    btnNew: document.getElementById('btnNew'),
    btnAddQ: document.getElementById('btnAddQ'),
    btnSave: document.getElementById('btnSave'),
    qsWrap: document.getElementById('qsWrap'),
    optsBox: document.getElementById('optsBox') // sayfadaki sağdaki textarea (kullanmayacağız)
  };

  const API = {
    getForm: async (slug) => {
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      if (!r.ok) throw new Error('Form bulunamadı');
      return r.json();
    },
    saveForm: async (payload) => {
      const r = await fetch('/admin/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Kaydet hatası');
      return j;
    }
  };

  // --- UI helpers
  function clearQuestions() {
    el.qsWrap.innerHTML = '';
  }

  function renderQuestion(q = { type: 'radio', label: '', options: [], required: true }) {
    const row = document.createElement('div');
    row.className = 'q-row';
    row.style.cssText = 'display:grid;grid-template-columns: 360px 1fr 56px;gap:12px;align-items:start;margin:16px 0;';

    // type select
    const sel = document.createElement('select');
    sel.innerHTML = `
      <option value="radio">Tek seçenek (radyo)</option>
      <option value="checkbox">Çoklu seçenek (checkbox)</option>
      <option value="text">Kısa metin</option>
      <option value="textarea">Uzun metin</option>
    `;
    sel.value = q.type || 'radio';

    // label input
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Soru metni';
    inp.value = q.label || '';

    // options textarea
    const ta = document.createElement('textarea');
    ta.placeholder = 'Seçenekler (satır satır)…';
    ta.rows = 5;
    ta.style.gridColumn = '2 / span 2'; // büyük textarea
    ta.value = (q.options || []).join('\n');
    // text/textarea ise seçenek kutusunu gizle
    const toggleOpts = () => {
      const show = (sel.value === 'radio' || sel.value === 'checkbox');
      ta.style.display = show ? '' : 'none';
    };
    sel.addEventListener('change', toggleOpts);
    toggleOpts();

    // delete btn
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Sil';
    del.className = 'button';
    del.addEventListener('click', () => row.remove());

    row.appendChild(sel);
    row.appendChild(inp);
    row.appendChild(del);
    row.appendChild(ta);
    el.qsWrap.appendChild(row);
  }

  function readQuestionsFromUI() {
    const rows = el.qsWrap.querySelectorAll('.q-row');
    const arr = [];
    rows.forEach(r => {
      const type = r.querySelector('select').value;
      const label = r.querySelector('input').value.trim();
      const ta = r.querySelector('textarea');
      const options = (ta && ta.style.display !== 'none')
        ? ta.value.split('\n').map(s => s.trim()).filter(Boolean)
        : [];
      if (!label) return; // boş soru atla
      arr.push({ type, label, options, required: true });
    });
    return arr;
  }

  async function loadForm() {
    const slug = el.slug.value.trim();
    if (!slug) return alert('Slug yaz');
    try {
      const j = await API.getForm(slug);
      // beklenen json: { ok:true, form:{slug,title,active,schema:{questions:[...]}} }
      const form = j.form || {};
      el.title.value = form.title || '';
      el.status.value = (form.active === false) ? 'pasif' : 'aktif';

      const qs = (form.schema && Array.isArray(form.schema.questions))
        ? form.schema.questions
        : [];

      clearQuestions();
      qs.forEach(q => renderQuestion(q));
      if (!qs.length) renderQuestion(); // boşsa 1 tane şablon
    } catch (e) {
      console.error(e);
      alert('Yüklenemedi: ' + e.message);
    }
  }

  function newForm() {
    el.title.value = '';
    el.status.value = 'aktif';
    clearQuestions();
    renderQuestion(); // boş bir soru
  }

  async function saveForm() {
    const slug = el.slug.value.trim();
    if (!slug) return alert('Slug yaz');
    const title = el.title.value.trim();
    const active = (el.status.value === 'aktif');
    const questions = readQuestionsFromUI();
    try {
      await API.saveForm({ slug, title, active, schema: { questions } });
      alert('Kaydedildi');
    } catch (e) {
      console.error(e);
      alert('Kaydet hatası: ' + e.message);
    }
  }

  // --- events
  el.btnLoad?.addEventListener('click', loadForm);
  el.btnNew?.addEventListener('click', newForm);
  el.btnAddQ?.addEventListener('click', () => renderQuestion());
  el.btnSave?.addEventListener('click', saveForm);

  // URL ?slug=… ile gelindiyse otomatik yükle
  const usp = new URLSearchParams(location.search);
  const qsSlug = usp.get('slug');
  if (qsSlug) {
    el.slug.value = qsSlug;
    loadForm();
  }
})();
