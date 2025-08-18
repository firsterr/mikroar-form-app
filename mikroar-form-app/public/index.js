(async function init(){
  const sel  = document.getElementById('sel');
  const open = document.getElementById('open');
  const copy = document.getElementById('copy');
  const msg  = document.getElementById('msg');

  function setLoading() {
    sel.innerHTML = '<option value="">— Yükleniyor… —</option>';
    sel.disabled = true; open.disabled = true; copy.disabled = true;
    msg.textContent = '';
  }

  function populate(rows) {
    sel.innerHTML = '';
    if (!rows || rows.length === 0) {
      sel.innerHTML = '<option value="">(Aktif form yok)</option>';
      sel.disabled = true; open.disabled = true; copy.disabled = true;
      msg.textContent = 'Admin üzerinden bir formı “Aktif” yapın.';
      return;
    }
    sel.disabled = false;
    for (const r of rows) {
      const opt = document.createElement('option');
      opt.value = r.slug;
      opt.textContent = r.title ? `${r.title}  •  ${r.slug}` : r.slug;
      sel.appendChild(opt);
    }
    open.disabled = false; copy.disabled = false;
    msg.textContent = 'Bir form seçip “Formu aç” ile devam edin.';
  }

  async function loadForms(){
    setLoading();
    try {
      // ÖNEMLİ: public endpoint
      const res = await fetch('/api/forms', { cache: 'no-store' });
      if (!res.ok) throw new Error('Sunucu '+res.status+' döndürdü');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Bilinmeyen hata');
      populate(data.rows);
    } catch (e) {
      sel.innerHTML = '<option value="">(Yüklenemedi)</option>';
      sel.disabled = true; open.disabled = true; copy.disabled = true;
      msg.innerHTML = `<span class="error">Yüklenemedi:</span> ${e.message}`;
    }
  }

  open.addEventListener('click', () => {
    const slug = sel.value;
    if (!slug) return;
    location.href = `/form.html?slug=${encodeURIComponent(slug)}`;
  });

  copy.addEventListener('click', async () => {
    const slug = sel.value;
    if (!slug) return;
    const url = `${location.origin}/form.html?slug=${encodeURIComponent(slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      msg.textContent = 'Bağlantı panoya kopyalandı.';
    } catch {
      msg.textContent = url;
    }
  });

  await loadForms();
})();
