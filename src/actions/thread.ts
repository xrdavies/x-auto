import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { XAutoError } from '../core/errors.js';
import { checkText } from '../core/text.js';
import { requireAvailableSelectedProfile, type ProfileSelection } from '../core/profiles.js';
import { firstVisible, visibleElements } from '../browser/dom.js';
import { openSession } from '../browser/session.js';

export const readThreadFile = async (path: string) => {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/).filter((line) => line.trim());
  const posts = lines.map((line, index) => {
    try {
      const value = JSON.parse(line) as { text?: unknown };
      if (typeof value.text !== 'string') throw new Error('text must be a string');
      return checkText(value.text);
    } catch (error) {
      if (error instanceof XAutoError) throw error;
      throw new XAutoError('THREAD_INVALID', `Thread 第 ${index + 1} 行不是有效的 {"text":"..."} JSON`, { details: { line: index + 1 } });
    }
  });
  if (posts.length < 2) throw new XAutoError('THREAD_INVALID', 'Thread 至少需要两条推文');
  return posts;
};

const composerSelector = '[data-testid^="tweetTextarea_"]';

const threadComposers = async (page: import('puppeteer-core').Page) => {
  const candidates = await visibleElements(page, composerSelector);
  const composers = [];
  for (const candidate of candidates) {
    const testId = await candidate.evaluate((element) => element.getAttribute('data-testid'));
    const isThreadSized = await candidate.evaluate((element) => element.getBoundingClientRect().height >= 50);
    if (testId && /^tweetTextarea_\d+$/.test(testId) && isThreadSized) composers.push(candidate);
    else await candidate.dispose();
  }
  return composers;
};

const waitForThreadComposers = async (page: import('puppeteer-core').Page, count: number) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const composers = await threadComposers(page);
    if (composers.length >= count) return composers;
    await Promise.all(composers.map((composer) => composer.dispose()));
    await delay(250);
  }
  return [];
};

export const threadPosts = async ({ profileId, profilePath, handle, texts, headed = false }: ProfileSelection & { handle: string; texts: string[]; headed?: boolean }) => {
  const posts = texts.map((text) => checkText(text));
  if (posts.length < 2) throw new XAutoError('THREAD_INVALID', 'Thread 至少需要两条推文');
  const profile = await requireAvailableSelectedProfile({ profileId, profilePath });
  const session = await openSession(profile.profilePath, handle, !headed);
  try {
    await session.page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    for (let index = 0; index < posts.length; index += 1) {
      const composers = await waitForThreadComposers(session.page, index + 1);
      const composer = composers.at(-1);
      if (!composer) throw new XAutoError('THREAD_CONTROL_NOT_FOUND', `找不到 Thread 第 ${index + 1} 条输入框`);
      await composer.click();
      await composer.type(posts[index].text, { delay: 10 });
      await Promise.all(composers.map((element) => element.dispose()));

      if (index < posts.length - 1) {
        const addButton = await firstVisible(session.page, ['[data-testid="addButton"]', 'button[aria-label="Add post"]', 'button[aria-label="添加帖子"]']);
        if (!addButton) throw new XAutoError('THREAD_CONTROL_NOT_FOUND', '找不到“添加另一条帖子”控件，不会降级为独立推文');
        await addButton.click();
        await addButton.dispose();
        let added = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const next = await threadComposers(session.page);
          added = next.length > index + 1;
          await Promise.all(next.map((element) => element.dispose()));
          if (added) break;
          await delay(250);
        }
        if (!added) throw new XAutoError('THREAD_CONTROL_NOT_FOUND', '点击添加控件后没有出现新的 Thread 输入框，不会降级发布');
      }
    }

    const publishAll = await firstVisible(session.page, ['[data-testid="tweetButton"]']);
    if (!publishAll) throw new XAutoError('THREAD_CONTROL_NOT_FOUND', '找不到 Thread 全部发布控件，不会降级发布');
    const label = await publishAll.evaluate((element) => (element.textContent || '').trim());
    if (!/post all|publish all|全部发布|发布全部/i.test(label)) {
      await publishAll.dispose();
      throw new XAutoError('THREAD_CONTROL_NOT_FOUND', `检测到的发布控件不是“全部发布”：${label || '<empty>'}`);
    }
    const disabled = await publishAll.evaluate((element) => element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled'));
    if (disabled) {
      const composerStates = await session.page.$$eval('[data-testid^="tweetTextarea_"]', (elements) => elements
        .filter((element) => /^tweetTextarea_\d+$/.test(element.getAttribute('data-testid') || ''))
        .map((element) => {
        const node = element as HTMLElement;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          testId: node.getAttribute('data-testid'),
          visible: style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0,
          characters: Array.from(node.innerText || node.textContent || '').length,
        };
      }));
      const alerts = await session.page.$$eval('[role="alert"]', (elements) => elements
        .map((element) => (element.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 5));
      await publishAll.dispose();
      throw new XAutoError('PUBLISH_FAILED', 'Thread 全部发布控件处于禁用状态，请检查每条内容和页面提示', {
        details: { posts: posts.length, label, composerStates, alerts },
      });
    }

    const responses: Array<Promise<string | null>> = [];
    const listener = (response: import('puppeteer-core').HTTPResponse) => {
      if (/\/CreateTweet(?:$|\?|\/)/.test(response.url()) && response.request().method() === 'POST') {
        responses.push(response.json().then((payload) => {
          const result = payload?.data?.create_tweet?.tweet_results?.result;
          return result?.rest_id || result?.legacy?.id_str || null;
        }).catch(() => null));
      }
    };
    session.page.on('response', listener);
    await publishAll.click();
    await publishAll.dispose();
    await delay(15_000);
    session.page.off('response', listener);
    const tweetIds = (await Promise.all(responses)).filter((value): value is string => Boolean(value));
    if (tweetIds.length !== posts.length) {
      throw new XAutoError(tweetIds.length ? 'PARTIAL_THREAD' : 'PUBLISH_UNKNOWN', `Thread 预期 ${posts.length} 条，确认发布 ${tweetIds.length} 条，请人工检查`, {
        details: { expected: posts.length, publishedTweetIds: tweetIds, publishControlLabel: label },
      });
    }
    return { tweetIds, rootUrl: `https://x.com/${session.handle}/status/${tweetIds[0]}` };
  } finally {
    await session.browser.close();
  }
};

export const thread = async ({ profileId, profilePath, handle, file, headed = false }: ProfileSelection & { handle: string; file: string; headed?: boolean }) => {
  const posts = await readThreadFile(file);
  return threadPosts({ profileId, profilePath, handle, texts: posts.map((post) => post.text), headed });
};
