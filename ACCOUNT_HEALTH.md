# Account Health Audit

**Owner task — must be filled and saved before any live posting.**
**Last audited**: _NOT YET_  (replace with `YYYY-MM-DD`)

Run `npm run audit:accounts` to verify this file is filled and shows no active strikes.

---

## @imtheblondeshell (Instagram)
URL: https://www.instagram.com/imtheblondeshell/
Settings → Account → Account Status

- [ ] Account active (not disabled, not under review)
- [ ] No active strikes or warnings
- [ ] Reach not restricted (no shadow ban indicator)
- [ ] AI-disclosure / "AI-generated" string present in bio
- [ ] Meta AI label toggle defaults to ON

**Active strikes/warnings**: _none / list them here_
**Restrictions noted**: _none / describe_
**Followers at audit time**: _0_
**Notes**:

---

## @itstheblondeshell (TikTok)
URL: https://www.tiktok.com/@itstheblondeshell
Settings → Account → Account Status (and TikTok Studio if creator account)

- [ ] Account active
- [ ] No active warnings (including the previously-on-hold minor warning — confirm cleared)
- [ ] Posting unrestricted
- [ ] AI-generated content toggle defaults to ON
- [ ] Region: United States (not Israel)

**Active warnings**: _none / describe_
**Posts under review**: _none / describe_
**Followers at audit time**: _0_
**Notes**:

---

## Twitter / X
URL: TBD — current `@ShellVibesAi` to be CLOSED in Wave 1.

- [ ] `@ShellVibesAi` archived/closed
- [ ] Primary handle `@imtheblondeshell` checked for availability
- [ ] If unavailable, fallback `@blondeshell_ai` registered
- [ ] Locked bio applied (per `config/bios.json`)
- [ ] Region: United States

**New handle**: _e.g. @imtheblondeshell or @blondeshell_ai_
**Notes**:

---

## Fanvue (fanvue.com/blondeshell)

- [ ] Account active
- [ ] KYC verified (personal — Yoni)
- [ ] Subscription price set ($10/mo per pricing_state default)
- [ ] PPV tiers configured (standard $10, premium $18, personalized $30)
- [ ] Welcome DM template enabled (Substy will replace once activated Wave 3)

**Notes**:

---

## Beacons (beacons.ai/blondeshell)

- [ ] Profile live
- [ ] Links match `config/bios.json` beacons.links array
- [ ] Brand inquiry email is `shellvibes.official@proton.me`

**Notes**:

---

## Backup pool (Wave 1 task — separate audit)

These accounts are registered separately as part of Wave 1 backup pool initialization.
Track them in the `backup_accounts` table (Supabase) and `scripts/warmup_backup_pool.mjs` log.

| Platform | Handle | Device fingerprint | IP/proxy | Email | Status |
|---|---|---|---|---|---|
| IG #1 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | warming |
| IG #2 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | warming |
| TT #1 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | warming |
| TT #2 | _TBD_ | _TBD_ | _TBD_ | _TBD_ | warming |
| X #1  | _TBD_ | _TBD_ | _TBD_ | _TBD_ | warming |

---

## Overall

After completing all sections above, set the `Final-status` line below to ONE of:

- `PASS` — all primary accounts active, zero unresolved strikes/warnings, bios deployed, backup pool registered. Cleared for Wave 1+ work that touches live accounts.
- `FAIL` — open issue exists. Describe blocker(s) below; do NOT proceed with live posting.
- `NOT_YET` — audit not started or in progress.

Final-status: NOT_YET

Blockers (if FAIL):
-
