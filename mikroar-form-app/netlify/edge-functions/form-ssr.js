// Edge SSR: form.html?slug=... isteğinde formu server-side çiz ve HTML'e enjekte et
export default async (request, context) => {
  const url = new URL(request.url);

  // Sadece form sayfasını ele al
  if (url.pathname !== '/form.html') return context.next();

  // slug tespiti: ?slug=... (form.html dışı path slug’ını kullanmıyoruz)
  const slug = url.searchParams.get('slug');
  if (!slug) return context.next(); // slug yoksa client tarafı liste ekranı çalışsın

  // Form şemasını Functions üzerinden çek
  const apiURL = new URL(`/.netlify/functions/forms?slug=${encodeURIComponent(slug)}`, url.origin);
  let schema = null;
  try {
    const r = await fetch(apiURL.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) return context.next();
    const j = await r.json();
    if (!j?.ok || !j?.schema) return context.next();
    schema = j.schema;
  } catch {
    return context.next();
  }

  // Orijinal HTML’i al
  const origRes = await context.next();
  const contentType = origRes.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return origRes;

  // Soru HTML’lerini üret
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const renderQuestion = (q, i) => {
    const type = String(q.type || 'text').toLowerCase();
    const name = q.name || `q${i + 1}`;
    const label = q.label || `Soru ${i + 1}`;
    const required = q.required ? ' required' : '';
    const opts = Array.isArray(q.options) ? q.options : [];

    if (type === 'radio' || type === 'checkbox') {
      if (!opts.length) {
        return `<div class="row"><label>${esc(label)}${required ? ' *' : ''}</label><div class="muted">Bu soru için seçenek tanımlı değil.</div></div>`;
      }
      const items = opts
        .map((opt, j) => {
          const id = `f_${name}_${j}`;
          return `<div><input id="${id}" type="${type}" name="${esc(name)}" value="${esc(opt)}"${type === 'radio' && required ? ' required' : ''}><label for="${id}">${esc(opt)}</label></div>`;
        })
        .join('');
      return `<div class="row"><label>${esc(label)}${required ? ' *' : ''}</label><div>${items}</div></div>`;
    }

    if (type === 'select') {
      const options = opts.length
        ? opts.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')
        : '';
      const warn = opts.length ? '' : `<div class="muted">Bu soru için seçenek tanımlı değil.</div>`;
      return `<div class="row"><label>${esc(label)}${required ? ' *' : ''}</label><select name="${esc(name)}"${required}><option value="" disabled selected>Seçiniz</option>${options}</select>${warn}</div>`;
    }

    if (type === 'textarea') {
      return `<div class="row"><label>${esc(label)}${required ? ' *' : ''}</label><textarea name="${esc(name)}"${required}></textarea></div>`;
    }

    // text / email / default
    const itype = type === 'email' ? 'email' : 'text';
    return `<div class="row"><label>${esc(label)}${required ? ' *' : ''}</label><input type="${itype}" name="${esc(name)}"${required}></div>`;
  };

  const questions = (schema.questions || schema.fields || []).map(renderQuestion).join('');
  const formInner = `${questions}<div class="actions"><button type="submit">Gönder</button></div><p class="foot-meta">Bu form mikroar.com alanında oluşturulmuştur.</p>`;

  // HTML Rewriter ile <h1>, <p#desc> ve <form#form> içine SSR içeriklerini bas
  const rewriter = new HTMLRewriter()
    .on('h1#title', {
      element(el) {
        el.setInnerContent(schema.title || slug, { html: false });
        el.setAttribute('style', 'display:block');
      }
    })
    .on('p#desc', {
      element(el) {
        if (schema.description) {
          el.setInnerContent(schema.description, { html: false });
          el.setAttribute('style', 'display:block');
        } else {
          el.setAttribute('style', 'display:none');
        }
      }
    })
    .on('form#form', {
      element(el) {
        // SSR ile hemen görünür olsun + client tarafı yeniden çizmesin diye işaret koy
        el.setAttribute('data-ssr', '1');
        el.removeAttribute('style'); // varsa display:none’i temizle
        el.setAttribute('action', `/api/submit-form?slug=${encodeURIComponent(slug)}`);
        el.setAttribute('method', 'POST');
        el.setInnerContent(formInner, { html: true });
      }
    })
    .on('head', {
      element(el) {
        // Client tarafında fetch’i atlatmak için minimal şema (başlık, açıklama, slug)
        const light = {
          slug,
          title: schema.title || slug,
          description: schema.description || ''
        };
        el.append(
          `<script id="__SSR_FORM__">window.__FORM=${JSON.stringify(light)};</script>`,
          { html: true }
        );
      }
    });

  return rewriter.transform(origRes);
};

// Netlify Edge için zorunlu export (CommonJS yok)
export const config = { path: '/form.html' };
