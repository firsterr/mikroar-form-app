// ===== kısayollar
const qs = (s, r=document) => r.querySelector(s);
const qa = (s, r=document) => [...r.querySelectorAll(s)];

const slugEl   = qs('#slug');
const titleEl  = qs('#title');
const qList    = qs('#qList');
const addBtn   = qs('#addBtn');
const saveBtn  = qs('#saveBtn');
const statusEl = qs('#saveStatus');
const tpl      = qs('#qTemplate');

// Basic Auth header (bir kere sor, sakla)
function getAuth() {
  let a = sessionStorage.getItem('admAuth');
  if (!a) {
    const u = prompt('Admin kullanıcı adı?','admin') || '';
    const p = prompt('Admin şifre?','password') || '';
    a = 'Basic ' + btoa(`${u}:${p}`);
    sessionStorage.setItem('admAuth', a);
  }
  return a;
}

// Türlere göre alan göster/gizle
function toggleBlocks(block){
  const type = qs('.q-type', block).value;
  const opt  = qs('.opt-wrap', block);
  const lin  = qs('.linear-wrap', block);
  opt.style.display = 'none';
  lin.style.display = 'none';
  if (['radio','checkbox','dropdown'].includes(type)) opt.style.display = 'block';
  if (type === 'linear') lin.style.display = 'grid';
}

function addQuestion(prefill){
  const node = tpl.content.cloneNode(true);
  const block = node.querySelector('.q-item');

  if (prefill){
    qs('.q-text', block).value = prefill.label || '';
    qs('.q-type', block).value = prefill.type || 'short_text';
    qs('.q-req',  block).value = prefill.required ? 'true':'false';
    if (Array.isArray(prefill.options)) qs('.q-opts', block).value = prefill.options.join('\n');
    if (prefill.type === 'linear') {
      qs('.q-min', block).value    = prefill.min ?? 1;
      qs('.q-max', block).value    = prefill.max ?? 5;
      qs('.q-minlab', block).value = prefill.minLabel || '';
      qs('.q-maxlab', block).value = prefill.maxLabel || '';
    }
  }

  qs('.q-type', block).addEventListener('change', ()=>toggleBlocks(block));
  toggleBlocks(block);
  qList.appendChild(block);
}

// + Soru Ekle
addBtn.addEventListener('click', ()=> addQuestion());

// Sil / yukarı / aşağı
qList.addEventListener('click', (e)=>{
  const btn  = e.target.closest('button');
  if (!btn) return;
  const item = e.target.closest('.q-item');
  if (!item) return;

  if (btn.classList.contains('btn-del')) {
    item.remove();
  } else if (btn.classList.contains('btn-up')) {
    const prev = item.previousElementSibling;
    if (prev) qList.insertBefore(item, prev);
  } else if (btn.classList.contains('btn-down')) {
    const next = item.nextElementSibling;
    if (next) qList.insertBefore(next, item);
  }
});

// Soruları topla
function collectQuestions(){
  return qa('.q-item', qList).map(block=>{
    const label    = qs('.q-text', block).value.trim();
    const type     = qs('.q-type', block).value;
    const required = qs('.q-req',  block).value === 'true';
    if (!label) return null;

    const q = { label, type, required };
    if (['radio','checkbox','dropdown'].includes(type)){
      q.options = (qs('.q-opts', block).value || '')
        .split('\n').map(s=>s.trim()).filter(Boolean);
    }
    if (type === 'linear'){
      q.min      = Number(qs('.q-min', block).value || 1);
      q.max      = Number(qs('.q-max', block).value || 5);
      q.minLabel = qs('.q-minlab', block).value.trim();
      q.maxLabel = qs('.q-maxlab', block).value.trim();
    }
    return q;
  }).filter(Boolean);
}

// Kaydet
saveBtn.addEventListener('click', async () => {
  try{
    statusEl.textContent = 'Kaydediliyor…';
    const slug  = slugEl.value.trim();
    const title = titleEl.value.trim();
    if (!slug || !title){ alert('Slug ve Başlık zorunlu.'); statusEl.textContent=''; return; }

    const questions = collectQuestions();
    const payload = { slug, title, active:true, schema:{ questions } };

    const res = await fetch('/admin/api/forms', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': getAuth() },
      body: JSON.stringify(payload)
    });
    const txt = await res.text();
    let json; try{ json = JSON.parse(txt); }catch{}
    if (!res.ok || !(json?.ok || json?.success)) throw new Error(json?.error || txt);

    statusEl.textContent = 'Kaydedildi ✓';
  }catch(err){
    console.error(err);
    alert('Kaydedilemedi: ' + err.message);
    statusEl.textContent = '';
    sessionStorage.removeItem('admAuth'); // şifre yanlışsa yeniden sorabilsin
  }
});

// ?slug=... verilirse yükle
(async function autoLoad(){
  const s = new URLSearchParams(location.search).get('slug');
  if (!s) return;
  try {
    const r = await fetch('/api/forms/'+encodeURIComponent(s));
    if (!r.ok) throw new Error('Bulunamadı');
    const d = await r.json();
    slugEl.value  = d.form.slug;
    titleEl.value = d.form.title || '';
    (d.form.schema?.questions || []).forEach(q => addQuestion(q));
  } catch(_){}
})();
