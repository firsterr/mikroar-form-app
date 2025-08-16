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

// === Veri çekme ve pivot ===
// /api/forms/:slug -> { slug,title,active,schema:{questions:[...] } }
// /admin/forms/:slug/responses.json -> { ok:true, rows:[{ id, payload:{answers:{}}, user_agent, ip, created_at }] }

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

// Array<string> -> "a, b, c"
const joinVals = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');

function pivotRows(schemaQuestions, rows){
  // Sütun başlıkları: Tarih, IP + soru etiketleri
  const headers = ['Tarih', 'IP', ...schemaQuestions.map(q => q.label)];

  const data = rows.map(row => {
    const answers = (row.payload && row.payload.answers) || {};
    const out = [
      new Date(row.created_at).toLocaleString('tr-TR'),
      row.ip || ''
    ];
    for (const q of schemaQuestions) {
      out.push(joinVals(answers[q.label] ?? answers[q.name] ?? answers[q.id]));
    }
    return out;
  });

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
    // Öneriye ekle
    knownSlugs.add(slug);
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(knownSlugs)));
    updateDatalist();

    const [form, rows] = await Promise.all([ fetchForm(slug), fetchResponses(slug) ]);

    const schemaQuestions = Array.isArray(form.schema?.questions) ? form.schema.questions : [];
    renderMeta(form);

    const { headers, data } = pivotRows(schemaQuestions, rows);
    renderTable(headers, data);

    // CSV-TSV butonları o anki tabloya bakacak
    els.btnCopy.onclick = () => copyTSV(headers, data);
    els.btnCsv.onclick  = () => downloadCSV(slug, headers, data);

  } catch(err){
    console.error(err);
    els.stats.textContent = (err && err.message) || 'Hata';
    els.thead.innerHTML = '';
    els.tbody.innerHTML = '';
  }
}

// UI olayları
els.btnLoad.addEventListener('click', () => load(els.slug.value.trim()));
els.slug.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(els.slug.value.trim()); } });

// Sayfa ilk açılışta URL param varsa otomatik yükle
if (initialSlug) load(initialSlug);
