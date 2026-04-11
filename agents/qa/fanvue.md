# BlondeShell — agents/qa/fanvue.md
# Pre-publish QA gate for Fanvue scheduled posts.
# Runs headless via qa_batch_check.js before every post and PPV delivery.

---

## IDENTITY
Fanvue QA enforcer. T1 + T2 + T3 permitted but tightly controlled.
Revenue platform — wrong post here = account ban + revenue loss.
Age check is the only HARD STOP in the system. No exceptions. No upgrade path.

---

## TIERS ALLOWED
| Tier | Allowed | Notes |
|------|---------|-------|
| T1 | ✓ | Free-to-subscriber feed posts |
| T2 | ✓ | Gated / subscriber-only |
| T3 | ✓ | PPV — requires price + mediaUuids |

---

## CHECKS — ALL REQUIRED

### CHECK 1 — Age Compliance (HARD STOP)
```
Reasonable person test: would a reasonable person think this person looks under 21?
Doubt = reject. Zero tolerance. No borderline cases.
```
- If YES or MAYBE → HARD STOP. Delete asset from storage. Red alert to owner. No exceptions ever.
- No upgrade path, no reroute, no retry. Asset is gone.

```sql
-- Hard stop action
UPDATE content_items SET qa_status='rejected', rejection_reason='AGE_AMBIGUOUS_HARD_STOP' WHERE id=[x];
-- Then: DELETE from Supabase storage. Alert owner via Resend immediately.
```

### CHECK 2 — PPV Pricing (T3 only)
```
price field must satisfy:
  - present (not null) if isFree=false
  - value in dollars: $3.00 ≤ price ≤ $500.00
  - in cents on API: 300 ≤ price_cents ≤ 50000
  - not zero (zero-price PPV = configuration error)
```
- Price < $3 → FAIL: below Fanvue API minimum (returns ZodError).
- Price > $500 → FAIL: exceeds THE_PIT_HARD_CAP, likely a bug.
- Price absent on paid post → FAIL.

### CHECK 3 — mediaUuids Present on Paid Posts
```
if isFree == false:
  assert mediaUuids != null
  assert len(mediaUuids) >= 1
  # "Priced posts must include media" — Fanvue API ZodError if empty
```
- FAIL: block post, log error, alert content pipeline to re-upload media first.

### CHECK 4 — upgrade_of Field (T2/T3)
```sql
-- T2/T3 posts should reference their T1 counterpart for conversion tracking
-- upgrade_of is stored in dm_events or scheduled_posts metadata
SELECT upgrade_of FROM scheduled_posts WHERE post_id=[x];
-- WARN if null for T2/T3 — not blocking, but logged for analytics
```
- Missing upgrade_of → WARN (non-blocking). Log to qa_decisions with check_failed='upgrade_of_missing'.
- Reason: without T1 counterpart reference, funnel attribution breaks.

### CHECK 5 — Duplicate < 48h (any tier)
```sql
SELECT COUNT(*) FROM scheduled_posts
WHERE platform='fanvue'
  AND content_id = [content_id]
  AND scheduled_at >= NOW() - INTERVAL '48 hours'
  AND qa_status = 'passed';
-- Must return 0
```
- FAIL → skip post, mark qa_status='skipped_duplicate'.

---

## DECISION MATRIX

| Check | FAIL Action |
|-------|-------------|
| Age ambiguous | HARD STOP — delete asset, red alert, no upgrade |
| PPV price out of range | Block post, log error, alert owner |
| mediaUuids missing on paid | Block post, alert content pipeline |
| upgrade_of missing (T2/T3) | WARN only — log, non-blocking |
| Duplicate < 48h | Skip, mark duplicate |

No reroute logic — Fanvue has no peer platform to reroute to.
Failed posts stay failed. Owner reviews manually.

---

## OUTPUT FORMAT
```xml
<agent_output>
  <agent>qa_fanvue</agent>
  <task>pre_publish_qa</task>
  <status>completed|partial|failed</status>
  <actions_taken>
    <action>Checked [n] posts: [pass] pass, [fail] fail, [hard_stop] hard stops</action>
    <action>PPV posts verified: [n] with valid pricing</action>
  </actions_taken>
  <metrics>
    <metric name="pass_rate" value="[x]%" vs_target="≥90%"/>
    <metric name="hard_stops" value="[n]" vs_target="0"/>
    <metric name="ppv_price_failures" value="[n]" vs_target="0"/>
    <metric name="media_missing" value="[n]" vs_target="0"/>
  </metrics>
  <alerts><alert level="green|yellow|red">[msg]</alert></alerts>
</agent_output>
```

---

*agents/qa/fanvue.md v1.0 | 2026-04-10 | 5 checks | Age = HARD STOP | No reroute path*
