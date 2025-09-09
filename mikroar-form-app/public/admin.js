// ---- Basit Admin Panel JS (final) ----
// Netlify redirect ile /api/* -> /.netlify/functions/*
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

// ---------------- Helpers ----------------
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
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Admin-Token': t,
  };
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

    <input class="q-name"  type="text" placeholder="alan adı" value="${q.name || ''}">
    <input class="q-label" type="text" placeholder="Etiket"    value="${q.label || ''}">
    <label class="q-req">
      <input type="checkbox" ${q.required ? 'checked' : ''}> Zorunlu
    </label>

    <input class="q-opts" type="text" placeholder="Seçenekler (virgül ile)"
      value="${(q.options || []).join(', ')}" style="${/(radio|checkbox)/.test(q.type) ? '' : 'display:none'}">

    <button class="q-del" type="button">Sil</button>
  `;

  // type değişince seçenek alanını göster/gizle
  div.querySelector('.q-type').addEventListener('change', (e) => {
    const show = /(radio|checkbox)/.test(e.target.value);
    div.querySelector('.q-opts').style.display = show ? '' : 'none';
  });

  div.querySelector('.q-del').addEventListener('click', () => div.remove());
  qsEl.appendChild(div);

  // ilk render'da doğru görünüm
  div.querySelector('.q-type').dispatchEvent(new Event('change'));
}

function collectFields() {
  const rows = [...qsEl.querySelectorAll('.qrow')];
  const fields = rows.map((r) => {
    const type = r.querySelector('.q-type').value;
    const name = r.querySelector('.q-name').value.trim();
    const label = r.querySelector('.q-label').value.trim();
    const required = r.querySelector('.q-req input').checked;

    if (!name) throw new Error('Alan adı boş olamaz');

    const f = { type, name, label, required };
    if (/(radio|checkbox)/.test(type)) {
      const opts = r
        .querySelector('.q-opts')
        .value.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      f.options = opts;
    }
    return f;
  });

  // benzersiz name kontrolü
  const dup = fields.map(f => f.name).find((n, i, a) => a.indexOf(n) !== i);
  if (dup) throw new Error(`Aynı alan adı iki kez kullanılamaz: "${dup}"`);

  return fields;
}

// --------------- Load / Save ---------------
async function loadForm() {
  const slug = $('#inSlug').value.trim();
  if (!slug) return toast('Önce slug gir.', 'err');

  const res = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok || !j.schema) {
    return toast(j.error || `Bulunamadı (HTTP ${res.status})`, 'err');
  }

  const s = j.schema || {};
  $('#inTitle').value = s.title || '';
  $('#inDesc').value = s.description || '';
  $('#selStatus').value = s.active === false ? 'false' : 'true';

  // Eski yapıyla uyum: fields yoksa questions -> fields'e dönüştür
  const fromQuestions =
    Array.isArray(s.questions)
      ? s.questions.map((q, i) => ({
          type: q.type || 'text',
          name: q.name || `q_${i}`,
          label: q.label || '',
          required: !!q.required,
          options: Array.isArray(q.options) ? q.options : [],
        }))
      : [];

  const fields = Array.isArray(s.fields) ? s.fields : fromQuestions;

  qsEl.innerHTML = '';
  fields.forEach(addQuestion);

  toast('Form yüklendi.');
}

async function saveForm() {
  try {
    const slug = $('#inSlug').value.trim();
    if (!slug) return toast('Slug zorunlu.', 'err');

    const fields = collectFields();

    // 🔴 Sunucu bu yapıyı bekliyor (forms.schema → fields[])
    const body = {
      slug,
      title: $('#inTitle').value.trim(),
      description: $('#inDesc').value.trim(),
      active: $('#selStatus').value === 'true',
      schema: {
        title: $('#inTitle').value.trim(),
        description: $('#inDesc').value.trim(),
        active: $('#selStatus').value === 'true',
        fields, // <— önemli: sorular burada
      },
    };

    const res = await fetch(`${API}/forms-admin`, {
      method: 'POST',            // upsert
      headers: authHeaders(),
      body: JSON.stringify(body),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);

    toast('Kaydedildi ✅', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------------- Wire UI -----------------
$('#btnAddQ').addEventListener('click', () => addQuestion());
$('#btnLoad').addEventListener('click', loadForm);
$('#btnSave').addEventListener('click', saveForm);
$('#btnNew').addEventListener('click', clearForm);
$('#btnToken').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  getToken();
});

// tabs (görsel)
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
