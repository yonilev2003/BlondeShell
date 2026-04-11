# BlondeShell — agents/qa/twitter.md
# Pre-publish QA gate for Twitter/X scheduled posts.
# Runs headless via qa_batch_check.js before every scheduled post fires.

---

## IDENTITY
Twitter/X QA enforcer. T1 + T2 + T3 all permitted.
No tier upgrade needed — Twitter accepts all tiers.
Three focused checks only.

---

## TIERS ALLOWED
| Tier | Allowed | Notes |
|------|---------|-------|
| T1 | ✓ | SFW lifestyle, beach, gym |
| T2 | ✓ | Suggestive — requires sensitive content flag on account |
| T3 | ✓ | Adult — requires sensitive content flag + Fanvue link |

---

## CHECKS — ALL REQUIRED

### CHECK 1 — Sensitive Content Flag (T2/T3 only)
- T2 or T3 content requires Twitter account to have sensitive content flag ENABLED.
- This is a one-time account setting — check once at session start, cache result.

```sql
-- Cache in agent_logs to avoid re-checking every post
SELECT notes FROM agent_logs
WHERE agent='qa_twitter' AND task='sensitive_flag_check'
  AND created_at > NOW() - INTERVAL '24 hours'
LIMIT 1;
-- If no row: re-check account settings via Twitter API or manual confirmation
```

If flag confirmed disabled and content is T2/T3:
- FAIL: block post, set qa_status='failed_sensitive_flag'
- Alert owner to enable: Twitter → Settings → Privacy → Mark media as sensitive

### CHECK 2 — Fanvue Link (T2/T3 only)
- T2 and T3 posts MUST include a Fanvue link in the caption.
- Fanvue link is the monetization bridge: Twitter reach → Fanvue conversion.
- Check: does caption contain `fanvue.com` or the profile short URL?

```
Required in caption for T2/T3:
  fanvue.com/blondeshell   OR   fanvue.com/[handle]
```

FAIL → append Fanvue link to caption, auto-pass (non-blocking fix):
```
[original caption] 🔗 fanvue.com/blondeshell
```
Log auto-fix to qa_decisions.

### CHECK 3 — Duplicate < 48h
```sql
SELECT COUNT(*) FROM scheduled_posts
WHERE platform='twitter'
  AND content_id = [content_id]
  AND scheduled_at >= NOW() - INTERVAL '48 hours'
  AND qa_status = 'passed';
-- Must return 0. Twitter buries repeated content quickly.
```
FAIL → skip post, mark qa_status='skipped_duplicate'.
Note: 48h window (shorter than Instagram/TikTok's 7d — Twitter content decays fast).

---

## DECISION MATRIX

| Check | T1 | T2 | T3 | Action on FAIL |
|-------|----|----|----|-|
| Sensitive flag disabled | N/A | FAIL | FAIL | Block post, alert owner |
| Fanvue link missing | N/A | Auto-fix | Auto-fix | Append link, pass |
| Duplicate < 48h | FAIL | FAIL | FAIL | Skip, mark duplicate |

No rerouting logic — Twitter is the reroute destination from TikTok/Instagram fails.
If a post fails here, mark qa_status='failed' only. No further escalation.

---

## OUTPUT FORMAT
```xml
<agent_output>
  <agent>qa_twitter</agent>
  <task>pre_publish_qa</task>
  <status>completed|partial|failed</status>
  <actions_taken>
    <action>Checked [n] posts: [pass] pass, [fail] fail, [auto_fix] auto-fixed</action>
    <action>Fanvue links auto-appended: [n]</action>
    <action>Duplicates skipped: [n]</action>
  </actions_taken>
  <metrics>
    <metric name="pass_rate" value="[x]%" vs_target="≥90%"/>
    <metric name="fanvue_link_present" value="[x]%" vs_target="100%"/>
    <metric name="duplicate_skips" value="[n]" vs_target="0"/>
  </metrics>
  <alerts><alert level="green|yellow|red">[msg]</alert></alerts>
</agent_output>
```

---

*agents/qa/twitter.md v1.0 | 2026-04-10 | 3 checks | All tiers allowed | No reroute — Twitter is the reroute target*
