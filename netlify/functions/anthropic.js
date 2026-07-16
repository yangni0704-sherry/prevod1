// Netlify Function: Anthropic proxy with login gate + daily quota.
// The browser sends a standard Anthropic Messages body; we verify the caller,
// check today's spend, forward it, then record the tokens actually used.
//
// No prompt caching here: a translation is one short one-shot call, well under
// the model's 4096-token cache minimum, so cache markers would do nothing.

const { requireUser, unauthorized } = require('./_auth.js');
const { checkQuota, recordUsage } = require('./_quota.js');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 1) must be logged in
  const gate = await requireUser(event);
  if (gate.error) return unauthorized(gate.error);
  const userId = gate.user.id;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured on server" }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "Body must be JSON" }) }; }

  // 2) daily cap
  const q = await checkQuota(userId);
  if (!q.ok) {
    return {
      statusCode: q.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q.body),
    };
  }

  // 3) forward to Anthropic
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    // 4) account for what was actually spent
    try {
      const d = JSON.parse(text);
      if (d && d.usage) {
        const u = d.usage;
        const total = (u.input_tokens || 0) + (u.output_tokens || 0)
          + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        await recordUsage(userId, total);
      }
    } catch (_) { /* non-JSON or error response — nothing to record */ }

    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Proxy error: " + err.message }) };
  }
};
