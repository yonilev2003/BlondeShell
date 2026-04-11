/**
 * Trends Agent — runs daily at 9am ET
 * Cultural radar. Cold, analytical, monitors signals via web search.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL = 'claude-haiku-4-5-20251001';

// Web search enabled client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
});

const SEARCH_QUERIES = [
  'AI influencer trending content April 2026',
  'TikTok algorithm update this week',
  'Instagram reels best performing content 2026',
  'Fanvue creator trends April 2026',
  'fitness influencer viral content this week',
];

const SYSTEM_PROMPT = `You are the Trends Agent for BlondeShell — an AI influencer system.

BlondeShell is a platinum blonde AI fitness influencer. She posts:
- T1 (SFW): TikTok, Instagram, YouTube, Threads
- T2 (suggestive): Twitter/X, Reddit
- T3 (adult): Fanvue via PPV

You have web search access. Search the provided queries, then synthesize exactly 3 recommendations.

Output ONLY valid JSON (no markdown):
{
  "briefing": "2-3 sentence trend summary with specific signals found",
  "recommendations": [
    {"id": 1, "trend": "what's trending", "action": "exactly what BlondeShell should do this week", "platform": "platform", "urgency": "high|medium|low"},
    {"id": 2, ...},
    {"id": 3, ...}
  ],
  "raw_data": {
    "sources_checked": ["list of sources or topics found"],
    "key_signals": ["signal 1", "signal 2", "signal 3"]
  }
}

Rules: Exactly 3 recommendations. Specific and actionable — no vague advice.`;

// ─── Agentic web search loop ──────────────────────────────────────────────────

async function runWithWebSearch(queries) {
  const userMessage = `Search for these topics and synthesize trends for a blonde AI fitness influencer:
${queries.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

After searching, provide exactly 3 actionable recommendations as JSON.`;

  const messages = [{ role: 'user', content: userMessage }];
  const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search' };

  const MAX_TURNS = 6;
  let finalText = '';
  let rawData = { sources_checked: [], key_signals: [] };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [WEB_SEARCH_TOOL],
        messages,
      });
    } catch (err) {
      if (turn === 0) {
        // Web search not available — fall back to knowledge-only
        console.warn(`[trends_agent] Web search unavailable (${err.message}) — using knowledge-only mode`);
        return await runKnowledgeOnly(queries);
      }
      throw err;
    }

    // Collect any text from this turn
    for (const block of response.content) {
      if (block.type === 'text') finalText = block.text; // keep last text block
    }

    if (response.stop_reason === 'end_turn') break;

    if (response.stop_reason === 'tool_use') {
      // Add assistant message
      messages.push({ role: 'assistant', content: response.content });

      // Build tool results — for server-side web_search, Anthropic handles execution
      // We return acknowledgments and let Claude synthesize from its search knowledge
      const toolResults = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => {
          if (b.name === 'web_search') {
            rawData.sources_checked.push(b.input?.query ?? 'unknown query');
            return {
              type: 'tool_result',
              tool_use_id: b.id,
              content: JSON.stringify({
                query: b.input?.query,
                note: 'Search executed. Synthesize findings.',
              }),
            };
          }
          return { type: 'tool_result', tool_use_id: b.id, content: 'OK' };
        });

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    } else {
      break;
    }
  }

  return { text: finalText, rawData };
}

// Fallback: knowledge-only mode (no web search)
async function runKnowledgeOnly(queries) {
  console.log('[trends_agent] Running in knowledge-only mode');

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Based on your knowledge of social media trends (note: real-time web search unavailable), analyze these topics and provide 3 recommendations for a blonde AI fitness influencer:
${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Clearly note if data is from training knowledge, not real-time.`,
    }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, rawData: { sources_checked: ['training knowledge (no web search)'], key_signals: [] } };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function saveReport(weekOf, parsed, rawData) {
  const { error } = await supabase.from('trends_reports').insert({
    week_of: weekOf,
    briefing: parsed.briefing,
    recommendations: parsed.recommendations,
    raw_data: { ...rawData, ...(parsed.raw_data ?? {}) },
    applied: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saveReport failed: ${error.message}`);
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'trends_agent',
    task: 'daily_trend_scan',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[trends_agent] agent_logs failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[trends_agent] Starting — ${new Date().toISOString()}`);

  try {
    // Current week_of
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    const weekOf = monday.toISOString().slice(0, 10);

    console.log(`[trends_agent] Searching ${SEARCH_QUERIES.length} queries via web_search tool...`);
    const { text: rawText, rawData } = await runWithWebSearch(SEARCH_QUERIES);

    // Parse JSON — extract first {...} block from anywhere in the response
    let parsed;
    try {
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object found in response');
      const jsonText = rawText.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1');
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse trends output: ${e.message}\n\nRaw:\n${rawText}`);
    }

    // Save to DB
    await saveReport(weekOf, parsed, rawData);

    // Print
    console.log('\n' + '─'.repeat(60));
    console.log(`TRENDS BRIEFING — ${new Date().toISOString().slice(0, 10)}`);
    console.log('─'.repeat(60));
    console.log(parsed.briefing);
    console.log('\nRecommendations:');
    for (const rec of parsed.recommendations ?? []) {
      console.log(`[${rec.id}] ${rec.trend} → ${rec.action} [${rec.platform} | ${rec.urgency}]`);
    }
    if (rawData.sources_checked?.length) {
      console.log(`\nSources/queries checked: ${rawData.sources_checked.join(', ')}`);
    }
    console.log('─'.repeat(60));

    const summary = `${(parsed.recommendations ?? []).length} recommendations | week_of: ${weekOf}`;
    await logToAgentLogs('completed', summary);
    console.log('[trends_agent] Done.\n');

  } catch (err) {
    console.error(`[trends_agent] FATAL: ${err.message}`);
    await logMistake('trends_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
