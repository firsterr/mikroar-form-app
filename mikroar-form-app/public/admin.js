/* MikroAR – Admin Form Builder (hafif, responsive) */
const $ = s => document.querySelector(s);
const qsWrap = $('#qs');
const toast = (m, type='')=>{
  const t = $('#toast');
  t.textContent = m;
  t.style.display='block';
  t.style.borderColor = type==='err' ? '#ef4444' : type==='ok' ? '#22c55e' : 'var(--line)';
  setTimeout(()=> t.style.display='none', 2000);
};

const els = {
  slug:   $('#slug'),
  title:  $('#title'),
  active: $('#active'),
  meta:   $('#meta'),
  btnLoad:$('#btnLoad'),
  btnNew: $('#btnNew'),
  btnAdd: $('#btnAdd'),
  btnSave:$('#btnSave'),
};

const blankQ = () => ({
  type:'radio',        // 'radio' | 'checkbox' | 'text' | 'textarea'
  label:'',            // soru metni
  required:true,
  options:['Evet','Hayır']
});

let questions = [];   // state

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
      <button class="up btn" title="Yukarı">↑</button>
      <button class="down btn" title="Aşağı">↓</button>
    </div>
    <div class="opts">
      <label>Seçenekler (her satır bir seçenek):</label>
      <textarea class="qopts" placeholder="Evet&#10;Hayır"></textarea>
      <div class="hint">Metin sorularında seçenek gerekmez.</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="dup btn">Kopyala</button>
        <button class="del btn" style="color:#ef4444;border-color:#ef4444">Sil</button>
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

  const updateVisible = ()=>{
    div.querySelector('.opts').style.display = (tSel.value==='radio'||tSel.value==='checkbox') ? 'block' : 'none';
  };
  updateVisible();

  // events
  tSel.onchange = ()=>{ q.type = tSel.value; updateVisible(); renderMeta(); };
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
  els.active.value = (form.active === false ? 'false' : 'true');
  questions = Array.isArray(form.schema?.questions) ? JSON.parse(JSON.stringify(form.schema.questions)) : [];
  render();
}

async function load(){
  const slug = els.slug.value.trim();
  if (!slug) return toast('Slug gerekli','err');
  try{
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Bulunamadı');
    setForm(j.form);
    toast('Yüklendi');
  }catch(e){ toast('Yüklenemedi: '+e.message,'err'); }
}

async function save(){
  const slug = els.slug.value.trim();
  if (!slug) return toast('Slug gerekli','err');
  const body = {
    slug,
    title: els.title.value.trim(),
    active: els.active.value === 'true',
    schema: { questions }
  };
  try{
    const r = await fetch('/admin/api/forms',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error||'Kaydedilemedi');
    toast('Kaydedildi ✓','ok');
  }catch(e){ toast('Hata: '+e.message,'err'); }
}

// UI
els.btnAdd.onclick = ()=>{ questions.push(blankQ()); render(); };
els.btnNew.onclick = ()=>{ els.title.value=''; els.active.value='true'; questions=[]; render(); };
els.btnLoad.onclick= load;
els.btnSave.onclick= save;

// URL param’dan otomatik yükle
const uSlug = new URLSearchParams(location.search).get('slug');
if (uSlug){ els.slug.value = uSlug; load(); }
