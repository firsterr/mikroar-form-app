// public/results.js
(() => {
  const $ = (s, p = document) => p.querySelector(s);

  const el = {
    slug: $('#slug'),
    load: $('#btnLoad'),
    stat: $('#stat'),
    copy: $('#btnCopy'),
    csv: $('#btnCSV'),
    thead: $('#thead'),
    tbody: $('#tbody'),
  };

  let lastCols = [], lastRows = [];

  // Soru başlığı normalizasyonu (çoğalmayı önlemek için)
  const normKey = s => (s || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // aksanları at
    .toLowerCase()
    .replace(/\?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  el.load.addEventListener('click', load);
  el.slug.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  el.copy.addEventListener('click', copyTSV);
  el.csv.addEventListener('click', downloadCSV);

  async function load() {
    const slug = (el.slug.value || '').trim();
    if (!slug) return;

    // UI reset + yükleniyor
    el.stat.textContent = 'yükleniyor…';
    el.thead.innerHTML = '';
    el.tbody.innerHTML = '';
    lastCols = []; lastRows = [];

    try {
      // 1) Şema
      const formRes = await fetchJSON(`/api/forms/${encodeURIComponent(slug)}`);
      const schemaQ = Array.isArray(formRes?.form?.schema)
        ? formRes.form.schema
        : Array.isArray(formRes?.form?.schema?.questions)
        ? formRes.form.schema.questions
        : [];

      // Kanonik başlıklar
      const canonByNorm = new Map();
      const cols = [
        { key: 'created_at', label: 'Tarih' },
        { key: 'ip',         label: 'IP' }
      ];

      for (const q of schemaQ) {
        const label = q?.label ?? '';
        const nk = normKey(label);
        if (!canonByNorm.has(nk)) {
          canonByNorm.set(nk, label);
          cols.push({ key: label, label });
        }
      }

      // 2) Yanıtlar
      const raw = await fetchJSON(`/admin/forms/${encodeURIComponent(slug)}/responses.json`);
      const responses = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.rows)
        ? raw.rows
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.items)
        ? raw.items
        : [];

      // Sadece yanıtlarda görünen yeni başlıklar
      for (const rec of responses) {
        const ans = answersObject(rec?.payload);
        for (const k of Object.keys(ans)) {
          const nk = normKey(k);
          if (!canonByNorm.has(nk)) {
            canonByNorm.set(nk, k);
            cols.push({ key: k, label: canonByNorm.get(nk) });
          }
        }
      }

      // Başlık çiz
      renderHead(cols);

      // Satırlar
      const rows = responses.map((rec) => {
        const ans = answersObject(rec?.payload);
        const base = {
          created_at: fmt(rec.created_at || rec.createdAt || rec.created || rec.inserted_at),
          ip: rec.ip || rec.ip_address || rec.client_ip || ''
        };

        // Yanıtları normalleştir → kanonik başlığa eşle
        const byNorm = {};
        for (const [k, v] of Object.entries(ans)) byNorm[normKey(k)] = v;

        for (const c of cols.slice(2)) { // tarih+ip harici
          const want = normKey(c.label);
          let val = byNorm[want];
          if (Array.isArray(val)) val = val.join(', ');
          base[c.key] = (val ?? '').toString();
        }
        return base;
      });

      renderBody(cols, rows);
      el.stat.textContent = `kayıt: ${rows.length}, sütun: ${cols.length}`;
      lastCols = cols;
      lastRows = rows;

    } catch (err) {
      console.error(err);
      el.stat.textContent = `hata: ${err.message || err}`;
    }
  }

  function answersObject(payload) {
    if (!payload) return {};
    const obj = payload.answers ?? payload;
    return (obj && typeof obj === 'object') ? obj : {};
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function renderHead(cols) {
    el.thead.innerHTML = `<tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
  }

  function renderBody(cols, rows) {
    el.tbody.innerHTML = rows.map(r => (
      `<tr>${cols.map(c => `<td>${esc(r[c.key] ?? '')}</td>`).join('')}</tr>`
    )).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function tsv(cols, rows) {
    const head = cols.map(c => c.label).join('\t');
    const body = rows.map(r => cols.map(c => (r[c.key] ?? '').toString().replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t'));
    return [head, ...body].join('\n');
  }

  function copyTSV() {
    if (!lastCols.length) return;
    navigator.clipboard.writeText(tsv(lastCols, lastRows));
  }

  function downloadCSV() {
    if (!lastCols.length) return;
    const csv = tsv(lastCols, lastRows).replace(/\t/g, ',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (el.slug.value.trim() || 'results') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function fmt(x) {
    if (!x) return '';
    try {
      const d = new Date(x);
      if (!isNaN(d)) return d.toLocaleString('tr-TR');
    } catch {}
    return String(x);
  }
})();
