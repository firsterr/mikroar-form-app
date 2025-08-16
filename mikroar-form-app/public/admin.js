<!-- public/admin.js -->
<script>
(() => {
  // --- DOM ---
  const elSlug   = document.getElementById('slug');
  const elTitle  = document.getElementById('title');
  const elActive = document.getElementById('active');
  const elLoad   = document.getElementById('btnLoad');
  const elNew    = document.getElementById('btnNew');
  const elAdd    = document.getElementById('btnAdd');
  const elSave   = document.getElementById('btnSave');
  const listBox  = document.getElementById('questions');

  // Yardımcı
  const h = (tag, attrs={}, ...children) => {
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v);
    });
    children.forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const toLines = (arr) => (arr || []).map(x => String(x)).join('\n');
  const fromLines = (txt) =>
    (txt || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

  // Ekranı sorularla doldur
  function renderQuestions(questions) {
    listBox.innerHTML = '';
    (questions || []).forEach((q, idx) => {
      const typeSel = h('select', { class: 'q-type' });
      ['radio','checkbox','text'].forEach(t => {
        typeSel.appendChild(h('option', { value: t }, t === 'radio' ? 'Tek seçenek (radyo)' : (t==='checkbox' ? 'Çoklu seçenek (checkbox)' : 'Metin (tek satır)')));
      });
      typeSel.value = q.type || 'radio';

      // 🔥 PROBLEM BURADAYDI: q.text geri yazılmıyordu
      const textInp = h('input', { class: 'q-text', type: 'text', placeholder: 'Soru metni', value: q.text || '' });

      // Seçenekler sadece radio/checkbox için
      const optsTa  = h('textarea', { class: 'q-options', rows: 5, placeholder: 'Seçenekler (satır satır):' }, '');
      if (q.type === 'radio' || q.type === 'checkbox') {
        optsTa.value = toLines(q.options);
      } else {
        optsTa.style.display = 'none';
      }

      // Tür değişince textarea göster/gizle
      typeSel.addEventListener('change', () => {
        if (typeSel.value === 'radio' || typeSel.value === 'checkbox') {
          optsTa.style.display = '';
        } else {
          optsTa.style.display = 'none';
        }
      });

      const delBtn = h('button', { type: 'button', class: 'btn-del' }, 'Sil');
      delBtn.addEventListener('click', () => {
        listBox.removeChild(card);
      });

      const card = h('div', { class: 'q-card' },
        h('div', { class: 'q-row' }, typeSel, textInp, delBtn),
        h('div', { class: 'q-row' }, optsTa)
      );
      listBox.appendChild(card);
    });
  }

  // Form verisini UI’dan topla
  function collectSchemaFromUI() {
    const cards = [...listBox.querySelectorAll('.q-card')];
    const questions = cards.map(card => {
      const type = card.querySelector('.q-type').value;
      const text = card.querySelector('.q-text').value.trim();          // <-- soru metni
      const optsArea = card.querySelector('.q-options');
      const options = (type === 'radio' || type === 'checkbox') ? fromLines(optsArea.value) : [];
      return { type, text, options };                                   // <-- text mutlaka yazılıyor
    });
    return { questions };
  }

  // API: form getir
  async function fetchForm(slug) {
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error('Form bulunamadı');
    return r.json();
  }

  // API: kaydet
  async function saveForm(payload) {
    const r = await fetch('/admin/api/forms', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) {
      const tx = await r.text().catch(()=>'');
      throw new Error(tx || 'Kaydetme hatası');
    }
    return r.json();
  }

  // --- Butonlar ---
  elLoad.addEventListener('click', async () => {
    const slug = (elSlug.value || '').trim();
    if (!slug) return alert('Önce slug yaz.');
    try {
      const { ok, form } = await fetchForm(slug);
      if (!ok || !form) throw new Error('Bulunamadı');
      elTitle.value = form.title || '';
      elActive.value = (form.active === false ? 'Pasif' : 'Aktif');
      const qs = (form.schema && Array.isArray(form.schema.questions)) ? form.schema.questions : [];
      renderQuestions(qs);                                              // <-- text’ler input’a set ediliyor
    } catch (e) {
      alert('Yükleme hata: ' + e.message);
    }
  });

  elNew.addEventListener('click', () => {
    elTitle.value = '';
    elActive.value = 'Aktif';
    renderQuestions([
      { type:'radio', text:'', options:['Evet','Hayır'] }
    ]);
  });

  elAdd.addEventListener('click', () => {
    const curr = collectSchemaFromUI().questions;
    curr.push({ type:'radio', text:'', options:['Evet','Hayır'] });
    renderQuestions(curr);
  });

  elSave.addEventListener('click', async () => {
    const slug = (elSlug.value || '').trim();
    if (!slug) return alert('Slug gerekli');
    const title = elTitle.value || '';
    const active = elActive.value === 'Aktif';
    const schema = collectSchemaFromUI();                               // <-- text + options toplanıyor
    try {
      await saveForm({ slug, title, active, schema });
      alert('Kaydedildi.');
    } catch (e) {
      alert('Kaydetme hata: ' + e.message);
    }
  });

  // sayfa açıldığında boxes boş gelsin
  renderQuestions([]);
})();
</script>
