import express from 'express';
import fs from 'fs';
import path from 'path';
import basicAuth from 'express-basic-auth';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin giriş bilgileri
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';

app.use(
  '/admin',
  basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true
  })
);

// Form dosya yolu
const FORMS_FILE = path.join(__dirname, 'forms.json');

function readForms() {
  if (!fs.existsSync(FORMS_FILE)) return [];
  return JSON.parse(fs.readFileSync(FORMS_FILE));
}

function saveForms(forms) {
  fs.writeFileSync(FORMS_FILE, JSON.stringify(forms, null, 2));
}

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

app.get('/api/forms/:slug', (req, res) => {
  const forms = readForms();
  const form = forms.find(f => f.slug === req.params.slug);
  if (!form) return res.status(404).json({ error: 'Form bulunamadı' });
  res.json(form);
});

app.get('/admin/api/forms', (req, res) => {
  res.json(readForms());
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
