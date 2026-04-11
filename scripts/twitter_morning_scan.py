"""
scripts/twitter_morning_scan.py — Twitter reply bot via twikit 2.x (async)
Railway cron: 07:00 IL (04:00 UTC) daily
"""

import asyncio
import base64
import json
import os
import random
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

# ── Patch twikit ClientTransaction before importing Client ────────────────────
# twikit 2.3.3 tries to parse Twitter's JS bundle to compute x-client-transaction-id.
# Twitter changed their HTML so the regex never matches → raises "Couldn't get KEY_BYTE indices".
# Cookies-based auth doesn't need a valid transaction ID for search — we stub it out.
import twikit.x_client_transaction.transaction as _tx_mod

class _NoopTransaction:
    home_page_response = True  # truthy → skips re-init on every request

    async def init(self, *a, **kw):
        pass

    def generate_transaction_id(self, method='', path='', **kw):
        # random base64 value — Twitter accepts it when session cookies are valid
        return base64.b64encode(random.randbytes(32)).decode()

_tx_mod.ClientTransaction = _NoopTransaction

from twikit import Client

# ── Config ────────────────────────────────────────────────────────────────────
COOKIES_PATH          = Path(__file__).parent.parent / 'cookies.json'

# ── Railway: decode TWITTER_COOKIES_B64 → cookies.json if file absent ─────────
# On Railway there's no local cookies.json. Encode once locally:
#   base64 -i cookies.json | tr -d '\n'   → paste as TWITTER_COOKIES_B64 env var
_COOKIES_B64 = os.getenv('TWITTER_COOKIES_B64', '')
if _COOKIES_B64 and not COOKIES_PATH.exists():
    _tmp = Path('/tmp/blondeshell_cookies.json')
    _tmp.write_bytes(base64.b64decode(_COOKIES_B64))
    COOKIES_PATH = _tmp
    print(f'[twikit] Loaded cookies from TWITTER_COOKIES_B64 → {COOKIES_PATH}')
MAX_SEARCHES_PER_HOUR = 20
REQUEST_DELAY_S       = 2

KEYWORDS = [
    'gym', 'workout', 'fitness', 'lifting', 'gains',
    'gaming', 'controller', 'gamer', 'grind', 'sweat'
]

TEMPLATES = [
    "ok that form though 👀 actually impressive. gamer girls who lift are a different breed",
    "post-workout energy hits different. the dedication is showing 💪 love seeing this on my timeline",
    "real ones know the grind. those are the sessions that actually matter 🔥",
    "gaming stamina + gym stamina = the actual final boss combo. respect",
    "late night gym sessions built different. something about training when everyone else is sleeping 🌙",
    "the controller can wait. those gains are not going to lift themselves 😏",
    "progress like this doesn't happen by accident. been watching this arc and it's a good one 👀",
    "accountability posts always hit harder. the fact you're putting it out here says everything",
    "rest days are part of the game too. recovery arc is underrated 💯",
    "this just made my whole timeline better ngl. keep going 🔥",
]

DRY_RUN  = '--dry-run' in sys.argv
USERNAME = os.getenv('TWITTER_USER') or os.getenv('TWITTER_USERNAME')
EMAIL    = os.getenv('TWITTER_MAIL') or os.getenv('TWITTER_EMAIL')
PASSWORD = os.getenv('TWITTER_PASSWORD')
SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY', '')

def _sb_headers():
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
    }

def sb_select(table, query_params):
    qs  = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in query_params.items())
    url = f'{SUPABASE_URL}/rest/v1/{table}?{qs}'
    req = urllib.request.Request(url, headers=_sb_headers())
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def sb_insert(table, payload):
    url  = f'{SUPABASE_URL}/rest/v1/{table}'
    data = json.dumps(payload).encode()
    req  = urllib.request.Request(url, data=data, headers=_sb_headers(), method='POST')
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as e:
        print(f'[sb_insert] {table}: {e}', file=sys.stderr)

def log_agent(message, level='info'):
    if DRY_RUN:
        print(f'[LOG:{level}] {message}')
        return
    sb_insert('agent_logs', {
        'agent':      'twitter_morning_scan',
        'message':    message,
        'level':      level,
        'created_at': datetime.now(timezone.utc).isoformat(),
    })

async def get_client() -> Client:
    client = Client('en-US')
    # Patch the instance's transaction object too (Client.__init__ creates a new one)
    client.client_transaction = _NoopTransaction()
    if COOKIES_PATH.exists():
        print(f'[twikit] Loading cookies from {COOKIES_PATH}')
        client.load_cookies(str(COOKIES_PATH))
    else:
        if not all([USERNAME, EMAIL, PASSWORD]):
            raise RuntimeError('Missing credentials. Set TWITTER_USER, TWITTER_MAIL, TWITTER_PASSWORD in .env')
        print(f'[twikit] First login as {USERNAME}...')
        await client.login(auth_info_1=USERNAME, auth_info_2=EMAIL, password=PASSWORD)
        client.save_cookies(str(COOKIES_PATH))
        print(f'[twikit] Cookies saved -> {COOKIES_PATH}')
    return client

def matches_keywords(text: str) -> bool:
    return any(kw in text.lower() for kw in KEYWORDS)

def pick_template() -> str:
    return random.choice(TEMPLATES)

class RateLimiter:
    def __init__(self, max_per_hour: int, delay_s: float):
        self.max_per_hour  = max_per_hour
        self.delay_s       = delay_s
        self._window_start = time.time()
        self._count        = 0

    async def acquire(self):
        now = time.time()
        if now - self._window_start >= 3600:
            self._window_start = now
            self._count = 0
        if self._count >= self.max_per_hour:
            wait = 3600 - (now - self._window_start) + 1
            print(f'[rate_limit] Hour cap reached - sleeping {wait:.0f}s')
            await asyncio.sleep(wait)
            self._window_start = time.time()
            self._count = 0
        await asyncio.sleep(self.delay_s)
        self._count += 1

async def main():
    print(f'[twitter_morning_scan] Starting {"(DRY RUN) " if DRY_RUN else ""}at {datetime.now(timezone.utc).isoformat()}')

    if DRY_RUN:
        idx   = sys.argv.index('--dry-run')
        query = sys.argv[idx + 1] if len(sys.argv) > idx + 1 else 'gym workout'
        print(f'\n[DRY RUN] Searching: "{query}"\n')
        client  = await get_client()
        results = await client.search_tweet(query, 'Latest', count=3)
        tweets  = list(results)[:3]
        print(f'First {len(tweets)} results:\n')
        for i, tweet in enumerate(tweets, 1):
            handle = tweet.user.screen_name if tweet.user else '?'
            text   = tweet.text.replace('\n', ' ')[:120]
            print(f'  {i}. @{handle}')
            print(f'     {text}')
            print(f'     id: {tweet.id}')
            print()
        return

    client  = await get_client()
    limiter = RateLimiter(MAX_SEARCHES_PER_HOUR, REQUEST_DELAY_S)
    try:
        accounts = sb_select('twitter_reply_queue', {
            'select':   'account_handle,tweet_topic',
            'status':   'eq.pending',
            'row_type': 'eq.target',
        })
    except Exception as e:
        log_agent(f'Supabase load failed: {e}', 'error')
        sys.exit(1)

    print(f'[twitter_morning_scan] Scanning {len(accounts)} accounts')
    drafted = 0
    for account in accounts:
        handle = account.get('account_handle', '').replace('@', '')
        if not handle:
            continue
        try:
            await limiter.acquire()
            results = await client.search_tweet(f'from:{handle}', 'Latest', count=10)
            for tweet in results:
                if not matches_keywords(tweet.text):
                    continue
                tweet_url   = f'https://x.com/i/web/status/{tweet.id}'
                draft_reply = pick_template()
                sb_insert('twitter_reply_queue', {
                    'account_handle': f'@{handle}',
                    'tweet_url':      tweet_url,
                    'tweet_topic':    tweet.text[:200],
                    'draft_reply':    draft_reply,
                    'status':         'pending',
                })
                drafted += 1
                print(f'[DRAFT] @{handle} -> "{tweet.text[:60]}..."')
        except Exception as err:
            log_agent(f'Error scanning @{handle}: {err}', 'warn')

    log_agent(f'Morning scan complete. {drafted} reply drafts queued.', 'info')
    print(f'[twitter_morning_scan] Done. {drafted} drafts inserted.')

if __name__ == '__main__':
    asyncio.run(main())
