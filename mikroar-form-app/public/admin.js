console.log('[admin.js] loaded');

const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);

let CURRENT_FORM = {
  slug: '',
  title: '',
  active: true,
  schema: { questions: [] }
};

function renderQuestions(list) {
  const wrap = el('questions');
  wrap.innerHTML = '';
  list.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'qcard';
    card.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px">
        <select data-k="type">
          <option value="radio"   ${q.type==='radio'?'selected':''}>Tek seçenek (radyo)</option>
          <option value="checkbox"${q.type==='checkbox'?'selected':''}>Çoklu seçenek (checkbox)</option>
          <option value="short_text"${q.type==='short_text'?'selected':''}>Kısa metin</option>
          <option value="long_text" ${q.type==='long_text'?'selected':''}>Uzun metin</option>
        </select>
        <input data-k="text" placeholder="Soru metni" value="${q.text||''}" style="flex:1"/>
        <button data-k="del">Sil</button>
      </div>
      <div ${q.type==='radio'||q.type==='checkbox'?'':'style="display:none"'} >
        <div class="muted" style="margin-bottom:6px">Seçenekler (satır satır):</div>
        <textarea data-k="options" rows="4" style="width:100%">${(q.options||[]).join('\n')}</textarea>
      </div>
    `;
    // event’lar
    card.querySelector('[data-k="type"]').onchange = e=>{
      q.type = e.target.value;
      renderQuestions(CURRENT_FORM.schema.questions);
    };
    card.querySelector('[data-k="text"]').oninput = e=> q.text = e.target.value;
    const opts = card.querySelector('[data-k="options"]');
    if (opts) opts.oninput = e=> q.options = e.target.value.split('\n').filter(Boolean);
    card.querySelector('[data-k="del"]').onclick = ()=>{
      CURRENT_FORM.schema.questions.splice(idx,1);
      renderQuestions(CURRENT_FORM.schema.questions);
    };
    wrap.appendChild(card);
  });
}

el('btnAddQuestion').onclick = ()=>{
  CURRENT_FORM.schema.questions.push({type:'radio', text:'', options:[]});
  renderQuestions(CURRENT_FORM.schema.questions);
};

el('btnNew').onclick = ()=>{
  CURRENT_FORM = { slug:'', title:'', active:true, schema:{questions:[]} };
  el('title').value = ''; el('active').value = 'true';
  renderQuestions(CURRENT_FORM.schema.questions);
};

el('btnLoad').onclick = async ()=>{
  const slug = el('slug').value.trim();
  if (!slug) return alert('Önce slug gir');
  try{
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}?_=${Date.now()}`, {cache:'no-store'});
    if(!r.ok){ alert(`Bulunamadı (${r.status})`); return; }
    const json = await r.json();
    const form = json.form || json;
    const qs = (form.schema?.questions) || form.questions || [];
    CURRENT_FORM = {
      slug: form.slug || slug,
      title: form.title || '',
      active: form.active !== false,
      schema: { questions: qs.map(q=>({
        type: q.type || 'short_text',
        text: q.text || '',
        options: Array.isArray(q.options)? q.options : []
      })) }
    };
    el('title').value  = CURRENT_FORM.title;
    el('active').value = CURRENT_FORM.active ? 'true' : 'false';
    renderQuestions(CURRENT_FORM.schema.questions);
  }catch(e){ console.error(e); alert('Yükleme hatası: '+e.message); }
};

el('btnSave').onclick = async ()=>{
  const slug = el('slug').value.trim();
  if(!slug) return alert('Slug gir');
  CURRENT_FORM.slug   = slug;
  CURRENT_FORM.title  = el('title').value.trim();
  CURRENT_FORM.active = (el('active').value === 'true');

  try{
    const r = await fetch('/admin/api/forms', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        slug: CURRENT_FORM.slug,
        title: CURRENT_FORM.title,
        active: CURRENT_FORM.active,
        schema: { questions: CURRENT_FORM.schema.questions }
      })
    });
    if(!r.ok){
      const t = await r.text().catch(()=> '');
      throw new Error(`Kaydedilemedi (${r.status}) ${t}`);
    }
    alert('Kaydedildi ✔');
  }catch(e){ console.error(e); alert(e.message); }
};

// sayfa ilk açılış: boş render
renderQuestions(CURRENT_FORM.schema.questions);
