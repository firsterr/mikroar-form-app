// admin.js - sağlam sürüm
const qs = (s, r=document) => r.querySelector(s);
const qa = (s, r=document) => [...r.querySelectorAll(s)];

const slugEl  = qs('#slug');      // <input id="slug">
const titleEl = qs('#title');     // <input id="title">
const listEl  = qs('#qList');     // soruları saran <div id="qList">
const saveBtn = qs('#saveBtn');   // "Kaydet" butonu
const addBtn  = qs('#addBtn');    // "+ Soru Ekle" butonu
const statusEl= qs('#saveStatus');

function parseOptions(text){
  return (text || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

// Tek bir soru bloğundan JSON üret
function readQuestion(block){
  const label    = qs('.q-text', block).value.trim();
  const typeVal  = qs('.q-type', block).value;  // short_text | paragraph | radio | checkbox | dropdown | linear
  const required = qs('.q-req', block).value === 'true';

  let q = { label, type: typeVal, required };

  // seçenek gerektiren tipler
  if (['radio','checkbox','dropdown'].includes(typeVal)) {
    q.options = parseOptions(qs('.q-opts', block).value);
  }

  // lineer ölçek
  if (typeVal === 'linear') {
    const min  = Number(qs('.q-min', block).value || 1);
    const max  = Number(qs('.q-max', block).value || 5);
    const minL = qs('.q-minlab', block).value.trim();
    const maxL = qs('.q-maxlab', block).value.trim();
    q.min = min; q.max = max; q.minLabel = minL; q.maxLabel = maxL;
  }

  return q;
}

// Tüm soruları oku
function collectQuestions(){
  const blocks = qa('.q-item', listEl);
  const arr = blocks.map(readQuestion).filter(q => q.label);
  return arr;
}

// POST /admin/api/forms
async function saveForm(){
  statusEl.textContent = 'Kaydediliyor…';
  const slug  = slugEl.value.trim();
  const title = titleEl.value.trim();
  if (!slug || !title) { alert('Slug ve Başlık zorunlu.'); return; }

  const questions = collectQuestions();
  const payload = {
    slug,
    title,
    active: true,
    schema: { questions }      // >>> beklediğimiz format
  };

  const res = await fetch('/admin/api/forms', {
    method : 'POST',
    headers: { 'Content-Type':'application/json' },
    body   : JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Kaydetme hatası: ${t}`);
  }

  statusEl.textContent = 'Kaydedildi ✓';
}

// olaylar
saveBtn?.addEventListener('click', async ()=>{
  try { await saveForm(); }
  catch(e){ alert(e.message); statusEl.textContent=''; }
});

// örnek yeni soru ekleme (varsa kendi kodun kalsın)
addBtn?.addEventListener('click', ()=>{
  const tpl = qs('#qTemplate');
  const node = tpl.content.cloneNode(true);
  listEl.appendChild(node);
});
