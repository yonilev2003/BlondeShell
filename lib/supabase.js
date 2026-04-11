import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL not set');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function logAgentAction(agent, task, status, notes = '', tokensUsed = 0) {
  try {
    await supabase.from('agent_logs').insert({
      agent,
      task,
      status,
      notes,
      tokens_used: tokensUsed,
    });
  } catch (err) {
    console.error('[supabase] logAgentAction failed:', err.message);
  }
}

export { supabase, logAgentAction };
