// ---- FORMS LIST: slug seçimi için basit liste ----
app.get("/api/forms-list", async (_req, res) => {
  try {
    if (!supabase) {
      return res.status(501).json({ error: "Supabase yapılandırılmadı" });
    }
    const { data, error } = await supabase
      .from("forms")
      .select("id, slug, title, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    // Basitleştirilmiş çıktı
    const items = (data || []).map(r => ({
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
