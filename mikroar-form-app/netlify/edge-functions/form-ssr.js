export default async (request, context) => {
  const url = new URL(request.url);

  // Sadece /form.html ve slug varsa çalış
  if (url.pathname.endsWith('/form.html') && url.searchParams.get('slug')) {
    // HTML ve API çağrısını paralel yap
    const [pageRes, apiRes] = await Promise.all([
      context.next(),
      fetch(`${url.origin}/.netlify/functions/forms?slug=${encodeURIComponent(url.searchParams.get('slug'))}`, {
        headers: { 'accept': 'application/json' }
      })
    ]);

    let html = await pageRes.text();

    try {
      const data = await apiRes.json();
      if (data?.ok && data?.schema) {
        // Şemayı ilk HTML’in içine göm
        const payload = `<script>window.__SCHEMA__=${JSON.stringify(data.schema)};</script>`;
        html = html.includes('</head>')
          ? html.replace('</head>', `${payload}</head>`)
          : html.replace('<body>', `<body>${payload}`);
      }
    } catch (_) { /* injection olmazsa client fetch’e düşer */ }

    // Orijinal response başlıklarını koru
    const h = new Headers(pageRes.headers);
    return new Response(html, { status: pageRes.status, headers: h });
  }

  // Diğer istekleri olduğu gibi devam ettir
  return context.next();
};
