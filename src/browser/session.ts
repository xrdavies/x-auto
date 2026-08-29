import { setTimeout as delay } from 'node:timers/promises';

import { XAutoError } from '../core/errors.js';
import { normalizeHandle } from '../core/profiles.js';
import { launchAutomatedChrome } from './chrome.js';

const selectors = [
  '[data-testid="SideNav_AccountSwitcher_Button"]',
  '[data-testid="SideNav_NewTweet_Button"]',
  '[data-testid="AppTabBar_Profile_Link"]',
];

export const checkSession = async (profilePath: string, expectedHandle: string, headless = true) => {
  const handle = normalizeHandle(expectedHandle);
  const browser = await launchAutomatedChrome(profilePath, headless);
  try {
    const tab = browser.getActiveTab();
    if (!tab) throw new XAutoError('BROWSER_NAVIGATION_FAILED', 'Chrome 没有可用标签页');
    const page = tab.page;
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      ready = (await Promise.all(selectors.map((selector) => page.$(selector)))).some(Boolean);
      if (ready) break;
      await delay(500);
    }
    if (!ready || !page.url().includes('x.com/home')) throw new XAutoError('SESSION_NOT_AUTHENTICATED', 'Profile 尚未登录 X');

    const account = await page.$('[data-testid="SideNav_AccountSwitcher_Button"]');
    const accountText = account ? await account.evaluate((element) => element.textContent || '') : '';
    const match = accountText.match(/@([A-Za-z0-9_]{1,15})/);
    const actualHandle = match?.[1]?.toLowerCase();
    if (!actualHandle) throw new XAutoError('SESSION_NOT_AUTHENTICATED', '无法读取当前 X 账号');
    if (actualHandle !== handle) throw new XAutoError('ACCOUNT_MISMATCH', `当前账号是 @${actualHandle}，预期为 @${handle}`);
    return { handle: actualHandle };
  } finally {
    await browser.close();
  }
};
