# SKILL: weekly_report
**Token savings: ~1200 tokens per call**

## Description
Generate a weekly performance report by querying Supabase directly. Aggregates content_items, platform_scores, agent_logs, fanvue_earnings, and subscriber_events for the last 7 days. Returns a formatted digest with metrics vs targets.

## Trigger Phrases
- "weekly report"
- "how did we do"
- "weekly summary"
- "performance this week"
- "week in review"
- "show me the numbers"

## Input Schema
```json
{
  "week_of": "string? — YYYY-MM-DD Monday date, defaults to current week",
  "format": "text | json — default text"
}
```

## Output Schema (text format)
```
BLONDESHELL WEEKLY REPORT — week of YYYY-MM-DD
═══════════════════════════════════════════════
CONTENT
  Generated:  N images + N videos
  QA passed:  N (N%)
  Approved:   N total in library
  Top setting: beach | gym | street | home

REVENUE (Fanvue)
  Subscriptions: $N
  PPV:           $N
  Tips:          $N
  Total:         $N / $250 target (N%)

GROWTH
  New subs:    N / 25 target (N%)
  Unsubs:      N
  Net:         +N
  Follows:     N across platforms

AGENTS
  Runs this week: N
  Failed runs:    N
  Agents down:    [list] | none

ALERTS
  [list of requires_action days] | none
```

## Output Schema (json format)
```json
{
  "week_of": "YYYY-MM-DD",
  "content": { "generated": N, "qa_passed": N, "qa_rate": 0.N, "approved_total": N, "top_setting": "beach" },
  "revenue": { "subscriptions": N, "ppv": N, "tips": N, "total": N, "target": 250, "vs_target_pct": N },
  "growth": { "new_subs": N, "unsubs": N, "net": N, "follows": N, "target": 25 },
  "agents": { "runs": N, "failed": N, "agents_down": [] },
  "alerts": []
}
```

## Implementation
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const since = weekOf + 'T00:00:00Z'; // Monday 00:00 UTC
const until = new Date(new Date(weekOf).getTime() + 7*24*60*60*1000).toISOString();

// Run all queries in parallel
const [content, earnings, events, agentLogs, cooDigests] = await Promise.all([
  supabase.from('content_items').select('type, setting, qa_status, created_at').gte('created_at', since).lt('created_at', until),
  supabase.from('fanvue_earnings').select('amount, source').gte('date', since.slice(0,10)).lt('date', until.slice(0,10)),
  supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since).lt('created_at', until),
  supabase.from('agent_logs').select('agent, status, created_at').gte('created_at', since).lt('created_at', until),
  supabase.from('coo_digests').select('date, requires_action').gte('created_at', since).lt('created_at', until),
]);
// Aggregate and format
```

## Targets Reference
| Metric           | Weekly Target | Monthly Target |
|------------------|---------------|----------------|
| New subscribers  | ~6-7          | 25             |
| Revenue          | ~$62.50       | $250           |
| PPV sales        | ~1-2          | 5              |
| Follower growth  | ~125          | 500            |
| Content approved | 10+           | 40+            |

## Example Usage
```
User: "how did we do this week?"
→ week_of = current Monday
→ Queries all tables → formats report
→ Prints revenue / growth / content / agent health

User: "weekly report for April 7"
→ week_of = 2026-04-07
→ Same queries scoped to that week
```
