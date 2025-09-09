// ---- Basit Admin Panel JS ----
// Netlify redirect ile /api/* -> /.netlify/functions/*
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

// ---- Yardımcılar
function toast(msg, type = 'ok') {
  alertEl.textContent = msg;
  alertEl.className = 'note ' + type;
  alertEl.style.display = 'block';
  setTimeout(() => (alertEl.style.display = 'none'), 4000);
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
  if (!t) {
    toast('Admin anahtarı gerekli.', 'err');
    throw new Error('no-token');
  }
  return { 'Content-Type': 'application/json', 'X-Admin-Token': t };
}

function clearForm() {
  $('#inSlug').value = '';
  $('#inTitle').value = '';
  $('#inDesc').value = '';
  $('#selStatus').value = 'true';
  qsEl.innerHTML = '';
}

function addQuestion(q = { type: 'text', name: '', label: '', required: false, options: [] }) {
  const id = crypto.randomUUID();
  const div = document.createElement('div');
  div.className = 'qrow';
  div.dataset.id = id;
  div.innerHTML = `
    <select class="q-type">
      <option value="text" ${q.type === 'text' ? 'selected' : ''}>Metin</option>
      <option value="email" ${q.type === 'email' ? 'selected' : ''}>E-posta</option>
      <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>Metin alanı</option>
      <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>Tek seçim</option>
      <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>Çoklu seçim</option>
    </select>
    <input class="q-name" type="text" placeholder="alan adı" value="${q.name || ''}">
    <input class="q-label" type="text" placeholder="Etiket" value="${q.label || ''}">
    <label class="q-req"><input type="checkbox" ${q.required ? 'checked' : ''}> Zorunlu</label>
    <input class="q-opts" type="text" placeholder="Seçenekler (virgül ile)"
      value="${(q.options || []).join(', ')}" style="${/(radio|checkbox)/.test(q.type) ? '' : 'display:none'}">
    <button class="q-del">Sil</button>
  `;
  div.querySelector('.q-type').addEventListener('change', (e) => {
    const show = /(radio|checkbox)/.test(e.target.value);
    div.querySelector('.q-opts').style.display = show ? '' : 'none';
  });
  div.querySelector('.q-del').addEventListener('click', () => div.remove());
  qsEl.appendChild(div);
  // ilk render’da type’a göre opsiyon alanını doğru göster
  div.querySelector('.q-type').dispatchEvent(new Event('change'));
}

function collectFields() {
  const rows = [...qsEl.querySelectorAll('.qrow')];
  return rows.map((r) => {
    const type = r.querySelector('.q-type').value;
    const name = r.querySelector('.q-name').value.trim();
    const label = r.querySelector('.q-label').value.trim();
    const required = r.querySelector('.q-req input').checked;
    const opts = r.querySelector('.q-opts').value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name) throw new Error('Alan adı boş olamaz');

    const f = { type, name, label, required };
    if (/(radio|checkbox)/.test(type)) f.options = opts;
    return f;
  });
}

// ---- Yükle / Kaydet
async function loadForm() {
  const slug = $('#inSlug').value.trim();
  if (!slug) return toast('Önce slug gir.', 'err');

  const r = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok || !j.schema) {
    return toast(j.error || `Bulunamadı (HTTP ${r.status})`, 'err');
  }

  const s = j.schema;
  $('#inTitle').value = s.title || '';
  $('#inDesc').value = s.description || '';
  $('#selStatus').value = s.active === false ? 'false' : 'true';

  qsEl.innerHTML = '';
  (s.fields || s.questions || []).forEach(addQuestion);

  toast('Form yüklendi.');
}

async function saveForm() {
  try {
    const slug = $('#inSlug').value.trim();
    if (!slug) return toast('Slug zorunlu.', 'err');

    const body = {
      slug,
      title: $('#inTitle').value.trim(),
      description: $('#inDesc').value.trim(),
      active: $('#selStatus').value === 'true',
      schema: { fields: collectFields() }
    };

    const r = await fetch(`${API}/forms-admin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    toast('Kaydedildi ✅', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---- UI bağla
$('#btnAddQ').addEventListener('click', () => addQuestion());
$('#btnLoad').addEventListener('click', loadForm);
$('#btnSave').addEventListener('click', saveForm);
$('#btnNew').addEventListener('click', clearForm);
$('#btnToken').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  getToken();
});

// tabs sadece görsel; iki mod da aynı ekranda çalışıyor
$('#tabCreate').addEventListener('click', () => {
  $('#tabCreate').classList.add('active');
  $('#tabEdit').classList.remove('active');
  clearForm();
});
$('#tabEdit').addEventListener('click', () => {
  $('#tabEdit').classList.add('active');
  $('#tabCreate').classList.remove('active');
});

// ilk açılış
clearForm();
