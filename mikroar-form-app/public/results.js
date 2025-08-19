// === Kısa yardımcılar ===
const $ = (s) => document.querySelector(s);

const els = {
  slug:     $('#slug'),
  sluglist: $('#sluglist'),
  btnLoad:  $('#btnLoad'),
  btnCopy:  $('#btnCopy'),
  btnCsv:   $('#btnCsv'),
  stats:    $('#stats'),
  meta:     $('#meta'),
  thead:    $('#thead'),
  tbody:    $('#tbody'),
};

const LS_KEY = 'known_slugs_v3';
const knownSlugs = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

function updateDatalist(){
  els.sluglist.innerHTML = Array.from(knownSlugs).sort().map(s => `<option value="${s}">`).join('');
}

const urlParams = new URLSearchParams(location.search);
const initialSlug = urlParams.get('slug') || '';
if (initialSlug) els.slug.value = initialSlug;
updateDatalist();

// İsteğe bağlı: mevcut formları datalist'e doldur (BasicAuth ister)
(async () => {
  try {
    const r = await fetch('/admin/api/forms');
    const j = await r.json();
    if (j.ok && Array.isArray(j.rows)) {
      j.rows.forEach(row => row.slug && knownSlugs.add(row.slug));
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(knownSlugs)));
      updateDatalist();
    }
  } catch {}
})();

// === API ===
async function fetchForm(slug){
  const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Form bulunamadı');
  return j.form; // { slug, title, active, schema:{questions:[...]} }
}

async function fetchResponses(slug){
  const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Yanıtlar alınamadı');
  return j.rows; // [{created_at, ip, payload:{answers:{...}}}, ...]
}

// === Eşleştirme yardımcıları ===
const normalize = (v) =>
  (v ?? '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-'); // TR dahil unicode harf/rakam dışını '-'

const joinVals = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');

function looksLikeQKey(k){
  // q0, q_0, q-0, "q 0" hepsini yakala
  const m = /^q[\s_\-]?(\d+)$/i.exec((k ?? '').toString().trim());
  return m ? Number(m[1]) : null;
}

// gevşek eşleşme: eşit || biri diğerini kapsıyor
function isMatchLoose(a, b){
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// === Pivot: dinamik sütunlara izin veren sağlam sürüm ===
function buildTable(schemaQuestions, rows){
  const baseHeaders = ['Tarih', 'IP'];
  const questionLabels = (schemaQuestions || []).map(q => q?.label ?? '');
  const headers = [...baseHeaders, ...questionLabels];

  // şema label -> kolon index (2 offsetli)
  const labelToCol = new Map();
  questionLabels.forEach((lbl, i) => labelToCol.set(i, 2 + i));

  // 1) Tüm yanıtları tarayıp şemada eşleşmeyen "ek anahtarları" yakala
  const extraKeys = [];
  const extraKeyCols = new Map(); // normalize(key) -> columnIndex

  for (const row of rows) {
    const answers = row?.payload?.answers || {};
    for (const [k, v] of Object.entries(answers)) {
      // qN ise şemadaki sıraya düşer, şemaya ek sütun açmayız
      if (looksLikeQKey(k) != null) continue;

      // Şemadaki herhangi bir label ile gevşek eşleşiyorsa ek sütuna gerek yok
      const matchesSchema = questionLabels.some(lbl => isMatchLoose(k, lbl));
      if (matchesSchema) continue;

      const nk = normalize(k);
      if (!extraKeyCols.has(nk)) {
        // Yeni bir dinamik sütun aç
        extraKeyCols.set(nk, headers.length);
        extraKeys.push({ raw: k, nk });
        headers.push(k); // başlığa ham anahtarı yaz
      }
    }
  }

  // 2) Satırları doldur
  const data = [];
  for (const row of rows) {
    const answers = row?.payload?.answers || {};

    // satır arabelleği
    const arr = new Array(headers.length).fill('');
    arr[0] = new Date(row.created_at).toLocaleString('tr-TR');
    arr[1] = row.ip || '';

    // her cevap anahtarı için bir hedef sütun bul
    for (const [k, v] of Object.entries(answers)) {
      let col = null;

      // a) qN formatı (sıra ile eşle)
      const qIdx = looksLikeQKey(k);
      if (qIdx != null && qIdx < questionLabels.length) {
        col = 2 + qIdx;
      }

      // b) şema label'ları ile gevşek eşleşme
      if (col == null) {
        for (let i = 0; i < questionLabels.length; i++) {
          if (isMatchLoose(k, questionLabels[i])) { col = 2 + i; break; }
        }
      }

      // c) dinamik ek sütunlara düşür
      if (col == null) {
        const nk = normalize(k);
        if (extraKeyCols.has(nk)) col = extraKeyCols.get(nk);
      }

      // d) yine bulunamadıysa — son çare: sıraya göre düşür (çok uç durum)
      if (col == null) {
        const firstEmpty = arr.findIndex((x, idx) => idx >= 2 && !x);
        col = firstEmpty > -1 ? firstEmpty : headers.length - 1;
      }

      // yaz
      arr[col] = joinVals(v);
    }

    data.push(arr);
  }

  return { headers, data };
}

// === Render yardımcıları ===
function renderMeta(form){
  els.meta.innerHTML = '';
  const chips = [
    ['Başlık', form.title || form.slug],
    ['Durum', form.active === false ? 'pasif' : 'aktif'],
    ['Soru', Array.isArray(form.schema?.questions) ? form.schema.questions.length : 0]
  ];
  for (const [k,v] of chips) {
    const s = document.createElement('span');
    s.className = 'chip';
    s.textContent = `${k}: ${v}`;
    els.meta.appendChild(s);
  }
}

function renderTable(headers, data){
  els.thead.innerHTML = '';
  els.tbody.innerHTML = '';

  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    els.thead.appendChild(th);
  });

  data.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell ?? '';
      tr.appendChild(td);
    });
    els.tbody.appendChild(tr);
  });

  els.stats.textContent = `kayıt: ${data.length}, sütun: ${headers.length}`;
}

function asCSV(headers, data, sep=','){
  const esc = (s) => {
    const v = (s ?? '').toString();
    if (v.includes(sep) || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g,'""')}"`;
    }
    return v;
  };
  const lines = [ headers.map(esc).join(sep), ...data.map(r => r.map(esc).join(sep)) ];
  return lines.join('\n');
}
function copyTSV(headers, data){
  const tsv = asCSV(headers, data, '\t');
  navigator.clipboard.writeText(tsv).then(() => {
    els.btnCopy.textContent = 'Kopyalandı ✓';
    setTimeout(() => els.btnCopy.textContent = 'Kopyala (TSV)', 1400);
  });
}
function downloadCSV(filename, headers, data){
  const csv = asCSV(headers, data, ',');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// === Akış ===
async function load(slug){
  if (!slug) return;
  els.stats.textContent = 'yükleniyor…';
  try {
    knownSlugs.add(slug);
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(knownSlugs)));
    updateDatalist();

    const [form, rows] = await Promise.all([ fetchForm(slug), fetchResponses(slug) ]);
    const schemaQuestions = Array.isArray(form.schema?.questions) ? form.schema.questions : [];

    renderMeta(form);

    const { headers, data } = buildTable(schemaQuestions, rows);
    renderTable(headers, data);

    els.btnCopy.onclick = () => copyTSV(headers, data);
    els.btnCsv.onclick  = () => downloadCSV(slug, headers, data);

  } catch(err){
    console.error(err);
    els.stats.textContent = err.message || 'Hata';
    els.thead.innerHTML = '';
    els.tbody.innerHTML = '';
  }
}

// UI
els.btnLoad.addEventListener('click', () => load(els.slug.value.trim()));
els.slug.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(els.slug.value.trim()); } });

const initial = els.slug.value.trim();
if (initial) load(initial);
