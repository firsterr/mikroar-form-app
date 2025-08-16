(async function () {
  const $ = s => document.querySelector(s);
  const slugInput = $('#slug');
  const loadBtn = $('#loadBtn');
  const meta = $('#meta');
  const thead = $('#grid thead');
  const tbody = $('#grid tbody');
  const csvBtn = $('#csvBtn');
  const copyBtn = $('#copyBtn');

  // ?slug=... ile çağrılırsa otomatik set et
  const url = new URL(location.href);
  const initialSlug = url.searchParams.get('slug') || '';
  slugInput.value = initialSlug;

  // küçük yardımcılar
  const esc = (s='') => String(s).replaceAll('"','""');
  const asArray = v => Array.isArray(v) ? v : (v == null ? [] : [v]);

  async function load() {
    const slug = slugInput.value.trim();
    if (!slug) { alert('Slug girin'); return; }

    thead.innerHTML = '';
    tbody.innerHTML = '';
    meta.textContent = 'yükleniyor...';

    try {
      // 1) Şema (soru sırası için)
      const formRes = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      if (!formRes.ok) throw new Error('Form bulunamadı');
      const formJson = await formRes.json();
      const schema = formJson?.form?.schema || {};
      const qOrder = Array.isArray(schema.questions)
        ? schema.questions.map(q => q.label).filter(Boolean)
        : [];

      // 2) Yanıtlar
      const respRes = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, {
        credentials: 'include'
      });
      if (!respRes.ok) throw new Error(`Yanıtlar alınamadı (${respRes.status})`);
      const respJson = await respRes.json();
      const rows = respJson.rows || [];

      // 3) Tüm soruların başlık seti (ekstra sorular da dahil)
      const allQSet = new Set(qOrder);
      for (const r of rows) {
        const ans = r.payload?.answers || {};
        Object.keys(ans).forEach(k => allQSet.add(k));
      }
      // Önce şemadaki sıra, sonra yeni çıkanlar (alfabetik)
      const extra = [...allQSet].filter(x => !qOrder.includes(x)).sort((a,b)=>a.localeCompare(b,'tr'));
      const columns = ['created_at','ip', ...qOrder, ...extra];

      // 4) Başlık çiz
      const trHead = document.createElement('tr');
      for (const c of columns) {
        const th = document.createElement('th');
        th.textContent = (c === 'created_at' ? 'Tarih' : c === 'ip' ? 'IP' : c);
        trHead.appendChild(th);
      }
      thead.appendChild(trHead);

      // 5) Satırlar
      for (const r of rows) {
        const tr = document.createElement('tr');
        const answers = r.payload?.answers || {};

        for (const c of columns) {
          const td = document.createElement('td');
          if (c === 'created_at') {
            td.textContent = new Date(r.created_at).toLocaleString('tr-TR');
          } else if (c === 'ip') {
            td.textContent = r.ip || '';
          } else {
            const vals = asArray(answers[c]);
            if (!vals.length) {
              td.textContent = '';
            } else if (vals.length === 1) {
              td.textContent = vals[0];
            } else {
              // Çoklu seçimlerde pill
              vals.forEach(v => {
                const span = document.createElement('span');
                span.className = 'pill';
                span.textContent = v;
                td.appendChild(span);
              });
            }
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }

      meta.textContent = `kayıt: ${rows.length}, sütun: ${columns.length}`;
      // CSV export ve kopyalama için data sakla
      window.__gridData = { columns, rows };

    } catch (e) {
      console.error(e);
      alert('Yüklenemedi: ' + e.message);
      meta.textContent = 'hata';
    }
  }

  function buildCSV({ columns, rows }) {
    const lines = [];
    // başlık
    lines.push(columns.map(c => `"${esc(c)}"`).join(','));

    for (const r of rows) {
      const answers = r.payload?.answers || {};
      const line = columns.map(c => {
        if (c === 'created_at') return `"${esc(new Date(r.created_at).toISOString())}"`;
        if (c === 'ip') return `"${esc(r.ip || '')}"`;
        const vals = asArray(answers[c]);
        return `"${esc(vals.join(', '))}"`;
      }).join(',');
      lines.push(line);
    }
    return lines.join('\r\n');
  }

  function buildTSV({ columns, rows }) {
    const lines = [];
    lines.push(columns.join('\t'));
    for (const r of rows) {
      const answers = r.payload?.answers || {};
      const line = columns.map(c => {
        if (c === 'created_at') return new Date(r.created_at).toISOString();
        if (c === 'ip') return (r.ip || '');
        const vals = asArray(answers[c]);
        return vals.join(', ');
      }).join('\t');
      lines.push(line);
    }
    return lines.join('\n');
  }

  // Olaylar
  loadBtn.addEventListener('click', load);
  csvBtn.addEventListener('click', () => {
    if (!window.__gridData) return;
    const csv = buildCSV(window.__gridData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const slug = slugInput.value.trim() || 'export';
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}_grid.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  copyBtn.addEventListener('click', async () => {
    if (!window.__gridData) return;
    const tsv = buildTSV(window.__gridData);
    await navigator.clipboard.writeText(tsv);
    alert('TSV panoya kopyalandı. (Excel’de yapıştırabilirsiniz)');
  });

  if (initialSlug) load();
})();
