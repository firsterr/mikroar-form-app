// admin.js — Form oluştur / düzenle (schema.questions veya questions farkını tolere eder)

const $  = (s, c=document)=>c.querySelector(s);
const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));

const elSlug   = $('#slug');
const elTitle  = $('#title');
const elStatus = $('#status');
const elList   = $('#questions');

const btnLoad  = $('#btnLoad');
const btnNew   = $('#btnNew');
const btnAdd   = $('#btnAdd');
const btnSave  = $('#btnSave');

function addQuestionRow(q = {}) {
  const row = document.createElement('div');
  row.className = 'q-row';
  row.innerHTML = `
    <div class="q-line">
      <select class="q-type">
        <option value="radio">Tek seçenek (radyo)</option>
        <option value="checkbox">Çoklu seçenek (checkbox)</option>
      </select>
      <input class="q-label" type="text" placeholder="Soru metni"/>
      <button type="button" class="q-del">Sil</button>
    </div>
    <div class="q-opts-wrap">
      <div>Seçenekler (satır satır):</div>
      <textarea class="q-options" rows="5"></textarea>
    </div>
  `;

  // Soru metni: label (yoksa text/question) kullan
  row.querySelector('.q-type').value   = q.type || 'radio';
  row.querySelector('.q-label').value  = q.label ?? q.text ?? q.question ?? '';
  row.querySelector('.q-options').value =
    Array.isArray(q.options) ? q.options.join('\n') : (q.options || '');

  row.querySelector('.q-del').addEventListener('click', () => row.remove());
  elList.appendChild(row);
}

function resetForm() {
  elTitle.value = '';
  elStatus.value = 'true';
  elList.innerHTML = '';
}

async function loadForm() {
  const slug = (elSlug.value || '').trim();
  if (!slug) { alert('Önce slug yaz.'); return; }

  const res  = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
  const json = await res.json();
  if (!json.ok) { alert(json.error || 'Form bulunamadı'); return; }

  const form = json.form || {};

  elTitle.value  = form.title || '';
  elStatus.value = (form.active !== false) ? 'true' : 'false';
  elList.innerHTML = '';

  // ---- DÜZELTME: Hem schema.questions hem de düz questions destekle ----
  const questions =
    (form.schema && Array.isArray(form.schema.questions)) ? form.schema.questions :
    (Array.isArray(form.questions) ? form.questions : []);

  if (!questions.length) {
    // Soru dizisi yoksa yine de bir satır göster
    addQuestionRow();
    return;
  }
  questions.forEach(q => addQuestionRow(q));
}

function newBlank() {
  resetForm();
  addQuestionRow();
}

async function saveForm() {
  const slug = (elSlug.value || '').trim();
  if (!slug) { alert('Slug gerekli'); return; }

  const title  = elTitle.value || '';
  const active = elStatus.value === 'true';

  const questions = $$('.q-row', elList).map(row => {
    const type    = row.querySelector('.q-type').value;
    const label   = row.querySelector('.q-label').value.trim();
    const options = row.querySelector('.q-options').value
                      .split('\n').map(s => s.trim()).filter(Boolean);
    return { type, label, options, required: true };
  });

  const payload = { slug, title, active, schema: { questions } };

  const res  = await fetch('/admin/api/forms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) { alert(data.error || 'Kaydet hata'); return; }
  alert('Kaydedildi ✅');
}

// Bağlantılar
btnLoad.addEventListener('click', loadForm);
btnNew .addEventListener('click', newBlank);
btnAdd .addEventListener('click', () => addQuestionRow());
btnSave.addEventListener('click', saveForm);

// İlk açılışta bir satır olsun
if (!elList.children.length) addQuestionRow();
