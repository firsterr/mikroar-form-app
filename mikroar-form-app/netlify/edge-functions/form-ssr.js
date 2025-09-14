// Netlify Edge – OG/Twitter meta'ları tekilleştirir ve doğru görseli enjekte eder.
export default async (request, context) => {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  let slug = url.searchParams.get("slug") || null;
  let code = null;
  const m = url.pathname.match(/^\/f\/([^/?#]+)/);
  if (m && m[1]) code = m[1];

  // Varsayılan meta (harici URL'de origin EKLEME!)
  let meta = {
    title: "Mikroar Anket",
    description: "Ankete katılın.",
    image: "https://www.emturkey.com.tr/wp-content/uploads/2022/03/em-nedir-resim.jpg",
    url: origin + url.pathname
  };

  // Form başlığı/açıklaması mevcutsa zenginleştir
  try {
    if (slug || code) {
      const api = new URL(origin + "/api/forms");
      if (slug) api.searchParams.set("slug", slug);
      if (code) api.searchParams.set("k", code);
      const r = await fetch(api.toString());
      if (r.ok) {
        const data = await r.json();
        if (data?.ok && data.form) {
          meta.title = data.form.title || meta.title;
          meta.description = data.form.description || meta.description;
          if (data.form.og_image) meta.image = absUrl(data.form.og_image, origin);
        }
      }
    }
  } catch (_) {}

  const resp = await context.next();
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html")) return resp;

  const tags = `
    <!-- og-from-edge -->
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${meta.image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${meta.url}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${meta.image}" />
  `;

  // Var olan og:/twitter: meta'larını temizle → tek set kalsın
  return new HTMLRewriter()
    .on('meta[property^="og:"]', { element(el){ el.remove(); } })
    .on('meta[name^="twitter:"]',  { element(el){ el.remove(); } })
    .on('head', { element(h){ h.append(tags, { html: true }); } })
    .transform(resp);
};

function esc(s=""){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
function absUrl(p, origin){ try{ return new URL(p, origin).href; }catch{ return origin + p; } }

export const config = { path: ["/f/*", "/form.html"] };
