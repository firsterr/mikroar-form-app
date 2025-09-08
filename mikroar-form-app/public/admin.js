// public/admin.js
// Admin Panel JS (self-contained)
// /api/* -> /.netlify/functions/* yönlendirmesi varsayılır
const API = '/api';
function normalizeFormShape(raw) {
  // raw -> { slug,title,description,active,fields? | schema.fields? | schema.questions? | questions? }
  const pick = (o, k, d) => (o && o[k] !== undefined ? o[k] : d);

  // 1) field kaynaklarını sırayla dene
  let fields = [];
  if (Array.isArray(raw?.fields)) {
    fields = raw.fields;
  } else if (Array.isArray(raw?.schema?.fields)) {
    fields = raw.schema.fields;
  } else if (Array.isArray(raw?.schema?.questions)) {
    fields = raw.schema.questions.map(q => ({
      type: q.type || 'text',
      name: q.name || '',
      label: q.label || '',
      required: !!q.required,
      options: q.options || []
    }));
  } else if (Array.isArray(raw?.questions)) {
    fields = raw.questions.map(q => ({
      type: q.type || 'text',
      name: q.name || '',
      label: q.label || '',
      required: !!q.required,
      options: q.options || []
    }));
  }

  return {
    slug:        pick(raw, 'slug', ''),
    title:       pick(raw, 'title', ''),
    description: pick(raw, 'description', ''),
    active:      raw?.active !== false,
    schema: { fields }
  };
}
// ---------- helpers ----------
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

function toast(msg, type = 'err') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = type;     // 'ok' | 'err'
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 4000);
}

function getToken() {
  let t = localStorage.getItem('ADMIN_TOKEN');
  if (!t) {
    t = prompt('Admin token (X-Admin-Token):') || '';
    if (t) localStorage.setItem('ADMIN_TOKEN', t);
  }
  return t;
}

// ---------- state ----------
let CURRENT = null; // {slug,title,description,active,schema:{fields:[]}}
const types = [
  { v: 'text',     label: 'Metin' },
  { v: 'email',    label: 'E-posta' },
  { v: 'textarea', label: 'Uzun metin' },
  { v: 'radio',    label: 'Tek seçim' },
  { v: 'checkbox', label: 'Çoklu seçim' },
];

// ---------- rendering ----------
function clearForm() {
  $('#slug').value = '';
  $('#title').value = '';
  $('#description').value = '';
  $('#active').value = 'true';
  $('#form-desc').textContent = '';
  $('#meta').innerHTML = '';
  $('#qs').innerHTML = '';
}

function addQuestionRow(f = { type: 'text', name: '', label: '', required: false, options: [] }) {
  const row = document.createElement('div');
  row.className = 'q-row';
  row.innerHTML = `
    <select class="q-type">
      ${types.map(t => `<option value="${t.v}" ${f.type === t.v ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
    <input  class="q-name"     placeholder="alan adı (örn. ad)"  value="${f.name   || ''}">
    <input  class="q-label"    placeholder="Etiket (örn. Ad)"    value="${f.label  || ''}">
    <label class="q-req"><input type="checkbox" class="q-required" ${f.required ? 'checked' : ''}> Zorunlu</label>
    <input  class="q-options"  placeholder="Seçenekler (virgülle)" value="${(f.options || []).join(', ')}">
    <button type="button" class="q-del">Sil</button>
  `;
  const syncOptionsVisibility = () => {
    const t = $('.q-type', row).value;
    $('.q-options', row).style.display = (t === 'radio' || t === 'checkbox') ? 'inline-block' : 'none';
  };
  $('.q-type', row).addEventListener('change', syncOptionsVisibility);
  $('.q-del',  row).addEventListener('click',   () => row.remove());
  syncOptionsVisibility();
  $('#qs').appendChild(row);
}

function render(form) {
  CURRENT = form;
  $('#slug').value        = form.slug || '';
  $('#title').value       = form.title || '';
  $('#description').value = form.description || '';
  $('#active').value      = (form.active === false ? 'false' : 'true');
  $('#form-desc').textContent = form.description || '';
  $('#meta').innerHTML = `
    <div>Slug: <code>${form.slug || '-'}</code></div>
    <div>Oluşturuldu: <code>${form.created_at || '-'}</code></div>
  `;
  $('#qs').innerHTML = '';
  const fields = Array.isArray(form?.schema?.fields) ? form.schema.fields : [];
if (fields.length === 0) addQuestionRow();
fields.forEach(addQuestionRow);
}

function collect() {
  const slug        = $('#slug').value.trim();
  const title       = $('#title').value.trim();
  const description = $('#description').value.trim();
  const active      = $('#active').value === 'true';

  const fields = $$('.q-row').map(row => {
    const type     = $('.q-type', row).value;
    const name     = $('.q-name', row).value.trim();
    const label    = $('.q-label', row).value.trim();
    const required = $('.q-required', row).checked;
    const optsRaw  = $('.q-options', row).value.trim();
    const options  = (type === 'radio' || type === 'checkbox')
      ? optsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const f = { type, name, label, required };
    if (options) f.options = options;
    return f;
  });

  return { slug, title, description, active, schema: { fields } };
}

// ---------- events ----------
document.addEventListener('DOMContentLoaded', () => {
  $('#btnAdd') ?.addEventListener('click', () => addQuestionRow());
  $('#btnNew') ?.addEventListener('click', () => { clearForm(); addQuestionRow(); });

  $('#btnLoad')?.addEventListener('click', async () => {
    const slug = prompt('Yüklenecek slug?', ($('#slug').value || ''))?.trim();
    if (!slug) return;
    try {
      const r = await fetch(`${API}/forms?slug=${encodeURIComponent(slug)}`);
     const j = await r.json().catch(() => ({}));
if (!r.ok || !j.ok || !j.schema) throw new Error(j.error || `HTTP ${r.status}`);
render(normalizeFormShape(j.schema));
      toast('Yüklendi', 'ok');
    } catch (e) {
      toast('Yüklenemedi: ' + e.message, 'err');
    }
  });

  $('#btnSave')?.addEventListener('click', async () => {
    const token = getToken();
    if (!token) { toast('Token gerekli', 'err'); return; }

    const payload = collect();
    if (!payload.slug)  { toast('Slug zorunlu',   'err'); return; }
    if (!payload.title) { toast('Başlık zorunlu', 'err'); return; }

    try {
      const r = await fetch(`${API}/forms-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast('Kaydedildi', 'ok');
      render(j.form || j.schema || payload); // geri geleni yeniden çiz
    } catch (e) {
      toast('Kaydedilemedi: ' + e.message, 'err');
    }
  });

  // ?slug=… ile otomatik yükleme
  const qs = new URLSearchParams(location.search);
  const slugParam = qs.get('slug');
  if (slugParam) {
    $('#slug').value = slugParam;
    $('#btnLoad').click();
  } else {
    addQuestionRow(); // boş sayfayı bir soruyla başlat
  }
});
