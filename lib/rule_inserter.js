import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OBSIDIAN_ROOT = join(ROOT, 'obsidian', 'blondeshell-brain');
const SKILLS_DIR = join(ROOT, 'skills');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
}

async function getNextRuleId() {
  const { data, error } = await supabase
    .from('skill_rules')
    .select('rule_id')
    .order('rule_id', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return 'R-001';

  const match = data.rule_id.match(/R-(\d+)/);
  if (!match) return 'R-001';

  const next = parseInt(match[1], 10) + 1;
  return `R-${String(next).padStart(3, '0')}`;
}

function buildObsidianFrontmatter(rule) {
  const lines = [
    '---',
    `id: "${rule.id}"`,
    `confidence: "${rule.confidence}"`,
    `verified_via: "${rule.verifiedVia || 'auto'}"`,
    `created: "${new Date().toISOString()}"`,
    rule.expires ? `expires: "${rule.expires}"` : null,
    `skill_file: "${rule.skillFile || 'unknown'}"`,
    '---',
  ].filter(Boolean);
  return lines.join('\n');
}

function buildObsidianBody(rule) {
  return [
    '',
    `# ${rule.id}`,
    '',
    `**Condition:** ${rule.condition}`,
    '',
    `**Old behavior:** ${rule.oldBehavior}`,
    '',
    `**New rule:** ${rule.newRule}`,
    '',
    `**Confidence:** ${rule.confidence}`,
    '',
  ].join('\n');
}

function writeObsidianRule(rule) {
  const rulesDir = join(OBSIDIAN_ROOT, 'Rules');
  ensureDir(rulesDir);
  const filePath = join(rulesDir, `${rule.id}.md`);
  const content = buildObsidianFrontmatter(rule) + buildObsidianBody(rule);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function insertSupabaseRule(rule) {
  const { error } = await supabase.from('skill_rules').insert({
    rule_id: rule.id,
    condition: rule.condition,
    old_behavior: rule.oldBehavior,
    new_rule: rule.newRule,
    confidence: rule.confidence,
    verified_via: rule.verifiedVia || 'auto',
    expires: rule.expires || null,
    skill_file: rule.skillFile || null,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`insertSupabaseRule failed: ${error.message}`);
}

function appendToSkillFile(rule) {
  if (!rule.skillFile) return null;

  const targetPath = join(SKILLS_DIR, rule.skillFile);
  if (!existsSync(targetPath)) {
    const allSkills = globSync('**/*.md', { cwd: SKILLS_DIR });
    const match = allSkills.find(f => {
      const content = readFileSync(join(SKILLS_DIR, f), 'utf8');
      return content.includes(rule.condition) || content.includes(rule.skillFile.replace('.md', ''));
    });
    if (!match) return null;
    const matchPath = join(SKILLS_DIR, match);
    const entry = `\n\n<!-- ${rule.id} -->\n> **Rule ${rule.id}:** ${rule.newRule}\n`;
    appendFileSync(matchPath, entry, 'utf8');
    return matchPath;
  }

  const entry = `\n\n<!-- ${rule.id} -->\n> **Rule ${rule.id}:** ${rule.newRule}\n`;
  appendFileSync(targetPath, entry, 'utf8');
  return targetPath;
}

async function insertRule(rule) {
  const results = { obsidian: null, supabase: false, skillFile: null };

  results.obsidian = writeObsidianRule(rule);
  console.log(`[rule_inserter] Obsidian: ${results.obsidian}`);

  if (rule.confidence === 'HIGH') {
    await insertSupabaseRule(rule);
    results.supabase = true;
    console.log(`[rule_inserter] Supabase: inserted ${rule.id}`);

    results.skillFile = appendToSkillFile(rule);
    if (results.skillFile) {
      console.log(`[rule_inserter] Skill file: appended to ${results.skillFile}`);
    }
  } else {
    console.log(`[rule_inserter] ${rule.confidence} confidence — Obsidian only, flagged for owner review`);
  }

  return results;
}

function logPattern(analysis) {
  const patternsDir = join(OBSIDIAN_ROOT, 'Patterns');
  ensureDir(patternsDir);

  const date = analysis.date || new Date().toISOString().slice(0, 10);
  const filePath = join(patternsDir, `${date}-analysis.md`);

  const sections = [
    '---',
    `date: "${date}"`,
    `created: "${new Date().toISOString()}"`,
    '---',
    '',
    `# Weekly Pattern Analysis — ${date}`,
    '',
  ];

  if (analysis.topPerformers?.length) {
    sections.push('## Top Performers');
    for (const p of analysis.topPerformers) {
      sections.push(`- ${typeof p === 'string' ? p : JSON.stringify(p)}`);
    }
    sections.push('');
  }

  if (analysis.trends?.length) {
    sections.push('## Trends');
    for (const t of analysis.trends) {
      sections.push(`- ${typeof t === 'string' ? t : JSON.stringify(t)}`);
    }
    sections.push('');
  }

  if (analysis.recommendations?.length) {
    sections.push('## Recommendations');
    for (const r of analysis.recommendations) {
      sections.push(`- ${typeof r === 'string' ? r : JSON.stringify(r)}`);
    }
    sections.push('');
  }

  if (analysis.engagementCurves?.length) {
    sections.push('## Engagement Curves');
    for (const c of analysis.engagementCurves) {
      sections.push(`- ${typeof c === 'string' ? c : JSON.stringify(c)}`);
    }
    sections.push('');
  }

  writeFileSync(filePath, sections.join('\n'), 'utf8');
  console.log(`[rule_inserter] Pattern analysis: ${filePath}`);
  return filePath;
}

function logMistake(mistake) {
  const mistakesDir = join(OBSIDIAN_ROOT, 'Mistakes');
  ensureDir(mistakesDir);

  const date = mistake.date || new Date().toISOString().slice(0, 10);
  const filePath = join(mistakesDir, `${date}.md`);

  const entry = [
    '',
    `## [${new Date().toISOString()}] ${mistake.agent || 'unknown'}`,
    '',
    `**Error:** ${mistake.error || mistake.message || 'Unknown error'}`,
    '',
    mistake.context ? `**Context:** ${mistake.context}` : null,
    mistake.resolution ? `**Resolution:** ${mistake.resolution}` : null,
    '',
  ].filter(l => l !== null).join('\n');

  if (existsSync(filePath)) {
    appendFileSync(filePath, entry, 'utf8');
  } else {
    const header = [
      '---',
      `date: "${date}"`,
      '---',
      '',
      `# Mistakes — ${date}`,
      entry,
    ].join('\n');
    writeFileSync(filePath, header, 'utf8');
  }

  console.log(`[rule_inserter] Mistake logged: ${filePath}`);
  return filePath;
}

export { insertRule, logPattern, logMistake, getNextRuleId };
