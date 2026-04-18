import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CREATOR_ID = 'a76fb92f-3ca0-4022-85d1-d4347af60f0b';
const BASE_URL = 'https://app.substy.ai';
const COOKIES_PATH = join(__dirname, 'cookies.json');
const SCREENSHOTS_DIR = join(__dirname, 'screenshots');
const NAV_TIMEOUT = 30_000;

const SELECTORS = {
  googleLoginBtn: 'button:has-text("Continue with Google")',
  appleLoginBtn: 'button:has-text("Continue with Apple")',
  googleEmail: 'input[type="email"]',
  googlePassword: 'input[type="password"]',
  googleNext: 'button:has-text("Next")',
  conversationList: '[data-testid="conversation-list"], .conversation-list, [class*="conversation"]',
  conversationItem: '[data-testid="conversation-item"], .conversation-item, [class*="conversation-item"]',
  subscriberList: '[data-testid="subscriber-list"], .subscriber-list, [class*="subscriber"]',
  subscriberItem: '[data-testid="subscriber-item"], .subscriber-item, [class*="subscriber-row"]',
  settingsNav: '[data-testid="settings-nav"], a[href*="settings"], [class*="settings"]',
  settingsForm: '[data-testid="settings-form"], form[class*="settings"]',
  saveButton: 'button:has-text("Save"), button[type="submit"]',
};

let browser = null;
let context = null;

async function ensureScreenshotsDir() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function screenshotOnFailure(page, label) {
  await ensureScreenshotsDir();
  const path = join(SCREENSHOTS_DIR, `${label}_${Date.now()}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function loadCookies() {
  try {
    const raw = await readFile(COOKIES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveCookies(cookies) {
  await writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

async function getContext() {
  if (context) return context;

  const b = await getBrowser();
  context = await b.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const cookies = await loadCookies();
  if (cookies) {
    await context.addCookies(cookies);
  }

  return context;
}

async function isSessionValid(page) {
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    return !page.url().includes('/login') && !page.url().includes('/auth');
  } catch {
    return false;
  }
}

export async function login() {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    if (await isSessionValid(page)) {
      console.log('[substy] Session still valid');
      await page.close();
      return { success: true, message: 'Session valid' };
    }

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

    await page.click(SELECTORS.googleLoginBtn);
    await page.waitForSelector(SELECTORS.googleEmail, { timeout: NAV_TIMEOUT });
    await page.fill(SELECTORS.googleEmail, process.env.SUBSTY_GOOGLE_EMAIL);
    await page.click(SELECTORS.googleNext);
    await page.waitForSelector(SELECTORS.googlePassword, { timeout: NAV_TIMEOUT });
    await page.fill(SELECTORS.googlePassword, process.env.SUBSTY_GOOGLE_PASSWORD);
    await page.click(SELECTORS.googleNext);

    await page.waitForURL(`${BASE_URL}/dashboard**`, { timeout: NAV_TIMEOUT });

    const cookies = await ctx.cookies();
    await saveCookies(cookies);
    console.log('[substy] Login successful, cookies saved');

    await page.close();
    return { success: true, message: 'Login completed' };
  } catch (err) {
    const screenshotPath = await screenshotOnFailure(page, 'login_failure');
    await page.close();
    throw Object.assign(err, { screenshotPath });
  }
}

export async function getConversations() {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/creators/${CREATOR_ID}/conversations`, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });

    if (page.url().includes('/login') || page.url().includes('/auth')) {
      await page.close();
      await login();
      return getConversations();
    }

    await page.waitForSelector(SELECTORS.conversationItem, { timeout: NAV_TIMEOUT });

    const conversations = await page.$$eval(SELECTORS.conversationItem, items =>
      items.map(el => ({
        subscriberId: el.getAttribute('data-subscriber-id') || el.getAttribute('data-id') || '',
        name: (el.querySelector('[class*="name"]') || el.querySelector('h3') || el.querySelector('span'))?.textContent?.trim() || '',
        lastMessage: (el.querySelector('[class*="preview"]') || el.querySelector('[class*="last-message"]') || el.querySelector('p'))?.textContent?.trim() || '',
        messageCount: parseInt(el.getAttribute('data-message-count') || '0', 10),
        lastActivity: el.getAttribute('data-last-activity') || '',
        unread: el.classList.contains('unread') || el.querySelector('[class*="unread"]') !== null,
      }))
    );

    await page.close();
    return conversations;
  } catch (err) {
    const screenshotPath = await screenshotOnFailure(page, 'conversations_failure');
    await page.close();
    throw Object.assign(err, { screenshotPath });
  }
}

export async function getSubscribers() {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/creators/${CREATOR_ID}/subscribers`, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });

    if (page.url().includes('/login') || page.url().includes('/auth')) {
      await page.close();
      await login();
      return getSubscribers();
    }

    await page.waitForSelector(SELECTORS.subscriberItem, { timeout: NAV_TIMEOUT });

    const subscribers = await page.$$eval(SELECTORS.subscriberItem, items =>
      items.map(el => ({
        id: el.getAttribute('data-subscriber-id') || el.getAttribute('data-id') || '',
        name: (el.querySelector('[class*="name"]') || el.querySelector('h3') || el.querySelector('span'))?.textContent?.trim() || '',
        email: (el.querySelector('[class*="email"]'))?.textContent?.trim() || '',
        joinedAt: el.getAttribute('data-joined') || '',
        tier: el.getAttribute('data-tier') || 'free',
        totalSpent: parseFloat(el.getAttribute('data-total-spent') || '0'),
        lastActive: el.getAttribute('data-last-active') || '',
      }))
    );

    await page.close();
    return subscribers;
  } catch (err) {
    const screenshotPath = await screenshotOnFailure(page, 'subscribers_failure');
    await page.close();
    throw Object.assign(err, { screenshotPath });
  }
}

export async function updateSettings(settings) {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/creators/${CREATOR_ID}/settings`, {
      waitUntil: 'networkidle',
      timeout: NAV_TIMEOUT,
    });

    if (page.url().includes('/login') || page.url().includes('/auth')) {
      await page.close();
      await login();
      return updateSettings(settings);
    }

    await page.waitForSelector(SELECTORS.settingsForm, { timeout: NAV_TIMEOUT });

    for (const [key, value] of Object.entries(settings)) {
      const selector = `[name="${key}"], [data-field="${key}"], #${key}`;
      const element = await page.$(selector);
      if (!element) {
        console.warn(`[substy] Settings field not found: ${key}`);
        continue;
      }

      const tagName = await element.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        await element.selectOption(value);
      } else if (tagName === 'textarea') {
        await element.fill('');
        await element.fill(String(value));
      } else if (tagName === 'input') {
        const type = await element.getAttribute('type');
        if (type === 'checkbox') {
          const checked = await element.isChecked();
          if (checked !== Boolean(value)) await element.click();
        } else {
          await element.fill('');
          await element.fill(String(value));
        }
      }
    }

    await page.click(SELECTORS.saveButton);
    await page.waitForResponse(
      res => res.url().includes('/settings') && res.status() < 400,
      { timeout: NAV_TIMEOUT }
    );

    await page.close();
    return { success: true, updatedFields: Object.keys(settings) };
  } catch (err) {
    const screenshotPath = await screenshotOnFailure(page, 'settings_failure');
    await page.close();
    throw Object.assign(err, { screenshotPath });
  }
}

export async function shutdown() {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
