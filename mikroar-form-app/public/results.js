/* MikroAR – Sonuçlar tablosu v2.1: çok-biçimli alan eşleme */
(async function () {
  const $ = (s) => document.querySelector(s);
  const slugInput = $('#slug');
  const loadBtn   = $('#loadBtn');
  const headRow   = $('#headRow');
  const bodyRows  = $('#bodyRows');
  const colgroup  = $('#colgroup');
  const metaEl    = $('#meta');
  const tags      = $('#tags');
  const copyBtn   = $('#copyBtn');
  const csvBtn    = $('#csvBtn');

  // URL ?slug=… oku
  const urlSlug = new URLSearchParams(location.search).get('slug') || '';
  if (urlSlug) slugInput.value = urlSlug;

  loadBtn.addEventListener('click', () => load(slugInput.value.trim()));
  if (slugInput.value) load(slugInput.value.trim());

  copyBtn.addEventListener('click', () => copyTSV());
  csvBtn.addEventListener('click', () => downloadCSV());

  async function load(slug) {
    if (!slug) return;

    // 1) form şemasını al
    const formRes = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { credentials: 'include' });
    if (!formRes.ok) { alert('Form bulunamadı / pasif.'); return; }
    const formJson = await formRes.json();

    const title = formJson?.form?.title || '';
    const qList = (formJson?.form?.schema?.questions || []);
    renderTags(title, formJson?.form?.active, qList.length);

    // 2) yanıtları al
    const respRes = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, { credentials: 'include' });
    if (!respRes.ok) { alert('Yanıtlar getirilemedi (auth / yetki).'); return; }
    const respJson = await respRes.json();

    // Farklı şekillerde dönebileceği için hepsini dene
    const rows = (
      respJson?.rows ||
      respJson?.data ||
      respJson?.items ||
      (Array.isArray(respJson) ? respJson : [])
    );

    // 3) başlık + colgroup
    buildHeaderAndCols(qList);

    // 4) satırlar
    bodyRows.innerHTML = rows.map((r) => {
      // tarih: created_at / createdAt / created / inserted_at
      const createdIso = r?.created_at ?? r?.createdAt ?? r?.created ?? r?.inserted_at ?? '';
      // ip: ip / client_ip / remote_addr
      const ip = r?.ip ?? r?.client_ip ?? r?.remote_addr ?? '';

      // payload & answers
      const payload  = r?.payload || {};
      const answers  = payload?.answers || payload; // q_0, q_1… durumunu da destekler

      const cells = [];
      cells.push(td(fmtDate(createdIso), 'date'));
      cells.push(td(ip, 'ip'));

      qList.forEach((q, i) => {
        const label = q?.label || `Soru ${i+1}`;
        // Önce label ile, yoksa q_i ile
        let v = (answers?.[label] !== undefined) ? answers[label] : answers[`q_${i}`];
        if (Array.isArray(v)) v = v.join(', ');
        if (v === undefined || v === null) v = '';
        cells.push(td(String(v), 'q'));
      });

      return `<tr>${cells.join('')}</tr>`;
    }).join('');

    metaEl.textContent = `kayıt: ${rows.length}, sütun: ${qList.length + 2}`;
  }

  function buildHeaderAndCols(qList) {
    const heads = [];
    heads.push(th('Tarih','date'));
    heads.push(th('IP','ip'));
    qList.forEach((q, i) => heads.push(th(q?.label || `Soru ${i+1}`, 'q')));
    headRow.innerHTML = heads.join('');

    const cols = [];
    cols.push(`<col style="width:180px">`); // Tarih
    cols.push(`<col style="width:160px">`); // IP
    qList.forEach(() => cols.push(`<col style="width:260px">`)); // Sorular
    colgroup.innerHTML = cols.join('');
  }

  function renderTags(title, active, count) {
    tags.innerHTML = `
      <span class="chip">Başlık: ${escapeHTML(title || '-')}</span>
      <span class="chip">Durum: ${active === false ? 'pasif' : 'aktif'}</span>
      <span class="chip">Soru: ${count}</span>
    `;
  }

  /* ---- yardımcılar ---- */
  const th = (t, cls='') => `<th class="${cls}">${escapeHTML(t)}</th>`;
  const td = (t, cls='') => `<td class="${cls}">${escapeHTML(t)}</td>`;

  function fmtDate(iso){
    if(!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    return `${dd}.${mm}.${yy} ${hh}:${mi}:${ss}`;
  }

  function escapeHTML(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  /* ---- TSV & CSV ---- */
  function getTableMatrix(){
    const rows = [];
    rows.push([...headRow.children].map(th=>th.textContent.trim()));
    rows.push(...[...bodyRows.querySelectorAll('tr')].map(tr =>
      [...tr.children].map(td=>td.textContent.trim())
    ));
    return rows;
  }

  function copyTSV(){
    const tsv = getTableMatrix().map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      copyBtn.textContent = 'Kopyalandı!';
      setTimeout(()=>copyBtn.textContent='Kopyala (TSV)',1200);
    });
  }

  function downloadCSV(){
    const csv = getTableMatrix().map(r =>
      r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v).join(',')
    ).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sonuclar_${(slugInput.value||'form')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
})();
