// public/index.js
(async function () {
  const sel = document.getElementById('forms');
  const btnOpen = document.getElementById('btn-open');
  const btnCopy = document.getElementById('btn-copy');
  const statusEl = document.getElementById('status');

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || '';
  }

  try {
    setStatus('Yükleniyor...');
    const r = await fetch('/api/forms-list', { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json(); // { ok, rows: [{slug,title},...] }

    if (!data.ok) throw new Error(data.error || 'Liste alınamadı');

    sel.innerHTML = '';
    (data.rows || []).forEach(row => {
      const opt = document.createElement('option');
      opt.value = row.slug;
      opt.textContent = row.title || row.slug;
      sel.appendChild(opt);
    });

    if (!sel.options.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Aktif form yok';
      sel.appendChild(opt);
      sel.disabled = true;
      btnOpen.disabled = true;
      btnCopy.disabled = true;
    }
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('Liste alınamadı');
  }

  btnOpen?.addEventListener('click', () => {
    const slug = sel.value;
    if (!slug) return;
    window.location.href = `/form.html?slug=${encodeURIComponent(slug)}`;
  });

  btnCopy?.addEventListener('click', async () => {
    const slug = sel.value;
    if (!slug) return;
    const url = `${location.origin}/form.html?slug=${encodeURIComponent(slug)}`;
    await navigator.clipboard.writeText(url);
    btnCopy.textContent = 'Kopyalandı';
    setTimeout(() => (btnCopy.textContent = 'Bağlantıyı kopyala'), 800);
  });
})();
