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

async function requireUser(event){
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if(!m){ return { error: 'Missing bearer token', status: 401 }; }
  const token = m[1];
  try{
    const { data, error } = await client().auth.getUser(token);
    if(error || !data || !data.user){
      return { error: 'Invalid or expired token', status: 401 };
    }
    return { user: data.user };
  }catch(e){
    return { error: 'Token verification failed', status: 401 };
  }
}

function unauthorized(msg){
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: msg || 'Unauthorized' })
  };
}

module.exports = { requireUser, unauthorized };
