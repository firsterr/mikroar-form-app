// public/app.js
const FORM_SLUG = 'genel-anket';

window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form');
  const statusEl = document.getElementById('status');

  if (!form) {
    console.error('Form bulunamadı!');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (statusEl) statusEl.textContent = 'Gönderiliyor…';

    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch(`/api/forms/${FORM_SLUG}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch {}

      if (res.ok && json && json.ok) {
        window.location.href = '/thanks.html';
      } else {
        const msg = (json && json.error) ? json.error : text || 'Bilinmeyen hata';
        console.error('API response:', text);
        if (statusEl) statusEl.textContent = 'Hata: ' + msg;
        alert('Gönderilemedi: ' + msg);
      }
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = 'Ağ hatası';
      alert('Ağ hatası: ' + err.message);
    }
  });
});
