// /public/admin.js
(() => {
  const API = '/api';
  const $ = (s, el=document) => el.querySelector(s);
  const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

  const els = {
    slug:        $('#slug'),
    title:       $('#title'),
    description: $('#description'),
    status:      $('#status'),
    summary:     $('#summary'),
    qs:          $('#qs'),
    btnLoad:     $('#btnLoad'),
    btnNew:      $('#btnNew'),
    btnAdd:      $('#btnAdd'),
    btnSave:     $('#btnSave'),
    toast:       $('#toast'),
  };

  // ---- Admin token
  function getToken() {
    let t = localStorage.getItem('ADMIN_TOKEN') || '';
    if (!t) {
      t = prompt('Admin token (bir kez girilecek):') || '';
      if (t) localStorage.setItem('ADMIN_TOKEN', t);
    }
    return t;
  }

  async function api(url, opts={}) {
    const headers = Object.assign(
      { 'Accept': 'application/json' },
      opts.headers || {},
      { 'X-Admin-Token': getToken() }
    );
    const res = await fetch(url, { ...opts, headers });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { ok:false, message:text || 'Parse error'}; }
    if (!res.ok || json.ok === false) {
      const msg = json.message || json.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  function toast(msg, ok=true) {
    const el = els.toast;
    el.textContent = msg;
    el.className = ok ? 'ok' : 'err';
    el.style.display = 'block';
    setTimeout(()=> (el.style.display='none'), 2500);
  }

  // ---------- Question editor ----------
  function makeQRow(field = {type:'text', name:'', label:'', required:false}) {
    const row = document.createElement('div');
    row.className = 'q-row';

    row.innerHTML = `
      <div class="q-grid">
        <select class="q-type">
          <option value="text">Metin</option>
          <option value="email">E-posta</option>
          <option value="textarea">Metin (uzun)</option>
          <option value="radio">Tek seçim</option>
          <option value="checkbox">Çoklu seçim</option>
        </select>
        <input class="q-name"  type="text" placeholder="alan adı (örn. ad)">
        <input class="q-label" type="text" placeholder="Etiket (örn. Ad)">
        <label class="q-req"><input class="q-required" type="checkbox"> Zorunlu</label>
        <button type="button" class="q-del">Sil</button>
      </div>
      <div class="q-options" style="display:none">
        <input class="q-opts" type="text" placeholder="Seçenekleri virgülle yazın (örn: A,B,C)">
      </div>
    `;

    // Set initial values
    $('.q-type', row).value = field.type || 'text';
    $('.q-name', row).value = field.name || '';
    $('.q-label', row).value = field.label || '';
    $('.q-required', row).checked = !!field.required;

    // Options for radio/checkbox
    const optsWrap = $('.q-options', row);
    if (field.type === 'radio' || field.type === 'checkbox') {
      optsWrap.style.display = '';
      $('.q-opts', row).value = (field.options || []).join(',');
    }

    $('.q-type', row).addEventListener('change', (e) => {
      const t = e.target.value;
      if (t === 'radio' || t === 'checkbox') {
        optsWrap.style.display = '';
      } else {
        optsWrap.style.display = 'none';
      }
    });

    $('.q-del', row).addEventListener('click', () => {
      row.remove();
    });

    return row;
  }

  function renderFields(fields = []) {
    // Eski şemadaki "questions" dizisini de destekle
    els.qs.innerHTML = '';
    fields.forEach(f => els.qs.appendChild(makeQRow(f)));
    if (!fields.length) els.qs.appendChild(makeQRow());
  }

  function collectFields() {
    const rows = $$('.q-row', els.qs);
    const fields = rows.map(r => {
      const type = $('.q-type', r).value.trim() || 'text';
      const name = $('.q-name', r).value.trim();
      const label = $('.q-label', r).value.trim();
      const required = $('.q-required', r).checked;
      const f = { type, name, label, required };
      if ((type === 'radio' || type === 'checkbox')) {
        const raw = ($('.q-opts', r).value || '').trim();
        f.options = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
      }
      return f;
    }).filter(f => f.name);
    return fields;
  }

  // ---------- Load existing ----------
  async function loadBySlug(slug) {
    if (!slug) throw new Error('Slug boş');
    const j = await api(`${API}/forms-admin?slug=${encodeURIComponent(slug)}`);
    const form = j.form || j.data || j; // farklı şekilleri tolere et
    els.slug.value = form.slug || '';
    els.title.value = form.title || '';
    els.description.value = form.description || '';
    els.status.value = form.active ? 'Aktif' : 'Pasif';
    els.summary.textContent = `Slug: ${form.slug || '—'}  Oluşturuldu: ${form.created_at ? new Date(form.created_at).toLocaleString() : '—'}`;
    const schema = form.schema || {};
    const fields = schema.fields || schema.questions || [];
    renderFields(fields);
    toast('Yüklendi');
  }

  function clearForm() {
    els.slug.value = '';
    els.title.value = '';
    els.description.value = '';
    els.status.value = 'Aktif';
    els.summary.textContent = '';
    renderFields([]);
  }

  // ---------- Save (create/update) ----------
  async function save() {
    const slug = els.slug.value.trim();
    const title = els.title.value.trim();
    const description = els.description.value.trim();
    const active = (els.status.value || 'Aktif') === 'Aktif';
    const fields = collectFields();

    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      toast('Geçerli bir slug girin (harf, sayı, tire).', false);
      els.slug.focus(); return;
    }
    if (!title) {
      toast('Başlık gerekli.', false);
      els.title.focus(); return;
    }
    if (!fields.length) {
      toast('En az 1 soru ekleyin.', false);
      return;
    }

    const body = JSON.stringify({ slug, title, description, active, schema:{ fields } });
    const j = await api(`${API}/forms-admin`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body
    });
    toast('Kaydedildi');
    if (j.form?.slug) {
      els.summary.textContent = `Slug: ${j.form.slug}  Oluşturuldu: ${j.form.created_at ? new Date(j.form.created_at).toLocaleString() : '—'}`;
    }
  }

  // ---------- Wire UI ----------
  els.btnAdd.addEventListener('click', () => els.qs.appendChild(makeQRow()));
  els.btnNew.addEventListener('click', clearForm);
  els.btnSave.addEventListener('click', () => { save().catch(e => toast('Kaydedilemedi: '+e.message, false)); });
  els.btnLoad.addEventListener('click', async () => {
    const s = prompt('Slug? (örn: formayvalik)');
    if (!s) return;
    try { await loadBySlug(s); }
    catch (e) { toast('Yüklenemedi: ' + e.message, false); }
  });

  // Auto-load when /admin?slug=xyz
  const initSlug = new URLSearchParams(location.search).get('slug');
  if (initSlug) loadBySlug(initSlug).catch(e => toast('Yüklenemedi: ' + e.message, false));
})();
