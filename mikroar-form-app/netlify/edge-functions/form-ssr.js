// form-ssr.js — k (short code) -> slug çöz ve kanonik URL'ye yönlendir.
// Tek bir default export olmalı!

export default async (request, context) => {
  const url = new URL(request.url);

  // Sadece form sitesi için k->slug çöz
  if (url.hostname === "form.mikroar.com") {
    const k = url.searchParams.get("k");
    const slug = url.searchParams.get("slug");

    // slug yoksa ve k varsa: functions/forms ile çöz
    if (k && !slug) {
      try {
        const api = new URL(
          "/.netlify/functions/forms?k=" + encodeURIComponent(k),
          url.origin
        );
        const res = await fetch(api.toString());
        const data = await res.json();

        if (data?.ok && data?.form?.slug) {
          url.searchParams.delete("k");
          url.searchParams.set("slug", data.form.slug);
          // Short code'u kanonik slug URL'sine 302 ile yönlendir
          return Response.redirect(url.toString(), 302);
        }
      } catch {
        // Sessiz geç; sayfa normal akışa düşsün
      }
    }
  }

  // Başka işlem yoksa normal akış
  return context.next();
};
