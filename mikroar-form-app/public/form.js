const params = new URLSearchParams(location.search);
const slug = params.get('slug') || params.get('form');
const formEl = document.getElementById('form');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');

function radio(name, opts, req){
  const d=document.createElement('div');
  for(const o of opts){
    const l=document.createElement('label'); l.className='opt';
    const i=document.createElement('input'); i.type='radio'; i.name=name; i.value=o; if(req) i.required=true;
    l.append(i,document.createTextNode(' '+o)); d.append(l);
  }
  return d;
}
function checkbox(name, opts, req){
  const d=document.createElement('div');
  for(const o of opts){
    const l=document.createElement('label'); l.className='opt';
    const i=document.createElement('input'); i.type='checkbox'; i.name=name; i.value=o; if(req) i.required=false; // checkbox'da HTML-level required sorunlu: kontrol submitte
    l.append(i,document.createTextNode(' '+o)); d.append(l);
  }
  return d;
}
function likert5(name, req){
  const opts=['Kesinlikle katılıyorum','Katılıyorum','Kararsızım','Katılmıyorum','Kesinlikle katılmıyorum'];
  return radio(name, opts, req);
}

(async function init(){
  if(!slug){ titleEl.textContent='slug parametresi gerekli'; return; }
  const r = await fetch('/api/forms/'+encodeURIComponent(slug));
  const j = await r.json().catch(()=>null);
  if(!j || !j.ok){ titleEl.textContent = j?.error || 'Form bulunamadı'; return; }

  titleEl.textContent = j.form.title || 'Anket';

  const qs = (j.form.schema?.questions) || [];
  qs.forEach((q,idx)=>{
    const wrap=document.createElement('div'); wrap.className='q';
    const h=document.createElement('h3'); h.textContent=(idx+1)+'. '+q.label; wrap.append(h);
    let input;
    if(q.type==='likert5') input = likert5('q'+(idx+1), q.required);
    else if(q.type==='radio') input = radio('q'+(idx+1), q.options||[], q.required);
    else if(q.type==='checkbox') input = checkbox('q'+(idx+1), q.options||[], q.required);
    else { input=document.createElement('input'); input.type='text'; input.name='q'+(idx+1); if(q.required) input.required=true; }
    wrap.append(input);
    formEl.append(wrap);
  });

  const btn=document.createElement('button'); btn.type='submit'; btn.textContent='Gönder';
  formEl.append(btn);

  formEl.addEventListener('submit', async (e)=>{
    e.preventDefault();
    statusEl.textContent='Gönderiliyor…';

    // cevapları schema'ya göre topla
    const payload = {};
    qs.forEach((q,idx)=>{
      const name = 'q'+(idx+1);
      if(q.type==='checkbox'){
        payload[name] = Array.from(formEl.querySelectorAll(`input[name="${name}"]:checked`)).map(i=>i.value);
        if(q.required && (!payload[name] || payload[name].length===0)){
          statusEl.textContent='Lütfen tüm zorunlu alanları işaretleyin.'; throw new Error('required');
        }
      }else{
        const el = formEl.querySelector(`[name="${name}"]`);
        if(q.type==='text') payload[name] = el.value || '';
        else payload[name] = (formEl.querySelector(`input[name="${name}"]:checked`)||{}).value || '';
      }
    });

    const rr = await fetch('/api/forms/'+encodeURIComponent(slug)+'/submit',{
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
    });
    const t = await rr.text(); let jj; try{ jj=JSON.parse(t);}catch{}
    if(rr.ok && jj && jj.ok) location.href='/thanks.html';
    else { statusEl.textContent='Hata: '+(jj?.error||t); alert('Gönderilemedi: '+(jj?.error||t)); }
  });
})();
