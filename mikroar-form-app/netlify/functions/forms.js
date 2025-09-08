// netlify/functions/forms.js
export async function handler(event) {
  // Sadece GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { Allow: 'GET' }, body: 'Method Not Allowed' };
  }

  // slug'ı hem path'ten (/forms/<slug>) hem de ?slug=... şeklinden yakalamayı dene
  let slug = null;

  try {
    const url = new URL(event.rawUrl || 'http://x');
    const qSlug = url.searchParams.get('slug');
    if (qSlug) slug = qSlug;
  } catch {}

  const p = event.path || '';
  // Netlify’da path genelde "/.netlify/functions/forms/<slug>" olur
  const m = p.match(/\/forms\/([^/]+)$/);
  if (!slug && m) slug = decodeURIComponent(m[1]);

  if (!slug) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'slug missing' })
    };
  }

  // NOT: Burada DB'den gerçek form şemanı çekebilirsin.
  // Şimdilik frontend'in render edebilmesi için basit bir "stub" dönüyoruz.
  // Form.js genelde title/desc + fields gibi bir şema bekliyor.
  const schema = {
    slug,
    title: `Form: ${slug}`,
    description: 'Test şeması — geçici',
    fields: [
      { type: 'text', name: 'ad',     label: 'Ad',      required: true },
      { type: 'email', name: 'email', label: 'E-posta', required: true },
      { type: 'textarea', name: 'mesaj', label: 'Mesaj', required: false },
    ]
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ ok: true, schema })
  };
}

return {
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    // Netlify CDN'de 120 saniye cache (kullanıcıya anında),
    // tarayıcı cachelemesin diye max-age=0 bırakıyoruz.
    'Cache-Control': 'public, max-age=0, s-maxage=120'
  },
  body: JSON.stringify({ ok: true, schema })
};
