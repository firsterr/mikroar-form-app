// public/app.js
const FORM_SLUG = 'genel-anket';

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form');
  const statusEl = document.getElementById('status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (statusEl) statusEl.textContent = 'Gönderiliyor…';

    // Tüm formu JSON'a çevir
    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    try {
      const res = await fetch(`/api/forms/${FORM_SLUG}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
      if (res.ok && json && json.ok) location.href = '/thanks.html';
      else {
        const msg = (json && json.error) ? json.error : text || 'Bilinmeyen hata';
        if (statusEl) statusEl.textContent = 'Hata: ' + msg;
        alert(msg);
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Ağ hatası';
      alert('Ağ hatası: ' + err.message);
    }
  });
});
