// ---- Admin Panel (final robust) ----
const API = '/api';
const LS_KEY = 'ADMIN_TOKEN';

const $ = (s) => document.querySelector(s);
const qsEl = $('#qs');
const alertEl = $('#alert');

// ---- helpers
function toast(msg, type = 'ok', keep = false) {
  alertEl.textContent = msg;
  alertEl.className = 'note ' + type;
  alertEl.style.display = 'block';
  if (!keep) setTimeout(() => (alertEl.style.display = 'none'), 4000);
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
  return { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Admin-Token': t };
}
function clearForm() {
  $('#inSlug').value = '';
  $('#inTitle').value = '';
  $('#inDesc').value = '';
  $('#selStatus').value = 'true';
  qsEl.innerHTML = '';
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
    </select>
    <input class="q-name"  type="text" placeholder="alan adı" value="${q.name || ''}">
    <input class="q-label" type="text" placeholder="Etiket"    value="${q.label || ''}">
    <label class="q-req"><input type="checkbox" ${q.required ? 'checked' : ''}> Zorunlu</label>
    <input class="q-opts" type="text" placeholder="Seçenekler (virgül ile)"
      value="${(q.options || []).join(', ')}" style="${/(radio|checkbox)/.test(q.type) ? '' : 'display:none'}">
    <button type="button" class="q-del">Sil</button>
  `;
  div.querySelector('.q-type').addEventListener('change', (e) => {
    const show = /(radio|checkbox)/.test(e.target.value);
    div.querySelector('.q-opts').style.display = show ? '' : 'none';
  });
  div.querySelector('.q-del').addEventListener('click', () => div.remove());
  qsEl.appendChild(div);
  div.querySelector('.q-type').dispatchEvent(new Event('change'));
}
function collectFields() {
  const rows = [...qsEl.querySelectorAll('.qrow')];
  const fields = rows.map((r, i) => {
    const type = r.querySelector('.q-type').value;
    let name = r.querySelector('.q-name').value.trim();
    const label = r.querySelector('.q-label').value.trim();
    const required = r.querySelector('.q-req input').checked;
    if (!name) name = `q_${i}`;
    // basit normalize: boşluk yok
    name = name.replace(/\s+/g, '_');

    const f = { type, name, label, required };
    if (/(radio|checkbox)/.test(type)) {
      const opts = r.querySelector('.q-opts').value
        .split(',').map(s => s.trim()).filter(Boolean);
      f.options = opts;
    }
    return f;
  });

  // benzersiz name
  const dup = fields.map(f => f.name).find((n, i, a) => a.indexOf(n) !== i);
  if (dup) throw new Error(`Aynı alan adı iki kez kullanılamaz: "${dup}"`);
  return fields;
}

// ---- load
async function loadForm() {
  const slug = $('#inSlug').value.trim();
  if (!slug) return toast('Önce slug gir.', 'err');

  const r = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}&t=${Date.now()}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok || !j.schema) {
    return toast(j.error || `Bulunamadı (HTTP ${r.status})`, 'err');
  }
  const s = j.schema;
  $('#inTitle').value = s.title || '';
  $('#inDesc').value = s.description || '';
  $('#selStatus').value = s.active === false ? 'false' : 'true';

  // fields yoksa eski questions'tan türet
  const fields = Array.isArray(s.fields)
    ? s.fields
    : (Array.isArray(s.questions)
        ? s.questions.map((q, i) => ({
            type: q.type || 'text',
            name: q.name || `q_${i}`,
            label: q.label || '',
            required: !!q.required,
            options: Array.isArray(q.options) ? q.options : []
          }))
        : []);

  qsEl.innerHTML = '';
  fields.forEach(addQuestion);
  toast('Form yüklendi.');
}

// ---- save (POST, olmazsa PUT) + doğrulama
async function saveForm() {
  try {
    const slug = $('#inSlug').value.trim();
    if (!slug) return toast('Slug zorunlu.', 'err');

    const fields = collectFields();
    const meta = {
      slug,
      title: $('#inTitle').value.trim(),
      description: $('#inDesc').value.trim(),
      active: $('#selStatus').value === 'true'
    };
    const body = {
      ...meta,
      // Sunucunun beklediği yapı
      schema: { ...meta, fields }
    };

    // 1) POST (upsert)
    let res = await fetch(`${API}/forms-admin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    let data = await res.json().catch(() => ({}));

    // 2) POST başarısızsa, PUT fallback
    if (!res.ok || !data.ok) {
      res = await fetch(`${API}/forms-admin/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body)
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    }

    // 3) Kaydı doğrula
    const vr = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}&t=${Date.now()}`);
    const vj = await vr.json().catch(() => ({}));
    const savedFields = (vj && vj.schema && (vj.schema.fields || vj.schema.questions)) || [];
    const count = Array.isArray(savedFields) ? savedFields.length : 0;

    if (count === 0) {
      toast('Kaydedildi ama alan sayısı 0 görünüyor. Yenileyip tekrar deneyin.', 'err', true);
    } else {
      toast(`Kaydedildi ✅ (alan: ${count})`, 'ok');
    }
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

clearForm();
