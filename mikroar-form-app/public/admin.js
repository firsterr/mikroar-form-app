// public/admin.js — FULL REPLACE
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? "");

  // Soruları ekrana basmak için basit renderer
  function renderQuestions(list) {
    const box = $("#questions");
    if (!box) return;
    box.innerHTML = "";
    (list || []).forEach((q, i) => {
      const row = document.createElement("div");
      row.className = "qrow";
      row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin:6px 0">
          <select class="q-type">
            <option value="radio"${q.type==="radio"?" selected":""}>Tek seçim</option>
            <option value="checkbox"${q.type==="checkbox"?" selected":""}>Çoklu seçim</option>
            <option value="select"${q.type==="select"?" selected":""}>Açılır menü</option>
            <option value="text"${q.type==="text"?" selected":""}>Metin</option>
            <option value="textarea"${q.type==="textarea"?" selected":""}>Paragraf</option>
            <option value="email"${q.type==="email"?" selected":""}>E-posta</option>
            <option value="number"${q.type==="number"?" selected":""}>Sayı</option>
          </select>
          <input class="q-name"   placeholder="alan adı" value="${esc(q.name||`soru${i+1}`)}" />
          <input class="q-label"  placeholder="Soru başlığı" value="${esc(q.label||"")}" />
          <label style="display:flex;gap:4px;align-items:center">
            <input type="checkbox" class="q-req"${q.required?" checked":""}/> Zorunlu
          </label>
          <input class="q-opts" placeholder="Seçenekler (virgülle)"
                 value="${Array.isArray(q.options)? q.options.join(", "): ""}"
                 style="flex:1;${["radio","checkbox","select"].includes(q.type)?"":"display:none"}" />
          <button class="q-del" type="button">Sil</button>
        </div>
      `;
      box.appendChild(row);
      // toggle options input görünürlüğü
      const typeSel = $(".q-type", row);
      const optsInp = $(".q-opts", row);
      typeSel.addEventListener("change", () => {
        if (["radio","checkbox","select"].includes(typeSel.value)) {
          optsInp.style.display = "";
        } else {
          optsInp.style.display = "none";
          optsInp.value = "";
        }
      });
      $(".q-del", row).addEventListener("click", () => row.remove());
    });
  }

  function collectQuestions() {
    return $$("#questions .qrow").map(row => {
      const type = $(".q-type", row).value;
      const name = $(".q-name", row).value.trim() || undefined;
      const label = $(".q-label", row).value.trim() || "";
      const required = $(".q-req", row).checked;
      let options = $(".q-opts", row).value;
      if (["radio","checkbox","select"].includes(type)) {
        options = options.split(",").map(s => s.trim()).filter(Boolean);
      } else {
        options = undefined;
      }
      return { type, name, label, required, options };
    });
  }

  // === FORM YÜKLE (slug ile) ===
  async function loadFormBySlug(slug) {
    if (!slug) throw new Error("Slug gerekli");
    const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`, { headers:{accept:"application/json"} });
    const txt = await r.text();
    let form = null;
    try {
      const j = JSON.parse(txt || "{}");
      form = j.form || j.data || (Array.isArray(j) ? j[0] : null);
    } catch (_) {}
    if (!r.ok || !form) throw new Error(`Bulunamadı (HTTP ${r.status})`);

    // Ekranı doldur
    $("#slug").value   = form.slug || "";
    $("#title").value  = form.title || "";
    $("#desc").value   = (form.schema && form.schema.description) || "";
    $("#status").value = form.active ? "Aktif" : "Pasif";

    const qs = (form.schema && Array.isArray(form.schema.questions)) ? form.schema.questions : [];
    renderQuestions(qs);
  }

  // === FORM KAYDET ===
  async function saveForm() {
    const payload = {
      slug: ($("#slug").value || "").trim(),
      title: ($("#title").value || "").trim(),
      description: ($("#desc").value || "").trim(),
      active: ($("#status").value || "Aktif") === "Aktif",
      schema: { questions: collectQuestions() }
    };
    if (!payload.slug) throw new Error("Slug gerekli");

    const r = await fetch("/api/forms-admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": localStorage.getItem("admintoken") || ""
      },
      body: JSON.stringify(payload)
    });

    const txt = await r.text();
    if (!r.ok) throw new Error(txt || "Kaydedilemedi");
    return true;
  }

  // === Event binding ===
  document.addEventListener("DOMContentLoaded", () => {
    const btnLoad = $("#btnLoad");
    const btnSave = $("#btnSave");
    const btnNew  = $("#btnNew");
    const btnAddQ = $("#btnAddQ");

    if (btnLoad) btnLoad.addEventListener("click", async () => {
      try { await loadFormBySlug(($("#slug").value || "").trim()); showToast("Form yüklendi"); }
      catch (e) { showToast(e.message || "Bulunamadı", true); }
    });

    if (btnSave) btnSave.addEventListener("click", async () => {
      try { await saveForm(); showToast("Kaydedildi"); }
      catch (e) { showToast(e.message || "Kaydedilemedi", true); }
    });

    if (btnNew) btnNew.addEventListener("click", () => {
      $("#title").value = ""; $("#desc").value = ""; $("#status").value = "Aktif";
      renderQuestions([]);
    });

    if (btnAddQ) btnAddQ.addEventListener("click", () => {
      const cur = collectQuestions(); cur.push({ type:"radio", name:"", label:"", required:false, options:[] });
      renderQuestions(cur);
    });

    // ilk render
    renderQuestions([]);
  });

  function showToast(msg, err=false){
    const el = $("#toast"); if (!el) return alert(msg);
    el.textContent = msg; el.style.color = err ? "#b91c1c" : "#0f766e";
    el.style.display = "block"; setTimeout(()=> el.style.display="none", 2500);
  }
})();
