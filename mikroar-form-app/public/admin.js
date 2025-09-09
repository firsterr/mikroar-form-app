<script>
// ---- Admin Panel (final) ----
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

function toast(msg, type = 'ok') {
  alertEl.textContent = msg;
  alertEl.className = 'note ' + type;
  alertEl.style.display = 'block';
  setTimeout(() => (alertEl.style.display = 'none'), 3500);
}

function getToken() {
  let t = localStorage.getItem(LS_KEY);
  if (!t) {
    t = prompt('Yönetici anahtarı (X-Admin-Token):');
    if (t) localStorage.setItem(LS_KEY, t);
  }
  return t;
}
function authHeaders() {
  const t = getToken();
  if (!t) { toast('Admin anahtarı gerekli', 'err'); throw new Error('no-token'); }
  return { 'Content-Type': 'application/json', 'X-Admin-Token': t };
}

function clearForm() {
  $('#inSlug').value = '';
  $('#inTitle').value = '';
  $('#inDesc').value = '';
  $('#selStatus').value = 'true';
  qsEl.innerHTML = '';
}

function addQuestion(q = { type:'text', name:'', label:'', required:false, options:[] }) {
  const row = document.createElement('div');
  row.className = 'qrow';
  row.innerHTML = `
    <select class="q-type">
      <option value="text" ${q.type==='text'?'selected':''}>Metin</option>
      <option value="email" ${q.type==='email'?'selected':''}>E-posta</option>
      <option value="textarea" ${q.type==='textarea'?'selected':''}>Metin alanı</option>
      <option value="radio" ${q.type==='radio'?'selected':''}>Tek seçim</option>
      <option value="checkbox" ${q.type==='checkbox'?'selected':''}>Çoklu seçim</option>
      <option value="select" ${q.type==='select'?'selected':''}>Açılır menü</option>
    </select>
    <input class="q-name"  type="text" placeholder="alan adı (boşsa q1,q2...)" value="${q.name||''}">
    <input class="q-label" type="text" placeholder="Etiket" value="${q.label||''}">
    <label class="q-req"><input type="checkbox" ${q.required?'checked':''}> Zorunlu</label>
    <input class="q-opts" type="text" placeholder="Seçenekler (virgülle) örn: Evet,Hayır"
           value="${(q.options||[]).join(', ')}" style="${/(radio|checkbox|select)/.test(q.type)?'':'display:none'}">
    <button type="button" class="q-del">Sil</button>
  `;
  row.querySelector('.q-type').addEventListener('change', (e)=>{
    row.querySelector('.q-opts').style.display = /(radio|checkbox|select)/.test(e.target.value)?'':'none';
  });
  row.querySelector('.q-del').addEventListener('click', ()=>row.remove());
  qsEl.appendChild(row);
  row.querySelector('.q-type').dispatchEvent(new Event('change'));
}

const sanitize = s => String(s||'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');

function collectQuestions() {
  const rows = [...qsEl.querySelectorAll('.qrow')];
  return rows.map((r,i)=>{
    const type = r.querySelector('.q-type').value;
    let name   = sanitize(r.querySelector('.q-name').value.trim()) || `q${i+1}`;
    let label  = r.querySelector('.q-label').value.trim() || `Soru ${i+1}`;
    let opts   = r.querySelector('.q-opts').value.split(',').map(s=>s.trim()).filter(Boolean);
    const required = r.querySelector('.q-req input').checked;

    // Yedek davranış: seçenek kutusu boş ama label virgüllü girilmişse onu seçenek olarak kabul et
    if (!opts.length && /(radio|checkbox|select)/.test(type) && label.includes(',')) {
      opts = label.split(',').map(s=>s.trim()).filter(Boolean);
      label = `Soru ${i+1}`;
    }
    const q = { type, name, label, required };
    if (/(radio|checkbox|select)/.test(type)) q.options = opts;
    return q;
  });
}

// ---- LOAD
async function loadForm() {
  const slug = $('#inSlug').value.trim();
  if (!slug) return toast('Önce slug gir', 'err');

  const r = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}`);
  const j = await r.json().catch(()=>({}));
  if (!r.ok || !j.ok || !j.schema) return toast(j.error || `HTTP ${r.status}`, 'err');

  const s = j.schema;
  $('#inTitle').value = s.title || '';
  $('#inDesc').value  = s.description || '';
  $('#selStatus').value = (s.active===false?'false':'true');

  qsEl.innerHTML='';
  (s.questions || s.fields || []).forEach(addQuestion);
  toast('Form yüklendi');
}

// ---- SAVE
async function saveForm() {
  try{
    const slug = $('#inSlug').value.trim();
    if (!slug) return toast('Slug zorunlu', 'err');

    const payload = {
      slug,
      title: $('#inTitle').value.trim(),
      description: $('#inDesc').value.trim(),
      active: $('#selStatus').value==='true',
      schema: { questions: collectQuestions() }
    };

    const r = await fetch(`${API}/forms-admin`, { method:'POST', headers: authHeaders(), body: JSON.stringify(payload) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    const savedLen = (j.schema?.questions || j.schema?.fields || []).length ?? 0;
    toast(savedLen ? 'Kaydedildi ✅' : 'Kaydedildi ama soru sayısı 0 görünüyor', savedLen?'ok':'err');
  }catch(e){ toast(e.message, 'err'); }
}

// UI
$('#btnAddQ').addEventListener('click', ()=>addQuestion());
$('#btnLoad').addEventListener('click', loadForm);
$('#btnSave').addEventListener('click', saveForm);
$('#btnNew').addEventListener('click', clearForm);
$('#btnToken').addEventListener('click', ()=>{ localStorage.removeItem(LS_KEY); getToken(); });

// “Oluştur / Düzenle” sadece görsel; temizlemek için:
$('#tabCreate')?.addEventListener('click', ()=>{ $('#tabCreate').classList.add('active'); $('#tabEdit').classList.remove('active'); clearForm(); });
$('#tabEdit')?.addEventListener('click', ()=>{ $('#tabEdit').classList.add('active'); $('#tabCreate').classList.remove('active'); });

clearForm();
</script>
