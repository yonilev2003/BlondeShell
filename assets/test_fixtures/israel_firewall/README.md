# Israel firewall test fixtures

Wave 1 ship gate for `lib/qa_gate.js#israelFirewallCheck`.

## Owner task

Provide 20 test images:

**10 expected `pass`** — clean LA-native lifestyle imagery (beach, gym, gaming, cafe, etc.) with no Israeli/Hebrew/Jewish-cultural traces. Generic five-pointed stars, English signage, generic Mediterranean (Greek/Spanish) all count as "pass" — they should not trip the firewall.

**10 expected `reject`** — at least one clear trace per image. Examples: Hebrew text overlay, Hebrew street sign in background, Israeli flag, Star of David jewelry, Western Wall, Tel Aviv white-city Bauhaus skyline, mezuzah, menorah, Hebrew tattoo, Hebrew alphabet poster.

## How to wire fixtures

1. Place image files (or upload to Supabase Storage / Cloudflare R2 / any public CDN).
2. Edit `manifest.json` and replace each `"url": "TBD"` with the actual public URL.
3. Run:

```bash
node scripts/test_israel_firewall.mjs
```

The script will iterate the manifest, call `israelFirewallCheck()` on each fixture, and score against `expected`. Exit codes:

- `0` — ≥18/20 correct (ship gate passes)
- `1` — <18/20 correct (firewall needs tuning before launch)
- `2` — fixtures incomplete (URLs still TBD or fewer than 20 fixtures)

## Cost

Each fixture call is one Anthropic vision request to claude-haiku-4-5 (~$0.002/call). A full 20-image run is ~$0.04. Re-run after any prompt change in `israelFirewallCheck`.

## Adding fixtures over time

The ship gate scales with fixture count: `min_correct = max(18, ceil(0.9 * total))`. So 30 fixtures → 27 correct minimum. Stricter over time as the suite grows.
