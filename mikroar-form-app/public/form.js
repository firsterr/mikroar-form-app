(async function () {
  const qs   = new URLSearchParams(location.search);
  const slug = qs.get('slug');

  const elTitle = document.getElementById('title');
  const elWrap  = document.getElementById('questions');
  const elFrm   = document.getElementById('frm');
  const elMsg   = document.getElementById('msg');

  if (!slug) {
    elMsg.innerHTML = '<span style="color:#ff8b8b">slug parametresi yok.</span>';
    elFrm.querySelector('#send').disabled = true;
    return;
  }

  function fieldName(i){ return `q${i}`; }
  function qText(q){ return q.label || q.text || q.question || 'Soru'; }

  function renderQuestion(q, idx){
    const name = fieldName(idx);
    const wrap = document.createElement('div');
    wrap.className = 'q';
    wrap.innerHTML = `<label class="title">${idx+1}. ${qText(q)}${q.required ? ' *' : ''}</label>`;
    const type = (q.type || '').toLowerCase();

    if (type === 'radio' || type === 'tek' || type === 'single'){
      const box = document.createElement('div'); box.className='opts';
      (q.options||[]).forEach(opt=>{
        const id = `${name}_${btoa(opt).replace(/=/g,'')}`;
        box.insertAdjacentHTML('beforeend',
          `<label><input type="radio" id="${id}" name="${name}" value="${opt}"> ${opt}</label>`);
      });
      wrap.appendChild(box);
    }
    else if (type === 'checkbox' || type === 'multi' || type === 'çoklu'){
      const box = document.createElement('div'); box.className='opts';
      (q.options||[]).forEach(opt=>{
        const id = `${name}_${btoa(opt).replace(/=/g,'')}`;
        box.insertAdjacentHTML('beforeend',
          `<label><input type="checkbox" id="${id}" name="${name}" value="${opt}"> ${opt}</label>`);
      });
      wrap.appendChild(box);
    }
    else if (type === 'select'){
      const sel = document.createElement('select'); sel.name = name;
      sel.innerHTML = `<option value="">Seçiniz</option>` + (q.options||[]).map(o=>`<option>${o}</option>`).join('');
      wrap.appendChild(sel);
    }
    else if (type === 'textarea'){
      const ta = document.createElement('textarea'); ta.name = name; ta.rows = 4;
      wrap.appendChild(ta);
    }
    else {
      const inp = document.createElement('input'); inp.type='text'; inp.name=name;
      wrap.appendChild(inp);
    }
    return wrap;
  }

  // --- Formu getir
  try{
    const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if(!res.ok) throw new Error('Sunucu '+res.status+' döndürdü');
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || 'Bilinmeyen hata');

    const form = data.form;
    elTitle.textContent = form.title || slug;

    const questions = (form.schema && form.schema.questions) ? form.schema.questions : [];
    elWrap.innerHTML = '';
    questions.forEach((q, i)=> elWrap.appendChild(renderQuestion(q, i)));

    // --- Gönder
    elFrm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const answers = {};
      questions.forEach((q, i)=>{
        const name = fieldName(i);
        if ((q.type||'').toLowerCase()==='checkbox'){ // çoklu
          answers[qText(q)] = Array.from(elFrm.querySelectorAll(`input[name="${name}"]:checked`)).map(x=>x.value);
        }else{
          const el = elFrm.querySelector(`[name="${name}"]`);
          answers[qText(q)] = el ? el.value : null;
        }
      });

      try{
        const s = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ answers })
        });
        const j = await s.json();
        if(!s.ok || !j.ok) throw new Error(j.error || ('HTTP '+s.status));
        elMsg.textContent = 'Teşekkürler, yanıtlarınız kaydedildi.';
      }catch(err){
        elMsg.innerHTML = `<span style="color:#ff8b8b">Gönderilemedi:</span> ${err.message}`;
      }
    });

  }catch(err){
    elWrap.innerHTML = '';
    elMsg.innerHTML = `<span style="color:#ff8b8b">Yüklenemedi:</span> ${err.message}`;
    elFrm.querySelector('#send').disabled = true;
  }
})();
