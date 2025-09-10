// netlify/edge-functions/form-ssr.js
export default async (request, context) => {
  const url = new URL(request.url);

  // slug: ?slug=… varsa onu, yoksa /slug gibi path'den al
  const rawPath  = url.pathname.replace(/^\/+|\/+$/g, '');
  const pathSlug = rawPath && !/\.html$/i.test(rawPath) ? rawPath : '';
  const slug = url.searchParams.get('slug') || pathSlug;
