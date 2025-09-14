(function(){
  const els = {
    gate:  document.getElementById("gate"),
    panel: document.getElementById("panel"),
    list:  document.getElementById("list"),
    token: document.getElementById("token"),
    login: document.getElementById("login"),
    slug:  document.getElementById("slug"),
    title: document.getElementById("title"),
    active: document.getElementById("active"),
    schema: document.getElementById("schema"),
    save:  document.getElementById("save")
  };

  els.login.addEventListener("click", async () => {
    const ok = await refreshList(true);
    els.gate.style.display  = ok ? "none" : "block";
    els.panel.style.display = ok ? "flex" : "none";
  });

  els.save.addEventListener("click", async () => {
    const payload = {
      slug: (els.slug.value || "").trim(),
      title: (els.title.value || "").trim(),
      active: els.active.value === "true",
      schema: tryJson(els.schema.value) || { questions: [] }
    };
    if (!payload.slug || !payload.title) return alert("slug ve başlık zorunlu");

    const token = els.token.value || "";
    const res = await fetch(`/api/forms-admin?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert("Hata: " + (data.error || res.status));
    await refreshList(false);
    alert("Kaydedildi.");
  });

  async function refreshList(showErr) {
    const token = els.token.value || "";
    const res = await fetch(`/api/forms-list?token=${encodeURIComponent(token)}`, {
      headers: { "x-admin-token": token }
    });
    if (!res.ok) {
      if (showErr) alert("Admin yetkisi doğrulanamadı. (401) Netlify'da ADMIN_TOKEN ayarlı mı?");
      return false;
    }
    const data = await res.json();
    renderList(data.items || []);
    return true;
  }

  function renderList(items) {
    els.list.innerHTML = "";
    for (const f of items) {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = `${f.slug} — ${f.title} ${f.active ? "(aktif)" : "(pasif)"}`;
      div.addEventListener("click", () => loadForm(f.slug));
      els.list.appendChild(div);
    }
  }

  async function loadForm(slug) {
    const token = els.token.value || "";
    const res = await fetch(`/api/forms-admin?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(token)}`, {
      headers: { "x-admin-token": token }
    });
    const data = await res.json();
    if (!res.ok) return alert("Hata: " + (data.error || res.status));

    els.slug.value   = data.form.slug || "";
    els.title.value  = data.form.title || "";
    els.active.value = data.form.active ? "true" : "false";
    els.schema.value = JSON.stringify(data.form.schema || { questions: [] }, null, 2);
  }

  function tryJson(s){ try{ return JSON.parse(s) } catch { return null } }
})();
