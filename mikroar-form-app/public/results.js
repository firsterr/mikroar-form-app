/* public/results.js – Tümüyle yenilendi */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $slug = $('#slug');
  const $btnLoad = $('#btnLoad');  // "Yükle" butonu id'si bu olmalı
  const $badgeMeta = $('#badgeMeta'); // "kayıt: x, sütun: y" yazdığımız yer
  const $badgeTitle = $('#badgeTitle'); // form başlığı etiketi
  const $badgeActive = $('#badgeActive'); // durum etiketi
  const $thead = $('#thead');
  const $tbody = $('#tbody');
  const $btnCopy = $('#btnCopy');
  const $btnCsv = $('#btnCsv');

  // ---- Küçük yardımcılar
  const fmtDate = (isoLike) => {
    try {
      const d = new Date(isoLike);
      // TR format – 19.08.2025 16:08:47
      return d.toLocaleString('tr-TR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
    } catch { return String(isoLike || ''); }
  };

  const toText = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toText).join(', ');
    if (typeof v === 'object') {
      // answers objesi ise doğrudan stringify etme; alt değerleri birleştir
      if (v.answers && typeof v.answers === 'object') {
        return Object.values(v.answers).map(toText).join(' | ');
      }
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
  };

  // payload -> { "Soru etiketi": "cevap" } normalizasyonu
  const normalizeAnswers = (payload, questions) => {
    const out = {};
    if (!payload || typeof payload !== 'object') return out;

    // 1) Yeni formlar (q_0, q_1...) – etiketler schema.questions'dan
    if (questions && Array.isArray(questions)) {
      questions.forEach((q, i) => {
        const key = `q_${i}`;
        if (key in payload) out[q.label || `Soru ${i + 1}`] = payload[key];
      });
    }

    // 2) Eski formlar (payload.answers: { "Soru": "cevap" })
    if (payload.answers && typeof payload.answers === 'object') {
      for (const [k, v] of Object.entries(payload.answers)) {
        out[k] = v;
      }
    }

    // 3) Güvenlik ağı: eğer iki yapı da yoksa, bildiğimiz tüm primitive alanları al
    if (Object.keys(out).length === 0) {
      for (const [k, v] of Object.entries(payload)) {
        if (k.startsWith('q_') || typeof v !== 'object') {
          out[k] = v;
        }
      }
    }

    return out;
  };

  // ---- API çağrıları
  const getForm = async (slug) => {
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error(`Form bulunamadı (${r.status})`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Form yüklenemedi');
    const questions = j.form?.schema?.questions || [];
    return { form: j.form, questions };
  };

  const getResponses = async (slug) => {
    // Aynı origin olduğundan credentials belirtmeye gerek yok;
    // Basic Auth prompt’u tarayıcı halleder.
    const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, {
      cache: 'no-store'
    });
    if (!r.ok) throw new Error(`Yanıtlar alınamadı (${r.status})`);
    const j = await r.json();
    // Beklenen: { ok:true, rows:[{created_at, ip, payload}, ...] } – farklıysa uyarlanır.
    if (Array.isArray(j.rows)) return j.rows;
    if (Array.isArray(j)) return j;
    return [];
  };

  // ---- Tablo çizimi
  const renderTable = (questions, rows) => {
    // Başlıklar: Tarih, IP, …soru etiketleri
    const headers = ['Tarih', 'IP', ...questions.map(q => q.label || 'Soru')];

    $thead.innerHTML = '';
    const trHead = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    });
    $thead.appendChild(trHead);

    // Gövde
    $tbody.innerHTML = '';
    rows.forEach(resp => {
      const tr = document.createElement('tr');
      const created = resp.created_at || resp.createdAt || resp.inserted_at || resp.ts || resp.created || resp.createdat;
      const ip = resp.ip || resp.ip_address || '';
      const payload = resp.payload || resp.data || resp.answers || {};

      const ans = normalizeAnswers(payload, questions);

      // İlk iki hücre
      const tdDate = document.createElement('td');
      tdDate.textContent = fmtDate(created);
      tr.appendChild(tdDate);

      const tdIp = document.createElement('td');
      tdIp.textContent = String(ip || '');
      tr.appendChild(tdIp);

      // Soru sütunları sırayla
      questions.forEach((q, i) => {
        const td = document.createElement('td');
        const label = q.label || `Soru ${i + 1}`;
        td.textContent = toText(ans[label]);
        tr.appendChild(td);
      });

      $tbody.appendChild(tr);
    });

    $badgeMeta.textContent = `kayıt: ${rows.length}, sütun: ${headers.length}`;
  };

  // ---- Kopyala / CSV
  const toMatrix = (questions, rows) => {
    const headers = ['Tarih', 'IP', ...questions.map(q => q.label || 'Soru')];
    const body = rows.map(resp => {
      const created = resp.created_at || resp.createdAt || resp.inserted_at || resp.ts || resp.created || resp.createdat;
      const ip = resp.ip || resp.ip_address || '';
      const payload = resp.payload || resp.data || resp.answers || {};
      const ans = normalizeAnswers(payload, questions);
      const row = [fmtDate(created), String(ip || '')];
      questions.forEach((q, i) => {
        const label = q.label || `Soru ${i + 1}`;
        row.push(toText(ans[label]));
      });
      return row;
    });
    return [headers, ...body];
  };

  const copyTSV = (matrix) => {
    const tsv = matrix.map(r => r.map(c => String(c ?? '')).join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      $btnCopy.textContent = 'Kopyalandı ✓';
      setTimeout(() => ($btnCopy.textContent = 'Kopyala (TSV)'), 1200);
    });
  };

  const downloadCSV = (matrix, fileName = 'sonuclar.csv') => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = matrix.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- Yükleme akışı
  const loadAll = async () => {
    const slug = ($slug.value || '').trim();
    if (!slug) return;

    try {
      // 1) Formu çek
      const { form, questions } = await getForm(slug);
      $badgeTitle.textContent = form.title || slug;
      $badgeActive.textContent = form.active === false ? 'pasif' : 'aktif';

      // 2) Yanıtları çek
      const resps = await getResponses(slug);

      // (Opsiyonel) Tarihe göre yeni → eski
      resps.sort((a, b) => {
        const ta = +new Date(a.created_at || a.createdAt || a.inserted_at || a.ts || 0);
        const tb = +new Date(b.created_at || b.createdAt || b.inserted_at || b.ts || 0);
        return tb - ta;
      });

      // 3) Çiz
      renderTable(questions, resps);

      // 4) Kopya/CSV
      const mat = toMatrix(questions, resps);
      $btnCopy.onclick = () => copyTSV(mat);
      $btnCsv.onclick = () => downloadCSV(mat, `${slug}.csv`);
    } catch (err) {
      console.error(err);
      $thead.innerHTML = '';
      $tbody.innerHTML = '';
      $badgeMeta.textContent = 'kayıt: 0, sütun: 0';
      alert('Yüklenemedi: ' + (err.message || err));
    }
  };

  // ---- Başlangıç
  // URL’den slug okunursa input’a bas
  const urlSlug = new URLSearchParams(location.search).get('slug');
  if (urlSlug) $slug.value = urlSlug;

  $btnLoad?.addEventListener('click', loadAll);
  // Enter’a basınca da yükle
  $slug?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAll();
  });

  // Otomatik ilk yük
  if ($slug.value) loadAll();
})();
