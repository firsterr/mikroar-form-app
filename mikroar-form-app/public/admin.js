// /public/admin.js
(() => {
  const API = '/api';
  const $  = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));

  // ---- Sekmeler
  const tabs = $$('.tab');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    $$('.panel').forEach(p => p.classList.remove('active'));
    t.classList.add('active');
    $('#panel-' + t.dataset.tab).classList.add('active');
  }));

  // ---- Admin Token
  function getToken(){
    let t = localStorage.getItem('ADMIN_TOKEN') || '';
    if(!t){ t = prompt('Admin token:') || ''; if(t) localStorage.setItem('ADMIN_TOKEN', t); }
    return t;
  }
  async function api(url, opts={}){
    const headers = Object.assign(
      {'Accept':'application/json'},
      opts.headers || {},
      {'X-Admin-Token': getToken()}
    );
    const res = await fetch(url, { ...opts, headers });
    const txt = await res.text();
    let j; try{ j = txt ? JSON.parse(txt) : {}; }catch{ j = {ok:false,message:txt}; }
    if(!res.ok || j.ok === false){ throw new Error(j.message || j.error || `HTTP ${res.status}`); }
    return j;
  }
  function toast(msg, ok=true){
    const el = ok ? $('#toast') : $('#toaste');
    el.textContent = msg;
    el.className = ok ? 'ok' : 'err';
    el.style.display = 'block';
    setTimeout(()=> el.style.display='none', 2400);
  }

  // ---- Soru satırı
  function makeRow(field={type:'text',name:'',label:'',required:false}){
    const row = document.createElement('div');
    row.className = 'q-row';
    row.innerHTML = `
      <div class="q-grid">
        <select class="q-type">
          <option value="text">Metin</option>
          <option value="email">E-posta</option>
          <option value="textarea">Metin (uzun)</option>
          <option value="radio">Tek seçim</option>
          <option value="checkbox">Çoklu seçim</option>
        </select>
        <input class="q-name"  type="text" placeholder="alan (örn. ad)">
        <input class="q-label" type="text" placeholder="Etiket (örn. Ad)">
        <label class="q-req"><input class="q-required" type="checkbox"> Zorunlu</label>
        <button type="button" class="q-del">Sil</button>
      </div>
      <div class="q-options" style="display:none">
        <input class="q-opts" type="text" placeholder="Seçenekleri virgülle yazın (A,B,C)">
      </div>`;
    $('.q-type',row).value = field.type || 'text';
    $('.q-name',row).value = field.name || '';
    $('.q-label',row).value = field.label || '';
    $('.q-required',row).checked = !!field.required;

    if(field.type==='radio' || field.type==='checkbox'){
      $('.q-options',row).style.display = '';
      $('.q-opts',row).value = (field.options||[]).join(',');
    }
    $('.q-type',row).addEventListener('change',e=>{
      $('.q-options',row).style.display = (e.target.value==='radio'||e.target.value==='checkbox')?'':'none';
    });
    $('.q-del',row).addEventListener('click',()=>row.remove());
    return row;
  }
  function render(container, fields=[]){
    container.innerHTML = '';
    (fields.length?fields:[{}]).forEach(f=>container.appendChild(makeRow(f)));
  }
  function collect(container){
    return $$('.q-row',container).map(r=>{
      const type = $('.q-type',r).value || 'text';
      const name = $('.q-name',r).value.trim();
      const label= $('.q-label',r).value.trim();
      const required = $('.q-required',r).checked;
      if(!name) return null;
      const f = {type,name,label,required};
      if(type==='radio'||type==='checkbox'){
        const raw = ($('.q-opts',r).value||'').trim();
        f.options = raw ? raw.split(',').map(s=>s.trim()).filter(Boolean) : [];
      }
      return f;
    }).filter(Boolean);
  }

  // ===== OLUŞTUR =====
  const elsC = {
    slug: $('#slug'), title:$('#title'), desc:$('#description'),
    status:$('#status'), qs:$('#qsCreate'), btnAdd:$('#btnAddCreate'), btnSave:$('#btnSaveCreate'),
    summary:$('#summary')
  };
  render(elsC.qs, []);

  elsC.btnAdd.addEventListener('click',()=> elsC.qs.appendChild(makeRow()));
  elsC.btnSave.addEventListener('click', async ()=>{
    try{
      const slug = (elsC.slug.value||'').trim();
      if(!/^[a-z0-9-]+$/i.test(slug)) throw new Error('Geçerli bir slug girin (harf-sayı-tire).');
      const title = (elsC.title.value||'').trim();
      if(!title) throw new Error('Başlık gerekli.');
      const fields = collect(elsC.qs);
      if(!fields.length) throw new Error('En az bir soru ekleyin.');

      const body = JSON.stringify({
        slug, title, description: elsC.desc.value||'',
        active: (elsC.status.value==='Aktif'),
        schema: { fields }
      });
      const j = await api(`${API}/forms-admin`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
      elsC.summary.textContent = `Oluşturuldu: ${new Date().toLocaleString()} — slug: ${slug}`;
      toast('Kaydedildi');
    }catch(e){ toast(e.message,false); }
  });

  // ===== DUZENLE =====
  const elsE = {
    sel:$('#selForm'), btnLoad:$('#btnLoad'), title:$('#titleE'), desc:$('#descriptionE'),
    status:$('#statusE'), qs:$('#qsEdit'), btnAdd:$('#btnAddEdit'), btnSave:$('#btnSaveEdit'),
    summary:$('#summaryE'), currentSlug:null
  };

  async function refreshList(){
    try{
      const j = await api(`${API}/forms-list`);
      elsE.sel.innerHTML = j.forms.map(f=>`<option value="${f.slug}">${f.title||f.slug}${f.active?'':' (pasif)'}</option>`).join('');
    }catch(e){ toast('Liste alınamadı: '+e.message,false); }
  }
  refreshList();

  elsE.btnLoad.addEventListener('click', async ()=>{
    const slug = elsE.sel.value;
    if(!slug) return;
    try{
      const j = await api(`${API}/forms-admin?slug=${encodeURIComponent(slug)}`);
      const form = j.form || j.data || j;
      elsE.currentSlug = form.slug;
      elsE.title.value = form.title || '';
      elsE.desc.value  = form.description || '';
      elsE.status.value= form.active ? 'Aktif':'Pasif';
      elsE.summary.textContent = `Slug: ${form.slug} • Oluşturuldu: ${form.created_at?new Date(form.created_at).toLocaleString():'—'}`;
      const schema = form.schema || {};
      const fields = schema.fields || schema.questions || [];
      render(elsE.qs, fields);
      toast('Yüklendi');
    }catch(e){ toast('Yüklenemedi: '+e.message,false); }
  });

  elsE.btnAdd.addEventListener('click',()=> elsE.qs.appendChild(makeRow()));
  elsE.btnSave.addEventListener('click', async ()=>{
    try{
      if(!elsE.currentSlug) throw new Error('Önce bir form yükleyin.');
      const fields = collect(elsE.qs);
      if(!fields.length) throw new Error('En az bir soru olmalı.');
      const body = JSON.stringify({
        slug: elsE.currentSlug,
        title: elsE.title.value||'',
        description: elsE.desc.value||'',
        active: (elsE.status.value==='Aktif'),
        schema: { fields }
      });
      await api(`${API}/forms-admin`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
      toast('Güncellendi');
    }catch(e){ toast(e.message,false); }
  });

  // — Bu sayfada slug otomatik çağırma YOK —
})();
