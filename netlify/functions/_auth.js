// netlify/functions/_auth.js
// Shared access gate. Every protected function calls requireUser(event) first.
const { createClient } = require('@supabase/supabase-js');

let _client = null;
function client(){
  if(_client) return _client;
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if(!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not configured');
  _client = createClient(url, anon);
  return _client;
}

// A rejected token and a misconfigured apikey produce the same Supabase error,
// so a bare "invalid token" can't tell them apart. Report which project this
// function is actually configured against. Nothing here is secret: the URL is
// public, `ref` is the public project id, and a length leaks nothing.
function envFingerprint(){
  const url = process.env.SUPABASE_URL || '(unset)';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  let ref = '(unparseable)';
  try{ ref = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString()).ref; }catch(_){}
  return { url, anon_len: anon.length, anon_ref: ref, anon_trimmed: anon !== anon.trim() };
}

async function requireUser(event){
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if(!m){ return { error: 'Missing bearer token', status: 401 }; }
  const token = m[1];
  try{
    const { data, error } = await client().auth.getUser(token);
    if(error || !data || !data.user){
      return { error: 'Invalid or expired token', status: 401, env: envFingerprint(), why: error && error.message };
    }
    return { user: data.user };
  }catch(e){
    return { error: 'Token verification failed', status: 401, env: envFingerprint(), why: e.message };
  }
}

// Accepts the whole gate object so the diagnostic fields ride along; a bare
// string still works for any caller that only has a message.
function unauthorized(gate){
  const g = typeof gate === 'string' ? { error: gate } : (gate || {});
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: g.error || 'Unauthorized', env: g.env, why: g.why })
  };
}

module.exports = { requireUser, unauthorized };
