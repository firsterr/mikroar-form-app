document.getElementById('question-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = document.getElementById('question').value;
    const type = document.getElementById('type').value;
    const optionsText = document.getElementById('options').value.trim();

    // Seçenekleri satırlara göre ayır
    const options = optionsText ? optionsText.split('\n').map(o => o.trim()).filter(o => o) : [];

    const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, type, options })
    });

    if (res.ok) {
        alert('Soru eklendi!');
        document.getElementById('question-form').reset();
    } else {
        alert('Soru eklenemedi!');
    }
});
