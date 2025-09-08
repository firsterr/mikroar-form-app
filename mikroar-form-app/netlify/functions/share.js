exports.handler = async (e) => {
  const slug = (e.queryStringParameters?.slug||'').trim();
  const title = `Form: ${slug}`;
  const desc  = `Anket – ${slug}`;
  const img   = 'https://anketmikroar.netlify.app/og-default.png'; // şimdilik sabit

  const html = `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="https://anketmikroar.netlify.app/form.html?slug=${encodeURIComponent(slug)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="/form.html?slug=${encodeURIComponent(slug)}">
</head><body>Yönlendiriliyor… <script>location.href="/form.html?slug=${encodeURIComponent(slug)}"</script></body></html>`;

  return { statusCode: 200, headers: { 'Content-Type':'text/html' }, body: html };
};
