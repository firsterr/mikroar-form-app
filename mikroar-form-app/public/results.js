// public/results.js
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);
  const $slug = $('#slug');
  const $btnLoad = $('#btnLoad');
  const $btnCopy = $('#btnCopy');
  const $btnCsv  = $('#btnCsv');
  const $badgeMeta   = $('#badgeMeta');
  const $badgeTitle  = $('#badgeTitle');
  const $badgeActive = $('#badgeActive');
  const $thead = $('#thead');
  const $tbody = $('#tbody');

  // --- küçük yardımcılar
  const fmtDate = (v) => {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleString('tr-TR', {
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    });
  };
  const toText = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toText).join(', ');
    if (typeof v === 'object') {
      if (v.answers && typeof v.answers === 'object') {
        return Object.values(v.answers).map(toText).join(' | ');
      }
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  };

  const normalizeAnswers = (payload, questions) => {
    const out = {};
    if (!payload || typeof payload !== 'object') return out;

    // yeni tip (q_0, q_1...) -> label eşle
    if (Array.isArray(questions)) {
      questions.forEach((q, i) => {
        const key = `q_${i}`;
        if (key in payload) out[q.label || `Soru ${i+1}`] = payload[key];
      });
    }
    // eski tip (answers: {...})
    if (payload.answers && typeof payload.answers === 'object') {
      for (const [k, v] of Object.entries(payload.answers)) out[k] = v;
    }
    // hiçbiri yoksa: primitive/q_* alanları al
    if (!Object.keys(out).length) {
      for (const [k, v] of Object.entries(payload)) {
        if (k.startsWith('q_') || typeof v !== 'object') out[k] = v;
      }
    }
    return out;
  };

  // --- API
  const getForm = async (slug) => {
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache:'no-store' });
    if (!r.ok) throw new Error(`Form bulunamadı (${r.status})`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Form yüklenemedi');
    return {
      form: j.form,
      questions: j.form?.schema?.questions || []
    };
  };
  const getResponses = async (slug) => {
    const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, {
      cache:'no-store',
      credentials:'include'
    });
    if (!r.ok) throw new Error(`Yanıtlar alınamadı (${r.status})`);
    const j = await r.json();
    if (Array.isArray(j?.rows)) return j.rows;
    if (Array.isArray(j)) return j;           // alternatif dönüş şekli
    return [];
  };

  // --- tablo
  const render = (questions, rows) => {
    const headers = ['Tarih', 'IP', ...questions.map(q => q.label || 'Soru')];

    // thead
    $thead.innerHTML = '';
    const trh = document.createElement('tr');
    headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; trh.appendChild(th); });
    $thead.appendChild(trh);

    // tbody
    $tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      const created = r.created_at || r.createdAt || r.inserted_at || r.ts || r.created || r.createdat;
      const ip = r.ip || r.ip_address || '';
      const payload = r.payload || r.data || r.answers || {};
      const ans = normalizeAnswers(payload, questions);

      const td0 = document.createElement('td'); td0.textContent = fmtDate(created); tr.appendChild(td0);
      const td1 = document.createElement('td'); td1.textContent = String(ip || '');  tr.appendChild(td1);

      questions.forEach((q, i) => {
        const k = q.label || `Soru ${i+1}`;
        const td = document.createElement('td'); td.textContent = toText(ans[k]); tr.appendChild(td);
      });

      $tbody.appendChild(tr);
    });

    $badgeMeta.textContent = `kayıt: ${rows.length}, sütun: ${headers.length}`;
  };

  const toMatrix = (questions, rows) => {
    const head = ['Tarih', 'IP', ...questions.map(q => q.label || 'Soru')];
    const body = rows.map(r => {
      const created = r.created_at || r.createdAt || r.inserted_at || r.ts || r.created || r.createdat;
      const ip = r.ip || r.ip_address || '';
      const payload = r.payload || r.data || r.answers || {};
      const ans = normalizeAnswers(payload, questions);
      const line = [fmtDate(created), String(ip || '')];
      questions.forEach((q, i) => line.push(toText(ans[q.label || `Soru ${i+1}`])));
      return line;
    });
    return [head, ...body];
  };

  const copyTSV = (mat) => {
    const tsv = mat.map(r => r.map(c => String(c ?? '')).join('\t')).join('\n');
    return navigator.clipboard.writeText(tsv);
  };
  const downloadCSV = (mat, name='sonuclar.csv') => {
    const esc = s => `"${String(s ?? '').replace(/"/g,'""')}"`;
    const csv = mat.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };

  // --- yükleme akışı
  let lastMatrix = null;

  const loadAll = async () => {
    const slug = ($slug.value || '').trim();
    if (!slug) return;

    // başta butonları kilitle
    $btnCopy.disabled = true; $btnCsv.disabled = true;

    try {
      const { form, questions } = await getForm(slug);
      $badgeTitle.textContent  = form.title || slug;
      $badgeActive.textContent = (form.active === false) ? 'pasif' : 'aktif';

      let rows = await getResponses(slug);
      rows.sort((a,b) => {
        const ta = +new Date(a.created_at || a.createdAt || a.ts || 0);
        const tb = +new Date(b.created_at || b.createdAt || b.ts || 0);
        return tb - ta;
      });

      render(questions, rows);
      lastMatrix = toMatrix(questions, rows);
      // yükleme tamam – butonları aç
      $btnCopy.disabled = $btnCsv.disabled = false;

    } catch (e) {
      console.error(e);
      alert('Yüklenemedi: ' + (e.message || e));
      $thead.innerHTML = ''; $tbody.innerHTML = '';
      $badgeMeta.textContent = 'kayıt: 0, sütun: 0';
      lastMatrix = null; $btnCopy.disabled = $btnCsv.disabled = true;
    }
  };

  // butonlar
  $btnLoad.addEventListener('click', loadAll);
  $slug.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadAll(); });

  $btnCopy.addEventListener('click', async () => {
    if (!lastMatrix) return;
    await copyTSV(lastMatrix);
    $btnCopy.textContent = 'Kopyalandı ✓';
    setTimeout(() => ($btnCopy.textContent = 'Kopyala (TSV)'), 1200);
  });

  $btnCsv.addEventListener('click', () => {
    if (!lastMatrix) return;
    const name = `${($slug.value||'sonuclar')}.csv`;
    downloadCSV(lastMatrix, name);
  });

  // url ?slug=… varsa otomatik doldur & yükle
  const fromUrl = new URLSearchParams(location.search).get('slug');
  if (fromUrl) $slug.value = fromUrl;
  if ($slug.value) loadAll();
});
