// ---- Admin JS (final, select fix) ----
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

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
  const row = document.createElement('div');
  row.className = 'qrow';
  row.innerHTML = `
    <select class="q-type">
      <option value="text" ${q.type === 'text' ? 'selected' : ''}>Metin</option>
      <option value="email" ${q.type === 'email' ? 'selected' : ''}>E-posta</option>
      <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>Metin alanı</option>
      <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>Tek seçim</option>
      <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>Çoklu seçim</option>
      <option value="select" ${q.type === 'select' ? 'selected' : ''}>Açılır menü</option>
    </select>
    <input class="q-name" type="text" placeholder="alan adı (boşsa q1,q2…)" value="${q.name || ''}">
    <input class="q-label" type="text" placeholder="Etiket" value="${q.label || ''}">
    <label class="q-req"><input type="checkbox" ${q.required ? 'checked' : ''}> Zorunlu</label>
    <input class="q-opts" type="text" placeholder="Seçenekler (virgül ile)"
      value="${(q.options || []).join(', ')}" style="${/(radio|checkbox|select)/.test(q.type) ? '' : 'display:none'}">
    <button type="button" class="q-del">Sil</button>
  `;
  row.querySelector('.q-type').addEventListener('change', (e) => {
    const show = /(radio|checkbox|select)/.test(e.target.value);
    row.querySelector('.q-opts').style.display = show ? '' : 'none';
  });
  row.querySelector('.q-del').addEventListener('click', () => row.remove());
  qsEl.appendChild(row);
  row.querySelector('.q-type').dispatchEvent(new Event('change'));
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
    const opts = r.querySelector('.q-opts').value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name) name = `q${idx + 1}`;

    const q = { type, name, label, required };
    // select dahil: options yaz
    if (/(radio|checkbox|select)/.test(type)) q.options = opts;
    return q;
  });
}
// --- mevcut sabitlerinizin altına ekleyin ---
function ensureAuthOverlay() {
  const lock = document.getElementById('lock');
  const hasToken = !!localStorage.getItem(LS_KEY);
  if (lock) lock.style.display = hasToken ? 'none' : 'flex';
  // token yoksa, ekranda başka bir şeyle etkileşime izin vermeyelim
  document.body.style.overflow = hasToken ? '' : 'hidden';
}

// Sayfa ilk yüklenirken anahtar iste
document.addEventListener('DOMContentLoaded', () => {
  // localStorage'ta yoksa prompt açılır (getToken zaten bunu yapıyor)
  if (!localStorage.getItem(LS_KEY)) {
    // kullanıcı Cancel derse, overlay açık kalır ve butondan tekrar deneyebilir
    try { getToken(); } catch(_) {}
  }
  ensureAuthOverlay();
});

// Kilit ekranı butonu
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'unlockBtn') {
    // Eski/değişmiş anahtar ihtimali için önce temizleyelim
    localStorage.removeItem(LS_KEY);
    try { getToken(); } catch(_) {}
    ensureAuthOverlay();
  }
});

// Mevcut "🔑 Anahtar" butonunuz zaten vardı; onu da bu davranışa bağlayın:
document.getElementById('btnToken')?.addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  try { getToken(); } catch(_) {}
  ensureAuthOverlay();
});

// --- mevcut authHeaders() KULLANIMLARI aynı kalabilir ---
// Her POST/PUT’ta zaten X-Admin-Token header’ını gönderiyorsunuz.
// Bu overlay sayfa içi etkileşimi anahtarsız engelliyor.
// ---- LOAD
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
  $('#selStatus').value = (s.active === false ? 'false' : 'true');

  const questions = s.questions || s.fields || [];
  qsEl.innerHTML = '';
  questions.forEach(addQuestion);

  toast('Form yüklendi.');
}
// === SLUG İLE FORM YÜKLE (FULL REPLACE) ===
async function loadFormBySlug(slug) {
  if (!slug) throw new Error("Slug gerekli");
  const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`, { headers:{accept:"application/json"} });
  const txt = await r.text();
  let form = null;
  try {
    const j = JSON.parse(txt || "{}");
    // Esnek şema: {form} | {data} | dizi
    form = j.form || j.data || (Array.isArray(j) ? j[0] : null);
  } catch(_) {}

  if (!r.ok || !form) {
    throw new Error(`Bulunamadı (HTTP ${r.status})`);
  }

  // Formu UI'a bas
  $("#slug").value = form.slug || "";
  $("#title").value = form.title || "";
  $("#desc").value = (form.schema && form.schema.description) || "";
  $("#status").value = form.active ? "Aktif" : "Pasif";

  // Soruları doldur (schema.questions)
  const qs = (form.schema && Array.isArray(form.schema.questions)) ? form.schema.questions : [];
  renderQuestions(qs);
}
// ---- SAVE
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
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);

    const savedLen = (j.schema?.questions || j.schema?.fields || []).length ?? 0;
    toast(savedLen ? 'Kaydedildi ✅' : 'Kaydedildi ama alan sayısı 0 görünüyor.', savedLen ? 'ok' : 'err');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---- UI
$('#btnAddQ').addEventListener('click', () => addQuestion());
$('#btnLoad').addEventListener('click', loadForm);
$('#btnSave').addEventListener('click', saveForm);
$('#btnNew').addEventListener('click', clearForm);
$('#btnToken').addEventListener('click', () => {
  localStorage.removeItem(LS_KEY);
  getToken();
});

clearForm();
