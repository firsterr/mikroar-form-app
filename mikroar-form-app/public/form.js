(function () {
  const params = new URLSearchParams(location.search);
  let slug = (params.get('slug') || '').trim();
  const DEFAULT = (window.DEFAULT_FORM_SLUG || 'formayvalik');

  // Slug yoksa otomatik yönlendir
  if (!slug) {
    location.replace(`/form.html?slug=${encodeURIComponent(DEFAULT)}`);
    return; // önemli: yönlendirme sonrası devam etmesin
  }

  // Başlık elemanı bulunamazsa yarat (çökmeyi önler)
  let titleEl = document.getElementById('title');
  if (!titleEl) {
    titleEl = document.createElement('h1');
    titleEl.id = 'title';
    document.body.prepend(titleEl);
  }

  // ... mevcut kodun burada devam edebilir
})();

/* MikroAR – Katılımcı Formu */
const $ = s => document.querySelector(s);
const toast=(m, type='')=>{
  const t=$('#toast'); t.textContent=m; t.style.display='block';
  t.style.borderColor = type==='err' ? '#ef4444' : 'var(--line)';
  setTimeout(()=>t.style.display='none',2000);
};

const els = {
  title: $('#title'),
  form:  $('#form'),
  send:  $('#btnSend'),
  card:  $('#formCard'),
  thanks:$('#thanks'),
};

const slug = new URLSearchParams(location.search).get('slug')
           || (window.__CFG && window.__CFG.defaultSlug);

if(!slug){
  toast('Slug eksik','err');
} else {
  load();
}

async function load(){
  try{
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'Bulunamadı');
    const form = j.form;
    els.title.textContent = form.title || slug;
    render(form.schema?.questions || []);
  }catch(e){ toast('Yüklenemedi: '+e.message,'err'); }
}

function el(tag, attrs={}, html=''){
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=> n.setAttribute(k,v));
  if(html) n.innerHTML = html;
  return n;
}

function render(questions){
  els.form.innerHTML='';
  questions.forEach((q,qi)=>{
    const idBase = `q_${qi}`;
    const block = el('fieldset',{class:'q'});
    const legend = el('legend',{}, `${qi+1}. ${q.label || 'Soru'}` + (q.required? ' *':''));
    block.appendChild(legend);

    if(q.type==='radio' || q.type==='checkbox'){
      (q.options||[]).forEach((op,oi)=>{
        const id = `${idBase}_${oi}`;
        const line = el('label',{for:id,class:'opt'});
        const inp = el('input',{type:q.type,name:idBase,id});
        // büyük tıklama alanı
        const text = el('span',{}, op);
        line.append(inp,text);
        block.appendChild(line);
      });
    } else if(q.type==='textarea'){
      const ta = el('textarea',{name:idBase,placeholder:'Yanıtınızı yazın...'});
      ta.className='text';
      const wrap = el('div',{class:'text'}); wrap.appendChild(ta);
      block.appendChild(wrap);
    } else { // text
      const inp = el('input',{type:'text',name:idBase,placeholder:'Yanıtınızı yazın...'});
      const wrap = el('div',{class:'text'}); wrap.appendChild(inp);
      block.appendChild(wrap);
    }

    els.form.appendChild(block);
  });

  els.send.onclick = (e)=>{ e.preventDefault(); submit(questions); };
}

function collect(questions){
  const answers = {};
  let valid = true;

  questions.forEach((q,qi)=>{
    const idBase = `q_${qi}`;
    let value = null;

    if(q.type==='radio'){
      const sel = document.querySelector(`input[name="${idBase}"]:checked`);
      value = sel ? sel.nextSibling.textContent : null;
    } else if(q.type==='checkbox'){
      value = Array.from(document.querySelectorAll(`input[name="${idBase}"]:checked`))
                   .map(inp => inp.nextSibling.textContent);
      if(value.length===0) value = null;
    } else {
      const inp = document.querySelector(`[name="${idBase}"]`);
      value = inp?.value?.trim() || null;
    }

    if(q.required && (value===null || value==='' || (Array.isArray(value)&&value.length===0))){
      valid = false;
    }
    // çıktıda anahtar olarak SORU METNİ’ni kullan
    answers[q.label || `Soru ${qi+1}`] = value;
  });

  return {valid, payload:{answers}};
}

async function submit(questions){
  const {valid, payload} = collect(questions);
  if(!valid) return toast('Lütfen zorunlu soruları doldurun','err');

  try{
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    const j = await r.json();
    if(!j.ok) throw new Error(j.error||'Kaydedilemedi');
    // teşekkür
    els.card.style.display='none';
    els.thanks.style.display='block';
  }catch(e){ toast('Hata: '+e.message,'err'); }
}
