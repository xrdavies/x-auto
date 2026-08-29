import { setTimeout as delay } from 'node:timers/promises';

import type { ElementHandle, HTTPResponse, Page } from 'puppeteer-core';

import { firstVisible, firstVisibleWithin, waitForVisible } from '../browser/dom.js';
import { openSession } from '../browser/session.js';
import { XAutoError } from '../core/errors.js';
import { requireAvailableSelectedProfile, type ProfileSelection } from '../core/profiles.js';
import { parseTweetTarget } from '../core/targets.js';
import { checkText } from '../core/text.js';

type InteractionOptions = ProfileSelection & { handle: string; tweet: string; headed?: boolean };

const openTarget = async (options: InteractionOptions) => {
  const target = parseTweetTarget(options.tweet);
  const profile = await requireAvailableSelectedProfile({ profileId: options.profileId, profilePath: options.profilePath });
  const session = await openSession(profile.profilePath, options.handle, !options.headed);
  try {
    await session.page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const tweet = await firstVisible(session.page, ['article[data-testid="tweet"]', '[data-testid="tweet"]']);
      if (tweet) return { ...session, target, tweet };
      await delay(500);
    }
    throw new XAutoError('TARGET_NOT_FOUND', `找不到目标推文：${target.tweetId}`);
  } catch (error) {
    await session.browser.close();
    throw error;
  }
};

const waitForWithin = async (root: ElementHandle<Element>, selector: string, timeout = 10_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const element = await firstVisibleWithin(root, [selector]);
    if (element) return element;
    await delay(250);
  }
  return null;
};

const extractTweetId = async (response: HTTPResponse | null) => {
  if (!response?.ok()) return null;
  const payload = await response.json().catch(() => null);
  const result = payload?.data?.create_tweet?.tweet_results?.result;
  return [result?.rest_id, result?.legacy?.id_str].find((value) => typeof value === 'string' && /^\d+$/.test(value)) ?? null;
};

const waitForCreateTweet = (page: Page) => page.waitForResponse(
  (response) => /\/CreateTweet(?:$|\?|\/)/.test(response.url()) && response.request().method() === 'POST',
  { timeout: 20_000 },
).catch(() => null);

const findMenuItem = async (page: Page, pattern: RegExp) => {
  const menuItems = await page.$$('[role="menuitem"]');
  for (let index = 0; index < menuItems.length; index += 1) {
    const item = menuItems[index];
    const label = await item.evaluate((element) => (element.textContent || '').trim());
    if (pattern.test(label)) {
      await Promise.all(menuItems.slice(index + 1).map((extra) => extra.dispose()));
      return item as ElementHandle<Element>;
    }
    await item.dispose();
  }
  return null;
};

const publishComposer = async (page: Page, text: string) => {
  const checked = checkText(text);
  const composer = await waitForVisible(page, ['[data-testid="tweetTextarea_0"]', 'div[contenteditable="true"][role="textbox"]']);
  if (!composer) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到文本输入框');
  await composer.click();
  await composer.type(checked.text, { delay: 10 });
  await composer.dispose();

  const button = await waitForVisible(page, ['[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]']);
  if (!button) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到发布按钮');
  const responsePromise = waitForCreateTweet(page);
  await button.click();
  await button.dispose();
  const tweetId = await extractTweetId(await responsePromise);
  if (!tweetId) throw new XAutoError('PUBLISH_UNKNOWN', '未能确认 X 发布结果，请人工检查后再决定是否重试');
  return { tweetId, weightedLength: checked.weightedLength };
};

export const like = async (options: InteractionOptions) => {
  const context = await openTarget(options);
  try {
    const already = await firstVisibleWithin(context.tweet, ['[data-testid="unlike"]']);
    if (already) {
      await already.dispose();
      return { targetTweetId: context.target.tweetId, alreadyApplied: true };
    }
    const button = await firstVisibleWithin(context.tweet, ['[data-testid="like"]']);
    if (!button) throw new XAutoError('ACTION_NOT_AVAILABLE', '目标推文没有可用的点赞控件');
    await button.click();
    await button.dispose();
    const confirmed = await waitForWithin(context.tweet, '[data-testid="unlike"]');
    if (!confirmed) throw new XAutoError('PUBLISH_UNKNOWN', '点赞结果不确定，请人工检查');
    await confirmed.dispose();
    return { targetTweetId: context.target.tweetId, alreadyApplied: false };
  } finally {
    await context.tweet.dispose();
    await context.browser.close();
  }
};

export const retweet = async (options: InteractionOptions) => {
  const context = await openTarget(options);
  try {
    const already = await firstVisibleWithin(context.tweet, ['[data-testid="unretweet"]']);
    if (already) {
      await already.dispose();
      return { targetTweetId: context.target.tweetId, alreadyApplied: true };
    }
    const button = await firstVisibleWithin(context.tweet, ['[data-testid="retweet"]']);
    if (!button) throw new XAutoError('ACTION_NOT_AVAILABLE', '目标推文没有可用的转发控件');
    await button.click();
    await button.dispose();
    const confirm = await waitForVisible(context.page, ['[data-testid="retweetConfirm"]']);
    if (!confirm) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到转发确认控件');
    await confirm.click();
    await confirm.dispose();
    const confirmed = await waitForWithin(context.tweet, '[data-testid="unretweet"]');
    if (!confirmed) throw new XAutoError('PUBLISH_UNKNOWN', '转发结果不确定，请人工检查');
    await confirmed.dispose();
    return { targetTweetId: context.target.tweetId, alreadyApplied: false };
  } finally {
    await context.tweet.dispose();
    await context.browser.close();
  }
};

export const comment = async (options: InteractionOptions & { text: string }) => {
  checkText(options.text);
  const context = await openTarget(options);
  try {
    const reply = await firstVisibleWithin(context.tweet, ['[data-testid="reply"]']);
    if (!reply) throw new XAutoError('ACTION_NOT_AVAILABLE', '目标推文没有可用的评论控件');
    await reply.click();
    await reply.dispose();
    const result = await publishComposer(context.page, options.text);
    return { targetTweetId: context.target.tweetId, tweetId: result.tweetId, url: `https://x.com/${context.handle}/status/${result.tweetId}` };
  } finally {
    await context.tweet.dispose();
    await context.browser.close();
  }
};

export const quote = async (options: InteractionOptions & { text: string }) => {
  checkText(options.text);
  const context = await openTarget(options);
  try {
    const button = await firstVisibleWithin(context.tweet, ['[data-testid="retweet"]', '[data-testid="unretweet"]']);
    if (!button) throw new XAutoError('ACTION_NOT_AVAILABLE', '目标推文没有可用的 Quote 入口');
    await button.click();
    await button.dispose();
    let quoteItem: ElementHandle<Element> | null = null;
    const deadline = Date.now() + 10_000;
    while (!quoteItem && Date.now() < deadline) {
      quoteItem = await findMenuItem(context.page, /^quote$|引用|引用帖子/i);
      if (!quoteItem) await delay(250);
    }
    if (!quoteItem) throw new XAutoError('ACTION_NOT_AVAILABLE', '找不到 Quote 菜单项');
    await quoteItem.click();
    await quoteItem.dispose();
    const result = await publishComposer(context.page, options.text);
    return { targetTweetId: context.target.tweetId, tweetId: result.tweetId, url: `https://x.com/${context.handle}/status/${result.tweetId}` };
  } finally {
    await context.tweet.dispose();
    await context.browser.close();
  }
};
