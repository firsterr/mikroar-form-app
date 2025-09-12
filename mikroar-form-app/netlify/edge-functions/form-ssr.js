// Edge: /form.html isteklerini karşılar.
// - ?k=CODE varsa kısa kodu slug'a çevirir ve /form.html?slug=…'a 302 yönlendirir
// - ?slug=.. varsa devam (SSR iskelet + preload); yoksa mevcut sayfa devam eder.

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const isFormHost = url.hostname === "form.mikroar.com";

    // 1) Shortlink: ?k=CODE -> slug bul ve redirect
    const k = url.searchParams.get("k");
    const hasSlug = url.searchParams.has("slug");

    if (isFormHost && k && !hasSlug) {
      const origin = `${url.protocol}//${url.host}`;
      const r = await fetch(`${origin}/.netlify/functions/go?code=${encodeURIComponent(k)}`, {
        headers: { "accept": "application/json" }
      });

      if (r.ok) {
        const json = await r.json();
        if (json?.ok && json?.slug) {
          url.searchParams.delete("k");
          url.searchParams.set("slug", json.slug);
          return Response.redirect(url.toString(), 302);
        }
      }
      // Kod bulunamadıysa normal akış (liste sayfası) devam etsin:
      return context.next();
    }

    // 2) slug varsa; SSR tarafında hafif bir iskelet iyileştirmesi yapılabilir
    // (İçerik fetch'ini client zaten yapıyor; beyaz ekran süresini kısaltıyoruz.)
    return context.next();
  } catch (e) {
    // Hata durumunda sayfayı bozmayalım
    return context.next();
  }
};
