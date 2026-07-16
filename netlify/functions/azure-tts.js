// Netlify Function: Azure TTS proxy
// Hides AZURE_SPEECH_KEY. Client POSTs { ssml } (already-built SSML string);
// function calls Azure with the key and returns the MP3 audio as base64.
// (Netlify Functions must return binary as base64 with isBase64Encoded=true.)

const { requireUser, unauthorized } = require('./_auth.js');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Access gate: require a valid Supabase login token before spending the key.
  const gate = await requireUser(event);
  if (gate.error) return unauthorized(gate.error);

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "westeurope";
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "AZURE_SPEECH_KEY not configured on server" }) };
  }

  let ssml;
  try {
    ssml = JSON.parse(event.body).ssml;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Body must be JSON with { ssml }" }) };
  }
  if (!ssml) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing ssml" }) };
  }

  try {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { statusCode: res.status, body: JSON.stringify({ error: "Azure TTS " + res.status + " " + t.slice(0, 160) }) };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: { "Content-Type": "audio/mpeg" },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Proxy error: " + err.message }) };
  }
};
