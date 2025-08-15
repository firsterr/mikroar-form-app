// helpers
const $ = (s) => document.querySelector(s);
const el = (t, a={}, ...kids) => {
  const e = document.createElement(t);
  for (const [k,v] of Object.entries(a)) (k==='class') ? e.className=v : e.setAttribute(k,v);
  for (const c of kids) e.append(typeof c==='string' ? document.createTextNode(c) : c);
  return e;
};

// basic auth
function getAuthHeader(){
  let a = sessionStorage.getItem('admAuth');
  if(!a){
    const u = prompt('Admin kullanıcı adı:');
    const p = prompt('Admin şifre:');
    a = 'Basic ' + btoa(`${u}:${p}`);
    sessionStorage.setItem('admAuth', a);
  }
  return a;
}

// slug'ı otomatik kebab-case yapmak (boşluk → -, küçük harf)
$('#slug').addEventListener('input', (e)=>{
  e.target.value = e.target.value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // aksanları sil
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
});

const TYPES = [
  { v:'likert5', t:'Likert (5 seçenek)' },
  { v:'radio',   t:'Tek seçenek (radio)' },
  { v:'checkbox',t:'Çoklu seçenek (checkbox)' },
  { v:'text',    t:'Metin' }
];

const questionsEl = $('#questions');

function addQuestion(q={ label:'Yeni soru', type:'likert5', required:true, options:[] }) {
  const box = el('div', { class:'q' });

  // üst satır
  const row = el('div',{class:'row'},
    el('div',{style:'flex:1'},
      el('label',{},'Soru'),
      el('input',{'data-k':'label',value:q.label})
    ),
    el('div',{style:'width:220px'},
      el('label',{},'Tip'),
      (()=>{ const s=el('select',{'data-k':'type'});
        for(const t of TYPES) s.append(el('option',{value:t.v, ...(q.type===t.v?{selected:true}:{})},t.t));
        // tip değişince seçenek alanını göster/gizle
        s.addEventListener('change',()=>toggleOptions());
        return s;
      })()
    ),
    el('div',{style:'width:160px'},
      el('label',{},'Zorunlu'),
      el('select',{'data-k':'required'},
        el('option',{value:'true', ...(q.required?{selected:true}:{})},'Evet'),
        el('option',{value:'false', ...(!q.required?{selected:true}:{})},'Hayır'),
      )
    ),
    el('div',{class:'right'},
      el('label',{},' '),
      (()=>{const b=el('button',{class:'danger',type:'button'},'Sil');
        b.addEventListener('click',()=>box.remove()); return b;})()
    )
  );

  // seçenekler
  const optsWrap = el('div',{},
    el('label',{},'Seçenekler (satır satır — sadece Radio/Checkbox)'),
    el('textarea',{'data-k':'options',rows:'3'},(q.options||[]).join('\n')),
    el('div',{class:'muted'},'Likert 5 tipinde seçenekler otomatik: Kesinlikle katılıyorum, Katılıyorum, Kararsızım, Katılmıyorum, Kesinlikle katılmıyorum')
  );

  function toggleOptions(){
    const type = box.querySelector('[data-k="type"]').value;
    optsWrap.style.display = (type==='radio' || type==='checkbox') ? 'block' : 'none';
  }

  box.append(row, optsWrap);
  questionsEl.append(box);
  toggleOptions();
}

function readQuestions(){
  const arr=[];
  for(const box of questionsEl.children){
    const q={};
    for(const input of box.querySelectorAll('[data-k]')){
      const k=input.getAttribute('data-k'); let v=input.value;
      if(k==='required') v = v==='true';
      if(k==='options') v = v ? v.split('\n').map(s=>s.trim()).filter(Boolean) : [];
      q[k]=v;
    }
    arr.push(q);
  }
  return arr;
}

// events
document.addEventListener('DOMContentLoaded', ()=>{
  $('#addQ').addEventListener('click',()=>addQuestion());
  $('#save').addEventListener('click', async ()=>{
    const slug = $('#slug').value.trim();
    const title = $('#title').value.trim();
    if(!slug || !title) return alert('Slug ve başlık zorunlu');

    const schema = { questions: readQuestions() };
    $('#status').textContent='Kaydediliyor…';
    const r = await fetch('/admin/api/forms',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':getAuthHeader()},
      body:JSON.stringify({ slug, title, active:true, schema })
    });
    const j = await r.json().catch(()=>null);
    $('#status').textContent = (j&&j.ok)?'Kaydedildi ✔':('Hata: '+(j?.error||''));
    if(!(j&&j.ok)) alert('Kaydedilemedi: '+(j?.error||'bilinmeyen hata'));
  });
});
