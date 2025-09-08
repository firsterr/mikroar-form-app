<!-- public/admin.js -->
<script>
/* MikroAR – Admin (fields tabanlı) */
const $ = s => document.querySelector(s);
const qsWrap = $('#qs');

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
  toast:  $('#toast'),
};

const API_FORM_READ  = (slug) => `/api/forms?slug=${encodeURIComponent(slug)}`;
const API_FORM_WRITE = `/admin/api/forms`;

const toast = (m, type='')=>{
  const t = els.toast;
  t.textContent = m;
  t.style.display='block';
  t.style.borderColor =
    type==='err' ? '#ef4444' :
    type==='ok'  ? '#22c55e' : '#e5e7eb';
  setTimeout(()=> t.scrollIntoView({behavior:'smooth',block:'end'}), 0);
  setTimeout(()=> t.style.display='none', 2300);
};

const blankField = () => ({
  type:'text',       // 'text' | 'email' | 'textarea'
  name:'',           // anahtar (ör. "email")
  label:'',          // görünen etiket
  required:false
});

let fields = [];   // state

function chip(k,v){
  const s = document.createElement('span');
  s.className='chip';
  s.textContent = `${k}: ${v}`;
  return s;
}
function renderMeta(){
  els.meta.innerHTML='';
  els.meta.append(
    chip('Alan', fields.length),
    chip('Zorunlu', fields.filter(f=>f.required).length)
  );
}

function fieldRow(f,i){
  const div = document.createElement('div');
  div.className='q'; div.dataset.idx = i;

  div.innerHTML = `
    <div class="qhead" style="display:grid;grid-template-columns:120px 1fr 1fr auto auto auto;gap:8px">
      <select class="ftype">
        <option value="text">Metin</option>
        <option value="email">E-posta</option>
        <option value="textarea">Uzun metin</option>
      </select>
      <input class="fname"  type="text" placeholder="name (ör. email)">
      <input class="flabel" type="text" placeholder="Etiket (ör. E-posta)">
      <label class="req" style="display:flex;gap:6px;align-items:center"><input class="freq" type="checkbox"> Zorunlu</label>
      <button class="up btn"   title="Yukarı">↑</button>
      <button class="down btn" title="Aşağı">↓</button>
    </div>
    <div class="opts" style="margin-top:8px;display:flex;gap:8px">
      <button class="dup btn">Kopyala</button>
      <button class="del btn" style="color:#ef4444;border-color:#ef4444">Sil</button>
    </div>
  `;

  const tSel = div.querySelector('.ftype');
  const nInp = div.querySelector('.fname');
  const lInp = div.querySelector('.flabel');
  const rChk = div.querySelector('.freq');

  tSel.value     = f.type || 'text';
  nInp.value     = f.name || '';
  lInp.value     = f.label || '';
  rChk.checked   = !!f.required;

  // events
  tSel.onchange = ()=>{ f.type = tSel.value; renderMeta(); };
  nInp.oninput  = ()=>{ f.name = nInp.value.trim(); };
  lInp.oninput  = ()=>{ f.label = lInp.value; };
  rChk.onchange = ()=>{ f.required = rChk.checked; renderMeta(); };

  div.querySelector('.up').onclick   = ()=>{ if (i>0){ [fields[i-1],fields[i]]=[fields[i],fields[i-1]]; render(); } };
  div.querySelector('.down').onclick = ()=>{ if (i<fields.length-1){ [fields[i+1],fields[i]]=[fields[i],fields[i+1]]; render(); } };
  div.querySelector('.del').onclick  = ()=>{ fields.splice(i,1); render(); };
  div.querySelector('.dup').onclick  = ()=>{ fields.splice(i+1,0, JSON.parse(JSON.stringify(f))); render(); };

  return div;
}

function render(){
  qsWrap.innerHTML='';
  fields.forEach((f,i)=> qsWrap.appendChild(fieldRow(f,i)));
  renderMeta();
}

function setForm(form){
  els.title.value       = form.title || '';
  els.description.value = form.description || '';
  els.active.value      = (form.active === false ? 'false' : 'true');
  fields = Array.isArray(form.schema?.fields)
    ? JSON.parse(JSON.stringify(form.schema.fields))
    : [];
  render();
}

async function load(){
  const slug = els.slug.value.trim();
  if (!slug) return toast('Slug gerekli','err');
  try{
    const r = await fetch(API_FORM_READ(slug));
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    const schema = j.schema || {};
    // /api/forms?slug=… yanıtı {schema:{title,description,fields}} şeklinde
    const form = {
      title: schema.title || slug,
      description: schema.description || '',
      active: true,
      schema
    };
    setForm(form);
    toast('Yüklendi');
  }catch(e){ toast('Yüklenemedi: '+e.message,'err'); }
}

function validate(slug){
  if (!/^[a-z0-9-]{2,}$/.test(slug)) return 'Slug [a-z0-9-] olmalı (min 2).';
  if (fields.length===0) return 'En az bir alan ekleyin.';
  const names = fields.map(f=>f.name);
  if (names.some(n=>!/^[a-zA-Z0-9_]{2,}$/.test(n))) return 'Alan adları [a-zA-Z0-9_] ve min 2 harf olmalı.';
  const dup = names.find((n,i)=> names.indexOf(n)!==i);
  if (dup) return `"${dup}" alan adı tekrarlı.`;
  return null;
}

async function save(){
  const slug = els.slug.value.trim();
  const err = validate(slug);
  if (err) return toast(err,'err');

  const body = {
    slug,
    title: els.title.value.trim() || slug,
    description: els.description.value.trim() || null,
    active: els.active.value === 'true',
    schema: { fields }
  };

  const headers = {'Content-Type':'application/json'};
  const token = localStorage.getItem('ADMIN_TOKEN'); // tarayıcıya bir kez kaydedin
  if (token) headers['X-Admin-Token'] = token;

  try{
    const r = await fetch(API_FORM_WRITE, {
      method:'POST',
      headers,
      body: JSON.stringify(body)
    });
    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('application/json') ? await r.json() : null;
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    toast('Kaydedildi ✓','ok');
  }catch(e){
    toast('Hata: '+e.message,'err');
  }
}

// UI
els.btnAdd.onclick = ()=>{ fields.push(blankField()); render(); };
els.btnNew.onclick = ()=>{ els.title.value=''; els.description.value=''; els.active.value='true'; fields=[]; render(); };
els.btnLoad.onclick= load;
els.btnSave.onclick= save;

// URL param’dan otomatik yükle
const uSlug = new URLSearchParams(location.search).get('slug');
if (uSlug){ els.slug.value = uSlug; load(); }
</script>
