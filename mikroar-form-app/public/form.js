const qs = (s, r=document) => r.querySelector(s);

const params = new URLSearchParams(location.search);
const slug = params.get('slug');

const area = qs('#formArea');
const titleEl = qs('#title');
const statusEl = qs('#status');

let formDef = null;   // { title, schema: { questions:[...] } }

(async function init(){
  if(!slug){
    area.innerHTML = `<p class="muted">slug eksik (?slug=...)</p>`;
    return;
  }
  try{
    const res = await fetch(`/api/forms/${slug}`);
    if(!res.ok){
      const t = await res.text();
      throw new Error(`Form alınamadı: ${t}`);
    }
    const data = await res.json();

    // API dönüşünü normalize et:
    // - senin server.js -> { ok:true, form:{ title, schema } }
    // - eski basit sürüm -> { title, questions } veya { schema:{questions} }
    let formObj = data?.form || data || {};
    let schema = formObj.schema || formObj; // schema yoksa kök objeyi dene

    // title belirle
    const title = formObj.title || schema.title || 'Anket';
    titleEl.textContent = title;

    // questions
    const questions = schema.questions || [];
    if(!Array.isArray(questions) || questions.length === 0){
      area.innerHTML = `<p class="muted">Bu ankette henüz soru yok.</p>`;
      return;
    }

    formDef = { slug, title, questions };
    renderQuestions(questions);
  }catch(e){
    console.error(e);
    area.innerHTML = `<p class="muted">${e.message}</p>`;
  }
})();

function renderQuestions(questions){
  area.innerHTML = '';
  questions.forEach((q, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'q';
    wrap.dataset.key = `q_${idx}`;

    const lab = document.createElement('label');
    lab.textContent = q.label + (q.required ? ' *' : '');
    wrap.appendChild(lab);

    let field;
    switch(q.type){
      case 'short_text': {
        field = document.createElement('input');
        field.type = 'text';
        if(q.required) field.required = true;
        break;
      }
      case 'paragraph': {
        field = document.createElement('textarea');
        if(q.required) field.required = true;
        break;
      }
      case 'radio': {
        field = renderOptions('radio', `q_${idx}`, q.options || []);
        break;
      }
      case 'checkbox': {
        field = renderOptions('checkbox', `q_${idx}`, q.options || []);
        break;
      }
      case 'dropdown': {
        field = document.createElement('select');
        (q.options||[]).forEach(o=>{
          const opt = document.createElement('option');
          opt.value = opt.textContent = o;
          field.appendChild(opt);
        });
        if(q.required) field.required = true;
        break;
      }
      case 'linear': {
        field = renderLinear(`q_${idx}`, q);
        break;
      }
      default: {
        field = document.createElement('input');
        field.type='text';
        if(q.required) field.required = true;
      }
    }

    wrap.appendChild(field);
    area.appendChild(wrap);
  });
}

function renderOptions(kind, name, options){
  const box = document.createElement('div');
  box.className = 'opts';
  (options||[]).forEach((o)=>{
    const row = document.createElement('div');
    const inp = document.createElement('input');
    inp.type = kind;
    inp.name = name;
    inp.value = o;
    const lab = document.createElement('span');
    lab.textContent = ' ' + o;
    row.appendChild(inp); row.appendChild(lab);
    box.appendChild(row);
  });
  return box;
}

function renderLinear(name, q){
  const box = document.createElement('div');
  const min = Number(q.min ?? 1);
  const max = Number(q.max ?? 5);
  const row = document.createElement('div');
  row.className = 'opts';

  for(let i=min;i<=max;i++){
    const r = document.createElement('div');
    const inp = document.createElement('input');
    inp.type='radio'; inp.name=name; inp.value=String(i);
    const lab = document.createElement('span'); lab.textContent = ' '+i;
    r.appendChild(inp); r.appendChild(lab);
    row.appendChild(r);
  }
  const hint = document.createElement('div');
  hint.className = 'muted';
  hint.textContent = `${q.minLabel ?? ''}  —  ${q.maxLabel ?? ''}`;
  box.appendChild(row); box.appendChild(hint);
  return box;
}

function collectAnswers(){
  const answers = [];
  const nodes = [...area.querySelectorAll('.q')];

  nodes.forEach((wrap, idx) => {
    const q = formDef.questions[idx];
    let value = null;

    if(['short_text','paragraph','dropdown'].includes(q.type)){
      const el = wrap.querySelector('input,textarea,select');
      value = el.value.trim();
    } else if(q.type==='radio'){
      const el = wrap.querySelector('input[type=radio]:checked');
      value = el ? el.value : '';
    } else if(q.type==='checkbox'){
      value = [...wrap.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
    } else if(q.type==='linear'){
      const el = wrap.querySelector('input[type=radio]:checked');
      value = el ? el.value : '';
    }

    if(q.required){
      const empty = (q.type==='checkbox') ? (value.length===0) : (value==='' || value==null);
      if(empty){ throw new Error(`Lütfen "${q.label}" sorusunu cevaplayın.`); }
    }

    answers.push({ label:q.label, type:q.type, value });
  });

  return answers;
}

qs('#sendBtn').addEventListener('click', async ()=>{
  try{
    const answers = collectAnswers();
    statusEl.textContent = 'Gönderiliyor…';

    // dosyaya yazan endpoint (ilk çözüm)
    const res = await fetch('/api/responses', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ slug, answers })
    });
    const out = await res.json();
    if(!res.ok) throw new Error(out.error || 'Hata');

    statusEl.textContent = 'Kaydedildi ✓';
    location.href = '/thanks.html';
  }catch(e){
    statusEl.textContent = e.message;
    alert(e.message);
  }
});
