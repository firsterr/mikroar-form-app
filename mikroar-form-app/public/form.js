(async () => {
  const $ = s => document.querySelector(s);
  const root = $('#root');
  const btn  = $('#send');
  const actions = $('#actions');
  const slug = new URLSearchParams(location.search).get('slug');

  if(!slug){ root.innerHTML = '<div class="error">Slug yok.</div>'; return; }

  let res, txt, json;
  try{
    res = await fetch(`/api/forms/${encodeURIComponent(slug)}`, {cache:'no-store'});
    txt = await res.text();
  }catch(e){
    root.innerHTML = '<div class="error">İstek hatası: '+e.message+'</div>';
    return;
  }

  try{ json = JSON.parse(txt); }
  catch{ root.innerHTML = '<div class="error">JSON parse hatası — sunucu cevabı:\n\n'+txt+'</div>'; return; }

  if(!json || json.ok !== true){
    root.innerHTML = '<div class="error">API hata: ' + (json && json.error || 'bilinmeyen') + '</div>';
    return;
  }

  const form = json.form || {};
  $('#title').textContent = form.title || 'Anket';

  let schema = form.schema;
  try{ if(typeof schema === 'string') schema = JSON.parse(schema); }catch(_){}
  const questions = Array.isArray(schema)
      ? schema
      : (schema && Array.isArray(schema.questions) ? schema.questions : []);

  if(!questions.length){
    root.innerHTML = '<div class="muted">Bu ankette henüz soru yok.</div>';
    return;
  }

  root.innerHTML = '';
  questions.forEach((q, i) => {
    const card = document.createElement('div'); card.className = 'card';
    const title = document.createElement('div'); title.className = 'q';
    const label = q.label || q.text || `Soru ${i+1}`;
    title.textContent = `${i+1}. ${label}` + (q.required ? ' *' : '');
    card.appendChild(title);

    const t = String(q.type || 'radio').toLowerCase();
    const name = `q_${i}`;

    if (t === 'checkbox'){
      (q.options || []).forEach(opt => {
        const row = document.createElement('label'); row.className='opt';
        const inp = document.createElement('input'); inp.type='checkbox'; inp.name=name; inp.value=opt;
        row.appendChild(inp); row.appendChild(document.createTextNode(opt));
        card.appendChild(row);
      });

    } else if (t === 'radio' || t === 'çoktan seçmeli' || t === 'coktan secmeli'){
      (q.options || []).forEach(opt => {
        const row = document.createElement('label'); row.className='opt';
        const inp = document.createElement('input'); inp.type='radio'; inp.name=name; inp.value=opt;
        row.appendChild(inp); row.appendChild(document.createTextNode(opt));
        card.appendChild(row);
      });

    } else if (t === 'dropdown' || t === 'select'){
      const row = document.createElement('div'); row.className='opt';
      const sel = document.createElement('select'); sel.name=name;
      (q.options || []).forEach(opt => { const o=document.createElement('option'); o.value=opt; o.textContent=opt; sel.appendChild(o); });
      row.appendChild(sel); card.appendChild(row);

    } else if (t === 'text'){
      const row = document.createElement('div'); row.className='opt';
      const inp = document.createElement('input'); inp.type='text'; inp.name=name;
      row.appendChild(inp); card.appendChild(row);

    } else if (t === 'textarea'){
      const row = document.createElement('div'); row.className='opt';
      const ta = document.createElement('textarea'); ta.name=name;
      row.appendChild(ta); card.appendChild(row);

    } else {
      const row = document.createElement('div'); row.className='opt';
      const inp = document.createElement('input'); inp.type='text'; inp.name=name;
      row.appendChild(inp); card.appendChild(row);
    }

    root.appendChild(card);
  });

  actions.style.display = 'block';
  btn.onclick = async () => {
    const answers = {};
    for (let i=0;i<questions.length;i++){
      const q = questions[i];
      const name = `q_${i}`;
      const t = String(q.type||'radio').toLowerCase();
      let val = null;

      if (t==='checkbox'){
        val = [...root.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);
      } else if (t==='radio' || t==='çoktan seçmeli' || t==='coktan secmeli'){
        const el = root.querySelector(`input[name="${name}"]:checked`);
        val = el ? el.value : null;
      } else if (t==='dropdown' || t==='select'){
        const el = root.querySelector(`select[name="${name}"]`);
        val = el ? el.value : null;
      } else if (t==='text' || t==='textarea'){
        const el = root.querySelector(`[name="${name}"]`);
        val = el ? el.value : null;
      }

      if (q.required){
        const empty = (val==null) || (Array.isArray(val)&&val.length===0) || (typeof val==='string' && val.trim()==='');
        if (empty){ alert(`${i+1}. soru zorunlu`); return; }
      }

      const key = q.label || q.text || `Soru ${i+1}`;
      answers[key] = val;
    }

    btn.disabled = true;
    try{
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({answers})
      });
      const j = await r.json().catch(()=> ({}));
      if(j && j.ok){ location.href='/thanks.html'; }
      else{ alert('Kaydetme hatası: ' + (j.error||'bilinmeyen')); btn.disabled=false; }
    }catch(e){
      alert('İstek hatası: '+e.message); btn.disabled=false;
    }
  };
})();
