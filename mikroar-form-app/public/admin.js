/* MikroAR – Admin Form Builder (hafif, responsive) */
const $ = s => document.querySelector(s);
const qsWrap = $('#qs');

const toast = (m, type='')=>{
  const t = $('#toast');
  t.textContent = m;
  t.style.display='block';
  t.style.borderColor =
    type==='err' ? '#ef4444' :
    type==='ok'  ? '#22c55e' : 'var(--line)';
  setTimeout(()=> t.style.display='none', 2200);
};

const els = {
  slug:   $('#slug'),
  title:  $('#title'),
  description: $('#description'),
  active: $('#active'),
  meta:   $('#meta'),
  btnLoad:$('#btnLoad'),
  btnNew: $('#btnNew'),
  btnAdd: $('#btnAdd'),
  btnSave:$('#btnSave'),
};

const blankQ = () => ({
  type:'radio',
  label:'',
  required:true,
  options:['Evet','Hayır']
});

let questions = [];

// ---------- helpers
function chip(k,v){
  const s = document.createElement('span');
  s.className='chip';
  s.textContent = `${k}: ${v}`;
  return s;
}
function renderMeta(){
  els.meta.innerHTML='';
  els.meta.append(
    chip('Soru', questions.length),
    chip('Zorunlu', questions.filter(q=>q.required).length)
  );
}
function qRow(q,i){
  const div = document.createElement('div');
  div.className='q'; div.dataset.idx = i;

  div.innerHTML = `
    <div class="qhead">
      <select class="qtype">
        <option value="radio">Tek seçenek (radyo)</option>
        <option value="checkbox">Çoklu seçenek (checkbox)</option>
        <option value="text">Kısa metin</option>
        <option value="textarea">Uzun metin</option>
      </select>
      <input class="qlabel" type="text" placeholder="Soru metni"/>
      <label class="req"><input class="qreq" type="checkbox"/> Zorunlu</label>
      <button class="up btn" type="button" title="Yukarı">↑</button>
      <button class="down btn" type="button" title="Aşağı">↓</button>
    </div>
    <div class="opts">
      <label>Seçenekler (her satır bir seçenek):</label>
      <textarea class="qopts" placeholder="Evet&#10;Hayır"></textarea>
      <div class="hint">Metin sorularında seçenek gerekmez.</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="dup btn" type="button">Kopyala</button>
        <button class="del btn" type="button" style="color:#ef4444;border-color:#ef4444">Sil</button>
      </div>
    </div>
  `;

  const tSel = div.querySelector('.qtype');
  const lInp = div.querySelector('.qlabel');
  const rChk = div.querySelector('.qreq');
  const oTxt = div.querySelector('.qopts');

  tSel.value = q.type;
  lInp.value = q.label || '';
  rChk.checked = !!q.required;
  if (Array.isArray(q.options)) oTxt.value = q.options.join('\n');

  const showOpts = ()=>{
    div.querySelector('.opts').style.display =
      (tSel.value==='radio'||tSel.value==='checkbox') ? 'block' : 'none';
  };
  showOpts();

  tSel.onchange = ()=>{ q.type = tSel.value; showOpts(); renderMeta(); };
  lInp.oninput  = ()=>{ q.label = lInp.value; };
  rChk.onchange = ()=>{ q.required = rChk.checked; renderMeta(); };
  oTxt.oninput  = ()=>{ q.options = oTxt.value.split('\n').map(s=>s.trim()).filter(Boolean); };

  div.querySelector('.up').onclick   = ()=>{ if (i>0){ [questions[i-1],questions[i]]=[questions[i],questions[i-1]]; render(); } };
  div.querySelector('.down').onclick = ()=>{ if (i<questions.length-1){ [questions[i+1],questions[i]]=[questions[i],questions[i+1]]; render(); } };
  div.querySelector('.del').onclick  = ()=>{ questions.splice(i,1); render(); };
  div.querySelector('.dup').onclick  = ()=>{ questions.splice(i+1,0, JSON.parse(JSON.stringify(q))); render(); };

  return div;
}
function render(){
  qsWrap.innerHTML='';
  questions.forEach((q,i)=> qsWrap.appendChild(qRow(q,i)));
  renderMeta();
}
function setForm(form){
  els.title.value  = form.title || '';
  els.description.value = form.description || '';
  els.active.value = (form.active === false ? 'false' : 'true');
  questions = Array.isArray(form.schema?.questions)
    ? JSON.parse(JSON.stringify(form.schema.questions))
    : [];
  render();
}
function sanitizeQuestions(arr){
  return (arr || []).map(q=>{
    const t = (q.type || 'radio').trim();
    const out = {
      type: ['radio','checkbox','text','textarea'].includes(t) ? t : 'radio',
      label: (q.label||'').trim(),
      required: !!q.required
    };
    if (out.type==='radio' || out.type==='checkbox'){
      out.options = (Array.isArray(q.options) ? q.options : [])
        .map(s=>String(s||'').trim())
        .filter(Boolean);
    }
    return out;
  });
}

// ---------- auth guard
async function ensureLogin() {
  try{
    const r = await fetch('/api/admin/ping', { headers:{'Accept':'application/json'} });
    if (r.status === 401) {
      // Basic Auth penceresini açtır
      location.href = `/admin/gate?next=${encodeURIComponent(location.pathname)}`;
      return false;
    }
    return true;
  }catch{ return true; }
}

// ---------- data ops
async function load(){
  const slug = els.slug.value.trim();
  if (!slug) return toast('Slug gerekli','err');
  try{
    if (!(await ensureLogin())) return;

    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, {
      headers:{'Accept':'application/json'}
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || 'Bulunamadı');
    setForm(j.form);
    toast('Yüklendi');
  }catch(e){
    toast('Yüklenemedi: '+ (e?.message || e), 'err');
  }
}

async function save(){
  const slug = els.slug.value.trim().toLowerCase();
  if (!slug) return toast('Slug gerekli','err');

  const body = {
    slug,
    title: (els.title.value || '').trim(),
    description: (els.description.value || '').trim() || null,
    active: els.active.value === 'true',
    schema: { questions: sanitizeQuestions(questions) }
  };

  try{
    if (!(await ensureLogin())) return;

    const r = await fetch('/admin/api/forms', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body: JSON.stringify(body)
    });

    // JSON değilse (örn. 401 Basic Auth HTML) metni göster
    const ct = r.headers.get('content-type') || '';
    let j;
    if (ct.includes('application/json')) {
      j = await r.json();
    } else {
      const txt = (await r.text()).slice(0,180);
      throw new Error(`HTTP ${r.status} – ${txt}`);
    }

    if (!r.ok || !j.ok){
      const msg = j.error || j.detail || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    toast('Kaydedildi ✓','ok');
  }catch(e){
    toast('Hata: '+ (e?.message || e), 'err');
  }
}

// ---------- UI
els.btnAdd.onclick = ()=>{ questions.push(blankQ()); render(); };
els.btnNew.onclick = ()=>{
  els.title.value='';
  els.description.value='';
  els.active.value='true';
  questions=[];
  render();
};
els.btnLoad.onclick= load;
els.btnSave.onclick= save;

// URL param’dan otomatik yükle
const uSlug = new URLSearchParams(location.search).get('slug');
if (uSlug){ els.slug.value = uSlug; load(); }
