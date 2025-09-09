// ---- Admin Panel (final) ----
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

function toast(msg, type = 'ok') {
  if (!alertEl) { console.log(type.toUpperCase()+':', msg); return; }
  alertEl.textContent = msg;
  alertEl.className = 'note ' + type;
  alertEl.style.display = 'block';
  setTimeout(() => (alertEl.style.display = 'none'), 3000);
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
  if (!t) throw new Error('no-token');
  return { 'Content-Type': 'application/json', 'X-Admin-Token': t };
}

function clearForm() {
  $('#inSlug')?.value = '';
  $('#inTitle')?.value = '';
  $('#inDesc')?.value = '';
  $('#selStatus')?.value = 'true';
  if (qsEl) qsEl.innerHTML = '';
}

function addQuestion(q = { type: 'text', name: '', label: '', required: false, options: [] }) {
  const div = document.createElement('div');
  div.className = 'qrow';
  div.innerHTML = `
    <select class="q-type">
      <option value="text" ${q.type === 'text' ? 'selected' : ''}>Metin</option>
      <option value="email" ${q.type === 'email' ? 'selected' : ''}>E-posta</option>
      <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>Metin alanı</option>
      <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>Tek seçim</option>
      <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>Çoklu seçim</option>
      <option value="select" ${q.type === 'select' ? 'selected' : ''}>Açılır menü</option>
    </select>
    <input class="q-name"  type="text" placeholder="alan adı (boşsa q1,q2…)" value="${q.name || ''}">
    <input class="q-label" type="text" placeholder="Etiket" value="${q.label || ''}">
    <label class="q-req"><input type="checkbox" ${q.required ? 'checked' : ''}> Zorunlu</label>
    <input class="q-opts" type="text" placeholder="Seçenekler (virgülle)"
           value="${(q.options || []).join(', ')}">
    <button type="button" class="q-del">Sil</button>
  `;
  const typeEl = div.querySelector('.q-type');
  const optsEl = div.querySelector('.q-opts');

  const toggleOpts = () => {
    const t = typeEl.value;
    // ❗ select da opsiyon ister
    const needs = /^(radio|checkbox|select)$/i.test(t);
    optsEl.style.display = needs ? '' : 'none';
  };
  typeEl.addEventListener('change', toggleOpts);
  toggleOpts();

  div.querySelector('.q-del').addEventListener('click', () => div.remove());
  qsEl.appendChild(div);
}

function sanitizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function collectQuestions() {
  const rows = [...qsEl.querySelectorAll('.qrow')];
  return rows.map((r, idx) => {
    const type = r.querySelector('.q-type').value;
    let name = sanitizeName(r.querySelector('.q-name').value.trim());
    const label = r.querySelector('.q-label').value.trim() || `Soru ${idx + 1}`;
    const required = r.querySelector('.q-req input').checked;

    if (!name) name = `q${idx + 1}`;

    const q = { type, name, label, required };

    // ❗ select için de options kaydet
    if (/^(radio|checkbox|select)$/i.test(type)) {
      const opts = r
        .querySelector('.q-opts')
        .value.split(',')
        .map(s => s.trim())
        .filter(Boolean);
      q.options = opts;
    }
    return q;
  });
}

// Load
async function loadForm() {
  const slug = $('#inSlug').value.trim();
  if (!slug) return toast('Önce slug gir.', 'err');

  const r = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}`);
  const j = await r.json().catch(()=>({}));
  if (!r.ok || !j.ok || !j.schema) return toast(j.error || `Bulunamadı (HTTP ${r.status})`, 'err');

  const s = j.schema;
  $('#inTitle').value = s.title || '';
  $('#inDesc').value = s.description || '';
  $('#selStatus').value = (s.active === false ? 'false' : 'true');
  qsEl.innerHTML = '';
  const qs = s.questions || s.fields || [];
  qs.forEach(addQuestion);
  toast('Form yüklendi.');
}

// Save
async function saveForm() {
  try {
    const slug = $('#inSlug').value.trim();
    if (!slug) return toast('Slug zorunlu.', 'err');

    const body = {
      slug,
      title: $('#inTitle').value.trim(),
      description: $('#inDesc').value.trim(),
      active: $('#selStatus').value === 'true',
      schema: { questions: collectQuestions() }
    };

    const r = await fetch(`${API}/forms-admin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    toast('Kaydedildi ✅', 'ok');
  } catch (e) {
    toast(e.message || 'Hata', 'err');
  }
}

// ---- UI bindings (buton id'leri) ----
// NOT: admin.html’de bu id’lerin olduğundan emin olun:
// #btnAddQ, #btnLoad, #btnSave, #btnNew, #btnToken
$('#btnAddQ')?.addEventListener('click', () => addQuestion());
$('#btnLoad')?.addEventListener('click', loadForm);
$('#btnSave')?.addEventListener('click', saveForm);
$('#btnNew')?.addEventListener('click', clearForm);
$('#btnToken')?.addEventListener('click', () => { localStorage.removeItem(LS_KEY); getToken(); });

clearForm();
