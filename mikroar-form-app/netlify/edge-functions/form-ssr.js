// Netlify Edge (Deno). /f/* ve /form.html isteklerinde <head>'e OG/Twitter meta ekler.
export default async (request, context) => {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  // Kimlik çöz: /f/:code veya ?slug= / ?k=
  let slug = url.searchParams.get("slug") || null;
  let code = null;
  const m = url.pathname.match(/^\/f\/([^/?#]+)/);
  if (m && m[1]) code = m[1];
  if (!slug && !code) {
    // /form.html (liste modu) için de default meta enjekte edeceğiz
  }

  // Varsayılan meta (fallback)
  let meta = {
    title: "Mikroar Anket",
    description: "Ankete katılın.",
    image: origin + "/og/default.jpg", // public/og/default.jpg dosyasını koy
    url: origin + url.pathname
  };

  // Form başlığı/açıklamasıyla meta’yı zenginleştir
  try {
    const api = new URL(origin + "/api/forms");
    if (slug) api.searchParams.set("slug", slug);
    if (code) api.searchParams.set("k", code);

    // slug/code varsa form çek; yoksa default meta kalır
    if (slug || code) {
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
    meta.url = origin + url.pathname;
  } catch (_) {}

  // Orijinal yanıtı al
  const resp = await context.next();
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/html")) return resp;

  // <head> içine meta'ları enjekte et
  const tags = `
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:image" content="${meta.image}" />
    <meta property="og:url" content="${meta.url}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${meta.image}" />
  `;

  return new HTMLRewriter()
    .on("head", { element(h) { h.append(tags, { html: true }); } })
    .transform(resp);
};

function esc(s = "") { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
function absUrl(path, origin){ try { return new URL(path, origin).href; } catch { return origin + path; } }

export const config = { path: ["/f/*", "/form.html"] };
