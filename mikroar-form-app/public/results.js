// results.js  (tamamını yapıştırın)

(async function () {
  const $ = (sel) => document.querySelector(sel);

  // UI elemanları
  const slugInput = $('#slug');
  const loadBtn   = $('#btnLoad');
  const tsvBtn    = $('#btnCopy');
  const csvBtn    = $('#btnCsv');
  const tableWrap = $('#tableWrap');
  const infoEl    = $('#info');

  // Yardımcılar
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const dd = d.toLocaleDateString('tr-TR');
      const tt = d.toLocaleTimeString('tr-TR', { hour12: false });
      return `${dd} ${tt}`;
    } catch { return iso || ''; }
  };

  const toText = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    return String(v);
  };

  const buildHeader = (questions) => {
    // İlk iki sabit sütun
    const ths = [
      '<th>Tarih</th>',
      '<th>IP</th>',
      ...questions.map(q => `<th>${q.label}</th>`)
    ];
    return `<thead><tr>${ths.join('')}</tr></thead>`;
  };

  const buildRows = (rows, questions) => {
    return rows.map(r => {
      const a = r.answers || {}; // server COALESCE yaptı ama yine de koruyalım
      const tds = [
        `<td>${fmtDate(r.created_at)}</td>`,
        `<td>${toText(r.ip)}</td>`,
        ...questions.map(q => `<td>${toText(a[q.label])}</td>`)
      ];
      return `<tr>${tds.join('')}</tr>`;
    }).join('');
  };

  const buildTable = ({ rows, questions }) => {
    if (!rows.length) {
      tableWrap.innerHTML = `<div class="empty">Kayıt yok</div>`;
      infoEl.textContent  = `kayıt: 0, sütun: ${questions.length + 2}`;
      return;
    }
    const html = `
      <table class="res">
        ${buildHeader(questions)}
        <tbody>
          ${buildRows(rows, questions)}
        </tbody>
      </table>
    `;
    tableWrap.innerHTML = html;
    infoEl.textContent  = `kayıt: ${rows.length}, sütun: ${questions.length + 2}`;
  };

  // TSV/CSV export
  const tableToMatrix = () => {
    const table = tableWrap.querySelector('table');
    if (!table) return [];
    const rows = [...table.querySelectorAll('tr')].map(tr => {
      return [...tr.children].map(td => td.textContent.trim());
    });
    return rows;
  };

  const copyTSV = () => {
    const m = tableToMatrix();
    if (!m.length) return;
    const tsv = m.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
  };

  const downloadCSV = () => {
    const m = tableToMatrix();
    if (!m.length) return;
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = m.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${slugInput.value || 'sonuclar'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ana yükleme
  const load = async () => {
    const slug = (slugInput.value || '').trim();
    if (!slug) return;

    tableWrap.innerHTML = `<div class="loading">yükleniyor...</div>`;
    infoEl.textContent  = '';

    try {
      // 1) Şemayı al
      const formRes = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { credentials: 'include' });
      const formJs  = await formRes.json();
      if (!formJs.ok) throw new Error(formJs.error || 'Form bulunamadı');

      // İçeride schema.questions bekliyoruz
      const questions = (formJs.form?.schema?.questions) || [];

      // 2) Yanıtları al (COALESCE answers/payload)
      const respRes = await fetch(`/api/forms/${encodeURIComponent(slug)}/responses`, { credentials: 'include' });
      const respJs  = await respRes.json();
      if (!respJs.ok) throw new Error(respJs.error || 'Yanıtlar alınamadı');

      buildTable({ rows: respJs.rows || [], questions });

    } catch (e) {
      tableWrap.innerHTML = `<div class="error">hata: ${e.message}</div>`;
      infoEl.textContent  = '';
    }
  };

  // Butonlar
  loadBtn?.addEventListener('click', load);
  tsvBtn?.addEventListener('click', copyTSV);
  csvBtn?.addEventListener('click', downloadCSV);

  // Sayfa açılır açılmaz otomatik yüklemek isterseniz:
  if (slugInput.value) load();
})();
