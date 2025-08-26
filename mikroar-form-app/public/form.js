/* ====== Global ====== */
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; }
body {
  background:#f1f3f4;                     /* Google Forms açık gri */
  color:#111;
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Arial, sans-serif;
}

/* Konteyner */
.main-wrap {
  max-width: 760px;
  margin: 24px auto 88px;                 /* sticky bar payı: 88px */
  padding: 0 16px;
}
#form-title { margin:0 0 6px; font-size: clamp(22px, 3.6vw, 34px); }
.desc { margin:0 0 18px; color:#374151; }

/* Yükleniyor / hata mesajı */
.message {
  margin:16px 0;
  padding:14px 16px;
  border:1px solid #e5e7eb;
  border-radius:8px;
  background:#fff;
}
.message.error { border-color:#fca5a5; background:#fff1f2; color:#991b1b; }

/* ====== Soru Kartı ====== */
.q {
  margin: 18px 0;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
.q > label {
  display:block;
  font-weight:600;
  margin-bottom: 12px;
}

/* Seçenek satırı */
.opt {
  display:flex; align-items:center;
  gap:8px;
  padding:4px 6px;
  margin:6px 0;
  border-radius:6px;
  cursor:pointer;
  transition: background .12s ease, box-shadow .12s ease;
}
.opt:hover { background:#f7f7f7; }

/* Seçili efekti – :has destekli tarayıcılar */
@supports selector(:has(*)) {
  .opt:has(input:checked) {
    background:#f3e8ff;                  /* morumsu vurgulama */
    box-shadow: inset 0 0 0 2px #7e57c2;
  }
}

/* :has yoksa JS fallback'i .is-checked sınıfını ekler */
.opt.is-checked {
  background:#f3e8ff;
  box-shadow: inset 0 0 0 2px #7e57c2;
}

/* Radio/Checkbox görünümü */
.opt input[type="radio"],
.opt input[type="checkbox"] {
  margin:0 2px 0 0;
  transform: scale(1.15);
  accent-color: #673ab7;                 /* Google Forms mor tonu */
}

/* Metin alanları */
input[type="text"], textarea {
  width:100%;
  border:1px solid #dfe1e5;
  border-radius:8px;
  padding:10px 12px;
  background:#fff; color:#111;
  font-size:15px;
}
input[type="text"]:focus, textarea:focus {
  outline:none;
  border-color:#7e57c2;
  box-shadow: 0 0 0 3px #ede7f6;
}

/* ====== Sticky submit bar ====== */
/* (form.js barı en sona ekler; burada sadece görünüm var) */
.sticky-submit {
  position: sticky;
  bottom: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-top: 28px;
  background: rgba(255,255,255,.96);
  backdrop-filter: saturate(180%) blur(6px);
  border:1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06) inset;
}

.sticky-submit .note {
  font-size:12px; line-height:1.35; color:#374151;
}
.sticky-submit .note b { font-weight: 700; }
.sticky-submit .note a { color:#1a73e8; text-decoration: underline; }

/* Gönder butonu */
#btnSend {
  background:#1a73e8; color:#fff; border:0;
  border-radius:8px; padding:10px 22px;
  font-weight:600; cursor:pointer;
}
#btnSend:hover { background:#1669c1; }
#btnSend:disabled { opacity:.6; cursor: default; }

/* Sticky bar içeriği alttan kapamasın */
#f { padding-bottom: 88px; }
