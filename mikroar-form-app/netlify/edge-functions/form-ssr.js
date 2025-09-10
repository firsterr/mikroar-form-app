// Edge SSR: /form.html?slug=... isteğinde formu server-side üretir
export default async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname !== '/form.html') return context.next();

  const slug = url.searchParams.get('slug');
  if (!slug) return context.next();

  // Functions üzerinden şemayı çek
  const apiURL = new URL(`/.netlify/functions/forms?slug=${encodeURIComponent(slug)}`, url.origin);
  let schema = null;
  try {
    const r = await fetch(apiURL.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) return context.next();
    const j = await r.json();
    if (!j?.ok || !j?.schema) return context.next();
    schema = j.schema;
  } catch { return context.next(); }

  const baseRes = await context.next();
  const ct = baseRes.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return baseRes;

  // Yardımcılar
  const esc = (s) => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

  const renderQ = (q, i) => {
    const type = String(q.type || 'text').toLowerCase();
    const name = q.name || `q${i+1}`;
    const label = q.label || `Soru ${i+1}`;
    const req = q.required ? ' required' : '';
    const opts = Array.isArray(q.options) ? q.options : [];

    if (type === 'radio' || type === 'checkbox') {
      if (!opts.length) {
        return `<div class="row"><label>${esc(label)}${req ? ' *' : ''}</label><div class="muted">Bu soru için seçenek tanımlı değil.</div></div>`;
      }
      const items = opts.map((opt,j)=>{
        const id = `f_${name}_${j}`;
        return `<div><input id="${id}" type="${type}" name="${esc(name)}" value="${esc(opt)}"${type==='radio'&&req?' required':''}><label for="${id}">${esc(opt)}</label></div>`;
      }).join('');
      return `<div class="row"><label>${esc(label)}${req ? ' *' : ''}</label><div>${items}</div></div>`;
    }

    if (type === 'select') {
      const options = opts.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      const warn = opts.length ? '' : `<div class="muted">Bu soru için seçenek tanımlı değil.</div>`;
      return `<div class="row"><label>${esc(label)}${req ? ' *' : ''}</label><select name="${esc(name)}"${req}><option value="" disabled selected>Seçiniz</option>${options}</select>${warn}</div>`;
    }

    if (type === 'textarea') {
      return `<div class="row"><label>${esc(label)}${req ? ' *' : ''}</label><textarea name="${esc(name)}"${req}></textarea></div>`;
    }

    const it = type === 'email' ? 'email' : 'text';
    return `<div class="row"><label>${esc(label)}${req ? ' *' : ''}</label><input type="${it}" name="${esc(name)}"${req}></div>`;
  };

  const qs = (schema.questions || schema.fields || []).map(renderQ).join('');
  const formInner = `${qs}<div class="actions"><button type="submit">Gönder</button></div><p class="foot-meta">Bu form mikroar.com alanında oluşturulmuştur.</p>`;

  const full = {
    slug,
    title: schema.title || slug,
    description: schema.description || '',
    questions: (schema.questions || schema.fields || [])
  };

  // HTML’e bas
  const rewriter = new HTMLRewriter()
    .on('h1#title', { element(el){ el.setInnerContent(full.title, {html:false}); el.setAttribute('style','display:block'); } })
    .on('p#desc',   { element(el){
      if (full.description) { el.setInnerContent(full.description, {html:false}); el.setAttribute('style','display:block'); }
      else el.setAttribute('style','display:none');
    }})
    .on('form#form',{ element(el){
      el.setAttribute('data-ssr','1');
      el.removeAttribute('style');                 // display:none varsa kaldır
      el.setAttribute('action', `/api/submit-form?slug=${encodeURIComponent(slug)}`);
      el.setAttribute('method','POST');
      el.setInnerContent(formInner, {html:true});  // SORULARI HTML OLARAK ENJEKTE ET
    }})
    .on('head', { element(el){
      el.append(`<script id="__SSR_FORM__">window.__FORM=${JSON.stringify(full)};</script>`, {html:true});
      el.append(`<meta name="ssr" content="1">`, {html:true});
    }});

  return rewriter.transform(baseRes);
};

export const config = { path: '/form.html' };
