// mikroar-form-app/public/js/submit.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#anketForm');
  const out = document.querySelector('#sonuc'); // opsiyonel sonuç kutusu
  if (!form) return;

  // slug'ı şu sırayla bul: URL (?slug=...), form data-attribute, hidden input
  const params = new URLSearchParams(location.search);
  const slugFromUrl = params.get('slug') || params.get('s');
  const slugFromAttr = form.dataset.slug || null;
  const slugFromInput = form.querySelector('input[name="slug"]')?.value || null;
  let slug = slugFromUrl || slugFromAttr || slugFromInput;

  if (!slug) {
    if (out) out.textContent = 'Form slug bulunamadı. URL’ye ?slug=formayvalik ekleyin ya da formda hidden slug alanı kullanın.';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Alan isimlerini formundaki "name" değerlerine göre alıyoruz
    const ad = form.elements['ad']?.value?.trim() || '';
    const email = form.elements['email']?.value?.trim() || '';
    const mesaj = form.elements['mesaj']?.value?.trim() || '';

    // Basit doğrulama
    if (!ad || !email) {
      if (out) out.textContent = 'Lütfen ad ve e-posta girin.';
      return;
    }

    // Gönderim sırasında butonu kilitle
    const btn = form.querySelector('[type="submit"]');
    const old = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor…'; }

    try {
      const resp = await fetch('/.netlify/functions/submit-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ad, email, mesaj })
      });

      const data = await resp.json().catch(() => ({}));
      if (out) {
        out.textContent = `HTTP ${resp.status}\n` + JSON.stringify(data, null, 2);
      }

      if (resp.ok) {
        form.reset();
      }
    } catch (err) {
      if (out) out.textContent = 'Gönderim hatası: ' + err;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old || 'Gönder'; }
    }
  });
});
