// netlify/functions/fb.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const PIXEL_ID = process.env.FB_PIXEL_ID;
    const CAPI_TOKEN = process.env.FB_CAPI_TOKEN;
    if (!PIXEL_ID || !CAPI_TOKEN) {
      return { statusCode: 500, body: "FB env vars missing" };
    }

    const body = JSON.parse(event.body || "{}");
    const {
      event_id,
      event_name = "Lead",
      event_source_url,
      form_slug,
      test_event_code, // opsiyonel: Test Events ekranındaki kod
    } = body;

    // IP ve UA’yi al
    const ua = event.headers["user-agent"] || "";
    const ip =
      event.headers["x-nf-client-connection-ip"] ||
      (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      "";

    // fbp / fbc (varsa) cookie’den çek
    const cookie = event.headers.cookie || "";
    const fbp = (cookie.match(/_fbp=([^;]+)/) || [])[1];
    const fbc = (cookie.match(/_fbc=([^;]+)/) || [])[1];

    const payload = {
      data: [
        {
          event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id, // dedup için tarayıcıyla aynı event_id
          action_source: "website",
          event_source_url,
          user_data: {
            client_user_agent: ua,
            client_ip_address: ip,
            fbp,
            fbc,
          },
          custom_data: {
            content_name: form_slug || "",
            currency: "TRY",
            value: 1,
          },
        },
      ],
    };

    // Test Events ekranından bir “Test Event Code” verdiysen ekle
    if (test_event_code) payload.test_event_code = test_event_code;

    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const text = await resp.text();
    return { statusCode: resp.status, body: text };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
}
