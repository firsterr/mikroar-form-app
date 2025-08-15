// Küçük yardımcılar
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) (k==='class') ? e.className=v : e.setAttribute(k,v);
  for (const k of kids) e.append(typeof k==='string' ? document.createTextNode(k) : k);
  return e;
};

// Basic Auth için header (prompt 1 kez sorup sessionStorage’da tutuyor)
function getAuthHeader() {
  let a = sessionStorage.getItem('admAuth');
  if (!a) {
    const u = prompt('Admin kullanıcı adı:');
    const p = prompt('Admin şifre:');
    a = 'Basic ' + btoa(`${u}:${p}`);
    sessionStorage.setItem('admAuth', a);
  }
  return a;
}

const TYPES = [
  { v: 'likert5', t: 'Likert 5' },
  { v: 'radio',   t: 'Tek seçenek' },
  { v: 'text',    t: 'Metin' }
];

const questionsEl = $('#questions');

function addQuestion(q={ label:'Yeni soru', type:'likert5', required:true, options:[] }) {
  const box = el('div', { class:'q' },
    el('div', { class:'row' },
      el('div', { style:'flex:1' },
        el('label', {}, 'Soru'),
        el('input', { 'data-k':'label', value:q.label })
      ),
      el('div', { style:'width:220px' },
        el('label', {}, 'Tip'),
        (() => {
          const s = el('select', { 'data-k':'type' });
          for (const t of TYPES) s.append(el('option', { value:t.v, ...(q.type===t.v?{selected:true}:{}) }, t.t));
          return s;
        })()
      ),
      el('div', { style:'width:160px' },
        el('label', {}, 'Zorunlu'),
        el('select', { 'data-k':'required' },
          el('option', { value:'true', ...(q.required?{selected:true}:{}) }, 'Evet'),
          el('option', { value:'false', ...(!q.required?{selected:true}:{}) }, 'Hayır')
        )
      )
    ),
    el('div', {},
      el('label', {}, 'Seçenekler (satır satır — sadece "Tek seçenek" için)'),
      el('textarea', { 'data-k':'options', rows:'3' }, (q.options||[]).join('\n'))
    )
  );
  questionsEl.append(box);
}

function readQuestions() {
  const arr = [];
  for (const box of questionsEl.children) {
    const q = {};
    for (const input of box.querySelectorAll('[data-k]')) {
      const k = input.getAttribute('data-k');
      let v = input.value;
      if (k === 'required') v = v === 'true';
      if (k === 'options') v = v ? v.split('\n').map(s=>s.trim()).filter(Boolean) : [];
      q[k] = v;
    }
    arr.push(q);
  }
  return arr;
}

// Event binding (inline onclick yok)
document.addEventListener('DOMContentLoaded', () => {
  $('#addQ').addEventListener('click', () => addQuestion());
  $('#save').addEventListener('click', async () => {
    const slug = $('#slug').value.trim();
    const title = $('#title').value.trim();
    if (!slug || !title) return alert('Slug ve başlık zorunlu');

    const schema = { questions: readQuestions() };
    $('#status').textContent = 'Kaydediliyor…';

    const res = await fetch('/admin/api/forms', {
      method: 'POST',
      headers: {
        'Content-Type':'application/json',
        'Authorization': getAuthHeader()
      },
      body: JSON.stringify({ slug, title, active: true, schema })
    });
    const json = await res.json().catch(()=>null);
    $('#status').textContent = (json && json.ok) ? 'Kaydedildi ✔' : ('Hata: ' + (json?.error || ''));
    if (!(json && json.ok)) alert('Kaydedilemedi: ' + (json?.error || 'bilinmeyen hata'));
  });
});
