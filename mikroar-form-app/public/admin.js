// admin.js — Form oluştur / düzenle (label düzeltmesiyle)
// Basit helper
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const elSlug     = $('#slug');
const elTitle    = $('#title');
const elStatus   = $('#status');
const elList     = $('#questions');
const btnLoad    = $('#btnLoad');
const btnNew     = $('#btnNew');
const btnAdd     = $('#btnAdd');
const btnSave    = $('#btnSave');

// Bir soru satırı oluştur
function addQuestionRow(q = {}) {
  const row = document.createElement('div');
  row.className = 'q-row';

  row.innerHTML = `
    <div class="q-line">
      <select class="q-type">
        <option value="radio">Tek seçenek (radyo)</option>
        <option value="checkbox">Çoklu seçenek (checkbox)</option>
      </select>
      <input class="q-label" type="text" placeholder="Soru metni" />
      <button class="q-del" type="button">Sil</button>
    </div>
    <div class="q-opts-wrap">
      <div>Seçenekler (satır satır):</div>
      <textarea class="q-options" rows="5"></textarea>
    </div>
  `;

  // --- DÜZELTME: Soru metnini label'dan yükle ---
  row.querySelector('.q-type').value = q.type || 'radio';
  row.querySelector('.q-label').value = q.label ?? q.text ?? q.question ?? '';
  row.querySelector('.q-options').value = Array.isArray(q.options)
    ? q.options.join('\n')
    : (q.options || '');

  row.querySelector('.q-del').addEventListener('click', () => row.remove());
  elList.appendChild(row);
}

// Formu sıfırla
function resetForm() {
  elTitle.value = '';
  elStatus.value = 'true';
  elList.innerHTML = '';
}

// Mevcut formu yükle
async function loadForm() {
  const slug = (elSlug.value || '').trim();
  if (!slug) { alert('Önce slug yaz.'); return; }

  const res = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
  const data = await res.json();

  if (!data.ok) { alert(data.error || 'Form bulunamadı'); return; }

  elTitle.value  = data.form.title || '';
  elStatus.value = (data.form.active !== false) ? 'true' : 'false';
  elList.innerHTML = '';

  const questions = data.form.schema?.questions || [];
  questions.forEach(q => addQuestionRow(q));
}

// Yeni (sıfır) başlat
function newBlank() {
  resetForm();
  addQuestionRow();
}

// Kaydet
async function saveForm() {
  const slug = (elSlug.value || '').trim();
  if (!slug) { alert('Slug gerekli'); return; }

  const title  = elTitle.value || '';
  const active = elStatus.value === 'true';

  const questions = $$('.q-row', elList).map(row => {
    const type    = row.querySelector('.q-type').value;
    const label   = row.querySelector('.q-label').value.trim(); // <-- label olarak kaydet
    const options = row.querySelector('.q-options').value
      .split('\n').map(s => s.trim()).filter(Boolean);

    return { type, label, options, required: true };
  });

  const payload = {
    slug, title, active,
    // Sunucu hem schema.questions’ı hem questions’ı kabul ediyor;
    // ama doğru alan: schema.questions
    schema: { questions }
  };

  const res = await fetch('/admin/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.ok) { alert(data.error || 'Kaydet hata'); return; }
  alert('Kaydedildi ✅');
}

// UI bağla
btnLoad.addEventListener('click', loadForm);
btnNew .addEventListener('click', newBlank);
btnAdd .addEventListener('click', () => addQuestionRow());
btnSave.addEventListener('click', saveForm);

// Sayfa ilk açıldığında boş bir satır olsun
if (!elList.children.length) addQuestionRow();
