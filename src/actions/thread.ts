import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { XAutoError } from '../core/errors.js';
import { checkText } from '../core/text.js';
import { requireAvailableProfile } from '../core/profiles.js';
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

const composerSelector = '[data-testid="tweetTextarea_0"]';

export const thread = async ({ profileId, handle, file, headed = false }: { profileId: string; handle: string; file: string; headed?: boolean }) => {
  const posts = await readThreadFile(file);
  const profile = await requireAvailableProfile(profileId);
  const session = await openSession(profile.profilePath, handle, !headed);
  try {
    await session.page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    for (let index = 0; index < posts.length; index += 1) {
      const composers = await visibleElements(session.page, composerSelector);
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
          const next = await visibleElements(session.page, composerSelector);
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
        details: { expected: posts.length, publishedTweetIds: tweetIds },
      });
    }
    return { tweetIds, rootUrl: `https://x.com/${session.handle}/status/${tweetIds[0]}` };
  } finally {
    await session.browser.close();
  }
};
