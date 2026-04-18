/**
 * Tool Evaluation Agent — runs 1st of each month at 12:00 UTC
 * Evaluates current stack: fal.ai models, video, TTS, scheduling
 * Writes recommendation to Obsidian. Never auto-switches — owner approval required.
 */

import { runAgent, logMistake } from '../lib/agent_runner.js';
import { writeNote } from '../lib/obsidian.js';
import { supabase } from '../lib/supabase.js';
import 'dotenv/config';

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are the Tool Evaluation Agent for BlondeShell, an AI influencer automation system.
Your job: monthly stack audit. Evaluate current tools against alternatives.
Be objective. Quantify cost/quality/speed trade-offs.
Output ONLY valid JSON — no markdown fences.

Current stack (for reference):
- Image gen: fal-ai/seedream-v4-5 (~$0.04/image)
- Video gen: fal-ai/kling-video/v3/standard
- TTS: ElevenLabs Starter ($6/mo, 30K credits)
- Lip-sync: Hedra
- Scheduling: Publer
- DMs: Substy

JSON format:
{
  "evaluation_date": "YYYY-MM-DD",
  "tools": [
    {
      "category": "image_gen",
      "current": "fal-ai/seedream-v4-5",
      "current_cost": "$0.04/image",
      "alternatives": [{ "name": "...", "cost": "...", "quality_delta": "+5% / -10% / same", "speed_delta": "..." }],
      "recommendation": "keep | switch | investigate",
      "reason": "one sentence",
      "owner_action_required": false
    }
  ],
  "summary": "2-3 sentence executive summary",
  "switch_candidates": ["tool names that warrant owner review"],
  "cost_savings_potential": "$X/month if switches made"
}`;

async function getAgentRunStats() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('agent_logs')
    .select('agent, status, notes, created_at')
    .gte('created_at', since30d)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  const stats = {};
  for (const r of rows) {
    if (!stats[r.agent]) stats[r.agent] = { runs: 0, failures: 0 };
    stats[r.agent].runs++;
    if (r.status === 'failed') stats[r.agent].failures++;
  }
  return stats;
}

async function getContentVolume() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: images } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'image')
    .gte('created_at', since30d);

  const { count: videos } = await supabase
    .from('content_items')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'video')
    .gte('created_at', since30d);

  return { images: images ?? 0, videos: videos ?? 0 };
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'tool_eval_agent',
    task: 'monthly_eval',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[tool_eval_agent] agent_logs write failed: ${error.message}`);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n[tool_eval_agent] Starting — ${new Date().toISOString()}`);

  try {
    const [agentStats, volume] = await Promise.all([getAgentRunStats(), getContentVolume()]);

    const userMessage = `DATE: ${today}

=== CONTENT VOLUME (last 30 days) ===
Images generated: ${volume.images}
Videos generated: ${volume.videos}
Estimated fal.ai cost: $${(volume.images * 0.04 + volume.videos * 0.12).toFixed(2)}

=== AGENT RUN STATS (last 30 days) ===
${Object.entries(agentStats).map(([a, s]) => `${a}: ${s.runs} runs, ${s.failures} failures`).join('\n') || '(none)'}

=== CURRENT STACK ===
Image gen: fal-ai/seedream-v4-5 @ $0.04/image
Video gen: fal-ai/kling-video/v3/standard @ ~$0.12/clip
TTS: ElevenLabs Starter @ $6/mo (30K credits, ~$0.0002/char)
Lip-sync: Hedra (pay per use)
Scheduling: Publer (current plan)
DMs: Substy Premium @ $99/mo + 8.5% cut

Evaluate all tools against current alternatives (as of ${today}). Flag anything where cost savings >20% with no quality loss, or quality gains at same/lower cost.

${volume.images > 500 ? `Note: High image volume (${volume.images} images). Cost optimization especially important.` : ''}`;

    console.log('[tool_eval_agent] Calling Claude Sonnet...');
    const rawOutput = await runAgent({ systemPrompt: SYSTEM_PROMPT, userMessage, model: MODEL, maxTokens: 2048 });

    let parsed;
    try {
      const cleaned = rawOutput
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Failed to parse tool_eval output: ${e.message}\nRaw: ${rawOutput.slice(0, 400)}`);
    }

    // Write to Obsidian
    const notePath = `Patterns/tool-eval-${today}.md`;
    const noteContent = `---
date: ${today}
agent: tool_eval_agent
summary: ${parsed.summary}
switch_candidates: ${JSON.stringify(parsed.switch_candidates ?? [])}
cost_savings_potential: ${parsed.cost_savings_potential ?? '$0'}
---

# Tool Evaluation — ${today}

## Summary
${parsed.summary}

## Cost Savings Potential
${parsed.cost_savings_potential ?? '$0/month'}

## Switch Candidates (Owner Review Required)
${(parsed.switch_candidates ?? []).map(t => `- ${t}`).join('\n') || '_None — current stack is optimal_'}

## Full Evaluation

${(parsed.tools ?? []).map(t => `### ${t.category}: ${t.current}
- **Cost**: ${t.current_cost}
- **Recommendation**: ${t.recommendation.toUpperCase()}
- **Reason**: ${t.reason}
- **Alternatives**: ${t.alternatives?.map(a => `${a.name} (${a.cost}, quality: ${a.quality_delta})`).join(', ') || 'none evaluated'}
- **Owner action**: ${t.owner_action_required ? '⚠️ YES' : 'No'}
`).join('\n')}

## Raw JSON
\`\`\`json
${JSON.stringify(parsed, null, 2)}
\`\`\`
`;

    writeNote(notePath, noteContent);
    console.log(`[tool_eval_agent] Report written → obsidian/blondeshell-brain/${notePath}`);

    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('TOOL EVALUATION —', today);
    console.log('═'.repeat(60));
    console.log(parsed.summary);
    if (parsed.switch_candidates?.length) {
      console.log('\n⚠️  Switch candidates (owner review):');
      for (const t of parsed.switch_candidates) console.log(`   • ${t}`);
    }
    console.log(`Potential savings: ${parsed.cost_savings_potential ?? '$0/month'}`);
    console.log('═'.repeat(60) + '\n');

    await logToAgentLogs('completed', parsed.summary);
    console.log('[tool_eval_agent] Done.\n');

  } catch (err) {
    console.error(`[tool_eval_agent] FATAL: ${err.message}`);
    await logMistake('tool_eval_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
