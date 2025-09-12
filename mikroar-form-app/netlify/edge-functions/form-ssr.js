// netlify/edge-functions/form-ssr.js
export default async (request, context) => {
  const url = new URL(request.url);

  // Sadece form.mikroar.com için k->slug çöz (diğer hostlar admin'e yönleniyor)
  if (url.hostname === "form.mikroar.com") {
    const k = url.searchParams.get("k");
    const slug = url.searchParams.get("slug");

    // slug yok, k varsa: functions/forms ile çöz ve kanonik slug'a yönlendir
    if (!slug && k) {
      try {
        const api = new URL("/.netlify/functions/forms?k=" + encodeURIComponent(k), url.origin);
        const res = await fetch(api.toString());
        const data = await res.json();
        if (data?.ok && data?.form?.slug) {
          url.searchParams.delete("k");
          url.searchParams.set("slug", data.form.slug);
          return Response.redirect(url.toString(), 302);
        }
      } catch (e) {
        // sessiz geç
      }
    }
  }

  // Mevcut SSR içeriğin neyse ona devam (veya sadece passthrough)
  return context.next();
};
// netlify/edge-functions/form-ssr.js
export default async (request, context) => {
  const url = new URL(request.url);

  // Yalnızca /form.html için çalışalım
  if (url.pathname !== "/form.html") return context.next();

  const k = url.searchParams.get("k");
  if (!k) return context.next(); // zaten slug ile gelmiş

  // Kısa kodu slug'a çevir
  const SUPABASE_URL = Netlify.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Netlify.env.get("SUPABASE_SERVICE_ROLE");

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/shortlinks?select=slug&code=eq.${encodeURIComponent(
        k
      )}&limit=1`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      }
    );

    if (!resp.ok) throw new Error("shortlink-lookup-failed");

    const rows = await resp.json();
    const slug = rows?.[0]?.slug || null;

    if (!slug) {
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Bulunamadı</title>
         <div style="font:16px/1.45 system-ui, -apple-system, Segoe UI, Roboto;max-width:720px;margin:48px auto">
           <h1>Kısa kod bulunamadı</h1>
           <p>Geçersiz veya süresi bitmiş kısa kod: <b>${k}</b></p>
         </div>`,
        { headers: { "content-type": "text/html; charset=utf-8" }, status: 404 }
      );
    }

    // Kanonik URL'e yönlendir (slug ile)
    url.searchParams.delete("k");
    url.searchParams.set("slug", slug);
    return Response.redirect(url.toString(), 302);
  } catch {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Hata</title>
       <div style="font:16px/1.45 system-ui, -apple-system, Segoe UI, Roboto;max-width:720px;margin:48px auto">
         <h1>Kısa kod çözümlenemedi</h1>
         <p>Geçici bir problem oluştu. Lütfen daha sonra tekrar deneyin.</p>
       </div>`,
      { headers: { "content-type": "text/html; charset=utf-8" }, status: 500 }
    );
  }
};

export const config = { path: "/form.html" };
