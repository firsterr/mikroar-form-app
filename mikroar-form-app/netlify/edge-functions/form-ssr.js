// netlify/edge-functions/form-ssr.js
export default async (request, context) => {
  const url = new URL(request.url);

  // slug: ?slug=… varsa onu, yoksa /slug gibi yoldan al
  const rawPath  = url.pathname.replace(/^\/+|\/+$/g,'');
  const pathSlug = rawPath && !/\.html$/i.test(rawPath) ? rawPath : '';
  const slug = url.searchParams.get('slug') || pathSlug;

  // slug yoksa SSR yapmayıp normal statik sayfayı verelim
  if (!slug) return context.next();

  // --- CDN cache (ilk istekten sonra "pat" diye gelsin) ---
  const cache = caches.default;
  const cacheKey = new Request(`https://edge-cache/form-ssr?slug=${encodeURIComponent(slug)}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Statik form.html içeriğini al
  const assetRes = await fetch(new URL('/form.html', url), { cf: { cacheTtl: 0 } });
  const html = await assetRes.text();

  // Şemayı al (functions → Supabase). Bu ilk sefer biraz sürebilir; sonra cache devreye girer.
  const apiRes = await fetch(new URL(`/.netlify/functions/forms?slug=${encodeURIComponent(slug)}`, url), {
    headers: { 'accept': 'application/json' }
  });
  const apiJson = await apiRes.json().catch(() => ({}));
  if (!apiJson?.ok || !apiJson?.schema) {
    // Şema yoksa statik sayfayı olduğu gibi döndür (client fetch eder)
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  }

  // Yalnızca gerekli alanları gömelim
  const schema = apiJson.schema || {};
  const slim = {
    title: schema.title || slug,
    description: schema.description || '',
    questions: schema.questions || schema.fields || []
  };

  // XSS güvenliği için </script> kırma ve < kaçağı
  const payload = JSON.stringify(slim)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(/<\/script/gi, '<\\/script');

  // __SCHEMA__ JSON'unu </body> öncesine enjekte et
  const injected = html.replace(
    '</body>',
    `<script id="__SCHEMA__" type="application/json">${payload}</script></body>`
  );

  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    // CDN cache: 10 dk hızlı servis + 1 gün SWR
    'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    // CSS'i önden yükle (ilk boyamayı hızlandırır)
    'link': '</form.css>; rel=preload; as=style'
  });

  const res = new Response(injected, { status: 200, headers });

  // Arka planda cache’e koy (CDN’de tutulur, sonraki istekler anında)
  context.waitUntil(cache.put(cacheKey, res.clone()));

  return res;
};
