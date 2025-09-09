// ---- Basit Admin Panel JS (stabil) ----
(function () {
  var API = '/api';
  var LS_KEY = 'ADMIN_TOKEN';

  function $(sel) { return document.querySelector(sel); }
  var qsEl = $('#qs');
  var alertEl = $('#alert');

  // ---- UI: bildirim
  function toast(msg, type) {
    type = type || 'ok';
    if (!alertEl) return;
    alertEl.textContent = msg;
    alertEl.className = 'note ' + type;
    alertEl.style.display = 'block';
    setTimeout(function () { alertEl.style.display = 'none'; }, 4000);
  }

  // ---- auth
  function getToken() {
    var t = localStorage.getItem(LS_KEY);
    if (!t) {
      t = prompt('Yönetici anahtarı (X-Admin-Token):');
      if (t) localStorage.setItem(LS_KEY, t);
    }
    return t;
  }
  function authHeaders() {
    var t = getToken();
    if (!t) {
      toast('Admin anahtarı gerekli.', 'err');
      throw new Error('no-token');
    }
    return { 'Content-Type': 'application/json', 'X-Admin-Token': t };
  }

  // ---- form temizle
  function clearForm() {
    var slug = $('#inSlug'); if (slug) slug.value = '';
    var title = $('#inTitle'); if (title) title.value = '';
    var desc = $('#inDesc'); if (desc) desc.value = '';
    var status = $('#selStatus'); if (status) status.value = 'true';
    if (qsEl) qsEl.innerHTML = '';
  }

  // ---- soru satırı ekle
  function addQuestion(q) {
    q = q || { type: 'text', name: '', label: '', required: false, options: [] };

    var div = document.createElement('div');
    div.className = 'qrow';
    div.innerHTML =
      '<select class="q-type">' +
        '<option value="text"'     + (q.type === 'text'     ? ' selected' : '') + '>Metin</option>' +
        '<option value="email"'    + (q.type === 'email'    ? ' selected' : '') + '>E-posta</option>' +
        '<option value="textarea"' + (q.type === 'textarea' ? ' selected' : '') + '>Metin alanı</option>' +
        '<option value="radio"'    + (q.type === 'radio'    ? ' selected' : '') + '>Tek seçim</option>' +
        '<option value="checkbox"' + (q.type === 'checkbox' ? ' selected' : '') + '>Çoklu seçim</option>' +
        '<option value="select"'   + (q.type === 'select'   ? ' selected' : '') + '>Açılır menü</option>' +
      '</select>' +
      '<input class="q-name"  type="text" placeholder="alan adı (boşsa q1,q2…)" value="' + (q.name  || '') + '">' +
      '<input class="q-label" type="text" placeholder="Etiket" value="' + (q.label || '') + '">' +
      '<label class="q-req"><input type="checkbox"' + (q.required ? ' checked' : '') + '> Zorunlu</label>' +
      '<input class="q-opts" type="text" placeholder="Seçenekler (virgül ile)" value="' + ((q.options || []).join(', ')) + '">' +
      '<button type="button" class="q-del">Sil</button>';

    // select/checkbox/radio/select harici tiplerde opsiyon alanını gizle
    function updateOptsVisibility() {
      var t = div.querySelector('.q-type').value;
      var show = (t === 'radio' || t === 'checkbox' || t === 'select');
      div.querySelector('.q-opts').style.display = show ? '' : 'none';
    }
    div.querySelector('.q-type').addEventListener('change', updateOptsVisibility);
    div.querySelector('.q-del').addEventListener('click', function () { div.remove(); });
    qsEl.appendChild(div);
    updateOptsVisibility();
  }

  // ---- soruları topla
  function sanitizeName(s) {
    s = String(s || '');
    s = s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
  }
  function collectQuestions() {
    var rows = qsEl ? qsEl.querySelectorAll('.qrow') : [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var type = r.querySelector('.q-type').value;
      var name = sanitizeName(r.querySelector('.q-name').value);
      if (!name) name = 'q' + (i + 1);
      var label = r.querySelector('.q-label').value || ('Soru ' + (i + 1));
      var required = r.querySelector('.q-req input').checked;
      var optsRaw = r.querySelector('.q-opts').value;
      var opts = [];
      if (optsRaw && (type === 'radio' || type === 'checkbox' || type === 'select')) {
        var parts = optsRaw.split(',');
        for (var k = 0; k < parts.length; k++) {
          var v = parts[k].trim();
          if (v) opts.push(v);
        }
      }
      var q = { type: type, name: name, label: label, required: required };
      if (opts.length && (type === 'radio' || type === 'checkbox' || type === 'select')) q.options = opts;
      out.push(q);
    }
    return out;
  }

  // ---- form yükle
  function loadForm() {
    var slug = $('#inSlug').value.trim();
    if (!slug) return toast('Önce slug gir.', 'err');

    fetch(API + '/forms?slug=' + encodeURIComponent(slug))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body || !res.body.ok || !res.body.schema) {
          toast((res.body && res.body.error) || ('Bulunamadı (HTTP ' + res.status + ')'), 'err');
          return;
        }
        var s = res.body.schema;
        $('#inTitle').value = s.title || '';
        $('#inDesc').value = s.description || '';
        $('#selStatus').value = (s.active === false ? 'false' : 'true');

        var list = s.questions ? s.questions : (s.fields ? s.fields : []);
        qsEl.innerHTML = '';
        for (var i = 0; i < list.length; i++) addQuestion(list[i]);
        toast('Form yüklendi.', 'ok');
      })
      .catch(function (e) { toast(e.message || 'Yüklenemedi', 'err'); });
  }

  // ---- form kaydet
  function saveForm() {
    try {
      var slug = $('#inSlug').value.trim();
      if (!slug) { toast('Slug zorunlu.', 'err'); return; }

      var body = {
        slug: slug,
        title: $('#inTitle').value.trim(),
        description: $('#inDesc').value.trim(),
        active: ($('#selStatus').value === 'true'),
        schema: { questions: collectQuestions() }
      };

      fetch(API + '/forms-admin', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.body || !res.body.ok) {
            throw new Error((res.body && res.body.error) || ('HTTP ' + res.status));
          }
          var arr = [];
          if (res.body.schema && res.body.schema.questions) arr = res.body.schema.questions;
          else if (res.body.schema && res.body.schema.fields) arr = res.body.schema.fields;

          if (!arr || !arr.length) {
            toast('Kaydedildi ama alan sayısı 0 görünüyor. Yenileyip tekrar deneyin.', 'err');
          } else {
            toast('Kaydedildi ✅', 'ok');
          }
        })
        .catch(function (e) { toast(e.message || 'Kaydedilemedi', 'err'); });
    } catch (e) {
      toast(e.message || 'Kaydedilemedi', 'err');
    }
  }

  // ---- bağla
  function bind() {
    var bAdd = $('#btnAddQ'); if (bAdd)  bAdd.addEventListener('click', function(){ addQuestion(); });
    var bLoad = $('#btnLoad'); if (bLoad) bLoad.addEventListener('click', loadForm);
    var bSave = $('#btnSave'); if (bSave) bSave.addEventListener('click', saveForm);
    var bNew  = $('#btnNew');  if (bNew)  bNew.addEventListener('click', clearForm);
    var bTok  = $('#btnToken');if (bTok)  bTok.addEventListener('click', function () {
      localStorage.removeItem(LS_KEY); getToken();
    });
  }

  // defer ile geliyor ama garanti olsun
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ bind(); clearForm(); });
  } else {
    bind(); clearForm();
  }
})();
