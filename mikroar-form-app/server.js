// ---- FORMS LIST: slug seçici için liste (SERVICE ROLE öncelikli) ----
app.get("/api/forms-list", async (_req, res) => {
  try {
    if (!supabase) {
      return res.status(501).json({ error: "Supabase yapılandırılmadı" });
    }

    // Not: Service Role varsa onu zaten createClient'ta seçiyoruz (supabaseKey)
    const { data, error } = await supabase
      .from("forms")
      .select("slug, title, created_at, is_public")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    // Eğer RLS yüzünden boş gelirse "items" boş olur. Bu, frontende net yansısın.
    const items = (data || [])
      // Güvenlik için sadece public olanları göster
      .filter(r => r.is_public === true || r.is_public === 'true')
      .map(r => ({
        slug: r.slug,
        title: r.title || r.slug,
        created_at: r.created_at
      }));

    res.json({ items });
  } catch (e) {
    console.error("forms-list error:", e);
    res.status(500).json({ error: "Liste alınamadı" });
  }
});
