// form-ssr.js — k (short code) -> slug çöz ve kanonik URL'ye 302 yönlendir.
export default async (request, context) => {
  const url = new URL(request.url);

  // Sadece form sitesi
  if (url.hostname !== "form.mikroar.com") return context.next();

  // /form.html?k=XXXX veya /form.html?slug=...
  const k    = url.searchParams.get("k");
  const slug = url.searchParams.get("slug");

  if (k && !slug) {
    try {
      const api = new URL("/.netlify/functions/forms?k=" + encodeURIComponent(k), url.origin);
      const res = await fetch(api.toString(), { headers: { "accept":"application/json" } });
      const data = await res.json();

      if (data?.ok && data?.form?.slug) {
        url.searchParams.delete("k");
        url.searchParams.set("slug", data.form.slug);
        return Response.redirect(url.toString(), 302);
      }
    } catch { /* sessiz geç */ }
  }

  return context.next();
};
