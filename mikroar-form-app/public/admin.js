// admin.js v9 — status yoksa aktif varsay, label + options sorunsuz yükle/kaydet

(() => {
  const el = {
    slug: document.getElementById('slug'),
    title: document.getElementById('title'),
    status: document.getElementById('status'),           // olabilir veya olmayabilir
    btnLoad: document.getElementById('btnLoad'),
    btnNew: document.getElementById('btnNew'),
    btnAddQ: document.getElementById('btnAddQ'),
    btnSave: document.getElementById('btnSave'),
    qsWrap: document.getElementById('qsWrap'),
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

  function clearQuestions(){ el.qsWrap.innerHTML=''; }

  function renderQuestion(q = { type:'radio', label:'', options:[], required:true }) {
    const row = document.createElement('div');
    row.className = 'q-row';

    const sel = document.createElement('select');
    sel.innerHTML = `
      <option value="radio">Tek seçenek (radyo)</option>
      <option value="checkbox">Çoklu seçenek (checkbox)</option>
      <option value="text">Kısa metin</option>
      <option value="textarea">Uzun metin</option>
    `;
    sel.value = q.type || 'radio';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Soru metni';
    inp.value = q.label || '';

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Sil';
    del.className = 'button';
    del.addEventListener('click', () => row.remove());

    const ta = document.createElement('textarea');
    ta.placeholder = 'Seçenekler (satır satır)…';
    ta.value = (q.options || []).join('\n');
    ta.style.gridColumn = '2 / span 2';

    const toggleOpts = () => {
      const show = (sel.value === 'radio' || sel.value === 'checkbox');
      ta.style.display = show ? '' : 'none';
    };
    sel.addEventListener('change', toggleOpts);
    toggleOpts();

    row.appendChild(sel);
    row.appendChild(inp);
    row.appendChild(del);
    row.appendChild(ta);
    el.qsWrap.appendChild(row);
  }

  function readQuestionsFromUI(){
    const rows = el.qsWrap.querySelectorAll('.q-row');
    const arr = [];
    rows.forEach(r=>{
      const type = r.querySelector('select').value;
      const label = r.querySelector('input').value.trim();
      const ta = r.querySelector('textarea');
      const options = (ta && ta.style.display !== 'none')
        ? ta.value.split('\n').map(s=>s.trim()).filter(Boolean)
        : [];
      if (!label) return;
      arr.push({ type, label, options, required:true });
    });
    return arr;
  }

  async function loadForm(){
    const slug = el.slug.value.trim();
    if (!slug) return alert('Slug yaz');
    try{
      const j = await API.getForm(slug);
      const form = j.form || {};
      el.title.value = form.title || '';

      // status yoksa bile patlama: aktif varsay
      const activeVal = (form.active === false) ? 'pasif' : 'aktif';
      if (el.status) el.status.value = activeVal;

      const qs = (form.schema && Array.isArray(form.schema.questions))
        ? form.schema.questions
        : [];

      clearQuestions();
      if (qs.length) qs.forEach(renderQuestion);
      else renderQuestion(); // boşsa şablon
    }catch(e){
      console.error(e);
      alert('Yüklenemedi: '+e.message);
    }
  }

  function newForm(){
    el.title.value = '';
    if (el.status) el.status.value = 'aktif';
    clearQuestions();
    renderQuestion();
  }

  async function saveForm(){
    const slug = el.slug.value.trim();
    if (!slug) return alert('Slug yaz');
    const title = el.title.value.trim();
    const active = el.status ? (el.status.value === 'aktif') : true; // status yoksa aktif
    const questions = readQuestionsFromUI();
    try{
      await API.saveForm({ slug, title, active, schema:{ questions } });
      alert('Kaydedildi');
    }catch(e){
      console.error(e);
      alert('Kaydet hatası: '+e.message);
    }
  }

  el.btnLoad?.addEventListener('click', loadForm);
  el.btnNew?.addEventListener('click', newForm);
  el.btnAddQ?.addEventListener('click', ()=>renderQuestion());
  el.btnSave?.addEventListener('click', saveForm);

  const qsSlug = new URLSearchParams(location.search).get('slug');
  if (qsSlug){ el.slug.value = qsSlug; loadForm(); }
})();
