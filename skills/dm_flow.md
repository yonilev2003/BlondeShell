# SKILL: dm_flow
**Token savings: ~400 tokens per call**

## Description
Log a DM intent to the `dm_events` table. Substy handles actual message delivery. This skill captures the 5W+H qualification data required before PPV generation can proceed.

## Trigger Phrases
- "send DM"
- "substy flow"
- "DM a fan"
- "PPV offer"
- "message subscriber"
- "qualification flow"

## Input Schema
```json
{
  "fan_id": "string — Substy/Fanvue fan identifier",
  "platform": "fanvue | substy",
  "who": "string — who appears (BlondeShell only | with elements)",
  "what": "string — what is happening",
  "where": "string — location: beach | gym | home | travel | other",
  "when": "string — time of day / lighting / season",
  "why": "string — mood/vibe: flirty | athletic | cozy | bold",
  "how": "string? — optional: camera angle, outfit specifics",
  "ppv_price_usd": "number? — optional, set if triggering PPV",
  "fulfillment_state": "fulfilled | failed_no_charge | failed_substitute | failed_queued"
}
```

## Output Schema
```json
{
  "dm_event_id": "uuid — inserted dm_events row id",
  "status": "logged | blocked",
  "block_reason": "string? — 'WHERE missing — qualification question sent'"
}
```

## 5W+H Qualification Rules
| Field  | Required? | If missing |
|--------|-----------|------------|
| WHO    | Yes       | Block generation |
| WHAT   | Yes       | Block generation |
| WHERE  | Yes       | Substy sends qualification question. Generation BLOCKED. |
| WHEN   | Yes       | Block generation |
| WHY    | Yes       | Block generation |
| HOW    | No        | Proceed without it |

**Timeout rule:** 4h after first question → use "surprise me" fallback with defaults.

## Implementation
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Validate 5W+H
const required = ['who', 'what', 'where', 'when', 'why'];
const missing = required.filter(f => !input[f]);
if (missing.length > 0) {
  // Log intent but block generation
  return { status: 'blocked', block_reason: `${missing.join(',')} missing — qualification question sent` };
}

const { data } = await supabase.from('dm_events').insert({
  fan_id: input.fan_id,
  platform: input.platform,
  qualification_who: input.who,
  qualification_what: input.what,
  qualification_where: input.where,
  qualification_when: input.when,
  qualification_why: input.why,
  qualification_how: input.how ?? null,
  ppv_price_usd: input.ppv_price_usd ?? null,
  fulfillment_state: input.fulfillment_state ?? 'failed_queued',
  created_at: new Date().toISOString(),
}).select().single();

return { dm_event_id: data.id, status: 'logged' };
```

## Fulfillment States
| State              | Meaning |
|--------------------|---------|
| fulfilled          | PPV delivered, fan charged |
| failed_no_charge   | Could not fulfill, fan not charged |
| failed_substitute  | Different content sent as substitute |
| failed_queued      | In queue, will fulfill when content ready |

## Financial Constants
- Substy Starter fee: 15%
- Substy Pro fee: 10%
- Substy Elite fee: 8.5%
- Fanvue fee: 20% (always)
- The Pit expected monthly: $430 | hard cap: $500

## Example Usage
```
User: "send DM to fan 12345, beach at sunset, flirty, $25 PPV"
→ who=BlondeShell, what=PPV beach set, where=beach, when=sunset, why=flirty
→ All 5W present → insert dm_events → Substy delivers
→ Returns: { dm_event_id: "uuid", status: "logged" }

User: "send DM to fan 67890, gym vibes"
→ WHERE missing → blocked
→ Returns: { status: "blocked", block_reason: "where missing — qualification question sent" }
```
