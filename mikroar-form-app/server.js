app.post('/api/forms', async (req,res)=>{
    const { slug, title, schema } = req.body;
    const { data, error } = await supabase
        .from('forms')
        .upsert({ slug, title, schema });
    if(error) return res.status(500).json(error);
    res.json({ok:true});
});

app.get('/api/forms/:slug', async (req,res)=>{
    const { data, error } = await supabase
        .from('forms')
        .select('*')
        .eq('slug', req.params.slug)
        .single();
    if(error) return res.status(404).json(error);
    res.json(data);
});

app.post('/api/response', async (req,res)=>{
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const { slug, answers } = req.body;
    // IP bazlı kontrol
    const { data: existing } = await supabase
        .from('responses')
        .select('id')
        .eq('form_slug', slug)
        .eq('ip', ip)
        .maybeSingle();
    if(existing) return res.status(409).json({error:'Bu IP zaten yanıtladı'});
    const { error } = await supabase
        .from('responses')
        .insert({ form_slug: slug, answers, ip });
    if(error) return res.status(500).json(error);
    res.json({ok:true});
});
