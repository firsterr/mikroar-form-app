// Basit util
const $ = s => document.querySelector(s);
const el = (tag, attrs={}, children=[])=>{
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if (k==='class') n.className=v;
    else if (k==='html') n.innerHTML=v;
    else n.setAttribute(k,v);
  });
  [].concat(children).forEach(c => n.append(c));
  return n;
};

// Soru tipleri
const TYPES = [
  {value:'short_text', label:'Kısa Yanıt'},
  {value:'paragraph',  label:'Paragraf'},
  {value:'radio',      label:'Tek Seçenek (radio)'},
  {value:'checkbox',   label:'Çoklu Seçenek (checkbox)'},
  {value:'dropdown',   label:'Açılır Liste'},
  {value:'linear',     label:'Ölçek / Likert (kendi etiketlerin)'}
];

const state = {
  questions: []
};

// Soru kartı oluştur
function renderQuestion(q) {
  const card = el('div',{class:'card'});
  const head = el('div',{class:'q-head'});
  const title = el('input',{type:'text', value:q.label||'', placeholder:'Soru metni'});
  const type  = el('select');
  TYPES.forEach(t=> type.append(el('option',{value:t.value, html:t.label})));
  type.value = q.type || 'short_text';
  const req   = el('select',{},[
    el('option',{value:'false',html:'Zorunlu değil'}),
    el('option',{value:'true', html:'Zorunlu'})
  ]);
  req.value = q.required ? 'true' : 'false';

  const actions = el('div',{class:'q-actions'},[
    el('button',{class:'btn', html:'↑'},), 
    el('button',{class:'btn', html:'↓'},),
    el('button',{class:'btn danger', html:'Sil'})
  ]);
  head.append(title,type,req,actions);
  card.append(head);

  // Seçenek alanı (radio/checkbox/dropdown)
  const optWrap = el('div',{class: (['radio','checkbox','dropdown'].includes(type.value)?'':'hidden')});
  const optsLabel = el('div',{class:'muted',html:'Seçenekler (her satıra bir seçenek yaz):'});
  const opts = el('textarea'); opts.value = (q.options||[]).join('\n');
  optWrap.append(optsLabel,opts);
  card.append(optWrap);

  // Linear scale alanı
  const scaleWrap = el('div',{class: (type.value==='linear'?'':'hidden')});
  scaleWrap.append(el('div',{class:'grid2'},[
    el('div',{},[
      el('div',{class:'muted',html:'Minimum (sayı)'}),
      el('input',{type:'number', value:q.min ?? 1, min:'1'})
    ]),
    el('div',{},[
      el('div',{class:'muted',html:'Maksimum (sayı)'}),
      el('input',{type:'number', value:q.max ?? 5, min:'2'})
    ]),
    el('div',{},[
      el('div',{class:'muted',html:'Sol Etiket'}),
      el('input',{type:'text', value:q.minLabel ?? 'Katılmıyorum'})
    ]),
    el('div',{},[
      el('div',{class:'muted',html:'Sağ Etiket'}),
      el('input',{type:'text', value:q.maxLabel ?? 'Katılıyorum'})
    ])
  ]));
  card.append(scaleWrap);

  // Tip değişince görünürlükler
  type.addEventListener('change', ()=>{
    optWrap.classList.toggle('hidden', !['radio','checkbox','dropdown'].includes(type.value));
    scaleWrap.classList.toggle('hidden', type.value!=='linear');
  });

  // Sıralama ve silme
  actions.children[0].onclick = ()=> moveQuestion(q._id,-1);
  actions.children[1].onclick = ()=> moveQuestion(q._id, 1);
  actions.children[2].onclick = ()=> removeQuestion(q._id);

  // Kartı state ile bağla
  q._dom = {card,title,type,req,opts,scaleWrap};

  return card;
}

// Ekle / Sil / Taşı
function addQuestion(initial={}){
  const q = {
    _id: crypto.randomUUID(),
    label: initial.label||'',
    type:  initial.type||'short_text',
    required: !!initial.required,
    options: initial.options||[],
    min: initial.min ?? 1,
    max: initial.max ?? 5,
    minLabel: initial.minLabel ?? 'Katılmıyorum',
    maxLabel: initial.maxLabel ?? 'Katılıyorum'
  };
  state.questions.push(q);
  $('#questions').append(renderQuestion(q));
}
function removeQuestion(id){
  const i = state.questions.findIndex(x=>x._id===id);
  if(i>-1){ state.questions.splice(i,1); document.querySelector(`#questions .card:nth-child(${i+1})`).remove(); }
}
function moveQuestion(id,dir){
  const i = state.questions.findIndex(x=>x._id===id);
  const ni = i+dir;
  if(ni<0 || ni>=state.questions.length) return;
  [state.questions[i],state.questions[ni]] = [state.questions[ni],state.questions[i]];
  const qs = [...document.querySelectorAll('#questions .card')];
  const parent = $('#questions');
  parent.insertBefore(qs[i], dir<0 ? qs[ni] : qs[ni].nextSibling);
}

// Formu topla
function collect(){
  const slug = $('#slug').value.trim();
  const title = $('#title').value.trim();
  if(!slug || !title) throw new Error('Slug ve başlık gerekli');

  const questions = state.questions.map(q=>{
    const dom = q._dom;
    const type = dom.type.value;
    const base = {
      label: dom.title.value.trim(),
      type,
      required: dom.req.value==='true'
    };
    if(['radio','checkbox','dropdown'].includes(type)){
      base.options = dom.opts.value
        .split('\n').map(s=>s.trim()).filter(Boolean);
    }
    if(type==='linear'){
      const [minIn,maxIn,minL,maxL] = dom.scaleWrap.querySelectorAll('input');
      base.min = parseInt(minIn.value||'1',10);
      base.max = parseInt(maxIn.value||'5',10);
      base.minLabel = minL.value||'';
      base.maxLabel = maxL.value||'';
    }
    return base;
  });

  return { slug, title, questions };
}

// Kaydet
async function save(){
  try{
    const payload = collect();
    $('#status').textContent = 'Kaydediliyor…';
    const auth = sessionStorage.getItem('admAuth') || (
      'Basic '+btoa(prompt('Kullanıcı adı?','admin')+':'+prompt('Şifre?','1234'))
    );
    sessionStorage.setItem('admAuth', auth);

    const r = await fetch('/admin/api/forms', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':auth},
      body: JSON.stringify(payload)
    });
    const t = await r.text(); let j; try{j=JSON.parse(t)}catch(e){}
    if(r.ok && (j?.success || j?.ok)){
      $('#status').textContent = 'Kaydedildi ✓';
      alert('Kaydedildi');
    }else{
      console.error('save error', r.status, t);
      $('#status').textContent = 'Hata';
      alert(`Kaydedilemedi (${r.status})\n${j?.error||t}`);
    }
  }catch(e){
    alert(e.message);
  }
}

// Başlangıç
$('#addQuestion').onclick = ()=> addQuestion();
$('#saveForm').onclick = ()=> save();

// İlk boş kart
addQuestion();
