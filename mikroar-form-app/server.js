app.post('/api/questions', async (req, res) => {
    const { question, type, options } = req.body;

    try {
        const { data, error } = await supabase
            .from('questions')
            .insert([{ question, type, options }]);

        if (error) throw error;
        res.json({ ok: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err.message });
    }
});
