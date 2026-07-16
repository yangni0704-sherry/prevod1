// netlify/functions/_quota.js
// Daily token cap for the Anthropic proxy — the only thing standing between a
// logged-in account and an unbounded API bill. There are no tiers or paid
// plans here: one cap, everyone.
//
// Usage is recorded per user+day via the increment_usage RPC (service-role,
// atomic upsert) into the same `usage_daily` table Govori uses. The `module`
// column is always 'tr', so this app's spend stays separable from Govori's.

const { createClient } = require('@supabase/supabase-js');

const DAILY_CAP = 60000;   // tokens/day/user — roughly 150+ translations
const MODULE = 'tr';

let _admin = null;
function admin(){
  if(_admin) return _admin;
  _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _admin;
}

async function usedToday(userId){
  try{
    const today = new Date().toISOString().slice(0,10);
    const { data } = await admin().from('usage_daily')
      .select('tokens_used')
      .eq('user_id', userId).eq('day', today).eq('module', MODULE)
      .maybeSingle();
    return data ? (data.tokens_used || 0) : 0;
  }catch(_){ return 0; }   // never let a bookkeeping read block a translation
}

// Returns { ok:true } or { status, body } ready to send back.
async function checkQuota(userId){
  const used = await usedToday(userId);
  if(used >= DAILY_CAP){
    return { status: 429, body: { error: 'quota', used, limit: DAILY_CAP } };
  }
  return { ok: true };
}

// Best-effort accounting; must never break the response path.
async function recordUsage(userId, tokens){
  if(!tokens || tokens <= 0) return;
  try{
    await admin().rpc('increment_usage', {
      p_user_id: userId, p_module: MODULE, p_tokens: Math.round(tokens)
    });
  }catch(_){ /* swallow — accounting failure must not break the answer */ }
}

module.exports = { checkQuota, recordUsage, DAILY_CAP };
