// results.js — soruları kolon, yanıtları satır yapan pivot tablo
(async () => {
  const el = (id) => document.getElementById(id);
  const slugInput = el('slugInput');
  const loadBtn = el('loadBtn');
  const grid = el('grid');
  const th = grid.querySelector('thead');
  const tb = grid.querySelector('tbody');

  const metaTitle = el('metaTitle');
  const metaActive= el('metaActive');
  const metaCount = el('metaCount');

  // URL ?slug=
  const urlSlug = new URLSearchParams(location.search).get('slug');
  if (urlSlug) slugInput.value = urlSlug;

  async function load() {
    const slug = slugInput.value.trim();
    if (!slug) return;

    // Form şeması (soru başlıkları)
    const fRes = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const f = await fRes.json();
    if (!fRes.ok || !f.ok) {
      th.innerHTML = ''; tb.innerHTML = '';
      alert(f.error || 'Form okunamadı');
      return;
    }

    const form = f.form;
    const questions = (form.schema && form.schema.questions) ? form.schema.questions : [];

    metaTitle.textContent = `Başlık: ${form.title || slug}`;
    metaActive.textContent= `Durum: ${(form.active === false) ? 'pasif' : 'aktif'}`;
    metaCount.textContent = `Soru: ${questions.length}`;

    // Yanıtlar
    const rRes = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, { cache: 'no-store' });
    const r = await rRes.json();
    if (!rRes.ok || !r.ok) {
      th.innerHTML = ''; tb.innerHTML = '';
      alert(r.error || 'Yanıtlar okunamadı');
      return;
    }

    // Kolonlar: Tarih, IP + sorular
    const cols = ['Tarih', 'IP', ...questions.map(q => q.label || 'Soru')];

    // Tablo başlık
    th.innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`;

    // Satırlar
    tb.innerHTML = '';
    r.rows.forEach(row => {
      const p = row.payload || {};
      const answersObj = p.answers || p; // eski q_0/q_1 ise aşağıda fallback var

      const tr = document.createElement('tr');

      const tds = [];
      // tarih & ip
      tds.push(new Date(row.created_at).toLocaleString('tr-TR'));
      tds.push(row.ip || '');

      // her soru için cevap
      questions.forEach((q, idx) => {
        const keyLabel = q.label || `Soru ${idx+1}`;
        let val;

        if (answersObj && Object.prototype.hasOwnProperty.call(answersObj, keyLabel)) {
          val = answersObj[keyLabel];
        } else {
          // q_0/q_1 fallback
          const qKey = `q_${idx}`;
          val = answersObj[qKey];
        }

        if (Array.isArray(val)) val = val.join(', ');
        if (val == null) val = '';
        tds.push(String(val));
      });

      tr.innerHTML = tds.map(v => `<td>${v}</td>`).join('');
      tb.appendChild(tr);
    });

    // Copy & CSV
    el('copyBtn').onclick = () => {
      const rows = [[...cols], ...Array.from(tb.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => td.textContent))];
      const tsv = rows.map(r => r.map(x => (x || '').replace(/\t/g,' ')).join('\t')).join('\n');
      navigator.clipboard.writeText(tsv);
      el('copyBtn').textContent = 'Kopyalandı ✓';
      setTimeout(()=> el('copyBtn').textContent='Kopyala (TSV)', 1500);
    };

    el('csvBtn').onclick = () => {
      const rows = [[...cols], ...Array.from(tb.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => td.textContent))];
      const csv = rows.map(r => r.map(x => `"${String(x||'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}_export.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  loadBtn.addEventListener('click', load);
  if (slugInput.value) load();
})();
