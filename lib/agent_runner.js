import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── System prompt loader ────────────────────────────────────────────────────

export function loadSystemPrompt(agentName) {
  const mdPath = join(ROOT, '.claude', 'agents', `${agentName}.md`);
  return readFileSync(mdPath, 'utf8');
}

// ─── Claude call ────────────────────────────────────────────────────────────

export async function runAgent({
  systemPrompt,
  userMessage,
  model = 'claude-opus-4-6',
  maxTokens = 4096,
}) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// ─── Output parser ──────────────────────────────────────────────────────────

export function parseAgentOutput(text) {
  const result = {
    agent: null,
    task: null,
    status: null,
    actions: [],
    metrics: [],
    alerts: [],
    skillUpdates: [],
    nextRun: null,
    raw: text,
  };

  const extract = (tag) => {
    const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
    return m ? m[1].trim() : null;
  };

  result.agent = extract('agent');
  result.task = extract('task');
  result.status = extract('status');
  result.nextRun = extract('next_run');

  // Actions
  const actionsBlock = extract('actions_taken');
  if (actionsBlock) {
    result.actions = [...actionsBlock.matchAll(/<action>([\s\S]*?)<\/action>/gi)]
      .map((m) => m[1].trim());
  }

  // Metrics
  const metricsBlock = extract('metrics');
  if (metricsBlock) {
    result.metrics = [...metricsBlock.matchAll(/<metric\s+name="([^"]*)"[^>]*value="([^"]*)"[^>]*vs_target="([^"]*)"/gi)]
      .map((m) => ({ name: m[1], value: m[2], vs_target: m[3] }));
  }

  // Alerts
  const alertsBlock = extract('alerts');
  if (alertsBlock) {
    result.alerts = [...alertsBlock.matchAll(/<alert\s+level="([^"]*)">([\s\S]*?)<\/alert>/gi)]
      .map((m) => ({ level: m[1], message: m[2].trim() }));
  }

  return result;
}

// ─── Supabase logging ────────────────────────────────────────────────────────

export async function logToSupabase(agentName, parsedOutput) {
  const { error } = await supabase.from('agent_runs').insert({
    agent: agentName,
    status: parsedOutput.status ?? 'unknown',
    output: {
      task: parsedOutput.task,
      actions: parsedOutput.actions,
      metrics: parsedOutput.metrics,
      next_run: parsedOutput.nextRun,
    },
    alerts: parsedOutput.alerts,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error(`[agent_runner] logToSupabase failed: ${error.message}`);
  }
}

// ─── Alerts ─────────────────────────────────────────────────────────────────

export function alertOwner(level, message, agentName = 'unknown') {
  const prefix = level === 'red' ? '🔴 RED ALERT' : level === 'yellow' ? '🟡 YELLOW ALERT' : '🟢';
  console.log(`\n${prefix} [${agentName}] ${message}\n`);

  // Non-blocking Supabase alert log
  supabase.from('agent_runs').insert({
    agent: agentName,
    status: 'alert',
    output: { message },
    alerts: [{ level, message }],
    created_at: new Date().toISOString(),
  }).then(({ error }) => {
    if (error) console.error(`[agent_runner] alert log failed: ${error.message}`);
  });
}

// ─── Error logger ────────────────────────────────────────────────────────────

export async function logMistake(agentName, error) {
  const { appendFileSync, existsSync, mkdirSync } = await import('fs');
  const today = new Date().toISOString().slice(0, 10);
  const mistakesDir = join(ROOT, 'mistakes');
  const mistakesFile = join(mistakesDir, `${today}.md`);

  if (!existsSync(mistakesDir)) mkdirSync(mistakesDir, { recursive: true });

  const entry = `\n## [${new Date().toISOString()}] ${agentName}\n\`\`\`\n${error.stack ?? error.message}\n\`\`\`\n`;
  appendFileSync(mistakesFile, entry);
  console.error(`[${agentName}] Error logged to mistakes/${today}.md`);
}

// ─── Full agent run orchestrator ─────────────────────────────────────────────

/**
 * Run a named agent end-to-end.
 * @param {string} agentName - matches .claude/agents/{agentName}.md
 * @param {() => Promise<string>} contextFn - async fn that returns user message string
 * @param {(parsed: object) => Promise<void>} [actionsFn] - optional fn to execute agent actions
 */
export async function runAgentFull(agentName, contextFn, actionsFn = null) {
  console.log(`\n[${agentName}] Starting — ${new Date().toISOString()}`);

  try {
    const systemPrompt = loadSystemPrompt(agentName);
    const userMessage = await contextFn();

    console.log(`[${agentName}] Calling Claude...`);
    const rawOutput = await runAgent({ systemPrompt, userMessage });

    console.log(`\n[${agentName}] Output:\n${rawOutput}\n`);

    const parsed = parseAgentOutput(rawOutput);

    // Surface alerts immediately
    for (const alert of parsed.alerts) {
      alertOwner(alert.level, alert.message, agentName);
    }

    // Execute agent-specific actions
    if (actionsFn) {
      await actionsFn(parsed);
    }

    // Log to Supabase
    await logToSupabase(agentName, parsed);

    console.log(`[${agentName}] Done — status: ${parsed.status}`);
    return parsed;

  } catch (err) {
    console.error(`[${agentName}] FATAL: ${err.message}`);
    await logMistake(agentName, err);
    alertOwner('red', `Agent crashed: ${err.message}`, agentName);
    throw err;
  }
}
