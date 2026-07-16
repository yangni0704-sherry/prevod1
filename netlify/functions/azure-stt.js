// Netlify Function: Azure STT proxy
// Hides AZURE_SPEECH_KEY. Client POSTs raw WAV audio (16k PCM) as the body.
// Netlify delivers a binary request body base64-encoded (event.isBase64Encoded=true),
// so we decode it back to a Buffer before forwarding to Azure.
// Returns { text } — the recognized text.
//
// Recognition language comes from ?lang= and must be one of LANGS; anything
// else falls back to en-US rather than trusting caller input in the URL.

const { requireUser, unauthorized } = require('./_auth.js');

const LANGS = ['zh-CN', 'en-US', 'fr-FR', 'sl-SI'];

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

  try {
    const audio = event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : Buffer.from(event.body);

    const asked = (event.queryStringParameters && event.queryStringParameters.lang) || '';
    const lang = LANGS.includes(asked) ? asked : 'en-US';

    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
      },
      body: audio,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { statusCode: res.status, body: JSON.stringify({ error: "Azure STT " + res.status + " " + t.slice(0, 160) }) };
    }

    const d = await res.json();
    let text = "";
    if (!d.RecognitionStatus || d.RecognitionStatus === "Success") {
      text = d.DisplayText || (d.NBest && d.NBest[0] && (d.NBest[0].Display || d.NBest[0].Lexical)) || "";
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Proxy error: " + err.message }) };
  }
};
