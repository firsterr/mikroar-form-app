// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const basicAuth = require('express-basic-auth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Admin giriş bilgileri ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

app.use(
  '/admin',
  basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true
  })
);

// --- Form verilerini saklamak için dosya yolu ---
const FORMS_FILE = path.join(__dirname, 'forms.json');

// Yardımcı fonksiyon: form verilerini oku
function readForms() {
  if (!fs.existsSync(FORMS_FILE)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(FORMS_FILE));
}

// Yardımcı fonksiyon: form verilerini kaydet
function saveForms(forms) {
  fs.writeFileSync(FORMS_FILE, JSON.stringify(forms, null, 2));
}

// --- API: Form ekleme veya güncelleme ---
app.post('/admin/api/forms', (req, res) => {
  const forms = readForms();
  const { slug, title, questions } = req.body;

  if (!slug || !title || !Array.isArray(questions)) {
    return res.status(400).json({ error: 'Eksik veri' });
  }

  const existingIndex = forms.findIndex(f => f.slug === slug);
  if (existingIndex !== -1) {
    forms[existingIndex] = { slug, title, questions };
  } else {
    forms.push({ slug, title, questions });
  }

  saveForms(forms);
  res.json({ success: true });
});

// --- API: Form getirme ---
app.get('/api/forms/:slug', (req, res) => {
  const forms = readForms();
  const form = forms.find(f => f.slug === req.params.slug);
  if (!form) {
    return res.status(404).json({ error: 'Form bulunamadı' });
  }
  res.json(form);
});

// --- API: Admin panelinden tüm formları listeleme ---
app.get('/admin/api/forms', (req, res) => {
  const forms = readForms();
  res.json(forms);
});

// --- Admin paneli HTML ---
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
