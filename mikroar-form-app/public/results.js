// === Basit yardımcılar ===
const $ = (sel) => document.querySelector(sel);

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

const LS_KEY = 'known_slugs_v2';
const knownSlugs = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));

function updateDatalist(){
  els.sluglist.innerHTML = Array.from(knownSlugs).sort().map(s => `<option value="${s}">`).join('');
}

// URL param
const urlParams = new URLSearchParams(location.search);
const initialSlug = urlParams.get('slug') || '';

updateDatalist();
if (initialSlug) els.slug.value = initialSlug;

// Sunucudaki tüm formların slug’larını çek (öneri için)
(async () => {
  try {
    const r = await fetch('/admin/api/forms'); // BasicAuth gerektirir
    const j = await r.json();
    if (j.ok && Array.isArray(j.rows)) {
      j.rows.forEach(row => row.slug && knownSlugs.add(row.slug));
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(knownSlugs)));
      updateDatalist();
    }
  } catch(err) {
    console.warn('Form listesi alınamadı:', err);
  }
})();

// === Veri çekme ===
async function fetchForm(slug){
  const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Form bulunamadı');
  return j.form; // {slug,title,active,schema}
}

async function fetchResponses(slug){
  const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Yanıtlar alınamadı');
  return j.rows; // []
}

// --- Normalizasyon & eşleştirme yardımcıları ---
const normalize = (v) =>
  (v ?? '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-'); // harf/rakam dışını '-' yap

const joinVals = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');

/**
 * answers içindeki anahtarları farklı yazım biçimleriyle yakalayabilmek için
 * bir anahtar seti üretir.
 */
function keyVariants(s, idx){
  const out = new Set();
  const raw = (s ?? '').toString();
  out.add(raw);
  out.add(raw.trim());
  out.add(raw.toLowerCase());
  out.add(normalize(raw));
  if (idx != null) out.add(`q${idx}`);       // q0, q1...
  // sık görülen başka varyasyonlar:
  out.add(raw.replace(/\s+/g, ''));          // boşluksuz
  out.add(raw.replace(/[:?.!]/g, '').trim());// noktalamasız
  return out;
}

/**
 * Tabloyu doldurmak için pivot.
 * Şema sorularını sütun başlığı yapar; answers ile eşleştirirken esnek davranır.
 */
function pivotRows(schemaQuestions, rows){
  const headers = ['Tarih', 'IP', ...schemaQuestions.map(q => q.label)];
  const data = [];

  for (const row of rows) {
    const answers = (row.payload && row.payload.answers) || {};
    const answerKeys = Object.keys(answers);

    // answers anahtarlarını normalize edilmiş -> gerçek değer eşlemesiyle haritala
    const ansMap = new Map();
    for (const k of answerKeys) {
      const variants = keyVariants(k);
      for (const v of variants) ansMap.set(normalize(v), answers[k]);
    }

    const out = [
      new Date(row.created_at).toLocaleString('tr-TR'),
      row.ip || ''
    ];

    schemaQuestions.forEach((q, idx) => {
      // soruya ait muhtemel anahtar varyasyonlarını sırayla dene
      const candidates = [
        ...(keyVariants(q.label, idx)),
        ...(keyVariants(q.name,  idx)),
        ...(keyVariants(q.id,    idx)),
      ];

      let val;
      for (const c of candidates) {
        const hit = ansMap.get(normalize(c));
        if (hit !== undefined) { val = hit; break; }
      }

      // hiç eşleşemediyse answers içinde sıra bazlı fallback (bazı eski kayıtlarda olabilir)
      if (val === undefined && answerKeys[idx] !== undefined) {
        val = answers[ answerKeys[idx] ];
      }

      out.push(joinVals(val));
    });

    data.push(out);
  }

  return { headers, data };
}

function renderMeta(form){
  els.meta.innerHTML = '';
  const chips = [
    ['Başlık', form.title || form.slug],
    ['Durum', form.active === false ? 'pasif' : 'aktif'],
    ['Soru', Array.isArray(form.schema?.questions) ? form.schema.questions.length : 0]
  ];
  for (const [k,v] of chips) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = `${k}: ${v}`;
    els.meta.appendChild(c);
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

// === Yükleme akışı ===
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

    const { headers, data } = pivotRows(schemaQuestions, rows);
    renderTable(headers, data);

    els.btnCopy.onclick = () => copyTSV(headers, data);
    els.btnCsv.onclick  = () => downloadCSV(slug, headers, data);

  } catch(err){
    console.error(err);
    els.stats.textContent = (err && err.message) || 'Hata';
    els.thead.innerHTML = '';
    els.tbody.innerHTML = '';
  }
}

// UI
els.btnLoad.addEventListener('click', () => load(els.slug.value.trim()));
els.slug.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(els.slug.value.trim()); } });

if (initialSlug) load(initialSlug);
