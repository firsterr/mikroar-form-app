(function () {
  const $  = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const els = { title: $('#title'), form: $('#form'), err: $('#err'), send: $('#send') };

  async function resolveSlug() {
    const qp = new URLSearchParams(location.search);
    const s  = (qp.get('slug') || '').trim();
    if (s) return s;
    const m = location.pathname.match(/^\/f\/([A-Za-z0-9_-]{4,64})$/);
    if (!m) throw new Error('slug veya kısa kod bulunamadı');
    const code = m[1];
    const r = await fetch(`/api/resolve-short/${encodeURIComponent(code)}`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Kısa kod çözülemedi');
    return j.slug;
  }

  function clear(el){ while(el.firstChild) el.removeChild(el.firstChild); }
  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){ if(v==null) continue; if(k in n) n[k]=v; else n.setAttribute(k,String(v)); }
    (Array.isArray(children)?children:[children]).forEach(c => n.appendChild(c instanceof Node?c:document.createTextNode(String(c))));
    return n;
  }

  function renderForm(questions=[]){
    clear(els.form);
    questions.forEach((q, i) => {
      const key  = q.key || q.name || `q_${i}`;
      const text = q.text || q.title || `Soru ${i+1}`;
      const type = String(q.type || 'text').toLowerCase();

      const wrap = el('div',{className:'field'});
      wrap.appendChild(el('label',{htmlFor:key},`${i+1}. ${text}`));

      let input;
      if (type==='text') input = el('input',{id:key,name:key,type:'text',className:'input'});
      else if (type==='textarea') input = el('textarea',{id:key,name:key,rows:4,className:'textarea'});
      else if (type==='select'){
        input = el('select',{id:key,name:key,className:'select'});
        (q.options||[]).forEach(opt=>input.appendChild(el('option',{value:String(opt)},String(opt))));
      }
      else if (type==='radio'){
        input = el('div');
        (q.options||[]).forEach((opt,k)=>{
          const rid = `${key}_${k}`;
          input.appendChild(el('label',{},[
            el('input',{type:'radio',name:key,value:String(opt),id:rid}),
            ' ', String(opt)
          ]));
        });
      }
      else if (type==='checkbox'){
        input = el('div');
        (q.options||[]).forEach((opt,k)=>{
          const cid = `${key}_${k}`;
          input.appendChild(el('label',{},[
            el('input',{type:'checkbox',name:key,value:String(opt),id:cid}),
            ' ', String(opt)
          ]));
        });
      }
      else input = el('input',{id:key,name:key,type:'text',className:'input'});

      wrap.appendChild(input);
      els.form.appendChild(wrap);
    });
  }

  async function submitAnswers(slug){
    try{
      els.send.disabled = true;
      const answers = {};
      $$('input[type="text"], textarea, select', els.form).forEach(inp => answers[inp.name]=inp.value);
      const radios = {}; $$('input[type="radio"]', els.form).forEach(r => (radios[r.name] ||= []).push(r));
      Object.entries(radios).forEach(([n,arr]) => { const c = arr.find(r=>r.checked); answers[n]=c?c.value:''; });
      const checks = {}; $$('input[type="checkbox"]', els.form).forEach(c => (checks[c.name] ||= []).push(c));
      Object.entries(checks).forEach(([n,arr]) => { answers[n]=arr.filter(c=>c.checked).map(c=>c.value); });

      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(answers)
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `Sunucu ${r.status}`);
      els.err.hidden = true; els.err.textContent='';
      alert('Teşekkürler! Cevabınız kaydedildi.');
    }catch(e){
      els.err.hidden=false; els.err.textContent=`Gönderilemedi: ${e.message||e}`;
    }finally{ els.send.disabled=false; }
  }

  async function main(){
    try{
      const slug = await resolveSlug();
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Form yüklenemedi');

      const form = j.form || {};
      const q = form.schema && Array.isArray(form.schema?.questions)
        ? form.schema.questions
        : (Array.isArray(form.schema) ? form.schema : []);

      if (els.title) els.title.textContent = form.title || slug;
      document.title = (form.title || slug) + ' – MikroAR';
      renderForm(q);

      els.send.onclick = (ev)=>{ ev.preventDefault(); submitAnswers(slug); };
    }catch(e){
      els.err.hidden=false; els.err.textContent=`Yüklenemedi: ${e.message||e}`;
      if (els.send) els.send.disabled=true;
    }
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
