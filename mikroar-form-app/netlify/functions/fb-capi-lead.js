// netlify/functions/fb-capi-lead.js
export default async (req, context) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok:false, error:'Method not allowed' }), { status: 405 });
    }

    const { event_id, event_name = 'Lead', event_source_url, fbp, fbc, client_user_agent } = await req.json();

    const accessToken = process.env.FB_CAPI_TOKEN;      // Pixel Access Token (Events Manager > Erişim jetonu oluştur)
    const pixelId     = process.env.FB_PIXEL_ID;        // 753180591019866

    if (!accessToken || !pixelId) {
      return new Response(JSON.stringify({ ok:false, error:'Missing FB_CAPI_TOKEN or FB_PIXEL_ID' }), { status: 500 });
    }

    const payload = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now()/1000),
        event_id,                                // dedup için; tarayıcı event’iyle aynı ID geçebilir
        action_source: 'website',
        event_source_url,
        user_data: {
          client_user_agent,
          fbp,                                   // _fbp cookie değeri
          fbc                                    // _fbc cookie değeri (varsa)
          // İleri seviye: e-posta/telefon SHA-256 hash’leri eklenebilir: em, ph
        }
      }],
      // Test Events sekmesindeki kodu geçerek testte anında görmek istersen:
      // "test_event_code": "TEST123..."
    };

    const url = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

    const fbRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });

    const fbJson = await fbRes.json();

    if (!fbRes.ok) {
      return new Response(JSON.stringify({ ok:false, status: fbRes.status, fb: fbJson }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok:true, fb: fbJson }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status: 500 });
  }
};
